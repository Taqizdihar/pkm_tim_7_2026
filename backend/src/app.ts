import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z, ZodError } from 'zod';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { authRouter } from './modules/auth/routes.js';
import { createAuthService } from './modules/auth/service.js';
import { adminRouter } from './modules/admin/routes.js';
import { HttpError } from './utils/http.js';
import type { CatalogRepository } from './modules/catalog/repository.js';

export interface AppDependencies {
  frontendOrigin: string;
  pool?: Pool; uploadRoot?: string; secureCookies?: boolean; sessionHours?: number;
  checkDatabase: () => Promise<void>;
  catalog: CatalogRepository;
}

const slugSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120) });

export function createApp(deps: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.frontendOrigin, credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(cookieParser());
  if (deps.pool) {
    const auth = createAuthService(deps.pool, deps.sessionHours ?? 8);
    app.use('/api/v1/admin', authRouter(auth, deps.frontendOrigin, deps.secureCookies ?? false), adminRouter(deps.pool, deps.uploadRoot ?? 'storage/uploads'));
    app.get('/api/v1/media/:filename', async (req,res) => {
      if (!/^[a-f0-9-]{36}\.webp$/.test(req.params.filename)) throw new HttpError(404,'Gambar tidak ditemukan.');
      const [rows] = await deps.pool!.execute<RowDataPacket[]>("SELECT id FROM media_assets WHERE storage_path=? AND visibility='public'", [`/api/v1/media/${req.params.filename}`]);
      if (!rows.length) throw new HttpError(404,'Gambar tidak ditemukan.');
      res.sendFile(path.resolve(deps.uploadRoot ?? 'storage/uploads',req.params.filename));
    });
  }
  app.get('/api/v1/catalog', async (_req,res) => {
    const [categories,species] = await Promise.all([deps.catalog.categories(),deps.catalog.species()]);
    const detailed = await Promise.all(species.map(async item => ({ ...item,
      media: await deps.catalog.media(item.id), careActions: await deps.catalog.careActions(item.id), guides: await deps.catalog.guides(item.id),
    })));
    res.json({ success: true, data: { categories, species: detailed } });
  });

  app.get('/api/v1/health', (_req, res) => {
    res.json({ success: true, message: 'Dewi Sri API is running' });
  });
  app.get('/api/v1/health/database', async (_req, res) => {
    try {
      await deps.checkDatabase();
      res.json({ success: true, message: 'Database is connected' });
    } catch {
      res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable' } });
    }
  });
  app.get('/api/v1/categories', async (_req, res) => {
    res.json({ success: true, data: await deps.catalog.categories() });
  });
  app.get('/api/v1/species', async (_req, res) => {
    res.json({ success: true, data: await deps.catalog.species() });
  });
  app.get('/api/v1/species/:slug', async (req, res) => {
    const parsed = slugSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'INVALID_SLUG', message: 'Invalid species slug' } });
      return;
    }
    const species = await deps.catalog.speciesBySlug(parsed.data.slug);
    if (!species) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Species not found' } });
      return;
    }
    const [media, careActions, guides] = await Promise.all([
      deps.catalog.media(species.id), deps.catalog.careActions(species.id), deps.catalog.guides(species.id),
    ]);
    res.json({ success: true, data: { ...species, media, careActions, guides } });
  });
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const err = error as { code?: string; status?: number };
    let status = error instanceof HttpError ? error.status : error instanceof ZodError ? 422 : 500;
    let message = error instanceof HttpError ? error.message : error instanceof ZodError ? 'Masukan tidak valid. Periksa isian formulir.' : 'Layanan tidak dapat memproses permintaan.';
    if (err.code === 'ER_DUP_ENTRY') { status=409; message='Slug, kode, atau email sudah digunakan.'; }
    if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') { status=409; message='Data masih memiliki hubungan atau referensi tidak ditemukan.'; }
    if (err.code === 'ER_NO_SUCH_TABLE') { status=503; message='Skema belum lengkap. Jalankan skrip SQL tambahan melalui phpMyAdmin.'; }
    if (err.code === 'LIMIT_FILE_SIZE') { status=413; message='Ukuran gambar maksimal 5 MB.'; }
    if (error instanceof SyntaxError) { status=400; message='JSON tidak valid.'; }
    res.status(status).json({ success: false, error: { code: `HTTP_${status}`, message } });
  });
  return app;
}
