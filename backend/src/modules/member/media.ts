import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { processImage } from '../admin/media.js';
import sharp from 'sharp';
import { rows, type DB } from './data.js';
import { HttpError } from '../../utils/http.js';

export async function privateImage(db:PoolConnection,root:string,user:string,buffer:Buffer,purpose='Foto profil') {
  const image=await processImage(buffer),filename=`${randomUUID()}.webp`,storagePath=`/api/v1/member/media/${filename}`;
  await mkdir(path.join(root,'private'),{recursive:true});
  const target=path.join(root,'private',filename);
  await writeFile(target,image.data,{flag:'wx'});
  try {
    const [result]=await db.execute<ResultSetHeader>(`INSERT INTO media_assets
      (storage_path,original_name,mime_type,size_bytes,width_px,height_px,visibility,uploaded_by,alt_text)
      VALUES (?,?,'image/webp',?,?,?,'private',?,?)`,[storagePath,filename,image.data.length,image.info.width,image.info.height,user,purpose]);
    return {id:String(result.insertId),storagePath,target};
  } catch(e) {await unlink(target).catch(()=>{});throw e;}
}

export async function consultationImage(db:DB,root:string,user:string,mediaId:string,conversationId:string,read:boolean) {
  const asset=(await rows(db,`SELECT a.storage_path,a.mime_type FROM media_assets a WHERE a.id=? AND a.uploaded_by=? AND a.visibility='private'
    AND (a.alt_text='Foto konsultasi' OR EXISTS(SELECT 1 FROM chat_messages m WHERE m.media_asset_id=a.id AND m.conversation_id=?))
    AND NOT EXISTS(SELECT 1 FROM users u WHERE u.avatar_url=a.storage_path)`,[mediaId,user,conversationId]))[0];
  if(!asset||asset.mime_type!=='image/webp'||!/^\/api\/v1\/member\/media\/[a-f0-9-]{36}\.webp$/.test(asset.storage_path))throw new HttpError(404,'Foto konsultasi tidak ditemukan.');
  if(!read)return undefined;
  try {
    const base=await realpath(path.resolve(root,'private'));
    const target=await realpath(path.resolve(base,path.basename(asset.storage_path)));
    if(path.dirname(target)!==base)throw Error();
    const data=await readFile(target);
    if(data.length>5*1024*1024)throw Error();
    const meta=await sharp(data,{limitInputPixels:16000000}).metadata();
    if(meta.format!=='webp'||!meta.width||!meta.height||meta.width>1600||meta.height>1600||(meta.pages||1)>1)throw Error();
    return {data,mimeType:'image/webp' as const};
  } catch {throw new HttpError(422,'Foto tidak dapat dibaca. Pilih dan unggah ulang foto.');}
}
