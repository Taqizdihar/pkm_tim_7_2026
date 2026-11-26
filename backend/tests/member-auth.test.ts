import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type {Pool} from 'mysql2/promise';
import {hashPassword,digest} from '../src/modules/auth/service.js';
import {createMemberAuth} from '../src/modules/member-auth/service.js';
import {memberAuthRouter} from '../src/modules/member-auth/routes.js';
import {membersRouter} from '../src/modules/admin/members.js';
import {normalizePhone,loginIdentifier,createInput,password} from '../src/modules/member-auth/validation.js';
import {applyEffects,owned,performCare,progress} from '../src/modules/member/data.js';

test('phone normalization preserves zero; identifiers and provisioning inputs are unambiguous',()=>{
  for(const p of ['081234567890','0812 3456-7890','+62 812-3456-7890','6281234567890'])assert.equal(normalizePhone(p),'081234567890');
  assert.deepEqual(loginIdentifier(' BUNDA.sri '),{column:'username',value:'bunda.sri'});
  assert.deepEqual(loginIdentifier(' SRI@EXAMPLE.TEST '),{column:'email',value:'sri@example.test'});
  const base={name:'Fixture',password:'frasa yang cukup panjang',confirm_password:'frasa yang cukup panjang'};
  for(const identifier of [{phone_number:'081234567890'},{username:'bunda.sri'},{email:'sri@example.test'}])assert.ok(createInput.safeParse({...base,...identifier}).success);
  for(const extra of [{},{username:'081234567890'},{phone_number:'81234567890'},{username:'ada spasi'},{phone_number:'081234567890',role:'admin'},{email:'bukanemail'}])assert.equal(createInput.safeParse({...base,...extra}).success,false);
  assert.equal(password.safeParse('abcde').success,false);assert.ok(password.safeParse('abcdef').success);assert.ok(password.safeParse('a'.repeat(200)).success);assert.equal(password.safeParse('a'.repeat(201)).success,false);
  assert.equal(createInput.parse({...base,phone_number:'081234567890'}).status,'active');
  assert.equal(createInput.safeParse({...base,phone_number:'081234567890',status:'disabled'}).success,false);
});

