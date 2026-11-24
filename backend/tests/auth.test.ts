import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { Pool } from 'mysql2/promise';
import { createAuthService, digest, hashPassword } from '../src/modules/auth/service.js';
import { authRouter } from '../src/modules/auth/routes.js';

test('real password verification, admin role/status, opaque sessions, CSRF, expiry and logout', async () => {
  const hash = await hashPassword('Example-Password123!');
  assert.match(hash,/^\$argon2id\$/);
  let active = true, adminRole = true;
  const sessions = new Map<string,{ expires: number; revoked: boolean }>();
  const user = { id: '11',name: 'Fixture Admin',email: 'fixture@example.test',password_hash: hash };
  const pool = { execute: async (sql:string, params:any[]) => {
    if (sql.startsWith('INSERT INTO admin_sessions')) { sessions.set(params[0],{expires:params[2].getTime(),revoked:false});return [{}]; }
    if (sql.startsWith('UPDATE admin_sessions')) { const session=sessions.get(params[0]);if(session)session.revoked=true;return [{}]; }
    if (sql.includes('u.email=?')) return [active && adminRole && params[0]===user.email ? [user]:[]];
    const session=sessions.get(params[0]);
    return [active && adminRole && session && !session.revoked && session.expires>Date.now() ? [user]:[]];
  } } as unknown as Pool;
  const auth=createAuthService(pool,8);
  const app=express();app.use(express.json(),cookieParser());app.use('/api/v1/admin',authRouter(auth,'http://localhost:3000',false));
  app.get('/api/v1/admin/protected',(_req,res)=>res.json({success:true}));
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({message:error.message}));
  const agent=request.agent(app);
  assert.equal((await agent.get('/api/v1/admin/auth/me')).status,401);
  assert.equal((await agent.post('/api/v1/admin/auth/login').send({email:user.email,password:'wrong'})).status,403);
  const login=(password='Example-Password123!')=>agent.post('/api/v1/admin/auth/login').set('Origin','http://localhost:3000').send({email:user.email,password});
  assert.equal((await login('wrong')).status,401);
  active=false;assert.equal((await login()).status,401);active=true;
  adminRole=false;assert.equal((await login()).status,401);adminRole=true;
  const response=await login();assert.equal(response.status,200);
  assert.match(response.headers['set-cookie'][0],/HttpOnly/);
  const token=response.headers['set-cookie'][0].split(';')[0].split('=')[1];
  assert.equal(sessions.has(token),false);assert.equal(sessions.has(digest(token)),true);
  assert.equal((await agent.get('/api/v1/admin/auth/me')).body.data.email,user.email);
  assert.equal((await agent.get('/api/v1/admin/protected')).status,200);
  active=false;assert.equal((await agent.get('/api/v1/admin/protected')).status,401);active=true;
  adminRole=false;assert.equal((await agent.get('/api/v1/admin/protected')).status,401);adminRole=true;
  sessions.get(digest(token))!.expires=Date.now()-1;
  assert.equal((await agent.get('/api/v1/admin/protected')).status,401);
  sessions.get(digest(token))!.expires=Date.now()+100000;
  assert.equal((await agent.post('/api/v1/admin/auth/logout').set('Origin','http://localhost:3000')).status,403);
  assert.equal((await agent.post('/api/v1/admin/auth/logout').set('Origin','http://localhost:3000').set('X-CSRF-Token',response.body.data.csrfToken)).status,200);
  assert.equal((await auth.authenticate(token)),null);
});

test('login attempts are limited and HTTPS cookies are secure', async()=>{
  const app=express();app.use(express.json(),cookieParser());
  const auth={login:async()=>({token:'a'.repeat(64),expiresAt:new Date(Date.now()+10000)}),authenticate:async()=>null,logout:async()=>{}};
  app.use('/api/v1/admin',authRouter(auth,'https://cms.example.test',true));
  for(let i=0;i<10;i++){
    const response=await request(app).post('/api/v1/admin/auth/login').set('Origin','https://cms.example.test').send({email:'fixture@example.test',password:'fixture'});
    assert.equal(response.status,200);assert.match(response.headers['set-cookie'][0],/Secure/);
  }
  assert.equal((await request(app).post('/api/v1/admin/auth/login').set('Origin','https://cms.example.test').send({email:'fixture@example.test',password:'fixture'})).status,429);
});
