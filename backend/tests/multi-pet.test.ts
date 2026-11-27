import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {petFixture} from './pet-fixture.js';
import {createPet,createPetInput,savePet,confirmPetInput,archivePet,restorePet,listPets,selections,selectPet,petInfo} from '../src/modules/member/pets.js';
import {recordCare,performCare,bulkInput} from '../src/modules/member/care.js';
import {saveSchedule} from '../src/modules/member/scheduling.js';
import {journal} from '../src/modules/member/journal.js';
import {bootstrap,progress} from '../src/modules/member/data.js';
import {localDate,multiPetReady} from '../src/modules/member/shared.js';
const input=(extra:Record<string,unknown>={})=>createPetInput.parse({nickname:'Kandang Belakang',species_slug:'petelur',pet_mode:'group',quantity:12,location_label:'Belakang rumah',ownership_confirmed:true,client_request_id:randomUUID(),...extra});
async function three(f:ReturnType<typeof petFixture>){return Promise.all([input(),input({nickname:'Ayam 1',pet_mode:'individual',quantity:1}),input({nickname:'Ayam 2',pet_mode:'individual',quantity:1})].map(b=>f.transaction(()=>createPet(f.db,'1',b))));}

test('empty ownership, explicit creation, same-species instances, BIGINT strings and canonical retry',async()=>{
  const f=petFixture();assert.deepEqual(await listPets(f.db,'1'),[]);assert.deepEqual((await selections(f.db,'1',[])).selectedCultivations,{tunas:null,koki:null,kuning:null});assert.equal(f.state.pets.length,0);
  const b=input(),[a,retry]=await Promise.all([f.transaction(()=>createPet(f.db,'1',b)),f.transaction(()=>createPet(f.db,'1',b))]);assert.equal(a,retry);assert.equal(a,'9007199254740993');assert.equal(f.state.pets.length,1);
  await assert.rejects(f.transaction(()=>createPet(f.db,'1',{...b,quantity:10})),e=>(e as any).status===409);
  const other=await createPet(f.db,'1',input({nickname:b.nickname}));assert.notEqual(a,other);assert.equal(f.state.pets.length,2);
  await selectPet(f.db,'1','kuning',other);assert.equal((await selections(f.db,'1',await listPets(f.db,'1'))).selectedCultivations.kuning,other);assert.equal(f.state.preferences.unrelated,'preserved');
  f.state.preferences={selected:{kuning:'petelur'},unrelated:'preserved'};assert.equal((await selections(f.db,'1',await listPets(f.db,'1'))).selectedCultivations.kuning,a);assert.equal(f.state.pets.length,2);
  const dynamic=await createPet(f.db,'1',input({species_slug:'baru-dinamis'}));assert.equal((await listPets(f.db,'1')).find(p=>p.id===dynamic)?.species.type,'koki');
});
test('mode, quantity, ownership confirmation, bulk shape and server-only fields are validated',()=>{
  for(const invalid of [{pet_mode:'individual',quantity:2},{quantity:0},{quantity:-1},{quantity:1.2},{quantity:1000001},{ownership_confirmed:false},{nickname:'  '},{metrics:{stat1:100}},{user_id:'2'},{species_id:'10'}])assert.equal(createPetInput.safeParse({...input(),...invalid}).success,false,JSON.stringify(invalid));
  assert.equal(createPetInput.safeParse(input({quantity:1})).success,true);
  assert.equal(bulkInput().safeParse({cultivation_ids:['1','1'],care_action_id:'31',client_event_id:randomUUID(),confirmed:true}).success,false);
  assert.equal(bulkInput(2).safeParse({cultivation_ids:['1','2','3'],care_action_id:'31',client_event_id:randomUUID(),confirmed:true}).success,false);
  assert.equal(bulkInput().safeParse({cultivation_ids:['18446744073709551616'],care_action_id:'31',client_event_id:randomUUID(),confirmed:true}).success,false);
});
test('legacy review preserves identity, metrics, schedules, logs and gives no activity',async()=>{
  const f=petFixture(),key=await createPet(f.db,'1',input());const pet=f.state.pets[0],metrics=structuredClone(pet.metrics_json);pet.ownership_confirmed_at=null;
  await assert.rejects(performCare(f.db,'1',key,'action1',randomUUID()),e=>(e as any).code==='PET_CONFIRMATION_REQUIRED');
  await assert.rejects(saveSchedule(f.db,'1',{cultivation_id:key,slot:'action1',time:'07:00',enabled:true}));
  await savePet(f.db,'1',key,confirmPetInput.parse({nickname:'Pet ditinjau',pet_mode:'group',quantity:10,location_label:'Depan',ownership_confirmed:true}),true);
  assert.equal(f.state.pets[0].id,key);assert.deepEqual(f.state.pets[0].metrics_json,metrics);assert.equal(f.state.logs.length,0);assert.equal((await progress(f.db,'1')).totalCareCount,0);
});
test('individual care is isolated, clamps CMS effects and replays after rename/archive without reapplying',async()=>{
  const f=petFixture(),ids=await three(f),event=randomUUID();const before=structuredClone(f.state.pets[1].metrics_json);
  const result=await performCare(f.db,'1',ids[0],'action1',event);assert.equal(result.representedQuantity,12);assert.equal(f.state.pets[0].metrics_json.stat1,45);assert.deepEqual(f.state.pets[1].metrics_json,before);
  f.actions[0].effect_config_json={stat1:300,stat3:-300};await performCare(f.db,'1',ids[1],'action1',randomUUID());assert.deepEqual(f.state.pets[1].metrics_json,{stat1:100,stat2:40,stat3:0});
  await savePet(f.db,'1',ids[0],petInfo.parse({nickname:'Nama baru',pet_mode:'group',quantity:10}));await archivePet(f.db,'1',ids[0],'sold');
  assert.deepEqual(await performCare(f.db,'1',ids[0],'action1',event),result);assert.equal(f.state.logs[0].pet_name_at_care,'Kandang Belakang');assert.equal(f.state.logs[0].quantity_at_care,12);
  await assert.rejects(performCare(f.db,'1',ids[1],'action1',event),e=>(e as any).status===409);await assert.rejects(performCare(f.db,'2',ids[1],'action1',randomUUID()),e=>(e as any).status===404);
});
test('bulk care commits three records representing fourteen animals, one activity, and stable concurrent retries',async()=>{
  const f=petFixture(),ids=await three(f),event=randomUUID(),b={ids,event,operation:'bulk' as const,actionId:'31'};
  const [a,retry]=await Promise.all([f.transaction(()=>recordCare(f.db,'1',b)),f.transaction(()=>recordCare(f.db,'1',{...b,ids:[...ids].reverse()}))]);assert.deepEqual(a,retry);assert.equal(a.affectedPetCount,3);assert.equal(a.representedQuantity,14);assert.equal(f.state.logs.length,3);assert.equal(new Set(f.state.logs.map(l=>l.batch_id)).size,1);assert.equal((await progress(f.db,'1')).totalCareCount,1);
  for(const changed of [{...b,ids:ids.slice(0,2)},{...b,actionId:'32'},{...b,operation:'individual' as const}])await assert.rejects(f.transaction(()=>recordCare(f.db,'1',changed)),e=>(e as any).status===409);
  await savePet(f.db,'1',ids[0],petInfo.parse({nickname:'Nama baru',pet_mode:'group',quantity:10}));await archivePet(f.db,'1',ids[0],'harvested');assert.deepEqual(await recordCare(f.db,'1',b),a);assert.equal(f.state.logs.length,3);
});
test('bulk target ownership, confirmation, active status, species and action are validated atomically',async()=>{
  for(const problem of ['foreign','unconfirmed','archived','mixed','action','failure']){
    const f=petFixture(),ids=await three(f),before=structuredClone(f.state.pets.map(p=>p.metrics_json));
    if(problem==='foreign')f.state.pets[1].user_id='2';if(problem==='unconfirmed')f.state.pets[1].ownership_confirmed_at=null;if(problem==='archived')f.state.pets[1].status='archived';if(problem==='mixed')f.state.pets[1].species_id='11';if(problem==='failure')f.state.failLog=2;
    await assert.rejects(f.transaction(()=>recordCare(f.db,'1',{ids,event:randomUUID(),operation:'bulk',actionId:problem==='action'?'999':'31'})),undefined,problem);assert.equal(f.state.logs.length,0,problem);assert.deepEqual(f.state.pets.map(p=>p.metrics_json),before,problem);
  }
});
test('per-instance schedules, manual/bulk matching, occurrence deduplication, extra physical action and archive/restore',async()=>{
  const f=petFixture(),ids=await three(f);
  for(const id of ids)await saveSchedule(f.db,'1',{cultivation_id:id,slot:'action1',time:'07:00',enabled:true});
  await saveSchedule(f.db,'1',{cultivation_id:ids[0],slot:'action2',time:'08:00',enabled:true});assert.equal(f.state.schedules.length,4);
  const first=f.state.schedules.find(s=>s.user_cultivation_id===ids[0]&&s.species_care_action_id==='51')!;
  f.state.schedules.push({...first,id:'99'});
  await performCare(f.db,'1',ids[0],'action1',randomUUID());assert.equal(f.state.logs[0].schedule_id,first.id);assert.equal(f.state.logs.length,1);
  await performCare(f.db,'1',ids[0],'action1',randomUUID(),first.id);assert.equal(f.state.logs.length,1);
  await recordCare(f.db,'1',{ids,event:randomUUID(),operation:'bulk',actionId:'31'});assert.equal(f.state.logs.length,4);assert.equal(f.state.logs[1].schedule_id,'99');assert.ok(!f.state.logs.some(l=>l.species_care_action_id==='52'));assert.ok(f.state.logs.every(l=>l.local_date===localDate()));
  await performCare(f.db,'1',ids[0],'action1',randomUUID());assert.equal(f.state.logs.length,5);assert.equal(f.state.logs[4].schedule_id,null);
  f.state.preferences={...f.state.preferences,selectedCultivations:{kuning:ids[0]},activePetType:'kuning'};await archivePet(f.db,'1',ids[0],'sold');assert.equal(f.state.schedules.filter(s=>s.user_cultivation_id===ids[0]&&s.is_enabled).length,0);assert.notEqual(f.state.preferences.selectedCultivations.kuning,ids[0]);
  f.species[0].status='archived';await restorePet(f.db,'1',ids[0]);assert.equal(f.state.pets[0].status,'active');assert.ok(f.state.schedules.filter(s=>s.user_cultivation_id===ids[0]).every(s=>!s.is_enabled));assert.equal(f.state.logs.length,5);
  await assert.rejects(createPet(f.db,'1',input()),/tidak tersedia/);
});
test('journal pages whole batches, counts activities, preserves snapshots and labels legacy quantities unknown',async()=>{
  const f=petFixture(),ids=await three(f);
  for(let i=0;i<21;i++)await recordCare(f.db,'1',{ids,event:randomUUID(),operation:'bulk',actionId:'31'});
  await performCare(f.db,'1',ids[0],'action2',randomUUID());Object.assign(f.state.logs.at(-1),{quantity_at_care:null,pet_name_at_care:null,notes:'legacy free text'});
  await savePet(f.db,'1',ids[0],petInfo.parse({nickname:'Nama sekarang',pet_mode:'group',quantity:10}));
  const first=await journal(f.db,'1'),second=await journal(f.db,'1',20);assert.equal(first.total,22);assert.equal(first.items.length,20);assert.equal(first.hasMore,true);assert.equal(second.items.length,2);assert.equal(second.hasMore,false);assert.equal(first.items[0].entries[0].quantity,null);
  assert.ok(first.items.slice(1).every(a=>a.entries.length===3&&a.representedQuantity===14));assert.equal(second.items[0].entries[0].petName,'Kandang Belakang');assert.equal((await progress(f.db,'1')).totalCareCount,22);assert.equal((await progress(f.db,'1')).level,5);assert.equal((await journal(f.db,'2')).total,0);
});
test('read-only schema readiness distinguishes a missing migration without mutating data',async()=>{const f=petFixture();assert.equal(await multiPetReady(f.db),true);f.state.ready=false;assert.equal(await multiPetReady(f.db),false);assert.equal(f.state.pets.length,0);assert.equal(f.state.logs.length,0);});
test('overlapping concurrent care requests serialize per member and each physical event contributes once',async()=>{
  const f=petFixture(),ids=await three(f),a={ids:ids.slice(0,2),event:randomUUID(),operation:'bulk' as const,actionId:'31'},b={ids:ids.slice(1),event:randomUUID(),operation:'bulk' as const,actionId:'31'};
  await Promise.all([f.transaction(()=>recordCare(f.db,'1',a)),f.transaction(()=>recordCare(f.db,'1',b)),f.transaction(()=>recordCare(f.db,'1',a))]);
  assert.equal(f.state.logs.length,4);assert.deepEqual(f.state.pets.map(p=>p.metrics_json.stat1),[45,75,45]);assert.equal((await progress(f.db,'1')).totalCareCount,2);
});
test('bootstrap never fabricates ownership and missing SQL 06 leaves profile and legacy progress usable',async()=>{
  const f=petFixture();const empty=await bootstrap(f.db,'1');assert.deepEqual(empty.cultivations,[]);assert.deepEqual(empty.schedules,[]);assert.equal(empty.multiPetReady,true);assert.equal(empty.profile.name,'Anggota');
  const key=await createPet(f.db,'1',input());await performCare(f.db,'1',key,'action1',randomUUID());f.state.ready=false;
  const unavailable=await bootstrap(f.db,'1');assert.equal(unavailable.multiPetReady,false);assert.deepEqual(unavailable.cultivations,[]);assert.equal(unavailable.profile.name,'Anggota');assert.equal(unavailable.totalCareCount,1);assert.equal(f.state.pets.length,1);
});
test('adding the same Pet action at another time creates a separate schedule; edits retain the original ID',async()=>{
  const f=petFixture(),key=await createPet(f.db,'1',input());
  await saveSchedule(f.db,'1',{cultivation_id:key,slot:'action1',time:'07:00',enabled:true});await saveSchedule(f.db,'1',{cultivation_id:key,slot:'action1',time:'17:00',enabled:true});
  assert.equal(f.state.schedules.length,2);assert.deepEqual(f.state.schedules.map(s=>s.care_time),['07:00','17:00']);
  await saveSchedule(f.db,'1',{cultivation_id:key,slot:'action1',time:'08:00',enabled:true},'1');assert.equal(f.state.schedules.length,2);assert.equal(f.state.schedules[0].id,'1');assert.equal(f.state.schedules[0].care_time,'08:00');assert.equal(f.state.schedules[1].care_time,'17:00');
  await assert.rejects(saveSchedule(f.db,'1',{cultivation_id:key,slot:'action2',time:'08:00',enabled:true},'1'),/tidak dapat diganti/);
});
