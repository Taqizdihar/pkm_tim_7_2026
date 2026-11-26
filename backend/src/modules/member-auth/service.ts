import { randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { csrfFor, digest, hashPassword } from '../auth/service.js';
import { transaction } from '../admin/provision.js';
import { HttpError } from '../../utils/http.js';
import { loginIdentifier } from './validation.js';

// Only accounts with exactly the ordinary member role are eligible.
export const ordinaryMember = `EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code='member')
 AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code<>'member')`;
export const safeColumns = `u.id,u.name,u.phone_number,u.username,u.email,u.avatar_url,u.status,u.must_change_password,
 DATE_FORMAT(u.last_login_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS last_login_at,DATE_FORMAT(u.created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at`;
export interface Member { id: string; name: string; must_change_password: number; [key: string]: unknown }
export function originGuard(value: string | undefined, origin: string) {
  if (value !== origin) throw new HttpError(403, 'Asal permintaan tidak diizinkan.', 'FORBIDDEN');
}
export function checkCsrf(token: string, value: string | undefined) {
  const a = Buffer.from(csrfFor(token)), b = Buffer.from(value || '');
  if (a.length !== b.length || !timingSafeEqual(a,b)) throw new HttpError(403, 'Sesi formulir tidak sesuai. Muat ulang halaman.', 'FORBIDDEN');
}
export async function lockMember(db: PoolConnection, userId: string) {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT u.id FROM users u WHERE u.id=? AND ${ordinaryMember} FOR UPDATE`, [userId]);
  if (!rows.length) throw new HttpError(404, 'Anggota tidak ditemukan.');
}
export function createMemberAuth(pool: Pool, hours = 24) {
  const dummy = hashPassword(randomBytes(32).toString('hex'));
  async function issue(db: PoolConnection, userId: string) {
    const token = randomBytes(32).toString('hex');
    await db.execute(`INSERT INTO member_sessions (token_hash,user_id,created_at,expires_at)
      VALUES (?,?,UTC_TIMESTAMP(3),DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? HOUR))`, [digest(token),userId,hours]);
    return { token, expiresAt: new Date(Date.now() + hours*3600000) };
  }
  async function authenticate(token: string, db: Pool | PoolConnection = pool): Promise<Member | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT ${safeColumns} FROM users u JOIN member_sessions ms ON ms.user_id=u.id
      WHERE ms.token_hash=? AND ms.revoked_at IS NULL AND ms.expires_at>UTC_TIMESTAMP(3) AND u.status='active' AND ${ordinaryMember}`, [digest(token)]);
    return rows[0] as Member || null;
  }
  return {
    authenticate,
    async login(identifier: string, supplied: string) {
      const key = loginIdentifier(identifier);
      return transaction(pool, async db => {
        const [rows] = await db.execute<RowDataPacket[]>(`SELECT u.id,u.password_hash,u.status,
          (u.temporary_password_expires_at IS NOT NULL AND u.temporary_password_expires_at<=UTC_TIMESTAMP(3)) AS expired
          FROM users u WHERE u.${key.column}=? AND ${ordinaryMember} FOR UPDATE`, [key.value]);
        const u = rows[0];
        const valid = await argon2.verify(u?.password_hash || await dummy, supplied).catch(() => false);
        if (!u || !valid || u.status !== 'active' || u.expired) throw new HttpError(401,
          'Nomor HP, username, email, atau kata sandi tidak sesuai. Jika akses bermasalah, hubungi pengelola KWT.', 'INVALID_CREDENTIALS');
        const session = await issue(db,u.id);
        await db.execute('UPDATE users SET last_login_at=UTC_TIMESTAMP(3) WHERE id=?', [u.id]);
        return session;
      });
    },
    async logout(token: string) {
      await pool.execute('UPDATE member_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE token_hash=?', [digest(token)]);
    },
    async change(userId: string, token: string, current: string, next: string) {
      const hash = await hashPassword(next);
      return transaction(pool, async db => {
        await lockMember(db,userId);
        const member = await authenticate(token,db);
        if (!member) throw new HttpError(401,'Silakan masuk kembali.','AUTH_REQUIRED');
        const [rows] = await db.execute<RowDataPacket[]>('SELECT password_hash FROM users WHERE id=?',[userId]);
        if (!await argon2.verify(rows[0].password_hash,current).catch(() => false)) throw new HttpError(422,'Kata sandi saat ini tidak sesuai.');
        await db.execute(`UPDATE users SET password_hash=?,must_change_password=0,temporary_password_expires_at=NULL,password_changed_at=UTC_TIMESTAMP(3) WHERE id=?`,[hash,userId]);
        await db.execute('UPDATE member_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[userId]);
        return issue(db,userId);
      });
    },
    async mutate<T>(userId: string, token: string, action: (db: PoolConnection) => Promise<T>) {
      return transaction(pool, async db => {
        await lockMember(db,userId);
        const member = await authenticate(token,db);
        if (!member) throw new HttpError(401,'Silakan masuk kembali.','AUTH_REQUIRED');
        if (member.must_change_password) throw new HttpError(403,'Ubah kata sandi terlebih dahulu.','PASSWORD_CHANGE_REQUIRED');
        return action(db);
      });
    },
  };
}
export type MemberAuth = ReturnType<typeof createMemberAuth>;
