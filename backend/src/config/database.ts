import mysql from 'mysql2/promise';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Env } from './env.js';

export function createDatabase(env: Env): Pool {
  return mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    charset: 'utf8mb4',
  });
}

export async function checkDatabase(pool: Pool, expectedName: string): Promise<void> {
  const [rows] = await pool.query<(RowDataPacket & { connected: string; schema_name: string })[]>(
    'SELECT 1 AS connected, DATABASE() AS schema_name',
  );
  if (Number(rows[0]?.connected) !== 1 || rows[0]?.schema_name !== expectedName) {
    throw new Error('Database schema is unavailable');
  }
}
