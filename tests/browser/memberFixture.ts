import type {Page} from '@playwright/test';
export function fixturePet(id:string,slug='sorgum',extra:Record<string,unknown>={}) {
  const type=/ayam|petelur/.test(slug)?'kuning':/lele|nila|mas/.test(slug)?'koki':'tunas';
  const name=({sorgum:'Sorgum',sawi:'Sawi',lele:'Lele',petelur:'Ayam petelur'} as Record<string,string>)[slug]||slug.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  const slots=type==='tunas'?['Siram','Beri pupuk','Cek kondisi']:type==='koki'?['Beri pakan','Ganti air','Cek kondisi']:['Beri makan','Beri minum','Bersihkan kandang'];
  return {id,nickname:name,petMode:'individual',quantity:1,locationLabel:'Pekarangan',ownershipConfirmed:true,status:'active',visualState:'normal',metrics:{stat1:40,stat2:40,stat3:40},startedAt:'2026-11-01T00:00:00Z',archivedAt:null,archiveReason:null,
    species:{id:slug,slug,name,type,status:'published',categoryName:type,images:{normal:`/assets/generated/${slug==='petelur'?'ayam-petelur':slug}.webp`},careActions:slots.map((label,i)=>({id:String(i+1),associationId:String(i+1),slot:`action${i+1}`,label,description:'Catat perawatan yang sudah dilakukan',icon:'plant'})),guides:[{title:`Panduan ${name}`,bodyText:'Periksa kondisi budidaya secara rutin.'}]},...extra};
}
export const fixtureCatalog={categories:[{id:'1',parentId:null,slug:'tanaman',habitatKey:'kebun'},{id:'2',parentId:null,slug:'ikan',habitatKey:'kolam'},{id:'3',parentId:null,slug:'ayam',habitatKey:'kandang'}],species:['sorgum','sawi','lele','petelur'].map(slug=>{const pet=fixturePet(slug,slug);return {slug,name:pet.species.name,categoryId:pet.species.type==='tunas'?'1':pet.species.type==='koki'?'2':'3',shortNote:'',media:[{stateKey:'normal',storagePath:pet.species.images.normal}],careActions:[]};})};


