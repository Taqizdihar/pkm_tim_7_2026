import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { hashPassword } from '../auth/service.js';

export const passwordSchema = z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/).regex(/[^a-zA-Z0-9]/);
export const emailSchema = z.string().trim().toLowerCase().email().max(191);
export async function transaction<T>(pool: Pool, action: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try { await connection.beginTransaction(); const value = await action(connection); await connection.commit(); return value; }
  catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export function provisioning(pool: Pool) {
  const lockRole = async (db: PoolConnection) => {
    const [rows] = await db.execute<RowDataPacket[]>("SELECT id FROM roles WHERE code='admin' FOR UPDATE");
    if (!rows[0]) throw Error('Role admin belum tersedia. Periksa database.');
    return rows[0].id;
  };
  const findAdmin = async (db: PoolConnection, email: string) => {
    const [rows] = await db.execute<RowDataPacket[]>(`SELECT u.id,u.status FROM users u JOIN user_roles ur ON ur.user_id=u.id
      JOIN roles r ON r.id=ur.role_id WHERE r.code='admin' AND u.email=? FOR UPDATE`, [email]);
    if (!rows[0]) throw Error('Administrator tidak ditemukan.');
    return rows[0];
  };
  return {
    async create(name: string, email: string, password: string) {
      name = z.string().trim().min(1).max(100).parse(name); email = emailSchema.parse(email); passwordSchema.parse(password);
      const hash = await hashPassword(password);
      return transaction(pool, async (db) => {
        const role = await lockRole(db);
        const [exists] = await db.execute<RowDataPacket[]>('SELECT id FROM users WHERE email=?', [email]);
        if (exists.length) throw Error('Email sudah digunakan. Akun tidak diubah.');
        const [user] = await db.execute<ResultSetHeader>("INSERT INTO users (name,email,password_hash,auth_provider,status) VALUES (?,?,?,'local','active')", [name,email,hash]);
        await db.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)', [user.insertId,role]);
        await db.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id) VALUES ('cli-create-admin','users',?)", [String(user.insertId)]);
      });
    },
    async list() {
      const [rows] = await pool.execute<RowDataPacket[]>(`SELECT u.name,u.email,u.status,u.created_at FROM users u
        JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE r.code='admin' ORDER BY u.created_at`);
      return rows;
    },
    async reset(email: string, password: string) {
      email = emailSchema.parse(email); passwordSchema.parse(password); const hash = await hashPassword(password);
      return transaction(pool, async (db) => {
        await lockRole(db); const user = await findAdmin(db,email);
        await db.execute('UPDATE users SET password_hash=? WHERE id=?', [hash,user.id]);
        await db.execute('UPDATE admin_sessions SET revoked_at=NOW(3) WHERE user_id=? AND revoked_at IS NULL', [user.id]);
        await db.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id) VALUES ('cli-reset-password','users',?)", [user.id]);
      });
    },
    async disable(email: string) {
      email = emailSchema.parse(email);
      return transaction(pool, async (db) => {
        const role = await lockRole(db); const user = await findAdmin(db,email);
        const [active] = await db.execute<RowDataPacket[]>("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE ur.role_id=? AND u.status='active' FOR UPDATE", [role]);
        if (user.status === 'active' && active.length <= 1) throw Error('Administrator aktif terakhir tidak boleh dinonaktifkan. Buat pengganti dahulu.');
        await db.execute("UPDATE users SET status='disabled' WHERE id=?", [user.id]);
        await db.execute('UPDATE admin_sessions SET revoked_at=NOW(3) WHERE user_id=? AND revoked_at IS NULL', [user.id]);
        await db.execute("INSERT INTO admin_audit_logs (action,entity_type,entity_id) VALUES ('cli-disable-admin','users',?)", [user.id]);
      });
    },
  };
}
