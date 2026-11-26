import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { HttpError } from '../../utils/http.js';

export type DB = Pool | PoolConnection;
export const json = <T>(value: unknown, fallback: T): T => value == null ? fallback : typeof value === 'string' ? JSON.parse(value) : value as T;
export async function rows(db: DB, sql: string, params: unknown[] = []) {
  const [result] = await db.query<RowDataPacket[]>(sql, params); return result;
}
export const localDate = (date = new Date(),timeZone='Asia/Jakarta') => new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const iso = (v: unknown) => v instanceof Date ? new Date(v.getTime()-v.getTimezoneOffset()*60000).toISOString() : `${String(v).replace(' ','T')}Z`;
export async function owned(db: DB, table: 'user_cultivations' | 'chat_conversations', key: string, user: string) {
  const result=await rows(db,`SELECT * FROM ${table} WHERE id=? AND user_id=?`,[key,user]);
  if(!result.length) throw new HttpError(404,'Data tidak ditemukan.'); return result[0];
}
export async function typeMap(db: DB) {
  const categories=await rows(db,'SELECT id,parent_id,habitat_key FROM cultivation_categories');
  const result:Record<string,string>={};
  for(const category of categories) {
    let current=category; const seen=new Set<string>();
    while(current && !seen.has(current.id)) {
      seen.add(current.id);
      if(current.habitat_key) { result[category.id]=({kebun:'tunas',kolam:'koki',kandang:'kuning'} as Record<string,string>)[current.habitat_key]; break; }
      current=categories.find(c=>c.id===current.parent_id)!;
    }
  } return result;
}
export const initialMetrics = (type:string) => type==='tunas' ? {stat1:30,stat2:10,stat3:25} : {stat1:15,stat2:40,stat3:30};
export function applyEffects(metrics: Record<string,number>,effects: Record<string,number>) {
  return Object.fromEntries(['stat1','stat2','stat3'].map(k=>[k,Math.max(0,Math.min(100,(Number(metrics[k])||0)+(Number(effects[k])||0)))]));
}
export async function cultivation(db: DB, user: string, slug: string) {
  const existing=await rows(db,`SELECT uc.*,s.slug,s.category_id FROM user_cultivations uc JOIN species s ON s.id=uc.species_id
    WHERE uc.user_id=? AND s.slug=? AND uc.status='active' ORDER BY uc.id LIMIT 1`,[user,slug]);
  if(existing.length) return existing[0];
  const species=await rows(db,"SELECT id,category_id FROM species WHERE slug=? AND status='published'",[slug]);
  const types=await typeMap(db), s=species[0];
  if(!s || !types[s.category_id]) throw new HttpError(404,'Jenis budidaya tidak tersedia.');
  const cats=await rows(db,'SELECT id,parent_id,is_active FROM cultivation_categories');
  let cat=cats.find(c=>c.id===s.category_id); const seen=new Set<string>();
  while(cat && !seen.has(cat.id)) { if(!cat.is_active) throw new HttpError(404,'Kategori tidak tersedia.'); seen.add(cat.id);cat=cats.find(c=>c.id===cat!.parent_id); }
  await db.execute(`INSERT INTO user_cultivations (user_id,species_id,metrics_json,visual_state,started_at,created_at,updated_at)
    VALUES (?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[user,s.id,JSON.stringify(initialMetrics(types[s.category_id])),types[s.category_id]==='tunas'?'wilted':'sick']);
  return cultivation(db,user,slug);
}
export async function profile(db: DB,user: string) {
  const result=await rows(db,`SELECT u.name,u.email,u.username,u.phone_number,u.avatar_url,p.* FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.id=?`,[user]);
  const p=result[0];
  return {name:p.name,email:p.email||'',username:p.username||'',phoneNumber:p.phone_number||'',avatarUrl:p.avatar_url||'/assets/generated/avatar-penyuluh.png',
    region:p.region||'',careFocus:json(p.care_focus_json,['tanaman']),textSize:p.text_size,soundEnabled:!!p.sound_enabled,reminderEnabled:!!p.reminder_enabled,language:'Indonesia',isLoggedIn:true};
}
export async function progress(db:DB,user:string) {
  const count=await rows(db,'SELECT COUNT(*) AS total FROM care_logs cl JOIN user_cultivations uc ON uc.id=cl.user_cultivation_id WHERE uc.user_id=?',[user]);
  const points=await rows(db,'SELECT COALESCE(SUM(points),0) AS total FROM point_transactions WHERE user_id=?',[user]);
  const dates=await rows(db,"SELECT source_reference AS day FROM point_transactions WHERE user_id=? AND source_type='daily_reward' ORDER BY source_reference DESC",[user]);
  const today=localDate(); let streak=0;
  const dateSet=new Set(dates.map(d=>d.day));
  let day=new Date(`${today}T00:00:00+07:00`);
  if(!dateSet.has(today)) day=new Date(day.getTime()-86400000);
  while(dateSet.has(localDate(day))) {streak++;day=new Date(day.getTime()-86400000);}
  const totalCareCount=Number(count[0].total);
  const level=totalCareCount>=20?5:totalCareCount>=10?4:totalCareCount>=6?3:totalCareCount>=3?2:1;
  return { totalCareCount,totalPoints:Number(points[0].total),streakDays:streak,dailyRewardDate:dateSet.has(today)?today:'',level };
}
export async function journal(db:DB,user:string,offset=0) {
  const types=await typeMap(db);
  return (await rows(db,`SELECT cl.id,cl.performed_at,sca.slot_key,s.slug,s.category_id FROM care_logs cl
    JOIN user_cultivations uc ON uc.id=cl.user_cultivation_id JOIN species s ON s.id=uc.species_id
    JOIN species_care_actions sca ON sca.id=cl.species_care_action_id WHERE uc.user_id=? ORDER BY cl.id DESC LIMIT 500 OFFSET ?`,[user,offset]))
    .map(r=>({id:String(r.id),createdAt:iso(r.performed_at),type:types[r.category_id],variety:r.slug,slot:r.slot_key}));
}
export async function schedules(db:DB,user:string) {
  const result=await rows(db,`SELECT cs.*,s.slug,sca.slot_key,
    (SELECT MAX(cl.local_date) FROM care_logs cl WHERE cl.schedule_id=cs.id) AS last_done
    FROM care_schedules cs JOIN user_cultivations uc ON uc.id=cs.user_cultivation_id
    JOIN species s ON s.id=uc.species_id JOIN species_care_actions sca ON sca.id=cs.species_care_action_id WHERE uc.user_id=? ORDER BY cs.id`,[user]);
  return Object.fromEntries(result.map(r=>{const today=localDate(new Date(),r.timezone);const done=r.last_done instanceof Date?`${r.last_done.getFullYear()}-${String(r.last_done.getMonth()+1).padStart(2,'0')}-${String(r.last_done.getDate()).padStart(2,'0')}`:String(r.last_done).slice(0,10);
    return [`${r.slug}-${r.slot_key}`,{id:String(r.id),enabled:!!r.is_enabled,time:String(r.care_time).slice(0,5),...(done===today?{doneOn:today}: {})}];}));
}
export async function bootstrap(db:DB,user:string) {
  const cultivations=await rows(db,`SELECT uc.id,uc.metrics_json,uc.visual_state,uc.started_at,s.slug,s.name,s.category_id
    FROM user_cultivations uc JOIN species s ON s.id=uc.species_id WHERE uc.user_id=? AND uc.status='active' ORDER BY uc.id`,[user]);
  const types=await typeMap(db);
  const prefs=(await rows(db,'SELECT preferences_json FROM user_preferences WHERE user_id=?',[user]))[0];
  const preferences=json<Record<string,unknown>>(prefs?.preferences_json,{});
  return { profile:await profile(db,user),cultivations:cultivations.map(c=>({...c,id:String(c.id),started_at:iso(c.started_at),type:types[c.category_id],metrics:json(c.metrics_json,{})})),
    selected:preferences.selected||{},activePetType:preferences.activePetType||'tunas',schedules:await schedules(db,user),careRecords:await journal(db,user),...await progress(db,user) };
}
export async function performCare(db:DB,user:string,ucId:string,slot:string,event:string,scheduleId?:string) {
  const uc=await owned(db,'user_cultivations',ucId,user);
  const actions=await rows(db,`SELECT sca.id,sca.effect_config_json FROM species_care_actions sca JOIN care_actions ca ON ca.id=sca.care_action_id
    WHERE sca.species_id=? AND sca.slot_key=? AND sca.is_active=1 AND ca.is_active=1`,[uc.species_id,slot]);
  if(!actions.length) throw new HttpError(422,'Tindakan tidak tersedia untuk jenis ini.');
  let occurrenceDate=localDate();
  if(!scheduleId) {
    const pending=await rows(db,`SELECT cs.id,cs.timezone FROM care_schedules cs WHERE cs.user_cultivation_id=? AND cs.species_care_action_id=? AND cs.is_enabled=1 ORDER BY cs.id LIMIT 1`,[ucId,actions[0].id]);
    if(pending.length) {
      const day=localDate(new Date(),pending[0].timezone);
      const done=await rows(db,'SELECT id FROM care_logs WHERE schedule_id=? AND local_date=? LIMIT 1',[pending[0].id,day]);
      if(!done.length)scheduleId=String(pending[0].id);
    }
  }
  if(scheduleId) {
    const schedule=await rows(db,'SELECT id,timezone FROM care_schedules WHERE id=? AND user_cultivation_id=? AND species_care_action_id=? AND is_enabled=1',[scheduleId,ucId,actions[0].id]);
    if(!schedule.length) throw new HttpError(404,'Jadwal tidak ditemukan.');
    occurrenceDate=localDate(new Date(),schedule[0].timezone||'Asia/Jakarta');
  }
  const previous=await rows(db,`SELECT id FROM care_logs WHERE user_cultivation_id=? AND (client_event_id=? OR (? IS NOT NULL AND schedule_id=? AND local_date=?)) LIMIT 1`,[ucId,event,scheduleId||null,scheduleId||null,occurrenceDate]);
  if(previous.length) return;
  const metrics=applyEffects(json(uc.metrics_json,{}),json(actions[0].effect_config_json,{}));
  const category=(await rows(db,'SELECT category_id FROM species WHERE id=?',[uc.species_id]))[0];
  const types=await typeMap(db);
  const visual=metrics.stat1<=25||metrics.stat2<=25||metrics.stat3<=30?(types[category.category_id]==='tunas'?'wilted':'sick'):'normal';
  await db.execute('UPDATE user_cultivations SET metrics_json=?,visual_state=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?',[JSON.stringify(metrics),visual,ucId,user]);
  await db.execute(`INSERT INTO care_logs (user_cultivation_id,species_care_action_id,schedule_id,client_event_id,performed_at,local_date,created_at)
    VALUES (?,?,?,?,UTC_TIMESTAMP(3),?,UTC_TIMESTAMP(3))`,[ucId,actions[0].id,scheduleId||null,event,occurrenceDate]);
}
