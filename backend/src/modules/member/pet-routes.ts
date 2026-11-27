import {Router,type Response} from 'express';
import {z} from 'zod';
import type {Pool,PoolConnection} from 'mysql2/promise';
import type {MemberAuth} from '../member-auth/service.js';
import {id} from '../member-auth/validation.js';
import {HttpError} from '../../utils/http.js';
import {bootstrap} from './data.js';
import {rows,requirePetSchema} from './shared.js';
import {archivePet,archiveReasons,confirmPetInput,createPet,createPetInput,listPets,petInfo,restorePet,savePet,selectionInput,selectPet} from './pets.js';
import {bulkInput,performCare,recordCare} from './care.js';
import {disableSchedule,saveSchedule,scheduleInput,schedules} from './scheduling.js';

export function petRouter(pool:Pool,auth:MemberAuth,bulkLimit=50){
  const router=Router(),event=z.string().uuid();
  const user=(res:Response):string=>res.locals.member.id;
  const mutate=<T>(res:Response,action:(db:PoolConnection)=>Promise<T>)=>auth.mutate(user(res),res.locals.memberToken,action);
  const result=async(res:Response,extra:Record<string,unknown>={})=>res.json({success:true,data:{...await bootstrap(pool,user(res)),bulkCareMaxPets:bulkLimit,...extra}});
  router.use(['/cultivations','/schedules'],async(_req,_res,next)=>{await requirePetSchema(pool);next();});
  router.get('/cultivations',async(_req,res)=>res.json({success:true,data:await listPets(pool,user(res))}));
  router.post('/cultivations',async(req,res)=>{
    const b=createPetInput.parse(req.body);
    const key=await mutate(res,async db=>{const key=await createPet(db,user(res),b);const pet=(await listPets(db,user(res))).find(p=>p.id===key)!;
      if(pet.status==='active'&&pet.species.type)await selectPet(db,user(res),pet.species.type,key);return key;});
    await result(res,{createdCultivationId:key});
  });
  router.put('/cultivations/selection',async(req,res)=>{const b=selectionInput.parse(req.body);await mutate(res,db=>selectPet(db,user(res),b.type,b.cultivation_id));await result(res);});
  router.post('/cultivations/bulk-care',async(req,res)=>{
    const b=bulkInput(bulkLimit).parse(req.body),careResult=await mutate(res,db=>recordCare(db,user(res),{ids:b.cultivation_ids,actionId:b.care_action_id,event:b.client_event_id,operation:'bulk'}));await result(res,{careResult});
  });
  router.get('/cultivations/:id',async(req,res)=>{const key=id.parse(req.params.id),pet=(await listPets(pool,user(res))).find(p=>p.id===key);if(!pet)throw new HttpError(404,'Pet tidak ditemukan.');res.json({success:true,data:pet});});
  router.patch('/cultivations/:id',async(req,res)=>{const key=id.parse(req.params.id),b=petInfo.parse(req.body);await mutate(res,db=>savePet(db,user(res),key,b));await result(res);});
  router.post('/cultivations/:id/confirm',async(req,res)=>{const key=id.parse(req.params.id),b=confirmPetInput.parse(req.body);await mutate(res,db=>savePet(db,user(res),key,b,true));await result(res);});
  router.post('/cultivations/:id/archive',async(req,res)=>{const key=id.parse(req.params.id),b=z.object({reason:z.enum(archiveReasons)}).strict().parse(req.body);await mutate(res,db=>archivePet(db,user(res),key,b.reason));await result(res);});
  router.post('/cultivations/:id/restore',async(req,res)=>{const key=id.parse(req.params.id);z.object({}).strict().parse(req.body);await mutate(res,db=>restorePet(db,user(res),key));await result(res);});
  router.post('/cultivations/:id/care-actions',async(req,res)=>{
    const key=id.parse(req.params.id),b=z.object({slot:z.enum(['action1','action2','action3']),client_event_id:event}).strict().parse(req.body);
    const careResult=await mutate(res,db=>performCare(db,user(res),key,b.slot,b.client_event_id));await result(res,{careResult});
  });
  router.get('/schedules',async(_req,res)=>res.json({success:true,data:await schedules(pool,user(res))}));
  router.post('/schedules',async(req,res)=>{const b=scheduleInput.parse(req.body);await mutate(res,db=>saveSchedule(db,user(res),b));await result(res);});
  router.patch('/schedules/:id',async(req,res)=>{
    const key=id.parse(req.params.id);
    if(Object.keys(req.body).length===1&&req.body.enabled===false)await mutate(res,db=>disableSchedule(db,user(res),key));
    else {const b=scheduleInput.parse(req.body);await mutate(res,db=>saveSchedule(db,user(res),b,key));}await result(res);
  });
  router.post('/schedules/:id/complete',async(req,res)=>{
    const key=id.parse(req.params.id),b=z.object({client_event_id:event}).strict().parse(req.body);
    const careResult=await mutate(res,async db=>{
      const s=(await rows(db,`SELECT cs.user_cultivation_id,sca.slot_key FROM care_schedules cs JOIN user_cultivations uc ON uc.id=cs.user_cultivation_id JOIN species_care_actions sca ON sca.id=cs.species_care_action_id WHERE cs.id=? AND uc.user_id=?`,[key,user(res)]))[0];
      if(!s)throw new HttpError(404,'Jadwal tidak ditemukan.');return performCare(db,user(res),String(s.user_cultivation_id),s.slot_key,b.client_event_id,key);
    });await result(res,{careResult});
  });
  return router;
}
