import assert from 'node:assert/strict';
import {test} from 'node:test';
import {loadEnv} from '../src/config/env.js';
import {GeminiProvider,type GeminiClient} from '../src/integrations/ai/gemini.js';
import {createAI} from '../src/integrations/ai/router.js';
import {localProvider} from '../src/integrations/ai/local.js';
import {ProviderError,normalizeError,bounded} from '../src/integrations/ai/errors.js';
import {redact} from '../src/integrations/ai/prompts.js';
import type {ConsultationProvider,ConsultationRequest} from '../src/integrations/ai/types.js';

export const config=(extra:Record<string,string>={})=>loadEnv({DB_HOST:'fixture',DB_PORT:'3306',DB_USER:'fixture',DB_PASSWORD:'',DB_NAME:'fixture',FRONTEND_ORIGIN:'http://localhost:3000',GEMINI_API_KEY:'fixture-primary',GEMINI_API_KEY_FALLBACK:'fixture-secondary',AI_DEMO_MEMBER_IDS:'7',...extra});
const input:ConsultationRequest={question:'Mengapa daun sorgum kuning?',context:[{role:'user',text:'Saya menanam sorgum.'},{role:'assistant',text:'Bagaimana kondisi tanahnya?'}],intent:'condition',externalAllowed:true};
const local=localProvider(async()=> 'Panduan umum dari aplikasi.');
const ok={text:'Periksa kelembapan tanah.',modelVersion:'fixture-model',usageMetadata:{promptTokenCount:24,candidatesTokenCount:12}};
const factory=(handler:(key:string,input:any)=>Promise<any>)=>(key:string):GeminiClient=>({models:{generateContent:params=>handler(key,params)}});

test('AI environment parses false correctly, validates limits and permits missing optional keys',()=>{
  const env=config({AI_ENABLED:'false',RAG_ENABLED:'false',GEMINI_API_KEY:'',GEMINI_API_KEY_FALLBACK:''});
  assert.equal(env.AI_ENABLED,false);assert.equal(env.RAG_ENABLED,false);
  for(const values of [{AI_ENABLED:'yes'},{AI_MAX_CONTEXT_MESSAGES:'999'},{AI_DEMO_MEMBER_IDS:'7,abc'},{AI_REQUEST_TIMEOUT_MS:'0'}])assert.throws(()=>config(values));
  assert.equal(createAI(env).capabilities('7').externalEnabled,false);
  assert.equal(createAI(config({AI_PRIMARY_PROVIDER:'local',AI_FALLBACK_PROVIDER:'local'})).capabilities('7').externalEnabled,false);
  assert.equal(normalizeError(null).code,'network');
});

test('official SDK boundary receives model, roles, bounded output and actual inline WebP bytes',async()=>{
  const seen:any[]=[];
  const provider=new GeminiProvider(config(),factory(async(_key,request)=>{seen.push(request);return ok;}));
  const text=await provider.generate(input,new AbortController().signal);
  const data=Buffer.from('fixture processed image');
  const image=await provider.generate({...input,image:{data,mimeType:'image/webp'}},new AbortController().signal);
  assert.equal(text.provider,'gemini');assert.equal(image.imageAnalyzed,true);assert.equal(image.model,'fixture-model');assert.equal(image.usage?.inputTokens,24);
  assert.equal(seen[1].model,'gemini-3.5-flash-lite');assert.equal(seen[1].config.maxOutputTokens,1024);
  assert.deepEqual(seen[1].contents.map((c:any)=>c.role),['user','model','user']);
  assert.deepEqual(seen[1].contents.at(-1).parts[1],{inlineData:{mimeType:'image/webp',data:data.toString('base64')}});
  assert.equal(seen[1].config.httpOptions.retryOptions.attempts,1);
  assert.doesNotMatch(JSON.stringify(seen),/fixture-primary|fixture-secondary|userId|phone_number/);
});

for(const status of [401,403,500,503])test(`secondary Gemini key handles eligible primary failure ${status}`,async()=>{
  const calls:string[]=[];
  const provider=new GeminiProvider(config(),factory(async(key)=>{calls.push(key);if(key==='fixture-primary')throw {status,message:'secret provider payload'};return ok;}));
  const result=await provider.generate(input,new AbortController().signal);
  assert.equal(result.keySlot,'fallback');assert.equal(calls.length,2);
  await provider.generate(input,new AbortController().signal);
  assert.equal(calls.filter(k=>k==='fixture-primary').length,1);
  assert.doesNotMatch(JSON.stringify(provider.status()),/secret provider payload|fixture-primary|fixture-secondary/);
});

test('quota cooldown respects RetryInfo, never rotates keys on shared quota exhaustion',async()=>{
  let calls=0;
  const provider=new GeminiProvider(config(),factory(async()=>{calls++;throw {status:429,message:JSON.stringify({error:{details:[{retryDelay:'123s'}]}})};}));
  const ai=createAI(config(),provider);
  for(let i=0;i<2;i++){const result=await ai.generate(input,local);assert.equal(result.provider,'local');assert.equal(result.fallbackReason,'rate_limited');}
  assert.equal(calls,1);assert.equal(normalizeError({status:429,message:'quota requestsPerDay exceeded'}).code,'quota_exhausted');
  assert.equal(normalizeError({status:429,message:JSON.stringify({error:{details:[{retryDelay:'123s'}]}})}).retryAfterMs,123000);
});

