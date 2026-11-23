import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'mysql2/promise';
import { checkDatabase } from '../src/config/database.js';

test('database check accepts mysql2 string values and verifies schema', async () => {
  const pool = { query: async () => [[{ connected: '1', schema_name: 'dewi_sri' }]] } as unknown as Pool;
  await checkDatabase(pool, 'dewi_sri');
  await assert.rejects(checkDatabase(pool, 'another_schema'), /schema is unavailable/);
});
