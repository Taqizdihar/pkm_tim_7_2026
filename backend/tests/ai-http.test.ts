import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {adminRouter} from '../src/modules/admin/routes.js';
import {memberRouter} from '../src/modules/member/routes.js';
import {createAI} from '../src/integrations/ai/router.js';
import {GeminiProvider} from '../src/integrations/ai/gemini.js';
import {loadEnv} from '../src/config/env.js';

test('new AI routes use the existing member and admin authorization boundaries',async()=>{
  const pool={execute:async()=>[[]]} as any;
  const catalog={categories:async()=>[],species:async()=>[]} as any;
  const app=createApp({pool,frontendOrigin:'http://localhost:3000',checkDatabase:async()=>{},catalog});
  for(const path of ['/api/v1/member/chat/capabilities','/api/v1/member/chat/conversations/1','/api/v1/admin/ai/status'])assert.equal((await request(app).get(path)).status,401);
  assert.equal((await request(app).post('/api/v1/admin/ai/test').send({})).status,401);
  assert.equal((await request(app).post('/api/v1/member/chat/conversations/1/messages').send({})).status,401);
});

test('CMS diagnostics are safe, never auto-call Gemini, and rate-limit manual real-provider tests',async()=>{
  let calls=0;
  const env=loadEnv({DB_HOST:'fixture',DB_PORT:'3306',DB_USER:'fixture',DB_PASSWORD:'',DB_NAME:'fixture',FRONTEND_ORIGIN:'http://localhost:3000',GEMINI_API_KEY:'secret-fixture-primary',GEMINI_API_KEY_FALLBACK:'secret-fixture-secondary'});
  const ai=createAI(env,new GeminiProvider(env,()=>({models:{generateContent:async()=>{calls++;return {text:'Periksa drainase.'} as any;}}})));
  const app=express();app.use(express.json());app.use((_req,res,next)=>{res.locals.admin={id:'9'};next();});app.use(adminRouter({} as any,'unused',ai));
  const status=await request(app).get('/ai/status');assert.equal(calls,0);assert.doesNotMatch(JSON.stringify(status.body),/secret-fixture/);
  assert.equal((await request(app).post('/ai/test').send({})).body.data.state,'verified');assert.equal(calls,1);
  assert.equal((await request(app).post('/ai/test').send({})).status,200);assert.equal((await request(app).post('/ai/test').send({})).status,429);assert.equal(calls,2);
});

test('consultation rate limit is keyed by member and cannot be bypassed with client request IDs',async()=>{
  const env=loadEnv({DB_HOST:'fixture',DB_PORT:'3306',DB_USER:'fixture',DB_PASSWORD:'',DB_NAME:'fixture',FRONTEND_ORIGIN:'http://localhost:3000',AI_MAX_REQUESTS_PER_MINUTE:'1'});
  const app=express();app.use(express.json());app.use((_req,res,next)=>{res.locals.member={id:'7'};next();});app.use(memberRouter({} as any,{} as any,'unused',createAI(env)));
  app.use((_error:any,_req:any,res:any,_next:any)=>res.status(422).json({}));
  assert.equal((await request(app).post('/chat/conversations/1/messages').send({content:'invalid'})).status,422);
  assert.equal((await request(app).post('/chat/conversations/1/messages').send({content:'another invalid'})).status,429);
});

test('all authenticated members receive AI capabilities regardless of the retired demo ID setting',async()=>{
  const env=loadEnv({DB_HOST:'fixture',DB_PORT:'3306',DB_USER:'fixture',DB_PASSWORD:'',DB_NAME:'fixture',FRONTEND_ORIGIN:'http://localhost:3000',GEMINI_API_KEY:'fixture',AI_DEMO_MEMBER_IDS:'7'});
  let calls=0;
  const ai=createAI(env,new GeminiProvider(env,()=>({models:{generateContent:async()=>{calls++;return {text:'Fixture'} as any;}}})));
  const app=express();app.use((_req,res,next)=>{res.locals.member={id:_req.get('x-fixture-member')};next();});app.use(memberRouter({} as any,{} as any,'unused',ai));
  for(const id of ['7','8']) {
    const response=await request(app).get('/chat/capabilities').set('x-fixture-member',id);
    assert.equal(response.status,200);assert.equal(response.body.data.externalEnabled,true);assert.equal(response.body.data.imageAnalysis,true);
    assert.equal('demoAuthorized' in response.body.data,false);
  }
  assert.equal(calls,0);
  assert.equal(ai.diagnostics().memberAccess,'authenticated_members');
});
