import type {Pool,PoolConnection,RowDataPacket} from 'mysql2/promise';
import {HttpError} from '../../utils/http.js';
export type DB=Pool|PoolConnection;
export const json=<T>(value:unknown,fallback:T):T=>value==null?fallback:typeof value==='string'?JSON.parse(value):value as T;
export function careNotes(value:unknown):Record<string,any>{try{const v=json<unknown>(value,{});return v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};}catch{return {};}}
export async function rows(db:DB,sql:string,params:unknown[]=[]){const [result]=await db.query<RowDataPacket[]>(sql,params);return result;}
export const localDate=(date=new Date(),timeZone='Asia/Jakarta')=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const iso=(v:unknown)=>v instanceof Date?new Date(v.getTime()-v.getTimezoneOffset()*60000).toISOString():`${String(v).replace(' ','T')}Z`;
export async function owned(db:DB,table:'user_cultivations'|'chat_conversations',key:string,user:string){
  const result=await rows(db,`SELECT * FROM ${table} WHERE id=? AND user_id=?`,[key,user]);
  if(!result.length)throw new HttpError(404,'Data tidak ditemukan.');return result[0];
}
export async function typeMap(db:DB){
  const categories=await rows(db,'SELECT id,parent_id,habitat_key FROM cultivation_categories');
  const result:Record<string,string>={};
  for(const category of categories){let current=category;const seen=new Set<string>();
    while(current&&!seen.has(String(current.id))){seen.add(String(current.id));if(current.habitat_key){result[String(category.id)]=({kebun:'tunas',kolam:'koki',kandang:'kuning'} as Record<string,string>)[current.habitat_key];break;}current=categories.find(c=>String(c.id)===String(current.parent_id))!;}
  }return result;
}
export const initialMetrics=(type:string)=>type==='tunas'?{stat1:30,stat2:10,stat3:25}:{stat1:15,stat2:40,stat3:30};
export function applyEffects(metrics:Record<string,number>,effects:Record<string,number>){return Object.fromEntries(['stat1','stat2','stat3'].map(k=>[k,Math.max(0,Math.min(100,(Number(metrics[k])||0)+(Number(effects[k])||0)))]));}
export function visualState(type:string,metrics:Record<string,number>){return metrics.stat1<=25||metrics.stat2<=25||metrics.stat3<=30?(type==='tunas'?'wilted':'sick'):'normal';}
export async function multiPetReady(db:DB){
  try{
    await db.query('SELECT pet_mode,quantity,location_label,ownership_confirmed_at,archived_at,archive_reason,create_request_id,create_request_hash FROM user_cultivations LIMIT 0');
    await db.query('SELECT batch_id,pet_name_at_care,quantity_at_care FROM care_logs LIMIT 0');
    const constraints=await rows(db,`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()
      AND ((TABLE_NAME='user_cultivations' AND CONSTRAINT_NAME IN ('uq_uc_create_request','chk_uc_mode_quantity')) OR (TABLE_NAME='care_logs' AND CONSTRAINT_NAME='uq_care_logs_client_event'))`);
    return new Set(constraints.map(c=>c.CONSTRAINT_NAME)).size===3;
  }catch(error){if(['ER_BAD_FIELD_ERROR','ER_NO_SUCH_TABLE'].includes((error as {code:string}).code))return false;throw error;}
}
export async function requirePetSchema(db:DB){if(!await multiPetReady(db))throw new HttpError(503,'Pet Saya belum tersedia. Hubungi pengelola untuk memperbarui database.','MULTI_PET_SCHEMA_NOT_READY');}
export const orderedIds=(ids:string[])=>[...ids].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