test('missing keys, unsupported RAG image input, invalid model and empty answer have honest local fallback',async()=>{
  for(const error of [undefined,{status:404,message:'invalid model'},new ProviderError('invalid_response')]){
    const env=config(error?{}:{GEMINI_API_KEY:'',GEMINI_API_KEY_FALLBACK:''});
    const provider=new GeminiProvider(env,factory(async()=>{if(error)throw error;return {text:''};}));
    const result=await createAI(env,provider).generate({...input,image:{data:Buffer.from('image'),mimeType:'image/webp'}},local);
    assert.equal(result.provider,'local');assert.equal(result.imageAnalyzed,false);
    assert.match(result.text,/Foto belum dapat dianalisis saat ini/);assert.equal(result.fallbackUsed,true);
  }
  const empty=new GeminiProvider(config(),factory(async()=>({text:''})));
  assert.equal((await createAI(config(),empty).generate(input,local)).fallbackReason,'invalid_response');
});

test('safety refusals are returned without another key or local-provider attempt',async()=>{
  let calls=0,localCalls=0;
  const provider=new GeminiProvider(config(),factory(async()=>{calls++;return {promptFeedback:{blockReason:'SAFETY'}};}));
  const result=await createAI(config(),provider).generate(input,localProvider(async()=>{localCalls++;return 'bad fallback';}));
  assert.equal(result.refused,true);assert.equal(result.provider,'gemini');assert.equal(calls,1);assert.equal(localCalls,0);
  assert.equal(result.imageAnalyzed,false);
  const blocked=new GeminiProvider(config(),factory(async()=>{calls++;throw {status:400,message:'PROHIBITED_CONTENT'};}));
  await assert.rejects(createAI(config(),blocked).generate(input,local),{code:'safety_refusal'});
  assert.equal(calls,2);
});

test('a transient cooldown preserves the technical fallback reason without repeating network calls',async()=>{
  let calls=0;
  const provider=new GeminiProvider(config(),factory(async()=>{calls++;throw {status:503};}));
  const ai=createAI(config(),provider);
  assert.equal((await ai.generate(input,local)).fallbackReason,'unavailable');
  assert.equal((await ai.generate(input,local)).fallbackReason,'unavailable');
  assert.equal(calls,2);
});

test('future injected RAG adapter can lead text, fall back technically and skip unsupported images',async()=>{
  let geminiCalls=0,ragCalls=0;
  const gemini=new GeminiProvider(config(),factory(async()=>{geminiCalls++;return ok;}));
  const rag:ConsultationProvider={id:'rag',configured:true,capabilities:{text:true,imageUnderstanding:false},generate:async()=>{ragCalls++;return {text:'Dari panduan terbit',provider:'rag',imageAnalyzed:false,latencyMs:1,sources:['published-guide-1']};}};
  const ai=createAI(config({AI_PRIMARY_PROVIDER:'rag',AI_FALLBACK_PROVIDER:'gemini',RAG_ENABLED:'true'}),gemini,rag);
  assert.equal((await ai.generate(input,local)).provider,'rag');assert.equal(geminiCalls,0);
  assert.equal((await ai.generate({...input,image:{data:Buffer.from('image'),mimeType:'image/webp'}},local)).provider,'gemini');assert.equal(ragCalls,1);
  rag.generate=async()=>{throw new ProviderError('unavailable');};
  assert.equal((await ai.generate(input,local)).provider,'gemini');
  rag.generate=async()=>{throw new ProviderError('safety_refusal');};
  await assert.rejects(ai.generate(input,local),{code:'safety_refusal'});
});

test('external privacy eligibility, redaction, concurrency bound, and explicit connection tests',async()=>{
  let calls=0;
  const gemini=new GeminiProvider(config(),factory(async()=>{calls++;return ok;}));
  const ai=createAI(config(),gemini);
  assert.equal(ai.externalFor('8'),false);assert.equal(ai.externalFor('7'),true);
  assert.equal((await ai.generate({...input,externalAllowed:false},local)).provider,'local');assert.equal(calls,0);
  assert.equal(ai.diagnostics().gemini.state,'not_tested');
  await ai.testConnection();assert.equal(calls,1);assert.equal(ai.diagnostics().lastTest?.state,'verified');
  assert.doesNotMatch(redact('Sri Ani sri@example.test 081234567890 3273000000000001',['Sri Ani']),/Sri Ani|@|0812|3273/);
  let release!:()=>void;
  const slow=new GeminiProvider(config(),factory(async()=>{await new Promise<void>(r=>release=r);return ok;}));
  const capped=createAI(config({AI_MAX_CONCURRENT_REQUESTS:'1'}),slow);
  const pending=capped.generate(input,local);
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await capped.generate(input,local)).fallbackReason,'busy');release();await pending;
});

test('timeout aborts the provider and the total deadline allows local recovery',async()=>{
  let aborted=false;
  await assert.rejects(bounded(async signal=>{signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});},new AbortController().signal,10),{code:'timeout'});
  assert.equal(aborted,true);
  const env=config({AI_REQUEST_TIMEOUT_MS:'1000',AI_TOTAL_TIMEOUT_MS:'1000'});
  const provider=new GeminiProvider(env,factory(async()=>new Promise(()=>{})));
  assert.equal((await createAI(env,provider).generate(input,local)).provider,'local');
});
