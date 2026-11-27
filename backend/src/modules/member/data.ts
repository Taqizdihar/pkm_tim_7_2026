import {rows,json,localDate,multiPetReady,type DB} from './shared.js';
import {listPets,selections} from './pets.js';
import {schedules} from './scheduling.js';
import {journal} from './journal.js';
export * from './shared.js';
export {performCare} from './care.js';
export {schedules} from './scheduling.js';
export {journal} from './journal.js';

export async function profile(db:DB,user:string){
  const p=(await rows(db,`SELECT u.name,u.email,u.username,u.phone_number,u.avatar_url,p.* FROM users u JOIN user_preferences p ON p.user_id=u.id WHERE u.id=?`,[user]))[0];
  return {name:p.name,email:p.email||'',username:p.username||'',phoneNumber:p.phone_number||'',avatarUrl:p.avatar_url||'/assets/generated/avatar-penyuluh.png',region:p.region||'',careFocus:json(p.care_focus_json,['tanaman']),textSize:p.text_size,soundEnabled:Boolean(Number(p.sound_enabled)),reminderEnabled:Boolean(Number(p.reminder_enabled)),language:'Indonesia',isLoggedIn:true};
}
export async function progress(db:DB,user:string,ready?:boolean){
  const extended=ready??await multiPetReady(db);
  const count=await rows(db,`SELECT ${extended?'COUNT(DISTINCT cl.batch_id)+COALESCE(SUM(cl.batch_id IS NULL),0)':'COUNT(*)'} AS total FROM care_logs cl JOIN user_cultivations uc ON uc.id=cl.user_cultivation_id WHERE uc.user_id=?`,[user]);
  const points=await rows(db,'SELECT COALESCE(SUM(points),0) AS total FROM point_transactions WHERE user_id=?',[user]);
  const dates=await rows(db,"SELECT source_reference AS day FROM point_transactions WHERE user_id=? AND source_type='daily_reward' ORDER BY source_reference DESC",[user]);
  const dateSet=new Set(dates.map(d=>d.day));let streak=0,day=new Date(`${localDate()}T00:00:00+07:00`);
  if(!dateSet.has(localDate()))day=new Date(day.getTime()-86400000);
  while(dateSet.has(localDate(day))){streak++;day=new Date(day.getTime()-86400000);}
  const totalCareCount=Number(count[0].total),level=totalCareCount>=20?5:totalCareCount>=10?4:totalCareCount>=6?3:totalCareCount>=3?2:1;
  return {totalCareCount,totalPoints:Number(points[0].total),streakDays:streak,dailyRewardDate:dateSet.has(localDate())?localDate():'',level};
}
export async function bootstrap(db:DB,user:string){
  const ready=await multiPetReady(db),cultivations=ready?await listPets(db,user):[];
  const selection=await selections(db,user,cultivations),history=ready?await journal(db,user):{items:[],total:0,hasMore:false};
  return {profile:await profile(db,user),cultivations,...selection,schedules:ready?await schedules(db,user):[],careRecords:history.items,journalTotal:history.total,journalHasMore:history.hasMore,multiPetReady:ready,...await progress(db,user,ready)};
}
