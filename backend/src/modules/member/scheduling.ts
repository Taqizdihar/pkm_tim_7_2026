import {z} from 'zod';
import {id} from '../member-auth/validation.js';
import {HttpError} from '../../utils/http.js';
import {rows,owned,localDate,type DB} from './shared.js';
import {assertCareEligible} from './care.js';
export const scheduleInput=z.object({cultivation_id:id,slot:z.enum(['action1','action2','action3']),time:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),enabled:z.boolean().default(true)}).strict();
export async function schedules(db:DB,user:string){
  const list=await rows(db,`SELECT cs.*,uc.nickname,uc.quantity,uc.status AS pet_status,uc.ownership_confirmed_at,s.name AS species_name,s.slug,sca.slot_key,ca.name AS action_label,
    EXISTS(SELECT 1 FROM care_logs cl WHERE cl.schedule_id=cs.id AND cl.local_date=?) AS done_today FROM care_schedules cs
    JOIN user_cultivations uc ON uc.id=cs.user_cultivation_id JOIN species s ON s.id=uc.species_id JOIN species_care_actions sca ON sca.id=cs.species_care_action_id JOIN care_actions ca ON ca.id=sca.care_action_id WHERE uc.user_id=? ORDER BY cs.care_time,cs.id`,[localDate(),user]);
  return list.map(r=>({id:String(r.id),cultivationId:String(r.user_cultivation_id),nickname:r.nickname||r.species_name,speciesName:r.species_name,quantity:Number(r.quantity),petStatus:r.pet_status,ownershipConfirmed:Boolean(r.ownership_confirmed_at),actionLabel:r.action_label,slot:r.slot_key,time:String(r.care_time).slice(0,5),enabled:Boolean(Number(r.is_enabled)),doneOn:Number(r.done_today)?localDate():undefined}));
}
export async function saveSchedule(db:DB,user:string,b:z.infer<typeof scheduleInput>,key?:string){
  const pet=await owned(db,'user_cultivations',b.cultivation_id,user);assertCareEligible(pet);
  const action=(await rows(db,`SELECT sca.id FROM species_care_actions sca JOIN care_actions ca ON ca.id=sca.care_action_id WHERE sca.species_id=? AND sca.slot_key=? AND sca.is_active=1 AND ca.is_active=1`,[pet.species_id,b.slot]))[0];
  if(!action)throw new HttpError(422,'Tindakan tidak tersedia.');
  if(key){
    const s=(await rows(db,`SELECT cs.id,cs.user_cultivation_id,cs.species_care_action_id FROM care_schedules cs JOIN user_cultivations uc ON uc.id=cs.user_cultivation_id WHERE cs.id=? AND uc.user_id=?`,[key,user]))[0];
    if(!s||String(s.user_cultivation_id)!==b.cultivation_id)throw new HttpError(404,'Jadwal tidak ditemukan.');
    if(String(s.species_care_action_id)!==String(action.id))throw new HttpError(422,'Jenis perawatan jadwal tidak dapat diganti. Buat jadwal lain.');
    await db.execute('UPDATE care_schedules SET care_time=?,is_enabled=? WHERE id=?',[b.time,b.enabled,key]);
  }else{
    await db.execute("INSERT INTO care_schedules (user_cultivation_id,species_care_action_id,care_time,is_enabled,timezone,recurrence) VALUES (?,?,?,?,'Asia/Jakarta','daily')",[pet.id,action.id,b.time,b.enabled]);
  }
}
export async function disableSchedule(db:DB,user:string,key:string){
  const s=await rows(db,'SELECT cs.id FROM care_schedules cs JOIN user_cultivations uc ON uc.id=cs.user_cultivation_id WHERE cs.id=? AND uc.user_id=?',[key,user]);
  if(!s.length)throw new HttpError(404,'Jadwal tidak ditemukan.');await db.execute('UPDATE care_schedules SET is_enabled=0 WHERE id=?',[key]);
}
