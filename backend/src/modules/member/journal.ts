import {rows,careNotes,iso,typeMap,type DB} from './shared.js';
export async function journal(db:DB,user:string,offset=0){
  // Page logical activities first, then fetch every row in each selected batch.
  const page=await rows(db,`SELECT cl.batch_id,CASE WHEN cl.batch_id IS NULL THEN cl.id ELSE NULL END AS single_id,MAX(cl.id) AS last_id
    FROM care_logs cl JOIN user_cultivations uc ON uc.id=cl.user_cultivation_id WHERE uc.user_id=? GROUP BY cl.batch_id,single_id ORDER BY last_id DESC LIMIT 20 OFFSET ?`,[user,offset]);
  const [count]=await rows(db,`SELECT COUNT(DISTINCT cl.batch_id)+COALESCE(SUM(cl.batch_id IS NULL),0) AS total FROM care_logs cl JOIN user_cultivations uc ON uc.id=cl.user_cultivation_id WHERE uc.user_id=?`,[user]);
  if(!page.length)return {items:[],total:Number(count.total),hasMore:false};
  const batch=page.filter(p=>p.batch_id).map(p=>p.batch_id),single=page.filter(p=>!p.batch_id).map(p=>p.single_id);
  const terms=[...(batch.length?[`cl.batch_id IN (${batch.map(()=>'?').join(',')})`]:[]),...(single.length?[`cl.id IN (${single.map(()=>'?').join(',')})`]:[])];
  const records=await rows(db,`SELECT cl.*,uc.nickname,s.name AS species_name,s.slug,s.category_id,ca.name AS action_label,sca.slot_key FROM care_logs cl
    JOIN user_cultivations uc ON uc.id=cl.user_cultivation_id JOIN species s ON s.id=uc.species_id JOIN species_care_actions sca ON sca.id=cl.species_care_action_id JOIN care_actions ca ON ca.id=sca.care_action_id
    WHERE uc.user_id=? AND (${terms.join(' OR ')}) ORDER BY cl.id`,[user,...batch,...single]);
  const types=await typeMap(db);
  const items=page.map(p=>{
    const entries=records.filter(r=>p.batch_id?r.batch_id===p.batch_id:String(r.id)===String(p.single_id)).map(r=>({id:String(r.id),cultivationId:String(r.user_cultivation_id),petName:r.pet_name_at_care||r.nickname||r.species_name,quantity:r.quantity_at_care==null?null:Number(r.quantity_at_care),petMode:careNotes(r.notes).petMode||null,speciesName:r.species_name,speciesSlug:r.slug,type:types[String(r.category_id)],actionLabel:r.action_label,slot:r.slot_key,createdAt:iso(r.performed_at),scheduleId:r.schedule_id?String(r.schedule_id):null}));
    return {id:p.batch_id?`batch-${p.batch_id}`:`care-${p.single_id}`,batchId:p.batch_id||null,createdAt:entries[0]?.createdAt,actionLabel:entries[0]?.actionLabel,representedQuantity:entries.every(e=>e.quantity!==null)?entries.reduce((sum,e)=>sum+e.quantity!,0):null,entries};
  });return {items,total:Number(count.total),hasMore:offset+items.length<Number(count.total)};
}
