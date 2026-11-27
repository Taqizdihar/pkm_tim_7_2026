import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { rows, owned, iso, type DB } from './data.js';
import {GROW_GUIDES,yellowLeafAdvice} from './guides.js';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'mysql2/promise';
import type { Member, MemberAuth } from '../member-auth/service.js';
import type { AIService } from '../../integrations/ai/router.js';
import { localProvider } from '../../integrations/ai/local.js';
import { redact } from '../../integrations/ai/prompts.js';
import type { ConsultationResponse } from '../../integrations/ai/types.js';
import { HttpError } from '../../utils/http.js';
import { json } from './data.js';
import { consultationImage } from './media.js';

export async function conversation(db:DB,user:string,key:string,offset=0) {
  const c=await owned(db,'chat_conversations',key,user);
  const messages=await rows(db,`SELECT m.*,a.storage_path FROM chat_messages m LEFT JOIN media_assets a ON a.id=m.media_asset_id
    AND a.uploaded_by=? AND a.visibility='private' WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT 100 OFFSET ?`,[user,key,offset]);
  messages.reverse();
  return {id:String(c.id),title:c.title,snippet:messages.at(-1)?.content||'',updatedAt:iso(c.updated_at),timestamp:'',dateCategory:'hari_ini',dateLabel:'',
    messages:messages.map(m=>({id:String(m.id),sender:m.role,text:m.content,timestamp:new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).format(new Date(iso(m.created_at))),
      ...(m.role==='assistant'?{providerMetadata:publicMetadata(m.rag_metadata_json)}:{}),
      ...(m.role==='user'&&m.client_request_id?{request:{...json<Record<string,unknown>>(m.rag_metadata_json,{}),client_request_id:m.client_request_id,state:m.request_state,media_id:m.media_asset_id?String(m.media_asset_id):undefined}}:{}),
      ...(m.storage_path?{photoUrl:m.storage_path,photoName:'Foto konsultasi'}:{})}))};
}
export function publicMetadata(value: unknown) {
  const m=json<Record<string,any>>(value,{});
  if(!['gemini','rag','local'].includes(m.provider))return undefined;
  return {provider:m.provider,model:typeof m.model==='string'?m.model:undefined,imageAnalyzed:m.imageAnalyzed===true,
    fallbackUsed:m.fallbackUsed===true,fallbackReason:typeof m.fallbackReason==='string'?m.fallbackReason:undefined,refused:m.refused===true,
    latencyMs:typeof m.latencyMs==='number'?m.latencyMs:undefined};
}
export async function localReply(db:DB,question:string,speciesSlug?:string) {
  const text=question.toLowerCase().replace(/\bcabe\b/g,'cabai');
  const species=await rows(db,"SELECT s.slug,s.name FROM species s WHERE s.status='published' AND (s.slug=? OR LOCATE(LOWER(s.name),?)>0) ORDER BY s.sort_order LIMIT 1",[speciesSlug||'',text]);
  const plant=species[0];
  let reply:string;
  if(/ikan|kolam|lele|nila/.test(text)) reply='Berikan pakan sedikit demi sedikit. Periksa warna, bau, dan kebersihan air kolam. Lakukan pergantian air secara bertahap. Pisahkan ikan yang lemah dan hubungi petugas perikanan jika kondisinya memburuk.';
  else if(/ayam|kandang|telur/.test(text)) reply='Sediakan air minum bersih dan pakan sesuai umur ayam. Jaga kandang dan sarang tetap bersih, kering, dan berventilasi. Periksa sarang dan catat perubahan kondisi ayam.';
  else if(/kuning/.test(text)) reply=plant?yellowLeafAdvice(plant.name.toLowerCase()):'Periksa kelembapan tanah, bagian bawah daun, serta apakah perubahan muncul pada daun tua atau muda. Jangan langsung menambah pupuk sebelum penyebabnya diperiksa.';
  else if(/hama|ulat|kutu|bercak/.test(text)) reply='Periksa bagian bawah daun dan luas perubahan yang terlihat. Singkirkan hama yang terlihat dan jaga kebersihan area tanam. Ikuti petunjuk label jika memakai produk pengendali hama.';
  else if(/pupuk|nutrisi/.test(text)) reply='Gunakan kompos matang atau pupuk sesuai kebutuhan tanaman dan petunjuk kemasan. Mulai dari dosis rendah. Periksa penyebab daun berubah warna sebelum menambah pupuk.';
  else if(/siram|air|layu/.test(text)) reply='Periksa kelembapan media terlebih dahulu. Siram saat lapisan atas mulai kering dan pastikan air dapat keluar melalui drainase. Sesuaikan dengan jenis tanaman dan kondisi cuaca.';
  else if(plant&&GROW_GUIDES[plant.slug])reply=`Langkah awal budidaya ${plant.name.toLowerCase()}:\n\n${GROW_GUIDES[plant.slug]!.map((s,i)=>`${i+1}. ${s}`).join('\n\n')}`;
  else reply='Ceritakan jenis tanaman atau hewan, perubahan yang terlihat, sejak kapan terjadi, dan perawatan terakhirnya.';
  if(/budidaya|menanam|tutorial/.test(text)||speciesSlug) {
    const guides=await rows(db,`SELECT g.title,g.body_text FROM cultivation_guides g JOIN species s ON s.id=g.species_id
      WHERE g.status='published' AND s.status='published' AND (s.slug=? OR LOCATE(LOWER(s.name),?)>0) ORDER BY g.sort_order LIMIT 1`,[speciesSlug||'',text]);
    if(guides.length) reply=`${guides[0].title}\n\n${guides[0].body_text}`;
  }
  return `${reply}\n\nPanduan umum dari aplikasi, bukan analisis gambar AI. Jika gejala memburuk atau meluas, hubungi penyuluh atau petugas setempat.`;
}
export async function newConversation(db:PoolConnection,user:string,title:string,clientId?:string) {
  if(clientId) {
    const existing=await rows(db,'SELECT id FROM chat_conversations WHERE user_id=? AND client_request_id=?',[user,clientId]);
    if(existing.length)return String(existing[0].id);
  }
  const [result]=await db.execute<ResultSetHeader>('INSERT INTO chat_conversations (user_id,title,client_request_id,created_at,updated_at) VALUES (?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))',[user,title,clientId||null]);
  return String(result.insertId);
}

