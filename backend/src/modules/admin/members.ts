import { Router } from 'express';
import { z } from 'zod';
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { createInput, memberInput, credential, id } from '../member-auth/validation.js';
import { ordinaryMember, safeColumns, lockMember } from '../member-auth/service.js';
import { hashPassword } from '../auth/service.js';
import { transaction } from './provision.js';
import { HttpError } from '../../utils/http.js';
import {memberPets,petSummary} from './member-pets.js';

export function membersRouter(pool: Pool) {
  const router=Router();
  const detail=async (userId:string) => {
    const [rows]=await pool.execute<RowDataPacket[]>(`SELECT ${safeColumns} FROM users u WHERE u.id=? AND ${ordinaryMember}`,[userId]);
    if (!rows.length) throw new HttpError(404,'Anggota tidak ditemukan.'); return rows[0];
  };
  router.get('/',async(req,res)=>{
    const q=z.object({ search:z.string().trim().max(100).default(''),status:z.enum(['active','disabled','']).default(''),page:z.coerce.number().int().min(1).max(100000).default(1) }).strict().parse(req.query);
    const where=`${ordinaryMember} AND (?='' OR u.status=?) AND CONCAT_WS(' ',u.name,u.phone_number,u.username,u.email) LIKE ?`;
    const params=[q.status,q.status,`%${q.search}%`];
    const [rows]=await pool.query<RowDataPacket[]>(`SELECT ${safeColumns} FROM users u WHERE ${where} ORDER BY u.id DESC LIMIT 20 OFFSET ?`,[...params,(q.page-1)*20]);
    const [count]=await pool.execute<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM users u WHERE ${where}`,params);
    const items=await Promise.all(rows.map(async r=>({...r,petSummary:await petSummary(pool,String(r.id))})));
    res.json({success:true,data:{items,total:Number(count[0].total),page:q.page}});
  });
  router.get('/:id/cultivations',async(req,res)=>{const key=id.parse(req.params.id);await detail(key);const q=z.object({page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().parse(req.query);res.json({success:true,data:await memberPets(pool,key,q.page)});});
  router.get('/:id',async(req,res)=>res.json({success:true,data:await detail(id.parse(req.params.id))}));
  router.post('/',async(req,res)=>{
    const b=createInput.parse(req.body),hash=await hashPassword(b.password);
    const userId=await transaction(pool,async db=>{
      const [roles]=await db.execute<RowDataPacket[]>("SELECT id FROM roles WHERE code='member'");
      if(!roles.length) throw new HttpError(503,'Role member belum tersedia.','SCHEMA_NOT_READY');
      const [result]=await db.execute<ResultSetHeader>(`INSERT INTO users (name,phone_number,username,email,password_hash,status,must_change_password,created_by,password_changed_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,[b.name,b.phone_number,b.username,b.email,hash,b.status,b.must_change_password,res.locals.admin.id]);
      const userId=String(result.insertId);
      await db.execute('INSERT INTO user_roles (user_id,role_id) VALUES (?,?)',[userId,roles[0].id]);
      await db.execute('INSERT INTO user_preferences (user_id,care_focus_json) VALUES (?,?)',[userId,'["tanaman"]']);
      await db.execute("INSERT INTO admin_audit_logs (admin_user_id,action,entity_type,entity_id) VALUES (?,'create-member','users',?)",[res.locals.admin.id,userId]);
      return userId;
    });
    res.status(201).json({success:true,data:await detail(userId)});
  });
  router.patch('/:id',async(req,res)=>{
    const userId=id.parse(req.params.id),b=memberInput.parse(req.body);
    await transaction(pool,async db=>{
      await lockMember(db,userId);
      const [old]=await db.execute<RowDataPacket[]>('SELECT phone_number,username,email,status FROM users WHERE id=?',[userId]);
      await db.execute('UPDATE users SET name=?,phone_number=?,username=?,email=?,status=? WHERE id=?',[b.name,b.phone_number,b.username,b.email,b.status,userId]);
      if(b.status==='disabled'||['phone_number','username','email'].some(k=>old[0][k]!==b[k as keyof typeof b]))
        await db.execute('UPDATE member_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[userId]);
      await db.execute("INSERT INTO admin_audit_logs (admin_user_id,action,entity_type,entity_id) VALUES (?,'edit-member','users',?)",[res.locals.admin.id,userId]);
    });
    res.json({success:true,data:await detail(userId)});
  });
  router.patch('/:id/status',async(req,res)=>{
    const userId=id.parse(req.params.id),b=z.object({status:z.enum(['active','disabled'])}).strict().parse(req.body);
    await transaction(pool,async db=>{
      await lockMember(db,userId);
      await db.execute('UPDATE users SET status=? WHERE id=?',[b.status,userId]);
      if(b.status==='disabled') await db.execute('UPDATE member_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[userId]);
      await db.execute("INSERT INTO admin_audit_logs (admin_user_id,action,entity_type,entity_id,after_json) VALUES (?,'member-status','users',?,?)",[res.locals.admin.id,userId,JSON.stringify(b)]);
    }); res.json({success:true,data:await detail(userId)});
  });
  router.post('/:id/reset-password',async(req,res)=>{
    const userId=id.parse(req.params.id),b=credential.parse(req.body),hash=await hashPassword(b.password);
    await transaction(pool,async db=>{
      await lockMember(db,userId);
      await db.execute('UPDATE users SET password_hash=?,must_change_password=?,temporary_password_expires_at=NULL,password_changed_at=UTC_TIMESTAMP(3) WHERE id=?',[hash,b.must_change_password,userId]);
      await db.execute('UPDATE member_sessions SET revoked_at=UTC_TIMESTAMP(3) WHERE user_id=? AND revoked_at IS NULL',[userId]);
      await db.execute("INSERT INTO admin_audit_logs (admin_user_id,action,entity_type,entity_id) VALUES (?,'reset-member-password','users',?)",[res.locals.admin.id,userId]);
    });res.json({success:true});
  });
  return router;
}
