import 'dotenv/config';
import { z } from 'zod';

const boolean = z.enum(['true', 'false']).transform(value => value === 'true');
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().min(1),
  FRONTEND_ORIGIN: z.string().url(),
  SESSION_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  MEMBER_SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  UPLOAD_DIR: z.string().min(1).default('storage/uploads'),
  AI_ENABLED: boolean.default(true),
  AI_PRIMARY_PROVIDER: z.enum(['gemini', 'rag', 'local']).default('gemini'),
  AI_FALLBACK_PROVIDER: z.enum(['gemini', 'local']).default('local'),
  AI_LOCAL_FALLBACK_ENABLED: boolean.default(true),
  AI_EXTERNAL_MODE: z.enum(['off', 'demo']).default('demo'),
  AI_DEMO_MEMBER_IDS: z.string().default('').refine(value => !value || value.split(',').every(id => /^[1-9][0-9]{0,19}$/.test(id.trim()))),
  GEMINI_API_KEY: z.string().trim().default(''),
  GEMINI_API_KEY_FALLBACK: z.string().trim().default(''),
  GEMINI_MODEL: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/).default('gemini-3.5-flash-lite'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(20000),
  AI_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(90000).default(30000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(128).max(4096).default(1024),
  AI_MAX_CONTEXT_MESSAGES: z.coerce.number().int().min(0).max(24).default(12),
  AI_MAX_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(30).default(5),
  AI_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().min(1).max(10).default(2),
  RAG_ENABLED: boolean.default(false),
  RAG_API_URL: z.union([z.literal(''), z.string().url()]).default(''),
  RAG_API_KEY: z.string().default(''),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid backend environment variables: ${names}`);
  }
  return result.data;
}
