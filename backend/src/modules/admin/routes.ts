import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Pool } from 'mysql2/promise';
import { adminCatalog, resources, idSchema } from './catalog.js';
import { saveMedia } from './media.js';
import { createAI, type AIService } from '../../integrations/ai/router.js';
import rateLimit from 'express-rate-limit';
import {petSummary} from './member-pets.js';

export function adminRouter(pool: Pool, uploadRoot: string,ai:AIService=createAI()) {
  const router = Router();
  const catalog = adminCatalog(pool);
  router.get('/ai/status',(_req,res)=>res.json({success:true,data:ai.diagnostics()}));
  router.post('/ai/test',rateLimit({windowMs:60000,limit:2,keyGenerator:(_req,res)=>String(res.locals.admin.id),standardHeaders:'draft-8',legacyHeaders:false,
    message:{success:false,error:{code:'RATE_LIMIT',message:'Uji koneksi maksimal dua kali per menit.'}}}),async(req,res)=>{
    z.object({}).strict().parse(req.body);
    res.json({success:true,data:await ai.testConnection()});
  });
  router.get('/dashboard', async (_req,res) => res.json({ success: true, data: {...await catalog.dashboard(),memberPets:await petSummary(pool)} }));
  for (const resource of resources) {
    router.get(`/${resource}`, async (req,res) => {
      z.object({}).strict().parse(req.query);
      res.json({ success: true, data: await catalog.list(resource) });
    });
    router.post(`/${resource}`, async (req,res) => res.status(201).json({ success: true, data: await catalog.save(resource,null,req.body,res.locals.admin.id) }));
    router.patch(`/${resource}/:id`, async (req,res) => res.json({ success: true, data: await catalog.save(resource,idSchema.parse(req.params.id),req.body,res.locals.admin.id) }));
  }
  router.get('/species/:id', async (req,res) => res.json({ success: true, data: await catalog.detail(idSchema.parse(req.params.id)) }));
  router.put('/species/:id/care-actions', async (req,res) => {
    await catalog.assign(idSchema.parse(req.params.id),req.body,res.locals.admin.id); res.json({ success: true });
  });
  router.get('/settings', async (_req,res) => res.json({ success: true, data: await catalog.settings() }));
  router.patch('/settings', async (req,res) => { await catalog.saveSettings(req.body,res.locals.admin.id); res.json({ success: true }); });
  router.post('/media', multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024, files: 1, fields: 3 } }).single('image'), async (req,res) => {
    const data = z.object({ species_id: idSchema, state_key: z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/), alt_text: z.string().max(255).default('') }).strict().parse(req.body);
    if (!req.file) { res.status(400).json({ success: false,error: { message: 'Pilih gambar.' } }); return; }
    res.status(201).json({ success: true, data: await saveMedia(pool,uploadRoot,data.species_id,data.state_key,data.alt_text,req.file.buffer,res.locals.admin.id) });
  });
  return router;
}
