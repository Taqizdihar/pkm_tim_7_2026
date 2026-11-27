import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type {Pool} from 'mysql2/promise';
import type {MemberAuth} from '../src/modules/member-auth/service.js';
import {generateTurn,conversation,messageInput,publicMetadata,newConversation} from '../src/modules/member/chat.js';
import {consultationImage} from '../src/modules/member/media.js';
import {createAI} from '../src/integrations/ai/router.js';
import {GeminiProvider} from '../src/integrations/ai/gemini.js';
import {loadEnv} from '../src/config/env.js';
import {HttpError} from '../src/utils/http.js';

const env=(extra:Record<string,string>={})=>loadEnv({DB_HOST:'fixture',DB_PORT:'3306',DB_USER:'fixture',DB_PASSWORD:'',DB_NAME:'fixture',FRONTEND_ORIGIN:'http://localhost:3000',GEMINI_API_KEY:'fixture',...extra});
const member={id:'7',name:'Anggota Rahasia',email:'rahasia@example.test',phone_number:'081234567890',must_change_password:0};

function store(){
  const messages:any[]=[];let exists=true,valid=true,inTransaction=0,tail=Promise.resolve();
  const db={query:async(sql:string,p:any[])=>{
    if(sql.includes('FROM chat_conversations'))return [exists&&p.includes('7')?[{id:'1',title:'Pertanyaan',updated_at:new Date()}]:[]];
    if(sql.includes('FROM media_assets'))return [[]];
    if(sql.includes('FROM species'))return [[]];
    if(sql.includes('FROM cultivation_guides'))return [[]];
    if(sql.includes('FROM chat_messages')){
      if(sql.includes('lease_live'))return [[...messages.filter(m=>m.role==='user'&&m.client_request_id===p[1])].map(m=>({...m,lease_live:m.expired?'0':'1'}))];
      if(sql.includes("IN ('pending','failed')"))return [messages.filter(m=>m.role==='user'&&['pending','failed'].includes(m.request_state)&&m.client_request_id!==p[1])];
      if(sql.includes('SELECT id,lease_token'))return [messages.filter(m=>m.role==='user'&&m.client_request_id===p[1])];
      if(sql.includes('SELECT role,content'))return [messages.filter(m=>m.client_request_id!==p[1]&&(m.role==='assistant'||m.request_state==='completed')).slice().reverse().slice(0,p[2])];
      if(sql.includes('SELECT m.*'))return [messages.slice().reverse()];
    }
    throw Error(`Unhandled fixture query ${sql}`);
  },execute:async(sql:string,p:any[])=>{
    assert.ok(inTransaction>0,'writes must use a short authenticated transaction');
    if(sql.includes('INSERT INTO chat_conversations'))return [{insertId:1}];
    if(sql.includes('INSERT INTO chat_messages')){
      const user=sql.includes("'user'");
      messages.push(user?{id:String(messages.length+1),role:'user',content:p[1],media_asset_id:p[2],client_request_id:p[3],request_hash:p[4],lease_token:p[5],request_state:'pending',rag_metadata_json:p[7],created_at:new Date()}:
        {id:String(messages.length+1),role:'assistant',content:p[1],client_request_id:p[2],rag_metadata_json:p[3],created_at:new Date()});
    }else if(sql.includes("request_state='completed'"))Object.assign(messages.find(m=>m.id===p[0]),{request_state:'completed',lease_token:null});
    else if(sql.includes("request_state='pending'"))Object.assign(messages.find(m=>m.id===p[2]),{request_state:'pending',lease_token:p[0],expired:false});
    else if(sql.includes("request_state='failed'")){const m=messages.find(m=>m.client_request_id===p[1]&&m.lease_token===p[2]);if(m)m.request_state='failed';}
    return [{}];
  }};
  const auth={mutate:async(_user:string,_token:string,action:any)=>{
    const previous=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);await previous;
    try{if(!valid)throw new HttpError(401,'Sesi dicabut.');inTransaction++;return await action(db);}finally{inTransaction=Math.max(0,inTransaction-1);release();}
  }} as MemberAuth;
  return {pool:db as unknown as Pool,auth,messages,deleted:()=>exists=false,revoke:()=>valid=false,assertOutside:()=>assert.equal(inTransaction,0,'external network must not hold a transaction')};
}

test('turn persistence is ordered, metadata is actual, duplicate IDs deduplicate and changed payloads conflict',async()=>{
  const db=store();let calls=0;const seen:any[]=[];
  const ai=createAI(env(),new GeminiProvider(env(),()=>({models:{generateContent:async request=>{db.assertOutside();calls++;seen.push(request);return {text:'Periksa tanah.',modelVersion:'fixture-model'} as any;}}})));
  const b=messageInput.parse({content:'Mengapa daun kuning?',client_request_id:randomUUID(),external_consent:true});
  const turn=(body=b)=>generateTurn(db.pool,db.auth,ai,'unused',member,'token','1',body);
  await turn();await turn();assert.equal(calls,1);assert.equal(db.messages.length,2);
  assert.equal(db.messages[0].request_state,'completed');assert.equal(JSON.parse(db.messages[1].rag_metadata_json).provider,'gemini');
  const saved=await conversation(db.pool,'7','1');assert.equal(saved.messages[1].providerMetadata?.model,'fixture-model');
  await assert.rejects(turn({...b,content:'Different'}),{code:'REQUEST_CONFLICT'});
  await turn({...b,content:'Daun bawah, baru dua hari.',client_request_id:randomUUID()});
  assert.equal(seen[1].contents.length,3);assert.equal(seen[1].contents[0].parts[0].text,b.content);
  assert.equal(db.messages.map(m=>m.role).join(','),'user,assistant,user,assistant');
  assert.equal(publicMetadata(null),undefined);assert.equal(publicMetadata({provider:'local',secret:'never'} as any)?.provider,'local');
  assert.doesNotMatch(JSON.stringify(seen),/Anggota Rahasia|rahasia@example|081234567890|"userId"/);
});

