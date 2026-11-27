import {rows,multiPetReady,type DB} from '../member/shared.js';
import {ordinaryMember} from '../member-auth/service.js';

export async function petSummary(db:DB,user?:string){
  const ready=await multiPetReady(db);
  if(!ready)return {ready:false,active:0,individual:0,group:0,archived:0,unconfirmed:0};
  const r=(await rows(db,`SELECT COALESCE(SUM(uc.status='active'),0) AS active,COALESCE(SUM(uc.status='active' AND pet_mode='individual'),0) AS individual,
    COALESCE(SUM(uc.status='active' AND pet_mode='group'),0) AS grouped,COALESCE(SUM(uc.status='archived'),0) AS archived,COALESCE(SUM(ownership_confirmed_at IS NULL),0) AS unconfirmed
    FROM user_cultivations uc JOIN users u ON u.id=uc.user_id WHERE ${ordinaryMember} ${user?'AND uc.user_id=?':''}`,user?[user]:[]))[0];
  return {ready:true,active:Number(r.active),individual:Number(r.individual),group:Number(r.grouped),archived:Number(r.archived),unconfirmed:Number(r.unconfirmed)};
}
export async function memberPets(db:DB,user:string,page:number){
  const summary=await petSummary(db,user);
  if(!summary.ready)return {summary,items:[],total:0,page};
  const records=await rows(db,`SELECT uc.id,uc.nickname,uc.pet_mode,uc.quantity,uc.location_label,uc.status,uc.ownership_confirmed_at,uc.archived_at,s.name AS species_name,c.name AS category_name
    FROM user_cultivations uc JOIN species s ON s.id=uc.species_id JOIN cultivation_categories c ON c.id=s.category_id WHERE uc.user_id=? ORDER BY uc.id DESC LIMIT 20 OFFSET ?`,[user,(page-1)*20]);
  const count=(await rows(db,'SELECT COUNT(*) AS total FROM user_cultivations WHERE user_id=?',[user]))[0];
  return {summary,items:records.map(r=>({id:String(r.id),nickname:r.nickname||r.species_name,speciesName:r.species_name,categoryName:r.category_name,petMode:r.pet_mode,quantity:Number(r.quantity),locationLabel:r.location_label||'',status:r.status,ownershipConfirmed:Boolean(r.ownership_confirmed_at)})),total:Number(count.total),page};
}