async function fixture() {
  const users:any[]=[{id:'10',name:'Anggota A',phone_number:'081234567890',username:'anggota.a',email:'a@example.test',status:'active',must_change_password:1,password_hash:await hashPassword('frasa awal anggota a'),role:'member',expired:'0'}];
  const sessions=new Map<string,any>();const audits:any[]=[];let tx=0,rollback=0,preferences=0,failAudit=false;
  let snapshot:any;
  const execute=async(sql:string,p:any[]=[])=>{
    if(sql.includes("SELECT id FROM roles WHERE code='member'"))return [[{id:'77'}]];
    if(sql.startsWith('INSERT INTO users')) {
      if(users.some(u=>['phone_number','username','email'].some((k,i)=>p[i+1]&&u[k]===p[i+1])))throw Object.assign(Error(),{code:'ER_DUP_ENTRY'});
      const u={id:String(users.length+10),name:p[0],phone_number:p[1],username:p[2],email:p[3],password_hash:p[4],status:p[5],must_change_password:p[6],created_by:p[7],expired:'0'};users.push(u);return [{insertId:Number(u.id)}];
    }
    if(sql.startsWith('INSERT INTO user_roles')){users.find(u=>u.id===p[0]).role=p[1]==='77'?'member':'admin';return [{}];}
    if(sql.startsWith('INSERT INTO user_preferences')){preferences++;return [{}];}
    if(sql.startsWith('INSERT INTO admin_audit_logs')){if(failAudit)throw Error('fixture audit failure');audits.push(p);return [{}];}
    if(sql.startsWith('INSERT INTO member_sessions')){sessions.set(p[0],{user:p[1],expires:Date.now()+p[2]*3600000,revoked:false});return [{}];}
    if(sql.startsWith('UPDATE member_sessions')){for(const [key,s]of sessions)if(sql.includes('user_id=?')?s.user===p[0]:key===p[0])s.revoked=true;return [{}];}
    if(sql.startsWith('UPDATE users SET last_login'))return [{}];
    if(sql.startsWith('UPDATE users SET password_hash')){const u=users.find(u=>u.id===p.at(-1));u.password_hash=p[0];u.must_change_password=sql.includes('must_change_password=0')?0:Number(p[1]);return [{}];}
    if(sql.startsWith('UPDATE users SET status')){users.find(u=>u.id===p[1]).status=p[0];return [{}];}
    if(sql.startsWith('SELECT password_hash'))return [[{password_hash:users.find(u=>u.id===p[0])?.password_hash}]];
    if(sql.startsWith('SELECT')&&sql.includes('FROM users u')) {
      let found:any;
      if(sql.includes('JOIN member_sessions')){const s=sessions.get(p[0]);if(s&&!s.revoked&&s.expires>Date.now())found=users.find(u=>u.id===s.user&&u.status==='active');}
      else if(sql.includes('u.phone_number=?'))found=users.find(u=>u.phone_number===p[0]);
      else if(sql.includes('u.username=?'))found=users.find(u=>u.username===p[0]);
      else if(sql.includes('u.email=?'))found=users.find(u=>u.email===p[0]);
      else found=users.find(u=>u.id===p[0]);
      if(found?.role!=='member')found=null;
      if(!found)return [[]];const projected={...found};if(!sql.includes('u.password_hash'))delete projected.password_hash;return [[projected]];
    }
    throw Error(`Unhandled fixture SQL: ${sql}`);
  };
  const connection={execute,query:execute,beginTransaction:async()=>{tx++;snapshot={users:structuredClone(users),sessions:structuredClone(sessions),audits:structuredClone(audits),preferences};},commit:async()=>{},rollback:async()=>{rollback++;users.splice(0,users.length,...snapshot.users);sessions.clear();for(const [k,s]of snapshot.sessions)sessions.set(k,s);audits.splice(0,audits.length,...snapshot.audits);preferences=snapshot.preferences;},release:()=>{}};
  const pool={execute,query:execute,getConnection:async()=>connection} as unknown as Pool;
  const auth=createMemberAuth(pool,24),app=express();app.use(express.json(),cookieParser());app.use('/api/v1',memberAuthRouter(auth,'http://localhost:3000',false));
  app.get('/api/v1/member/private',(_req,res)=>res.json({success:true}));
  app.use('/admin-members',(_req,res,next)=>{res.locals.admin={id:'9'};next();},membersRouter(pool));
  app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status||((e.code==='ER_DUP_ENTRY')?409:422)).json({error:{message:e.message,code:e.code}}));
  return {app,auth,users,sessions,audits,pool,get preferences(){return preferences;},get rollback(){return rollback;},get tx(){return tx;},failAudit:()=>{failAudit=true;}};
}
const origin='http://localhost:3000';
const credentials={identifier:'081234567890',password:'frasa awal anggota a'};
const cookieOf=(r:any)=>r.headers['set-cookie'][0].split(';')[0];

test('member login handles MySQL BIGINT expiry flags as strings and numbers',async()=>{
  const f=await fixture();
  for(const expired of ['0',0]) {
    f.users[0].expired=expired;
    const session=await f.auth.login(credentials.identifier,credentials.password);
    assert.equal((await f.auth.authenticate(session.token))?.id,'10');
  }
  for(const expired of ['1',1]) {
    f.users[0].expired=expired;
    await assert.rejects(f.auth.login(credentials.identifier,credentials.password),{status:401,code:'INVALID_CREDENTIALS'});
  }
});