export const messageInput=z.object({
  content:z.string().trim().max(4000).default(''),media_id:z.string().regex(/^[1-9][0-9]{0,19}$/).optional(),
  species:z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
  intent:z.enum(['identify','condition','cause','grow','care']).default('condition'),
  client_request_id:z.string().uuid(),
  // Preserve old request hashes on retry; this retired field no longer controls routing.
  external_consent:z.boolean().default(false),
}).strict().refine(value=>value.content.length>0||Boolean(value.media_id),'Tulis pertanyaan atau lampirkan foto.');
export type MessageInput=z.infer<typeof messageInput>;

export async function generateTurn(pool:Pool,auth:MemberAuth,ai:AIService,root:string,member:Member,token:string,key:string,input:MessageInput) {
  const user=member.id,lease=randomUUID();
  const content=input.content||'Apa yang terlihat pada foto ini dan apa yang perlu diperiksa?';
  const hash=createHash('sha256').update(JSON.stringify({...input,content})).digest('hex');
  const leaseSeconds=Math.ceil(ai.totalTimeout/1000)+30;
  const reserved=await auth.mutate(user,token,async db=>{
    const c=await rows(db,'SELECT id FROM chat_conversations WHERE id=? AND user_id=? FOR UPDATE',[key,user]);
    if(!c.length)throw new HttpError(404,'Percakapan tidak ditemukan.');
    const existing=(await rows(db,`SELECT *,lease_expires_at>UTC_TIMESTAMP(3) AS lease_live FROM chat_messages
      WHERE conversation_id=? AND role='user' AND client_request_id=?`,[key,input.client_request_id]))[0];
    if(existing?.request_hash!==undefined&&existing.request_hash!==hash)throw new HttpError(409,'ID permintaan sudah dipakai untuk isi berbeda.','REQUEST_CONFLICT');
    if(existing?.request_state==='completed')return {completed:true};
    if(existing?.request_state==='pending'&&Number(existing.lease_live)===1)throw new HttpError(409,'Jawaban sedang disiapkan. Coba lagi sebentar.','CHAT_PENDING');
    const pending=await rows(db,`SELECT id FROM chat_messages WHERE conversation_id=? AND role='user' AND request_state IN ('pending','failed') AND client_request_id<>? LIMIT 1`,[key,input.client_request_id]);
    if(pending.length)throw new HttpError(409,'Selesaikan atau coba lagi pertanyaan sebelumnya terlebih dahulu.','PREVIOUS_TURN_PENDING');
    if(input.media_id)await consultationImage(db,root,user,input.media_id,key,false);
    if(existing)await db.execute(`UPDATE chat_messages SET request_state='pending',lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND) WHERE id=?`,[lease,leaseSeconds,existing.id]);
    else await db.execute(`INSERT INTO chat_messages (conversation_id,role,content,media_asset_id,client_request_id,request_hash,request_state,lease_token,lease_expires_at,rag_metadata_json,created_at)
      VALUES (?,'user',?,?,?,?,'pending',?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL ? SECOND),?,UTC_TIMESTAMP(3))`,
      [key,content,input.media_id||null,input.client_request_id,hash,lease,leaseSeconds,JSON.stringify({intent:input.intent,species:input.species})]);
    await db.execute('UPDATE chat_conversations SET updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?',[key,user]);
    return {completed:false};
  });
  if(reserved.completed)return;
  try {
    // All provider I/O is outside auth.mutate and outside a checked-out transaction.
    const history=ai.maxContext ? await rows(pool,`SELECT role,content,rag_metadata_json FROM chat_messages WHERE conversation_id=? AND (client_request_id IS NULL OR client_request_id<>?)
      AND (role='assistant' OR request_state IS NULL OR request_state='completed') ORDER BY id DESC LIMIT ?`,[key,input.client_request_id,ai.maxContext]) : [];
    const personal=[member.name,String(member.email||''),String(member.phone_number||''),String(member.username||'')];
    const context=history.reverse().filter(m=>['user','assistant'].includes(m.role)&&json<Record<string,unknown>>(m.rag_metadata_json,{}).refused!==true)
      .map(m=>({role:m.role as 'user'|'assistant',text:redact(String(m.content).slice(0,4000),personal)}));
    let species:string|undefined;
    if(input.species)species=(await rows(pool,"SELECT name FROM species WHERE slug=? AND status='published'",[input.species]))[0]?.name;
    const image=input.media_id ? await consultationImage(pool,root,user,input.media_id,key,true) : undefined;
    const response=await ai.generate({question:redact(content,personal),context,species,intent:input.intent,image},localProvider(()=>localReply(pool,content,input.species)));
    await auth.mutate(user,token,async db=>{
      const c=await rows(db,'SELECT id FROM chat_conversations WHERE id=? AND user_id=? FOR UPDATE',[key,user]);
      if(!c.length)throw new HttpError(404,'Percakapan telah dihapus.');
      const current=(await rows(db,"SELECT id,lease_token,request_state FROM chat_messages WHERE conversation_id=? AND role='user' AND client_request_id=?",[key,input.client_request_id]))[0];
      if(!current||current.lease_token!==lease||current.request_state!=='pending')throw new HttpError(409,'Permintaan sedang dipulihkan. Muat ulang percakapan.','LEASE_CHANGED');
      const metadata:ConsultationResponse=response;
      await db.execute(`INSERT INTO chat_messages (conversation_id,role,content,client_request_id,rag_metadata_json,created_at) VALUES (?,'assistant',?,?,?,UTC_TIMESTAMP(3))`,[key,response.text,input.client_request_id,JSON.stringify(metadata)]);
      await db.execute("UPDATE chat_messages SET request_state='completed',lease_token=NULL,lease_expires_at=NULL WHERE id=?",[current.id]);
      await db.execute('UPDATE chat_conversations SET updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?',[key,user]);
    });
  } catch(error) {
    // A revoked session cannot write a response. Its lease expires for a later authorized retry.
    await auth.mutate(user,token,async db=>{
      await db.execute("UPDATE chat_messages SET request_state='failed',lease_token=NULL,lease_expires_at=NULL WHERE conversation_id=? AND role='user' AND client_request_id=? AND lease_token=?",[key,input.client_request_id,lease]);
    }).catch(()=>{});
    if(error instanceof HttpError)throw error;
    throw new HttpError(503,'Jawaban belum berhasil disiapkan. Pertanyaan tersimpan; coba lagi.','CONSULTATION_UNAVAILABLE');
  }
}
