import type {Page} from '@playwright/test';

export async function memberFixture(page:Page,authenticated=true) {
  let logged=authenticated,restricted=false,current='a',csrf='fixture-member';
  const states:Record<string,any>={};
  const make=(id:string)=>({profile:{name:`Anggota ${id.toUpperCase()}`,region:'Bandung',email:`${id}@example.test`,phoneNumber:'081234567890',careFocus:['tanaman'],soundEnabled:false,reminderEnabled:false,textSize:'medium',language:'Indonesia',avatarUrl:'/assets/generated/avatar-penyuluh.png',isLoggedIn:true},cultivations:[],selected:{},activePetType:'tunas',schedules:{},careRecords:[],totalCareCount:0,totalPoints:0,streakDays:0,dailyRewardDate:'',chats:[]});
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
    if(p==='/member/bootstrap')return send(data);
    if(p==='/member/preferences'){Object.assign(data.profile,b);return send(data.profile);}
    if(p==='/member/profile'){Object.assign(data.profile,b);return send(data.profile);}
    if(p==='/member/cultivations'&&req.method()==='POST'){
      const type=/ayam|petelur/.test(b.slug)?'kuning':/lele|nila|mas/.test(b.slug)?'koki':'tunas';
      if(!data.cultivations.some((c:any)=>c.slug===b.slug))data.cultivations.push({id:String(data.cultivations.length+1),slug:b.slug,name:b.slug,type,metrics:{stat1:30,stat2:10,stat3:25}});
      data.selected[type]=b.slug;data.activePetType=type;return send(data);
    }
    if(/\/care-actions$/.test(p)){
      const c=data.cultivations.find((c:any)=>c.id===p.split('/')[3]);data.totalCareCount++;data.careRecords.unshift({id:String(data.totalCareCount),type:c.type,variety:c.slug,slot:b.slot,createdAt:new Date().toISOString()});return send(data);
    }
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
  return {states};
}
