import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { PoolConnection, ResultSetHeader } from 'mysql2/promise';
import { processImage } from '../admin/media.js';

export async function privateImage(db:PoolConnection,root:string,user:string,buffer:Buffer) {
  const image=await processImage(buffer),filename=`${randomUUID()}.webp`,storagePath=`/api/v1/member/media/${filename}`;
  await mkdir(path.join(root,'private'),{recursive:true});
  const target=path.join(root,'private',filename);
  await writeFile(target,image.data,{flag:'wx'});
  try {
    const [result]=await db.execute<ResultSetHeader>(`INSERT INTO media_assets
      (storage_path,original_name,mime_type,size_bytes,width_px,height_px,visibility,uploaded_by)
      VALUES (?,?,'image/webp',?,?,?,'private',?)`,[storagePath,filename,image.data.length,image.info.width,image.info.height,user]);
    return {id:String(result.insertId),storagePath,target};
  } catch(e) {await unlink(target).catch(()=>{});throw e;}
}
