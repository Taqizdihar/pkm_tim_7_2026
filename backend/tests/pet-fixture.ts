import type {Pool} from 'mysql2/promise';

export function petFixture(){
  const state={pets:[] as any[],logs:[] as any[],schedules:[] as any[],preferences:{unrelated:'preserved'} as any,ready:true,next:'9007199254740993',failLog:0};
  const categories=[{id:'1',parent_id:null,habitat_key:'kandang',is_active:1},{id:'2',parent_id:null,habitat_key:'kebun',is_active:1},{id:'3',parent_id:null,habitat_key:'kolam',is_active:1}];
  const species=[{id:'10',slug:'petelur',name:'Ayam petelur',category_id:'1',status:'published'},{id:'11',slug:'sawi',name:'Sawi',category_id:'2',status:'published'},{id:'12',slug:'baru-dinamis',name:'Jenis CMS baru',category_id:'3',status:'published'}];
  const actions=[{id:'51',species_id:'10',care_action_id:'31',slot_key:'action1',name:'Beri makan',effect_config_json:{stat1:30,stat3:15}},{id:'52',species_id:'10',care_action_id:'32',slot_key:'action2',name:'Beri minum',effect_config_json:{stat2:30}},{id:'61',species_id:'11',care_action_id:'41',slot_key:'action1',name:'Siram',effect_config_json:{stat2:30,stat3:15}},{id:'71',species_id:'12',care_action_id:'31',slot_key:'action1',name:'Beri makan',effect_config_json:{stat1:30}}];
  const joined=(pet:any)=>({...pet,category_id:species.find(s=>s.id===pet.species_id)!.category_id,species_name:species.find(s=>s.id===pet.species_id)!.name});
  const ownLogs=(user:string)=>state.logs.filter(l=>state.pets.some(p=>p.id===l.user_cultivation_id&&p.user_id===user));
  const joinLog=(l:any)=>({...l,...{nickname:state.pets.find(p=>p.id===l.user_cultivation_id)?.nickname},...(()=>{const pet=state.pets.find(p=>p.id===l.user_cultivation_id),s=species.find(s=>s.id===pet?.species_id),a=actions.find(a=>a.id===l.species_care_action_id);return {species_name:s?.name,slug:s?.slug,category_id:s?.category_id,action_label:a?.name,slot_key:a?.slot_key};})()});
  const query=async(sql:string,p:any[]=[])=>{
    if(sql.includes('information_schema.TABLE_CONSTRAINTS'))return [[...['uq_uc_create_request','chk_uc_mode_quantity','uq_care_logs_client_event'].map(CONSTRAINT_NAME=>({CONSTRAINT_NAME}))]];
    if(sql.includes('FROM users u JOIN user_preferences'))return [[{name:'Anggota',email:null,username:null,phone_number:'081234567890',avatar_url:null,region:'Bandung',care_focus_json:['tanaman'],text_size:'medium',sound_enabled:0,reminder_enabled:0}]];
    if(sql.includes('LIMIT 0')){if(!state.ready)throw Object.assign(Error('missing'),{code:'ER_BAD_FIELD_ERROR'});return [[]];}
    if(sql.includes('COUNT(DISTINCT cl.batch_id)')){const logs=ownLogs(p[0]);return [[{total:new Set(logs.filter(l=>l.batch_id).map(l=>l.batch_id)).size+logs.filter(l=>!l.batch_id).length}]];}
    if(sql.includes('COUNT(*) AS total FROM care_logs'))return [[{total:ownLogs(p[0]).length}]];
    if(sql.includes('SUM(points)'))return [[{total:5}]];
    if(sql.includes('source_reference AS day'))return [[{day:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta'}).format(new Date())}]];
    if(sql.includes('preferences_json FROM user_preferences'))return [[{preferences_json:state.preferences}]];
    if(sql.includes('FROM cultivation_categories'))return [categories];
    if(sql.startsWith('SELECT id,category_id FROM species'))return [species.filter(s=>s.slug===p[0]&&s.status==='published')];
    if(sql.startsWith('SELECT category_id FROM species'))return [species.filter(s=>s.id===String(p[0]))];
    if(sql.includes('c.name AS category_name FROM species'))return [species.filter(s=>s.id===String(p[0])).map(s=>({...s,category_name:categories.find(c=>c.id===s.category_id)?.habitat_key}))];
    if(sql.includes('FROM species_media')||sql.includes('FROM cultivation_guides'))return [[]];
    if(sql.includes('FROM species_care_actions')){
      let matching=actions.filter(a=>a.species_id===String(p[0]));
      if(sql.includes('ca.id=?'))matching=matching.filter(a=>a.care_action_id===p[1]);
      if(sql.includes('sca.slot_key=?'))matching=matching.filter(a=>a.slot_key===p[1]);
      return [matching.map(a=>sql.includes('association_id')?{...a,id:a.care_action_id,association_id:a.id,icon_key:'feed',description:''}:a)];
    }
    if(sql.includes('create_request_hash FROM user_cultivations'))return [state.pets.filter(c=>c.user_id===p[0]&&c.create_request_id===p[1])];
    if(sql.startsWith('SELECT * FROM user_cultivations WHERE id='))return [state.pets.filter(c=>c.id===p[0]&&c.user_id===p[1])];
    if(sql.startsWith('SELECT * FROM user_cultivations WHERE user_id='))return [state.pets.filter(c=>c.user_id===p[0])];
    if(sql.startsWith('SELECT uc.*,s.category_id'))return [state.pets.filter(c=>c.user_id===p[0]&&p.slice(1).includes(c.id)).map(joined)];
    if(sql.includes('(cl.client_event_id=? OR cl.batch_id=?)'))return [ownLogs(p[0]).filter(l=>l.client_event_id===p[1]||l.batch_id===p[2]).map(joinLog)];
    if(sql.startsWith('SELECT cl.batch_id,CASE')){
      const groups=new Map<string,any>();for(const l of ownLogs(p[0]))groups.set(l.batch_id||`single-${l.id}`,{batch_id:l.batch_id,single_id:l.batch_id?null:l.id,last_id:l.id});
      return [[...groups.values()].sort((a,b)=>Number(BigInt(b.last_id)-BigInt(a.last_id))).slice(p[1],p[1]+20)];
    }
    if(sql.startsWith('SELECT cl.*,uc.nickname'))return [ownLogs(p[0]).filter(l=>p.slice(1).includes(l.batch_id)||p.slice(1).includes(l.id)).map(joinLog)];
    if(sql.startsWith('SELECT id FROM care_logs'))return [state.logs.filter(l=>l.schedule_id===p[0]&&l.local_date===p[1])];
    if(sql.includes('FROM care_schedules')){
      if(sql.includes('NOT EXISTS'))return [state.schedules.filter(s=>s.user_cultivation_id===String(p[0])&&s.species_care_action_id===String(p[1])&&s.is_enabled&&!state.logs.some(l=>l.schedule_id===s.id&&l.local_date===p[2])).sort((a,b)=>Number(a.id)-Number(b.id)).slice(0,1)];
      if(sql.startsWith('SELECT id,timezone'))return [state.schedules.filter(s=>s.id===p[0]&&s.user_cultivation_id===String(p[1])&&s.species_care_action_id===String(p[2])&&s.is_enabled)];
      if(sql.startsWith('SELECT id FROM care_schedules'))return [state.schedules.filter(s=>s.user_cultivation_id===String(p[0])&&s.species_care_action_id===String(p[1])).slice(0,1)];
      return [state.schedules.filter(s=>s.id===p[0]&&state.pets.some(c=>c.id===s.user_cultivation_id&&c.user_id===p[1]))];
    }
    throw Error(`Unhandled Pet fixture query: ${sql}`);
  };
  const execute=async(sql:string,p:any[])=>{
    if(sql.startsWith('INSERT INTO user_cultivations')){const key=state.next;state.next=String(BigInt(state.next)+1n);state.pets.push({id:key,user_id:p[0],species_id:p[1],nickname:p[2],pet_mode:p[3],quantity:p[4],location_label:p[5],ownership_confirmed_at:'2026-11-27',create_request_id:p[6],create_request_hash:p[7],metrics_json:JSON.parse(p[8]),visual_state:p[9],status:'active',started_at:'2026-11-27 00:00:00.000'});return [{insertId:key}];}
    if(sql.startsWith('UPDATE user_preferences')){state.preferences=JSON.parse(p[0]);return [{}];}
    if(sql.startsWith('UPDATE user_cultivations SET metrics')){const pet=state.pets.find(c=>c.id===String(p[2])&&c.user_id===p[3]);pet.metrics_json=JSON.parse(p[0]);pet.visual_state=p[1];return [{}];}
    if(sql.startsWith('UPDATE user_cultivations SET nickname')){const pet=state.pets.find(c=>c.id===p[4]&&c.user_id===p[5]);Object.assign(pet,{nickname:p[0],pet_mode:p[1],quantity:p[2],location_label:p[3]});if(sql.includes('ownership_confirmed_at=UTC'))pet.ownership_confirmed_at='2026-11-27';return [{}];}
    if(sql.includes("SET status='archived'")){Object.assign(state.pets.find(c=>c.id===p[1]&&c.user_id===p[2]),{status:'archived',archive_reason:p[0],archived_at:'2026-11-27'});return [{}];}
    if(sql.includes("SET status='active'")){Object.assign(state.pets.find(c=>c.id===p[0]&&c.user_id===p[1]),{status:'active',archive_reason:null,archived_at:null});return [{}];}
    if(sql.startsWith('INSERT INTO care_logs')){if(state.failLog&&state.logs.length+1===state.failLog)throw Error('injected log failure');state.logs.push({id:String(state.logs.length+1),user_cultivation_id:String(p[0]),species_care_action_id:String(p[1]),schedule_id:p[2],client_event_id:p[3],batch_id:p[4],pet_name_at_care:p[5],quantity_at_care:p[6],notes:p[7],local_date:p[8],performed_at:'2026-11-27 05:00:00.000'});return [{}];}
    if(sql.startsWith('UPDATE care_schedules SET is_enabled=0')){for(const s of state.schedules)if(sql.includes('WHERE user_cultivation_id')?s.user_cultivation_id===p[0]:s.id===p[0])s.is_enabled=0;return [{}];}
    if(sql.startsWith('UPDATE care_schedules SET care_time')){Object.assign(state.schedules.find(s=>s.id===p[2]),{care_time:p[0],is_enabled:Number(p[1])});return [{}];}
    if(sql.startsWith('INSERT INTO care_schedules')){state.schedules.push({id:String(state.schedules.length+1),user_cultivation_id:String(p[0]),species_care_action_id:String(p[1]),care_time:p[2],is_enabled:Number(p[3]),timezone:'Asia/Jakarta'});return [{}];}
    throw Error(`Unhandled Pet fixture write: ${sql}`);
  };
  const db={query,execute} as unknown as Pool;
  let tail=Promise.resolve();
  const transaction=<T>(action:()=>Promise<T>):Promise<T>=>{const run=tail.then(async()=>{const before=structuredClone(state);try{return await action();}catch(e){Object.assign(state,before);throw e;}});tail=run.then(()=>{},()=>{});return run;};
  return {state,db,species,actions,transaction};
}