test('simultaneous sends do not overlap; failed and stale turns recover with the original identity',async()=>{
  const db=store();let release!:()=>void,calls=0;
  const provider=new GeminiProvider(env(),()=>({models:{generateContent:async()=>{calls++;await new Promise<void>(r=>release=r);return {text:'Jawaban'} as any;}}}));
  const ai=createAI(env(),provider),b=messageInput.parse({content:'Sorgum',client_request_id:randomUUID(),external_consent:true});
  const turn=(body=b)=>generateTurn(db.pool,db.auth,ai,'unused',member,'token','1',body);
  const first=turn();await new Promise(r=>setTimeout(r,5));
  await assert.rejects(turn(),{code:'CHAT_PENDING'});
  await assert.rejects(turn({...b,client_request_id:randomUUID()}),{code:'PREVIOUS_TURN_PENDING'});
  release();await first;assert.equal(calls,1);
  const recovery=store();
  const failEnv=env({AI_LOCAL_FALLBACK_ENABLED:'false'});
  const broken=createAI(failEnv,new GeminiProvider(failEnv,()=>({models:{generateContent:async()=>{throw {status:503};}}})));
  await assert.rejects(generateTurn(recovery.pool,recovery.auth,broken,'unused',member,'token','1',b),{code:'CONSULTATION_UNAVAILABLE'});
  assert.equal(recovery.messages[0].request_state,'failed');
  Object.assign(recovery.messages[0],{request_state:'pending',expired:true});
  const restarted=createAI();await generateTurn(recovery.pool,recovery.auth,restarted,'unused',member,'token','1',b);
  assert.equal(recovery.messages.length,2);assert.equal(recovery.messages[0].request_state,'completed');assert.equal(JSON.parse(recovery.messages[1].rag_metadata_json).provider,'local');
});

for(const interruption of ['delete','revoke'])test(`a conversation ${interruption} during generation cannot save or return a private answer`,async()=>{
  const db=store();let release!:()=>void;
  const ai=createAI(env(),new GeminiProvider(env(),()=>({models:{generateContent:async()=>{await new Promise<void>(r=>release=r);return {text:'Private reply'} as any;}}})));
  const body=messageInput.parse({content:'Sorgum',client_request_id:randomUUID(),external_consent:true});
  const result=generateTurn(db.pool,db.auth,ai,'unused',member,'token','1',body);
  await new Promise(r=>setTimeout(r,5));interruption==='delete'?db.deleted():db.revoke();release();
  await assert.rejects(result,{status:interruption==='delete'?404:401});assert.equal(db.messages.filter(m=>m.role==='assistant').length,0);
});

test('privacy denial uses local guidance and does not send profile fields, previous unconsented text, or foreign media',async()=>{
  const db=store();let calls=0;
  const ai=createAI(env(),new GeminiProvider(env(),()=>({models:{generateContent:async()=>{calls++;return {text:'Answer'} as any;}}})));
  const b=messageInput.parse({content:'Cara menanam sorgum',client_request_id:randomUUID()});
  await generateTurn(db.pool,db.auth,ai,'unused',member,'token','1',b);assert.equal(calls,0);
  const saved=await conversation(db.pool,'7','1');assert.equal(saved.messages[1].providerMetadata?.provider,'local');
  await assert.rejects(generateTurn(db.pool,db.auth,ai,'unused',member,'token','2',{...b,client_request_id:randomUUID(),media_id:'999'}),{status:404});
});

test('authorized media loads processed bytes, rejects foreign/avatar/traversal assets and invalid contents',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'dewi-ai-'));
  try{
    await mkdir(path.join(root,'private'));const file=`${randomUUID()}.webp`,data=await sharp({create:{width:32,height:24,channels:3,background:'#228844'}}).webp().toBuffer();
    await writeFile(path.join(root,'private',file),data);
    let asset:any={storage_path:`/api/v1/member/media/${file}`,mime_type:'image/webp'};
    const db={query:async(sql:string,p:any[])=>{assert.ok(sql.includes("a.visibility='private'"));assert.ok(sql.includes('NOT EXISTS'));assert.equal(p[1],'7');return [asset?[asset]:[]];}} as any;
    const result=await consultationImage(db,root,'7','1','1',true);assert.deepEqual(result?.data,data);
    asset=null;await assert.rejects(consultationImage(db,root,'7','999','1',true),{status:404});
    asset={storage_path:'/api/v1/member/media/../../.env',mime_type:'image/webp'};await assert.rejects(consultationImage(db,root,'7','1','1',true),{status:404});
    asset={storage_path:`/api/v1/member/media/${file}`,mime_type:'image/webp'};await writeFile(path.join(root,'private',file),'invalid');await assert.rejects(consultationImage(db,root,'7','1','1',true),{status:422});
  }finally{await rm(root,{recursive:true,force:true});}
});
