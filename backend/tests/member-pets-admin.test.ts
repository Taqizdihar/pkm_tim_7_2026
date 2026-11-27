import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {membersRouter} from '../src/modules/admin/members.js';
import {createApp} from '../src/app.js';

test('admin member Pet monitoring is bounded, read-only, sanitized and restricted to ordinary members',async()=>{
  let queries=0,writes=0;
  const pool={execute:async(sql:string,p:any[])=>{assert.match(sql,/r.code='member'/);assert.match(sql,/r.code<>'member'/);return [p[0]==='7'?[{id:'7',name:'Anggota'}]:[]];},query:async(sql:string,p:any[]=[])=>{
    queries++;if(sql.includes('LIMIT 0'))return [[]];if(sql.includes('information_schema.TABLE_CONSTRAINTS'))return [['uq_uc_create_request','chk_uc_mode_quantity','uq_care_logs_client_event'].map(CONSTRAINT_NAME=>({CONSTRAINT_NAME}))];
    if(sql.includes('COALESCE(SUM(uc.status')){assert.match(sql,/JOIN users u/);assert.equal(p[0],'7');return [[{active:1,individual:0,grouped:1,archived:0,unconfirmed:0}]];}
    if(sql.includes('LIMIT 20 OFFSET')){assert.deepEqual(p,['7',20]);return [[{id:'9007199254740993',nickname:'Kolam',pet_mode:'group',quantity:20,location_label:'Belakang',status:'active',ownership_confirmed_at:'2026-11-27',species_name:'Lele',category_name:'Ikan'}]];}
    if(sql.includes('COUNT(*) AS total'))return [[{total:21}]];writes++;throw Error(sql);
  }} as any;
  const app=express();app.use(express.json());app.use(membersRouter(pool));app.use((e:any,_req:any,res:any,_next:any)=>res.status(e.status||422).json({message:e.message}));
  const response=await request(app).get('/7/cultivations?page=2');assert.equal(response.status,200);assert.equal(response.body.data.items[0].id,'9007199254740993');assert.equal(response.body.data.summary.group,1);assert.doesNotMatch(JSON.stringify(response.body),/metrics|password|chat|media|token/);
  const before=queries;assert.equal((await request(app).get('/8/cultivations')).status,404);assert.equal(queries,before);assert.equal((await request(app).get('/7/cultivations?page=0')).status,422);assert.equal((await request(app).post('/7/cultivations').send({quantity:999})).status,404);assert.equal(writes,0);
});
test('new member Pet and admin monitoring routes preserve independent authentication boundaries',async()=>{
  const pool={query:async()=>[[]],execute:async()=>[[]]} as any,catalog={categories:async()=>[],species:async()=>[]} as any;
  const app=createApp({pool,catalog,frontendOrigin:'http://localhost:3000',checkDatabase:async()=>{}});
  for(const path of ['/api/v1/member/cultivations','/api/v1/admin/members/7/cultivations'])assert.equal((await request(app).get(path)).status,401);
  for(const path of ['/api/v1/member/cultivations','/api/v1/member/cultivations/bulk-care','/api/v1/member/cultivations/1/archive'])assert.equal((await request(app).post(path).send({})).status,401);
});
