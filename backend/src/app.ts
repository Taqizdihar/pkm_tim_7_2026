import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import type { CatalogRepository } from './modules/catalog/repository.js';

export interface AppDependencies {
  frontendOrigin: string;
  checkDatabase: () => Promise<void>;
  catalog: CatalogRepository;
}

const slugSchema = z.object({ slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120) });

export function createApp(deps: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: deps.frontendOrigin }));
  app.use(express.json({ limit: '100kb' }));

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
    // Internal errors stay on the server; never send SQL details or stack traces to clients.
    console.error('Request failed:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });
  return app;
}