test('member identifiers, generic denial, restricted session, CSRF, rotation, expiry and revocation',async()=>{
  const f=await fixture(),agent=request.agent(f.app);
  for(const identifier of ['081234567890','+62 812-3456-7890','ANGGOTA.A','A@EXAMPLE.TEST']){
    const r=await agent.post('/api/v1/auth/login').set('Origin',origin).send({...credentials,identifier});assert.equal(r.status,200);assert.equal(r.body.data.id,'10');assert.equal(r.body.data.password_hash,undefined);
  }
  for(const change of [{status:'disabled'},{role:'admin'},{expired:'1'}]){
    Object.assign(f.users[0],change);const r=await agent.post('/api/v1/auth/login').set('Origin',origin).send(credentials);assert.equal(r.status,401);assert.equal(r.body.error.code,'INVALID_CREDENTIALS');Object.assign(f.users[0],{status:'active',role:'member',expired:'0'});
  }
  const r=await agent.post('/api/v1/auth/login').set('Origin',origin).send(credentials),cookie=cookieOf(r),csrf=r.body.data.csrfToken;
  assert.match(r.headers['set-cookie'][0],/HttpOnly/);assert.match(r.headers['set-cookie'][0],/Path=\/api\/v1;/);assert.ok(f.sessions.has(digest(cookie.split('=')[1])));
  assert.equal((await agent.get('/api/v1/member/private')).status,403);
  assert.equal((await agent.get('/api/v1/auth/me')).body.data.csrfToken,csrf);
  assert.equal((await agent.post('/api/v1/auth/change-password').set('Origin',origin).send({})).status,403);
  const change=(current:string)=>agent.post('/api/v1/auth/change-password').set('Origin',origin).set('X-CSRF-Token',csrf).send({current_password:current,password:'baru12',confirm_password:'baru12'});
  assert.equal((await change('salah')).status,422);
  const updated=await change(credentials.password);assert.equal(updated.status,200);assert.notEqual(cookieOf(updated),cookie);assert.equal(updated.body.data.must_change_password,0);
  assert.equal((await request(f.app).get('/api/v1/auth/me').set('Cookie',cookie)).status,401);
  assert.equal((await agent.get('/api/v1/member/private')).status,200);
  const token=cookieOf(updated).split('=')[1];f.sessions.get(digest(token)).expires=0;assert.equal((await agent.get('/api/v1/auth/me')).status,401);
  assert.equal((await request(f.app).get('/api/v1/member/private').set('Cookie',`dewi_admin=${'a'.repeat(64)}`)).status,401);
  assert.equal((await request(f.app).post('/api/v1/auth/register')).status,404);
});

test('CMS provisions only members, initializes preferences, rolls back audit failure and resets sessions without secrets',async()=>{
  const f=await fixture();
  const create={name:'Anggota B',phone_number:'085712345678',password:'awal12',confirm_password:'awal12'};
  const response=await request(f.app).post('/admin-members').send(create);assert.equal(response.status,201);assert.equal(f.users[1].role,'member');assert.equal(f.preferences,1);assert.match(f.users[1].password_hash,/^\$argon2id\$/);assert.equal(response.body.data.password_hash,undefined);assert.equal(f.users[1].created_by,'9');
  assert.equal(response.body.data.status,'active');
  assert.equal((await request(f.app).post('/admin-members').send({...create,status:'disabled'})).status,422);
  assert.equal((await request(f.app).post('/admin-members').send({...create,password:'abcde',confirm_password:'abcde'})).status,422);
  await f.auth.login(create.phone_number,create.password);
  assert.equal((await request(f.app).post('/admin-members').send(create)).status,409);
  assert.equal((await request(f.app).post('/admin-members').send({...create,role:'admin'})).status,422);
  const login=await request(f.app).post('/api/v1/auth/login').set('Origin',origin).send(credentials);const old=cookieOf(login);
  const reset={password:'ulang6',confirm_password:'ulang6',must_change_password:false};
  const result=await request(f.app).post('/admin-members/10/reset-password').send(reset);assert.equal(result.status,200);assert.equal(result.body.data,undefined);
  assert.equal((await request(f.app).get('/api/v1/auth/me').set('Cookie',old)).status,401);
  await assert.rejects(f.auth.login(credentials.identifier,credentials.password));
  const fresh=await f.auth.login(credentials.identifier,reset.password);assert.equal((await f.auth.authenticate(fresh.token))?.must_change_password,0);
  assert.ok(!JSON.stringify(f.audits).includes(reset.password));assert.ok(!JSON.stringify(f.audits).includes('$argon2'));
  f.users[0].role='admin';assert.equal((await request(f.app).post('/admin-members/10/reset-password').send(reset)).status,404);f.users[0].role='member';
  await request(f.app).patch('/admin-members/10/status').send({status:'disabled'});assert.equal(await f.auth.authenticate(fresh.token),null);
  await request(f.app).patch('/admin-members/10/status').send({status:'active'});assert.equal(await f.auth.authenticate(fresh.token),null);
  f.failAudit();const count=f.users.length;assert.equal((await request(f.app).post('/admin-members').send({...create,phone_number:'085799999999'})).status,422);assert.equal(f.users.length,count);assert.ok(f.rollback>0);
});

