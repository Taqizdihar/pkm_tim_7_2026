import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {ResultSetHeader} from 'mysql2/promise';
import {HttpError} from '../../utils/http.js';
import {id} from '../member-auth/validation.js';
import {rows,json,owned,iso,initialMetrics,typeMap,visualState,type DB} from './shared.js';

export const petInfo=z.object({nickname:z.string().trim().min(1).max(120),pet_mode:z.enum(['individual','group']),quantity:z.number().int().min(1).max(1000000),location_label:z.string().trim().max(160).default('')}).strict()
  .refine(b=>b.pet_mode==='group'||b.quantity===1,{message:'Pet individual harus berjumlah satu.',path:['quantity']});
export const createPetInput=petInfo.safeExtend({species_slug:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),ownership_confirmed:z.literal(true),client_request_id:z.string().uuid()});
export const confirmPetInput=petInfo.safeExtend({ownership_confirmed:z.literal(true)});
export const archiveReasons=['harvested','sold','no_longer_cared','died','incorrect','other'] as const;
export async function catalogDescriptor(db:DB,speciesId:string){
  const s=(await rows(db,`SELECT s.id,s.slug,s.name,s.status,s.category_id,c.name AS category_name FROM species s JOIN cultivation_categories c ON c.id=s.category_id WHERE s.id=?`,[speciesId]))[0];
  if(!s)throw new HttpError(404,'Jenis budidaya tidak ditemukan.');
  const types=await typeMap(db);
  const media=await rows(db,`SELECT sm.state_key,a.storage_path FROM species_media sm JOIN media_assets a ON a.id=sm.media_asset_id WHERE sm.species_id=? AND a.visibility='public' ORDER BY sm.sort_order,sm.id`,[speciesId]);
  const actions=await rows(db,`SELECT ca.id,sca.id AS association_id,sca.slot_key,ca.name,COALESCE(sca.description,ca.description,'') AS description,ca.icon_key FROM species_care_actions sca JOIN care_actions ca ON ca.id=sca.care_action_id WHERE sca.species_id=? AND sca.is_active=1 AND ca.is_active=1 ORDER BY sca.sort_order,sca.id`,[speciesId]);
  const guides=await rows(db,"SELECT title,body_text FROM cultivation_guides WHERE species_id=? AND status='published' ORDER BY sort_order,id",[speciesId]);
  return {id:String(s.id),slug:s.slug,name:s.name,type:types[String(s.category_id)]||null,categoryName:s.category_name,status:s.status,
    images:Object.fromEntries([...media].reverse().map(m=>[m.state_key,m.storage_path])),careActions:actions.map(a=>({id:String(a.id),associationId:String(a.association_id),slot:a.slot_key,label:a.name,description:a.description,icon:a.icon_key})),guides:guides.map(g=>({title:g.title,bodyText:g.body_text}))};
}
export async function listPets(db:DB,user:string){
  const records=await rows(db,'SELECT * FROM user_cultivations WHERE user_id=? ORDER BY id',[user]);
  const descriptors=new Map<string,Awaited<ReturnType<typeof catalogDescriptor>>>();
  for(const r of records)if(!descriptors.has(String(r.species_id)))descriptors.set(String(r.species_id),await catalogDescriptor(db,String(r.species_id)));
  return records.map(r=>({id:String(r.id),species:descriptors.get(String(r.species_id))!,nickname:r.nickname||descriptors.get(String(r.species_id))!.name,
    petMode:r.pet_mode,quantity:Number(r.quantity),locationLabel:r.location_label||'',metrics:json(r.metrics_json,initialMetrics(descriptors.get(String(r.species_id))!.type||'')),visualState:r.visual_state,
    status:r.status,ownershipConfirmed:Boolean(r.ownership_confirmed_at),startedAt:iso(r.started_at),archivedAt:r.archived_at?iso(r.archived_at):null,archiveReason:r.archive_reason||null}));
}
export async function availableSpecies(db:DB,slug:string){
  const s=(await rows(db,"SELECT id,category_id FROM species WHERE slug=? AND status='published'",[slug]))[0];
  if(!s)throw new HttpError(422,'Jenis ini tidak tersedia untuk Pet baru.');
  const cats=await rows(db,'SELECT id,parent_id,is_active,habitat_key FROM cultivation_categories');
  let cat=cats.find(c=>String(c.id)===String(s.category_id));const seen=new Set<string>();let habitat:string|undefined;
  while(cat){if(!Number(cat.is_active)||seen.has(String(cat.id)))throw new HttpError(422,'Kategori jenis ini tidak tersedia.');seen.add(String(cat.id));habitat ||= cat.habitat_key;cat=cat.parent_id?cats.find(c=>String(c.id)===String(cat!.parent_id)):undefined;}
  const type=({kebun:'tunas',kolam:'koki',kandang:'kuning'} as Record<string,string>)[habitat||''];
  if(!type)throw new HttpError(422,'Kategori jenis ini belum dapat dipakai.');return {id:String(s.id),category_id:String(s.category_id),type};
}
export async function createPet(db:DB,user:string,input:z.infer<typeof createPetInput>){
  const {client_request_id,...payload}=input,hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const previous=(await rows(db,'SELECT id,create_request_hash FROM user_cultivations WHERE user_id=? AND create_request_id=?',[user,client_request_id]))[0];
  if(previous){if(previous.create_request_hash!==hash)throw new HttpError(409,'Permintaan ini sudah dipakai untuk Pet berbeda.','REQUEST_CONFLICT');return String(previous.id);}
  const species=await availableSpecies(db,input.species_slug),metrics=initialMetrics(species.type);
  const [result]=await db.execute<ResultSetHeader>(`INSERT INTO user_cultivations (user_id,species_id,nickname,pet_mode,quantity,location_label,ownership_confirmed_at,create_request_id,create_request_hash,metrics_json,visual_state,status,started_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3),?,?,?,?,'active',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[user,species.id,input.nickname,input.pet_mode,input.quantity,input.location_label||null,client_request_id,hash,JSON.stringify(metrics),visualState(species.type,metrics)]);
  return String(result.insertId);
}
export async function savePet(db:DB,user:string,key:string,input:z.infer<typeof petInfo>,confirm=false){
  await owned(db,'user_cultivations',key,user);
  await db.execute(`UPDATE user_cultivations SET nickname=?,pet_mode=?,quantity=?,location_label=?,ownership_confirmed_at=${confirm?'UTC_TIMESTAMP(3)':'ownership_confirmed_at'},updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?`,[input.nickname,input.pet_mode,input.quantity,input.location_label||null,key,user]);
}
export async function selections(db:DB,user:string,pets:Awaited<ReturnType<typeof listPets>>){
  const p=json<Record<string,any>>((await rows(db,'SELECT preferences_json FROM user_preferences WHERE user_id=?',[user]))[0]?.preferences_json,{});
  const selected:Record<string,string|null>={};
  for(const type of ['tunas','koki','kuning']){
    const eligible=pets.filter(p=>p.status==='active'&&p.species.type===type);
    selected[type]=eligible.find(c=>c.id===String(p.selectedCultivations?.[type]))?.id||eligible.find(c=>c.species.slug===p.selected?.[type])?.id||eligible[0]?.id||null;
  }return {selectedCultivations:selected,activePetType:['tunas','koki','kuning'].includes(p.activePetType)?p.activePetType:'tunas'};
}
export const selectionInput=z.object({type:z.enum(['tunas','koki','kuning']),cultivation_id:id.nullable()}).strict();
export async function selectPet(db:DB,user:string,type:string,key:string|null){
  if(key){const uc=await owned(db,'user_cultivations',key,user),types=await typeMap(db),s=(await rows(db,'SELECT category_id FROM species WHERE id=?',[uc.species_id]))[0];
    if(uc.status!=='active'||types[String(s.category_id)]!==type)throw new HttpError(422,'Pet tidak tersedia dalam kategori ini.');}
  const p=json<Record<string,any>>((await rows(db,'SELECT preferences_json FROM user_preferences WHERE user_id=?',[user]))[0]?.preferences_json,{});
  p.selectedCultivations={...p.selectedCultivations,[type]:key};p.activePetType=type;
  await db.execute('UPDATE user_preferences SET preferences_json=? WHERE user_id=?',[JSON.stringify(p),user]);
}
export async function archivePet(db:DB,user:string,key:string,reason:string){
  await owned(db,'user_cultivations',key,user);
  await db.execute("UPDATE user_cultivations SET status='archived',archived_at=COALESCE(archived_at,UTC_TIMESTAMP(3)),archive_reason=?,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?",[reason,key,user]);
  await db.execute('UPDATE care_schedules SET is_enabled=0 WHERE user_cultivation_id=?',[key]);
  const pets=await listPets(db,user),next=await selections(db,user,pets);
  const p=json<Record<string,any>>((await rows(db,'SELECT preferences_json FROM user_preferences WHERE user_id=?',[user]))[0]?.preferences_json,{});
  await db.execute('UPDATE user_preferences SET preferences_json=? WHERE user_id=?',[JSON.stringify({...p,...next}),user]);
}
export async function restorePet(db:DB,user:string,key:string){
  const pet=await owned(db,'user_cultivations',key,user);
  // Existing species may be archived in the catalog; their identity and disabled schedules remain.
  await db.execute("UPDATE user_cultivations SET status='active',archived_at=NULL,archive_reason=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?",[key,user]);
  return pet;
}
