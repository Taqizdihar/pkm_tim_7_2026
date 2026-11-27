import { Router, type Response } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { MemberAuth } from '../member-auth/service.js';
import { id } from '../member-auth/validation.js';
import { HttpError } from '../../utils/http.js';
import { rows,json,bootstrap,profile,progress,journal,schedules,cultivation,performCare,owned,typeMap,localDate } from './data.js';
import { privateImage } from './media.js';
import { conversation,generateTurn,newConversation,messageInput } from './chat.js';
import { createAI, type AIService } from '../../integrations/ai/router.js';

const slot=z.enum(['action1','action2','action3']);
const slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const event=z.string().uuid();
const page=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict();
const prefs=z.object({region:z.string().trim().max(160).optional(),careFocus:z.array(z.enum(['tanaman','ikan','ayam'])).min(1).max(3).optional(),
  textSize:z.enum(['small','medium','large']).optional(),soundEnabled:z.boolean().optional(),reminderEnabled:z.boolean().optional(),language:z.literal('Indonesia').optional(),
  activePetType:z.enum(['tunas','koki','kuning']).optional()}).strict();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1,fields:0}}).single('image');

export function memberRouter(pool:Pool,auth:MemberAuth,root:string,ai:AIService=createAI()) {
  const router=Router();
  const user=(res:Response):string=>res.locals.member.id;
  const mutate=<T>(res:Response,action:(db:PoolConnection)=>Promise<T>)=>auth.mutate(user(res),res.locals.memberToken,action);
  router.get('/bootstrap',async(_req,res)=>res.json({success:true,data:await bootstrap(pool,user(res))}));
  router.get('/profile',async(_req,res)=>res.json({success:true,data:await profile(pool,user(res))}));
  router.patch('/profile',async(req,res)=>{
    const b=z.object({name:z.string().trim().min(1).max(100)}).strict().parse(req.body);
    await mutate(res,async db=>{await db.execute('UPDATE users SET name=? WHERE id=?',[b.name,user(res)]);});
    res.json({success:true,data:await profile(pool,user(res))});
  });
  router.post('/profile/avatar',upload,async(req,res)=>{
    if(!req.file) throw new HttpError(422,'Pilih gambar.'); let target='';
    try {
      const data=await mutate(res,async db=>{const media=await privateImage(db,root,user(res),req.file!.buffer);target=media.target; await db.execute('UPDATE users SET avatar_url=? WHERE id=?',[media.storagePath,user(res)]);return {storagePath:media.storagePath};});
      res.json({success:true,data});
    } catch(e) {if(target) await unlink(target).catch(()=>{});throw e;}
  });
  router.get('/media/:filename',async(req,res)=>{
    const filename=z.string().regex(/^[a-f0-9-]{36}\.webp$/).parse(req.params.filename);
    const assets=await rows(pool,`SELECT a.id FROM media_assets a WHERE a.storage_path=? AND a.uploaded_by=? AND a.visibility='private'
      AND (EXISTS(SELECT 1 FROM users u WHERE u.id=? AND u.avatar_url=a.storage_path)
        OR EXISTS(SELECT 1 FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id WHERE m.media_asset_id=a.id AND c.user_id=?))`,
      [`/api/v1/member/media/${filename}`,user(res),user(res),user(res)]);
    if(!assets.length) throw new HttpError(404,'Gambar tidak ditemukan.');res.sendFile(path.resolve(root,'private',filename));
  });
  router.get('/preferences',async(_req,res)=>res.json({success:true,data:await profile(pool,user(res))}));
  router.patch('/preferences',async(req,res)=>{
    const b=prefs.parse(req.body);
    await mutate(res,async db=>{
      const columns:Record<string,string>={region:'region',careFocus:'care_focus_json',textSize:'text_size',soundEnabled:'sound_enabled',reminderEnabled:'reminder_enabled'};
      for(const [key,value] of Object.entries(b)) if(columns[key]) await db.execute(`UPDATE user_preferences SET ${columns[key]}=? WHERE user_id=?`,[key==='careFocus'?JSON.stringify(value):value,user(res)]);
      if(b.activePetType) {
        const p=json<Record<string,unknown>>((await rows(db,'SELECT preferences_json FROM user_preferences WHERE user_id=?',[user(res)]))[0].preferences_json,{});
        p.activePetType=b.activePetType;
        await db.execute('UPDATE user_preferences SET preferences_json=? WHERE user_id=?',[JSON.stringify(p),user(res)]);
      }
    });res.json({success:true,data:await profile(pool,user(res))});
  });
  router.get('/cultivations',async(_req,res)=>res.json({success:true,data:(await bootstrap(pool,user(res))).cultivations}));
  router.post('/cultivations',async(req,res)=>{
    const b=z.object({slug}).strict().parse(req.body);
    await mutate(res,async db=>{
      const c=await cultivation(db,user(res),b.slug),types=await typeMap(db);
      const p=json<Record<string,any>>((await rows(db,'SELECT preferences_json FROM user_preferences WHERE user_id=?',[user(res)]))[0].preferences_json,{});
      p.selected={...p.selected,[types[c.category_id]]:b.slug};p.activePetType=types[c.category_id];
      await db.execute('UPDATE user_preferences SET preferences_json=? WHERE user_id=?',[JSON.stringify(p),user(res)]);
    });res.json({success:true,data:await bootstrap(pool,user(res))});
  });
  router.patch('/cultivations/:id',async(req,res)=>{
    const key=id.parse(req.params.id),b=z.object({nickname:z.string().trim().max(120)}).strict().parse(req.body);
    await mutate(res,async db=>{await owned(db,'user_cultivations',key,user(res));await db.execute('UPDATE user_cultivations SET nickname=? WHERE id=? AND user_id=?',[b.nickname,key,user(res)]);});res.json({success:true});
  });
  router.post('/cultivations/:id/care-actions',async(req,res)=>{
    const key=id.parse(req.params.id),b=z.object({slot,client_event_id:event}).strict().parse(req.body);
    await mutate(res,db=>performCare(db,user(res),key,b.slot,b.client_event_id));
    res.json({success:true,data:await bootstrap(pool,user(res))});
  });
  router.get('/schedules',async(_req,res)=>res.json({success:true,data:await schedules(pool,user(res))}));
  router.post('/schedules',async(req,res)=>{
    const b=z.object({slug,slot,time:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),enabled:z.boolean().default(true)}).strict().parse(req.body);
    await mutate(res,async db=>{
      const c=await cultivation(db,user(res),b.slug);
      const actions=await rows(db,`SELECT sca.id FROM species_care_actions sca JOIN care_actions ca ON ca.id=sca.care_action_id WHERE sca.species_id=? AND sca.slot_key=? AND sca.is_active=1 AND ca.is_active=1`,[c.species_id,b.slot]);
      if(!actions.length) throw new HttpError(422,'Tindakan tidak tersedia.');
      const exists=await rows(db,'SELECT id FROM care_schedules WHERE user_cultivation_id=? AND species_care_action_id=? ORDER BY id LIMIT 1',[c.id,actions[0].id]);
      if(exists.length) await db.execute('UPDATE care_schedules SET care_time=?,is_enabled=? WHERE id=?',[b.time,b.enabled,exists[0].id]);
      else await db.execute("INSERT INTO care_schedules (user_cultivation_id,species_care_action_id,care_time,is_enabled,timezone,recurrence) VALUES (?,?,?,?,'Asia/Jakarta','daily')",[c.id,actions[0].id,b.time,b.enabled]);
    });res.json({success:true,data:await bootstrap(pool,user(res))});
  });
  router.patch('/schedules/:id',async(req,res)=>{
    const key=id.parse(req.params.id),b=z.object({enabled:z.boolean(),time:z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/).optional()}).strict().parse(req.body);
    await mutate(res,async db=>{
      const r=await rows(db,'SELECT cs.id FROM care_schedules cs JOIN user_cultivations uc ON uc.id=cs.user_cultivation_id WHERE cs.id=? AND uc.user_id=?',[key,user(res)]);
      if(!r.length) throw new HttpError(404,'Jadwal tidak ditemukan.');
      await db.execute('UPDATE care_schedules SET is_enabled=?,care_time=COALESCE(?,care_time) WHERE id=?',[b.enabled,b.time||null,key]);
    });res.json({success:true,data:await bootstrap(pool,user(res))});
  });
  router.post('/schedules/:id/complete',async(req,res)=>{
    const key=id.parse(req.params.id),b=z.object({client_event_id:event}).strict().parse(req.body);
    await mutate(res,async db=>{
      const s=await rows(db,`SELECT cs.user_cultivation_id,sca.slot_key FROM care_schedules cs JOIN user_cultivations uc ON uc.id=cs.user_cultivation_id
        JOIN species_care_actions sca ON sca.id=cs.species_care_action_id WHERE cs.id=? AND uc.user_id=? AND cs.is_enabled=1`,[key,user(res)]);
      if(!s.length) throw new HttpError(404,'Jadwal tidak ditemukan.');await performCare(db,user(res),String(s[0].user_cultivation_id),s[0].slot_key,b.client_event_id,key);
    });res.json({success:true,data:await bootstrap(pool,user(res))});
  });
  router.get('/journal',async(req,res)=>res.json({success:true,data:await journal(pool,user(res),page.parse(req.query).offset)}));
  router.get('/progress',async(_req,res)=>res.json({success:true,data:await progress(pool,user(res))}));
  router.post('/rewards/daily',async(req,res)=>{
    z.object({}).strict().parse(req.body);
    await mutate(res,async db=>{
      await db.execute(`INSERT INTO point_transactions (user_id,source_type,source_reference,points,created_at)
        VALUES (?,'daily_reward',?,5,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE id=id`,[user(res),localDate()]);
    });res.json({success:true,data:await bootstrap(pool,user(res))});
  });
  router.get('/chat/capabilities',(_req,res)=>res.json({success:true,data:ai.capabilities()}));
  const consultationLimit=rateLimit({windowMs:60000,limit:ai.rateLimit,keyGenerator:(_req,res)=>user(res),standardHeaders:'draft-8',legacyHeaders:false,
    message:{success:false,error:{code:'RATE_LIMIT',message:'Terlalu banyak pertanyaan. Coba lagi satu menit kemudian.'}}});
  router.get('/chat/conversations',async(req,res)=>{
    const offset=page.parse(req.query).offset;
    const list=await rows(pool,`SELECT c.id,c.title,c.updated_at,(SELECT content FROM chat_messages m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS snippet
      FROM chat_conversations c WHERE c.user_id=? ORDER BY c.updated_at DESC,c.id DESC LIMIT 20 OFFSET ?`,[user(res),offset]);
    res.json({success:true,data:list.map(c=>({...c,id:String(c.id),updatedAt:c.updated_at instanceof Date?new Date(c.updated_at.getTime()-c.updated_at.getTimezoneOffset()*60000).toISOString():c.updated_at,messages:[]}))});
  });
  router.post('/chat/conversations',async(req,res)=>{
    const b=z.object({title:z.string().trim().min(1).max(200).default('Percakapan baru'),client_request_id:z.string().uuid().optional()}).strict().parse(req.body);
    const key=await mutate(res,db=>newConversation(db,user(res),b.title,b.client_request_id));res.status(201).json({success:true,data:await conversation(pool,user(res),key)});
  });
  router.get('/chat/conversations/:id',async(req,res)=>res.json({success:true,data:await conversation(pool,user(res),id.parse(req.params.id),page.parse(req.query).offset)}));
  router.patch('/chat/conversations/:id',async(req,res)=>{
    const key=id.parse(req.params.id),b=z.object({title:z.string().trim().min(1).max(200)}).strict().parse(req.body);
    await mutate(res,async db=>{await owned(db,'chat_conversations',key,user(res));await db.execute('UPDATE chat_conversations SET title=? WHERE id=? AND user_id=?',[b.title,key,user(res)]);});res.json({success:true});
  });
  router.delete('/chat/conversations/:id',async(req,res)=>{
    const key=id.parse(req.params.id);
    await mutate(res,async db=>{await owned(db,'chat_conversations',key,user(res));await db.execute('DELETE FROM chat_conversations WHERE id=? AND user_id=?',[key,user(res)]);});res.json({success:true});
  });
  router.post('/chat/conversations/:id/messages',consultationLimit,async(req,res)=>{
    const key=id.parse(req.params.id),b=messageInput.parse(req.body);
    await generateTurn(pool,auth,ai,root,res.locals.member,res.locals.memberToken,key,b);
    res.json({success:true,data:await conversation(pool,user(res),key)});
  });
  router.post('/chat/media',consultationLimit,upload,async(req,res)=>{
    if(!req.file) throw new HttpError(422,'Pilih gambar.');let target='';
    try {const data=await mutate(res,async db=>{const media=await privateImage(db,root,user(res),req.file!.buffer,'Foto konsultasi');target=media.target;return {id:media.id};});res.status(201).json({success:true,data});}
    catch(e){if(target)await unlink(target).catch(()=>{});throw e;}
  });
  return router;
}
