import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import type {Pool} from 'mysql2/promise';
import {memberRouter} from '../src/modules/member/routes.js';
import {performCare} from '../src/modules/member/data.js';
import {createApp} from '../src/app.js';

test('member HTTP data boundary rejects foreign records and forged fields',async()=>{
  const writes:string[]=[];
  const db={query:async(sql:string,params:any[])=>{
    assert.ok(params.includes('A'),'ownership query must include authenticated member A');
    if(sql.includes('FROM user_cultivations')||sql.includes('FROM chat_conversations')||sql.includes('FROM care_schedules')||sql.includes('FROM media_assets'))return [[]];
    throw Error(`Unexpected query ${sql}`);
  },execute:async(sql:string)=>{writes.push(sql);return [{}];}} as any;
  const auth={mutate:async(user:string,_token:string,fn:any)=>{assert.equal(user,'A');return fn(db);}} as any;
  const app=express();app.use(express.json());app.use((_req,res,next)=>{res.locals.member={id:'A'};res.locals.memberToken='fixture';next();});app.use(memberRouter(db as Pool,auth,'unused-fixture-path'));
  app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status||422).json({message:e.message}));
  const uuid='123e4567-e89b-42d3-a456-426614174000';
  assert.equal((await request(app).patch('/cultivations/2').send({nickname:'foreign'})).status,404);
  assert.equal((await request(app).post('/cultivations/2/care-actions').send({slot:'action1',client_event_id:uuid})).status,404);
  assert.equal((await request(app).post('/schedules/2/complete').send({client_event_id:uuid})).status,404);
  assert.equal((await request(app).get('/chat/conversations/2')).status,404);
  assert.equal((await request(app).delete('/chat/conversations/2')).status,404);
  assert.equal((await request(app).get('/media/123e4567-e89b-42d3-a456-426614174000.webp')).status,404);
  assert.equal((await request(app).patch('/profile').send({name:'A',user_id:'B',role:'admin'})).status,422);
  assert.equal((await request(app).post('/rewards/daily').send({points:999})).status,422);
  assert.equal((await request(app).post('/chat/conversations/2/messages').send({content:'forged',role:'assistant'})).status,422);
  assert.equal((await request(app).patch('/preferences').send({preferences_json:{points:999}})).status,422);
  assert.equal(writes.length,0);
});

test('scheduled occurrence is applied once even with different retry event IDs',async()=>{
  const events:any[]=[];let writes=0;
  const db={query:async(sql:string,p:any[])=>{
    if(sql.includes('SELECT * FROM user_cultivations'))return [[{id:'1',species_id:'3',metrics_json:{stat1:30,stat2:10,stat3:25}}]];
    if(sql.includes('sca.effect_config_json'))return [[{id:'5',effect_config_json:{stat2:30,stat3:15}}]];
    if(sql.includes('FROM care_schedules'))return [[{id:'7'}]];
    if(sql.includes('FROM care_logs'))return [events.filter(e=>e.schedule===p[3])];
    if(sql.includes('SELECT category_id FROM species'))return [[{category_id:'3'}]];
    if(sql.includes('FROM cultivation_categories'))return [[{id:'3',parent_id:null,habitat_key:'kebun'}]];
    throw Error(sql);
  },execute:async(sql:string,p:any[])=>{writes++;if(sql.startsWith('INSERT INTO care_logs'))events.push({schedule:p[2]});return [{}];}} as any;
  await performCare(db,'A','1','action1','event-1','7');await performCare(db,'A','1','action1','event-2','7');
  assert.equal(events.length,1);assert.equal(writes,2);
});

test('missing member schema is sanitized and does not break public catalog or admin login page APIs',async()=>{
  const catalog={categories:async()=>[],species:async()=>[],speciesBySlug:async()=>null,media:async()=>[],careActions:async()=>[],guides:async()=>[]} as any;
  for(const code of ['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR','ECONNREFUSED']) {
    const pool={query:async()=>{throw Object.assign(Error('secret SQL and credentials'),{code});},execute:async()=>{throw Object.assign(Error('secret SQL and credentials'),{code});}} as unknown as Pool;
    const app=createApp({frontendOrigin:'http://localhost:3000',pool,checkDatabase:async()=>{},catalog});
    const r=await request(app).get('/api/v1/health/member-schema');assert.equal(r.status,503);assert.equal(r.body.error.code,code==='ECONNREFUSED'?'DATABASE_UNAVAILABLE':'SCHEMA_NOT_READY');assert.doesNotMatch(JSON.stringify(r.body),/secret SQL|credentials/);
    assert.equal((await request(app).get('/api/v1/catalog')).status,200);
    assert.equal((await request(app).get('/api/v1/admin/members')).status,401);
    assert.equal((await request(app).get('/api/v1/member/bootstrap')).status,401);
  }
});
