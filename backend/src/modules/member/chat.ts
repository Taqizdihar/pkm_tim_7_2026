import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { rows, owned, iso, type DB } from './data.js';
import {GROW_GUIDES,yellowLeafAdvice} from './guides.js';

export async function conversation(db:DB,user:string,key:string,offset=0) {
  const c=await owned(db,'chat_conversations',key,user);
  const messages=await rows(db,`SELECT m.*,a.storage_path FROM chat_messages m LEFT JOIN media_assets a ON a.id=m.media_asset_id
    AND a.uploaded_by=? AND a.visibility='private' WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT 100 OFFSET ?`,[user,key,offset]);
  messages.reverse();
  return {id:String(c.id),title:c.title,snippet:messages.at(-1)?.content||'',updatedAt:iso(c.updated_at),timestamp:'',dateCategory:'hari_ini',dateLabel:'',
    messages:messages.map(m=>({id:String(m.id),sender:m.role,text:m.content,timestamp:new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'}).format(new Date(iso(m.created_at))),...(m.storage_path?{photoUrl:m.storage_path,photoName:'Foto konsultasi'}:{})}))};
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
export async function addMessage(db:PoolConnection,user:string,key:string,content:string,mediaId?:string,species?:string) {
  await owned(db,'chat_conversations',key,user);
  const reply=await localReply(db,content,species);
  await db.execute("INSERT INTO chat_messages (conversation_id,role,content,media_asset_id,created_at) VALUES (?,'user',?,?,UTC_TIMESTAMP(3))",[key,content,mediaId||null]);
  await db.execute("INSERT INTO chat_messages (conversation_id,role,content,created_at) VALUES (?,'assistant',?,UTC_TIMESTAMP(3))",[key,reply]);
  await db.execute('UPDATE chat_conversations SET updated_at=UTC_TIMESTAMP(3) WHERE id=? AND user_id=?',[key,user]);
}
export async function newConversation(db:PoolConnection,user:string,title:string) {
  const [result]=await db.execute<ResultSetHeader>('INSERT INTO chat_conversations (user_id,title,created_at,updated_at) VALUES (?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))',[user,title]);
  return String(result.insertId);
}
