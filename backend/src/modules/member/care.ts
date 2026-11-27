import {createHash} from 'node:crypto';
import {z} from 'zod';
import {HttpError} from '../../utils/http.js';
import {id} from '../member-auth/validation.js';
import {rows,json,careNotes,localDate,orderedIds,typeMap,applyEffects,visualState,type DB} from './shared.js';

export const bulkInput=(limit=50)=>z.object({cultivation_ids:z.array(id).min(1).max(limit).refine(ids=>new Set(ids).size===ids.length,'Pilih setiap Pet satu kali.'),care_action_id:id,client_event_id:z.string().uuid(),confirmed:z.literal(true)}).strict();
interface CareRequest {ids:string[];event:string;operation:'individual'|'bulk'|'schedule';slot?:string;actionId?:string;scheduleId?:string}
export function assertCareEligible(pet:Record<string,any>){
  if(pet.status!=='active')throw new HttpError(409,'Pulihkan Pet yang diarsipkan sebelum merawatnya.','PET_ARCHIVED');
  if(!pet.ownership_confirmed_at)throw new HttpError(409,'Tinjau dan konfirmasikan Pet sebelum mencatat perawatan atau jadwal.','PET_CONFIRMATION_REQUIRED');
}
export async function recordCare(db:DB,user:string,input:CareRequest){
  const ids=orderedIds(input.ids),fingerprint=createHash('sha256').update(JSON.stringify({operation:input.operation,ids,slot:input.slot||null,actionId:input.actionId||null,scheduleId:input.scheduleId||null})).digest('hex');
  // The authenticated member row is already locked by auth.mutate, across all server processes.
  const previous=await rows(db,`SELECT cl.*,sca.slot_key FROM care_logs cl JOIN user_cultivations uc ON uc.id=cl.user_cultivation_id JOIN species_care_actions sca ON sca.id=cl.species_care_action_id
    WHERE uc.user_id=? AND (cl.client_event_id=? OR cl.batch_id=?) ORDER BY cl.user_cultivation_id`,[user,input.event,input.event]);
  const summary=(records:Record<string,any>[])=>({batchId:records[0]?.batch_id||null,affectedPetCount:records.length,representedQuantity:records.every(r=>r.quantity_at_care!=null)?records.reduce((n,r)=>n+Number(r.quantity_at_care),0):null,updatedCultivationIds:records.map(r=>String(r.user_cultivation_id))});
  if(previous.length){
    const same=previous.length===ids.length&&orderedIds(previous.map(r=>String(r.user_cultivation_id))).every((key,i)=>key===ids[i]);
    const hashes=previous.map(r=>careNotes(r.notes).fingerprint);
    const legacy=same&&previous.length===1&&!previous[0].batch_id&&input.operation!=='bulk'&&previous[0].slot_key===input.slot&&(!input.scheduleId||String(previous[0].schedule_id)===input.scheduleId);
    if(!same||!(hashes.every(h=>h===fingerprint)||hashes.every(h=>!h)&&legacy))throw new HttpError(409,'ID perawatan sudah dipakai untuk kegiatan atau Pet berbeda.','REQUEST_CONFLICT');
    return summary(previous);
  }
  const pets=await rows(db,`SELECT uc.*,s.category_id,s.name AS species_name FROM user_cultivations uc JOIN species s ON s.id=uc.species_id WHERE uc.user_id=? AND uc.id IN (${ids.map(()=>'?').join(',')}) ORDER BY uc.id FOR UPDATE`,[user,...ids]);
  if(pets.length!==ids.length)throw new HttpError(404,'Pet tidak ditemukan.');
  for(const pet of pets)assertCareEligible(pet);
  if(new Set(pets.map(p=>String(p.species_id))).size!==1)throw new HttpError(422,'Rawat Bersama hanya untuk satu jenis budidaya.');
  const action=(await rows(db,`SELECT sca.id,sca.slot_key,sca.effect_config_json,ca.id AS care_action_id,ca.name FROM species_care_actions sca JOIN care_actions ca ON ca.id=sca.care_action_id
    WHERE sca.species_id=? AND ${input.actionId?'ca.id=?':'sca.slot_key=?'} AND sca.is_active=1 AND ca.is_active=1 ORDER BY sca.sort_order,sca.id LIMIT 1`,[pets[0].species_id,input.actionId||input.slot]))[0];
  if(!action)throw new HttpError(422,'Tindakan tidak tersedia untuk jenis ini.');
  const types=await typeMap(db),saved:Record<string,any>[]=[];
  for(const pet of pets){
    let scheduleId=input.scheduleId;const day=localDate();
    if(scheduleId){
      const s=(await rows(db,'SELECT id,timezone FROM care_schedules WHERE id=? AND user_cultivation_id=? AND species_care_action_id=? AND is_enabled=1',[scheduleId,pet.id,action.id]))[0];
      if(!s)throw new HttpError(404,'Jadwal tidak ditemukan.');
      const done=await rows(db,'SELECT id FROM care_logs WHERE schedule_id=? AND local_date=? LIMIT 1',[scheduleId,day]);
      if(done.length)return {batchId:null,affectedPetCount:0,representedQuantity:0,updatedCultivationIds:[],alreadyCompleted:true};
    } else {
      const pending=await rows(db,`SELECT cs.id,cs.timezone FROM care_schedules cs WHERE cs.user_cultivation_id=? AND cs.species_care_action_id=? AND cs.is_enabled=1
        AND NOT EXISTS(SELECT 1 FROM care_logs cl WHERE cl.schedule_id=cs.id AND cl.local_date=?) ORDER BY cs.id LIMIT 1`,[pet.id,action.id,day]);
      if(pending.length)scheduleId=String(pending[0].id);
    }
    const metrics=applyEffects(json(pet.metrics_json,{}),json(action.effect_config_json,{}));
    await db.execute('UPDATE user_cultivations SET metrics_json=?,visual_state=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?',[JSON.stringify(metrics),visualState(types[String(pet.category_id)],metrics),pet.id,user]);
    const batchId=input.operation==='bulk'?input.event:null,name=pet.nickname||pet.species_name;
    await db.execute(`INSERT INTO care_logs (user_cultivation_id,species_care_action_id,schedule_id,client_event_id,batch_id,pet_name_at_care,quantity_at_care,notes,performed_at,local_date,created_at)
      VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),?,UTC_TIMESTAMP(3))`,[pet.id,action.id,scheduleId||null,input.event,batchId,name,pet.quantity,JSON.stringify({fingerprint,operation:input.operation,petMode:pet.pet_mode}),day]);
    saved.push({user_cultivation_id:pet.id,batch_id:batchId,pet_name_at_care:name,quantity_at_care:pet.quantity});
  }
  return summary(saved);
}
export const performCare=(db:DB,user:string,key:string,slot:string,event:string,scheduleId?:string)=>recordCare(db,user,{ids:[key],slot,event,scheduleId,operation:scheduleId?'schedule':'individual'});
