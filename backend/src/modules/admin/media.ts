import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { HttpError } from '../../utils/http.js';
import { audit } from './catalog.js';
import { transaction } from './provision.js';

export async function processImage(buffer: Buffer) {
  try {
    const image = sharp(buffer, { limitInputPixels: 16000000, animated: false });
    const meta = await image.metadata();
    if (!['jpeg','png','webp'].includes(meta.format || '') || !meta.width || !meta.height || meta.width>4096 || meta.height>4096 || (meta.pages || 1)>1) throw Error();
    return await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  } catch { throw new HttpError(400,'Gambar harus JPEG, PNG, atau WebP statis, maksimal 4096 × 4096 piksel.'); }
}
export async function saveMedia(pool: Pool, root: string, speciesId: string, state: string, alt: string, buffer: Buffer, actor: string) {
  const image = await processImage(buffer);
  const filename = `${randomUUID()}.webp`;
  const storagePath = `/api/v1/media/${filename}`;
  await mkdir(root,{ recursive: true });
  const target = path.join(root,filename);
  try {
    await writeFile(target,image.data,{ flag: 'wx' });
    await transaction(pool, async db => {
      const [species] = await db.execute<RowDataPacket[]>('SELECT id FROM species WHERE id=? FOR UPDATE',[speciesId]);
      if (!species.length) throw new HttpError(404,'Pet tidak ditemukan.');
      const [media] = await db.execute<ResultSetHeader>(`INSERT INTO media_assets
        (storage_path,original_name,mime_type,size_bytes,width_px,height_px,alt_text,visibility,uploaded_by)
        VALUES (?,?,'image/webp',?,?,?,?,'public',?)`,[storagePath,filename,image.data.length,image.info.width,image.info.height,alt,actor]);
      // Keep old associations and shared assets. The newest illustration sorts first for this state.
      const [orders] = await db.execute<RowDataPacket[]>('SELECT COALESCE(MIN(sort_order),1)-1 AS next_order FROM species_media WHERE species_id=? AND state_key=?',[speciesId,state]);
      await db.execute('INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order) VALUES (?,?,?,?)',[speciesId,media.insertId,state,orders[0].next_order]);
      await audit(db,actor,'upload-image','species',speciesId);
    });
    return { storagePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') await unlink(target).catch(() => {});
    throw error;
  }
}
