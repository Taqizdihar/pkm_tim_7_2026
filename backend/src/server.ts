import { createApp } from './app.js';
import { createDatabase, checkDatabase } from './config/database.js';
import { loadEnv } from './config/env.js';
import { createCatalogRepository } from './modules/catalog/repository.js';
import { createAI } from './integrations/ai/router.js';

const env = loadEnv();
const pool = createDatabase(env);
const app = createApp({
  frontendOrigin: env.FRONTEND_ORIGIN,
  pool, uploadRoot: env.UPLOAD_DIR, secureCookies: env.NODE_ENV === 'production', sessionHours: env.SESSION_HOURS, memberSessionHours: env.MEMBER_SESSION_HOURS,
  checkDatabase: () => checkDatabase(pool, env.DB_NAME),
  catalog: createCatalogRepository(pool),
  ai: createAI(env),
});

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`Dewi Sri API listening on http://${env.HOST}:${env.PORT}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