export async function memberFixture(page:Page,authenticated=true,options:{empty?:boolean}={}) {
  let logged=authenticated,restricted=false,current='a',csrf='fixture-member';
  const states:Record<string,any>={};
  const make=(id:string)=>({profile:{name:`Anggota ${id.toUpperCase()}`,region:'Bandung',email:`${id}@example.test`,phoneNumber:'081234567890',careFocus:['tanaman'],soundEnabled:false,reminderEnabled:false,textSize:'medium',language:'Indonesia',avatarUrl:'/assets/generated/avatar-penyuluh.png',isLoggedIn:true},cultivations:options.empty?[]:[fixturePet('1'),fixturePet('2','lele'),fixturePet('3','petelur')],selectedCultivations:{tunas:options.empty?null:'1',koki:options.empty?null:'2',kuning:options.empty?null:'3'},activePetType:'tunas',schedules:[],careRecords:[],journalTotal:0,journalHasMore:false,multiPetReady:true,bulkCareMaxPets:50,totalCareCount:0,totalPoints:0,streakDays:0,dailyRewardDate:'',chats:[]});
  const get=()=>states[current]||(states[current]=make(current));
  const session=()=>({id:current,name:get().profile.name,must_change_password:Number(restricted),csrfToken:csrf});
  const handle=async(route:any)=>{
    const req=route.request(),p=new URL(req.url()).pathname.replace('/api/v1',''),b=req.method()==='GET'||req.headers()['content-type']?.startsWith('multipart')?{}:req.postDataJSON()||{};
    const send=(data:any,status=200)=>route.fulfill({status,json:status<400?{success:true,data}:{success:false,error:{code:status===401?'AUTH_REQUIRED':'PASSWORD_CHANGE_REQUIRED',message:'Silakan masuk kembali.'}}});
    if(p==='/auth/login'){logged=true;current=String(b.identifier).includes('anggota.b')?'b':'a';restricted=b.identifier==='pertama';return send(session());}
    if(!logged)return send(null,401);
    if(p==='/auth/me')return send(session());
    if(p==='/auth/logout'){logged=false;return send({});}
    if(p==='/auth/change-password'){restricted=false;csrf='rotated';return send(session());}
    if(restricted)return send(null,403);
    const data=get();
    if(p==='/member/chat/capabilities')return send({externalEnabled:false,imageAnalysis:false,connectionVerified:false,localFallback:true});
    if(p==='/member/bootstrap')return send(data);
    if(p==='/member/preferences'){Object.assign(data.profile,b);return send(data.profile);}
    if(p==='/member/profile'){Object.assign(data.profile,b);return send(data.profile);}
    if(p==='/member/cultivations'&&req.method()==='POST'){
      let pet=data.cultivations.find((p:any)=>p.createRequest===b.client_request_id);
      if(!pet){pet=fixturePet(String(data.cultivations.length+10),b.species_slug,{nickname:b.nickname,petMode:b.pet_mode,quantity:b.quantity,locationLabel:b.location_label,createRequest:b.client_request_id});data.cultivations.push(pet);}
      data.selectedCultivations[pet.species.type]=pet.id;data.activePetType=pet.species.type;return send({...data,createdCultivationId:pet.id});
    }
    if(p==='/member/cultivations/selection'){data.activePetType=b.type;data.selectedCultivations[b.type]=b.cultivation_id;return send(data);}
    const record=(ids:string[],slot:string,event:string,batch=false,scheduleId?:string)=>{
      const existing=data.careRecords.find((a:any)=>a.event===event);if(existing)return existing;
      const entries=ids.map(id=>{const pet=data.cultivations.find((c:any)=>c.id===id),action=pet.species.careActions.find((a:any)=>a.slot===slot);pet.metrics.stat2=Math.min(100,pet.metrics.stat2+30);return {id:`log-${event}-${id}`,cultivationId:id,petName:pet.nickname,quantity:pet.quantity,petMode:pet.petMode,speciesName:pet.species.name,speciesSlug:pet.species.slug,type:pet.species.type,actionLabel:action?.label||slot,slot,createdAt:new Date().toISOString(),scheduleId:scheduleId||null};});
      const activity={id:`activity-${event}`,event,batchId:batch?event:null,createdAt:new Date().toISOString(),actionLabel:entries[0].actionLabel,representedQuantity:entries.reduce((n:number,e:any)=>n+e.quantity,0),entries};
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());
      for(const id of ids){const schedule=data.schedules.find((s:any)=>s.cultivationId===id&&s.slot===slot&&s.enabled&&s.doneOn!==today&&(!scheduleId||s.id===scheduleId));if(schedule)schedule.doneOn=today;}
      data.careRecords.unshift(activity);data.totalCareCount++;data.journalTotal=data.careRecords.length;return activity;
    };
    if(p==='/member/cultivations/bulk-care'){const pet=data.cultivations.find((c:any)=>c.id===b.cultivation_ids[0]),slot=pet.species.careActions.find((a:any)=>a.id===b.care_action_id).slot,a=record(b.cultivation_ids,slot,b.client_event_id,true);return send({...data,careResult:{batchId:a.batchId,affectedPetCount:a.entries.length,representedQuantity:a.representedQuantity,updatedCultivationIds:b.cultivation_ids}});}
    if(/\/care-actions$/.test(p)){const id=p.split('/')[3];record([id],b.slot,b.client_event_id);return send(data);}
    if(p.startsWith('/member/cultivations/')){
      const id=p.split('/')[3],pet=data.cultivations.find((p:any)=>p.id===id);
      if(p.endsWith('/archive')){pet.status='archived';pet.archivedAt=new Date().toISOString();pet.archiveReason=b.reason;data.schedules.filter((s:any)=>s.cultivationId===id).forEach((s:any)=>s.enabled=false);for(const key of Object.keys(data.selectedCultivations))if(data.selectedCultivations[key]===id)data.selectedCultivations[key]=data.cultivations.find((p:any)=>p.status==='active'&&p.species.type===key)?.id||null;}
      else if(p.endsWith('/restore')){pet.status='active';pet.archivedAt=null;pet.archiveReason=null;}
      else if(req.method()==='PATCH'||p.endsWith('/confirm')){Object.assign(pet,{nickname:b.nickname,petMode:b.pet_mode,quantity:b.quantity,locationLabel:b.location_label});if(p.endsWith('/confirm'))pet.ownershipConfirmed=true;}
      return send(data);
    }
    if(p==='/member/schedules'&&req.method()==='POST'){const pet=data.cultivations.find((p:any)=>p.id===b.cultivation_id);data.schedules.push({id:String(data.schedules.length+1),cultivationId:pet.id,nickname:pet.nickname,speciesName:pet.species.name,quantity:pet.quantity,petStatus:pet.status,ownershipConfirmed:pet.ownershipConfirmed,actionLabel:pet.species.careActions.find((a:any)=>a.slot===b.slot)?.label,slot:b.slot,time:b.time,enabled:b.enabled});return send(data);}
    if(p.startsWith('/member/schedules/')){const schedule=data.schedules.find((s:any)=>s.id===p.split('/')[3]);if(p.endsWith('/complete')){if(!schedule.doneOn)record([schedule.cultivationId],schedule.slot,b.client_event_id,false,schedule.id);}else Object.assign(schedule,b);return send(data);}
    if(p==='/member/journal')return send({items:data.careRecords.slice(Number(new URL(req.url()).searchParams.get('offset')||0)),total:data.careRecords.length,hasMore:false});
    if(p==='/member/rewards/daily'){if(!data.dailyRewardDate){data.totalPoints=5;data.dailyRewardDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date());}return send(data);}
    if(p==='/member/chat/media')return send({id:'1'});
    if(p==='/member/chat/conversations'){
      if(req.method()==='POST'){const chat={id:String(data.chats.length+1),title:b.title,snippet:'',messages:[],updatedAt:new Date().toISOString()};data.chats.push(chat);return send(chat);}
      return send(data.chats.map((c:any)=>({...c,messages:[]})));
    }
    if(p.startsWith('/member/chat/conversations/')){
      const id=p.split('/')[4],chat=data.chats.find((c:any)=>c.id===id);
      if(req.method()==='DELETE'){data.chats=data.chats.filter((c:any)=>c.id!==id);return send({});}
      if(p.endsWith('/messages')){chat.messages.push({id:String(chat.messages.length+1),sender:'user',text:b.content,timestamp:'07.00'},{id:String(chat.messages.length+2),sender:'assistant',text:'Panduan umum: periksa kelembapan tanah.',timestamp:'07.00'});chat.snippet='Panduan umum';}
      return send(chat);
    }
    throw Error(`Unhandled member browser fixture ${req.method()} ${p}`);
  };
  await page.route('**/api/v1/auth/**',handle);await page.route('**/api/v1/member/**',handle);
  get();return {states};
}
