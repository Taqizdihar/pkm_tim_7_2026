import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { HttpError } from '../../utils/http.js';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const csrfFor = (token: string) => digest(`csrf:${token}`);
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3 });
export interface Admin { id: string; name: string; email: string }
const adminSelect = `SELECT u.id,u.name,u.email,u.password_hash FROM users u
  JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
  WHERE r.code='admin' AND u.status='active'`;

export function createAuthService(pool: Pool, hours: number) {
  // A dummy hash gives unknown accounts the same expensive verification path.
  const dummy = hashPassword(randomBytes(32).toString('hex'));
  return {
    async login(email: string, password: string) {
      const [rows] = await pool.execute<RowDataPacket[]>(`${adminSelect} AND u.email=? LIMIT 1`, [email]);
      const user = rows[0];
      const valid = await argon2.verify(user?.password_hash || await dummy, password).catch(() => false);
      if (!valid || !user) throw new HttpError(401, 'Email atau kata sandi tidak sesuai.');
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + hours * 3600000);
      await pool.execute('INSERT INTO admin_sessions (token_hash,user_id,expires_at) VALUES (?,?,?)', [digest(token), user.id, expiresAt]);
      return { token, expiresAt };
    },
    async authenticate(token: string): Promise<Admin | null> {
      if (!/^[a-f0-9]{64}$/.test(token)) return null;
      const [rows] = await pool.execute<RowDataPacket[]>(`${adminSelect} AND u.id IN
        (SELECT user_id FROM admin_sessions WHERE token_hash=? AND revoked_at IS NULL AND expires_at>NOW(3)) LIMIT 1`, [digest(token)]);
      const row = rows[0];
      return row ? { id: row.id, name: row.name, email: row.email } : null;
    },
    async logout(token: string) {
      await pool.execute('UPDATE admin_sessions SET revoked_at=NOW(3) WHERE token_hash=?', [digest(token)]);
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