test('member login rate limiter, origin checks and Secure production cookie',async()=>{
  const auth={login:async()=>({token:'a'.repeat(64),expiresAt:new Date(Date.now()+10000)}),authenticate:async()=>({id:'1',name:'fixture',must_change_password:0}),logout:async()=>{},change:async()=>{},mutate:async()=>{}} as any;
  const app=express();app.use(express.json(),cookieParser(),memberAuthRouter(auth,origin,true));app.use((e:any,_req:any,res:any,_next:any)=>res.sendStatus(e.status||500));
  assert.equal((await request(app).post('/auth/login').send(credentials)).status,403);
  for(let i=0;i<9;i++){const r=await request(app).post('/auth/login').set('Origin',origin).send(credentials);assert.equal(r.status,200);assert.match(r.headers['set-cookie'][0],/Secure/);}
  assert.equal((await request(app).post('/auth/login').set('Origin',origin).send(credentials)).status,429);
});

test('ownership, CMS effects, idempotent care and server-calculated progress',async()=>{
  const logs:any[]=[];let metrics={stat1:30,stat2:10,stat3:25};
  const db={query:async(sql:string,p:any[])=>{
    if(sql.startsWith('SELECT * FROM user_cultivations'))return [[...(p[0]==='1'&&p[1]==='A'?[{id:'1',user_id:'A',species_id:'3',metrics_json:metrics}]:[])]];
    if(sql.includes('sca.effect_config_json'))return [[{id:'5',effect_config_json:{stat2:30,stat3:15}}]];
    if(sql.includes('FROM care_schedules'))return [[]];
    if(sql.includes('SELECT category_id FROM species'))return [[{category_id:'3'}]];
    if(sql.includes('FROM cultivation_categories'))return [[{id:'3',parent_id:null,habitat_key:'kebun'}]];
    if(sql.startsWith('SELECT id FROM care_logs'))return [logs.filter(l=>l.event===p[1])];
    if(sql.includes('COUNT(*) AS total'))return [[{total:logs.length}]];
    if(sql.includes('SUM(points)'))return [[{total:5}]];
    if(sql.includes('source_reference AS day'))return [[{day:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date())}]];
    throw Error(`Unhandled: ${sql}`);
  },execute:async(sql:string,p:any[])=>{if(sql.startsWith('UPDATE user_cultivations'))metrics=JSON.parse(p[0]);else if(sql.startsWith('INSERT INTO care_logs'))logs.push({id:'7',event:p[3]});else throw Error(sql);return [{}];}} as any;
  await assert.rejects(owned(db,'user_cultivations','1','B'),/tidak ditemukan/);
  await performCare(db,'A','1','action1','event-1');await performCare(db,'A','1','action1','event-1');
  assert.equal(logs.length,1);assert.equal(metrics.stat2,40);assert.equal(metrics.stat3,40);
  assert.deepEqual(applyEffects({stat1:99,stat2:0,stat3:20},{stat1:35,stat2:-30,stat3:200}),{stat1:100,stat2:0,stat3:100});
  const p=await progress(db,'A');assert.equal(p.totalCareCount,1);assert.equal(p.totalPoints,5);assert.equal(p.streakDays,1);assert.equal(p.level,1);
});
