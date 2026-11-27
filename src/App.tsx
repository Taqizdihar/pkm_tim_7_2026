import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { ActiveScreen, ChatConversation, PetType, PetVariety, UserProfile } from './types/index.ts';
import { useJakartaClock } from './hooks/useJakartaClock.ts';
import { getSpeciesPet, normalizePets, normalizeSpeciesPets } from './utils/gardenState.ts';
import type { CareSchedules, ScheduledCare } from './utils/careSchedule.ts';
import { getRankInfo } from './utils/petRules.ts';
import { SPECIES } from './data/species.ts';
import type { CareSlot } from './data/care.ts';
import { setAudioEnabled } from './utils/audioEffects.ts';
import { memberApi, MemberApiError, clearMemberMemory, uploadDataImage } from './api/memberApi.ts';
import { WelcomeScreen } from './components/WelcomeScreen.tsx';
import { LoginScreen } from './components/LoginScreen.tsx';
import { ChangePasswordScreen } from './components/ChangePasswordScreen.tsx';
import { BerandaScreen } from './components/BerandaScreen.tsx';
import { ScheduleScreen } from './components/ScheduleScreen.tsx';
import { CareJournalScreen } from './components/CareJournalScreen.tsx';
import { ChatAIScreen } from './components/ChatAIScreen.tsx';
import { RiwayatChatScreen } from './components/RiwayatChatScreen.tsx';
import { PengaturanScreen } from './components/PengaturanScreen.tsx';
import { RankPetaniScreen } from './components/RankPetaniScreen.tsx';
import { EditProfileScreen } from './components/EditProfileScreen.tsx';
import { BottomNavBar } from './components/BottomNavBar.tsx';
import { normalizeConversations } from './utils/chatStorage.ts';
import type {MemberBootstrap,MemberSession} from './api/memberTypes.ts';

const SCREENS:ActiveScreen[]=['beranda','jadwal','jurnal','chat_ai','chat_history','pengaturan','rank_petani','edit_profile'];
function requestedScreen():ActiveScreen {const s=new URLSearchParams(location.search).get('screen') as ActiveScreen;return SCREENS.includes(s)?s:'beranda';}
const route=(url:string)=>{history.replaceState({},'',url);window.dispatchEvent(new PopStateEvent('popstate'));};

export default function App() {
  const [member,setMember]=useState<MemberSession|null>(null),[checking,setChecking]=useState(true),[error,setError]=useState(''),[path,setPath]=useState(location.pathname);
  const inspect=useCallback(async()=>{
    try{setMember(await memberApi('/auth/me'));setError('');}catch(e){if(e instanceof MemberApiError&&e.status===401){clearMemberMemory();setMember(null);}else{setMember(null);setError((e as Error).message);}}finally{setChecking(false);}
  },[]);
  useEffect(()=>{void inspect();const update=()=>setPath(location.pathname);const changed=(e:Event)=>{if((e as CustomEvent).detail==='PASSWORD_CHANGE_REQUIRED')void inspect();else{clearMemberMemory();setMember(null);route('/login');}};
    window.addEventListener('popstate',update);window.addEventListener('member-auth-change',changed);window.addEventListener('focus',inspect);
    return()=>{window.removeEventListener('popstate',update);window.removeEventListener('member-auth-change',changed);window.removeEventListener('focus',inspect);};},[inspect]);
  useEffect(()=>{if(checking||error)return;if(!member){if(location.pathname!=='/'||location.search)route('/login');}else if(member.must_change_password)route('/change-password');else if(['/login','/register','/forgot-password'].includes(location.pathname))route('/?screen=beranda');},[member,checking,error,path]);
  const logout=async()=>{try{await memberApi('/auth/logout','POST',{});clearMemberMemory();setMember(null);route('/login');}catch(e){setError((e as Error).message);}};
  if(checking)return <main className="member-load" role="status">Memeriksa sesi anggota…</main>;
  if(error)return <main className="member-load"><h1>Akses belum tersedia</h1><p role="alert">{error}</p><button className="app-button" onClick={()=>{setChecking(true);void inspect();}}>Coba lagi</button></main>;
  if(!member)return path==='/'&&!location.search?<WelcomeScreen onStart={()=>route('/login')}/>:<LoginScreen onLoginSuccess={m=>{setMember(m);route(m.must_change_password?'/change-password':'/?screen=beranda');}}/>;
  if(member.must_change_password||path==='/change-password')return <ChangePasswordScreen required={!!member.must_change_password} onSuccess={m=>{setMember(m);route('/?screen=beranda');}} onLogout={()=>void logout()}/>;
  return <MemberGarden key={member.id} onLogout={()=>void logout()}/>;
}

function MemberGarden({onLogout}:{onLogout:()=>void}) {
  const [data,setData]=useState<MemberBootstrap|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[toast,setToast]=useState('');
  const [activeScreen,setActiveScreen]=useState<ActiveScreen>(requestedScreen),[conversations,setConversations]=useState<ChatConversation[]>([]),[activeConversationId,setActiveConversationId]=useState<string|null>(null),[photoHelpRequested,setPhotoHelpRequested]=useState(false);
  const [chatHasMore,setChatHasMore]=useState(false);
  const lock=useRef(false),alive=useRef(true),now=useJakartaClock();
  const load=useCallback(async()=>{const value=await memberApi('/member/bootstrap');if(alive.current)setData(value);},[]);
  useEffect(()=>{alive.current=true;void load().catch(e=>setError(e.message));return()=>{alive.current=false;};},[load]);
  const navigate=useCallback((s:ActiveScreen)=>{setActiveScreen(s);history.pushState({},'',`/?screen=${s}`);},[]);
  useEffect(()=>{const f=()=>setActiveScreen(requestedScreen());window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f);},[]);
  useEffect(()=>{document.title=`Dewi Sri · ${activeScreen.replaceAll('_',' ')}`;window.scrollTo({top:0,behavior:'instant'});},[activeScreen]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{if(!data)return;document.documentElement.style.fontSize=data.profile.textSize==='large'?'18px':data.profile.textSize==='small'?'15px':'16px';setAudioEnabled(data.profile.soundEnabled);return()=>{document.documentElement.style.fontSize='16px';setAudioEnabled(false);};},[data?.profile.textSize,data?.profile.soundEnabled]);
  const mutation=async(action:()=>Promise<any>,message='Perubahan tersimpan.')=>{
    if(lock.current)throw new Error('Tunggu hingga penyimpanan selesai.');lock.current=true;setBusy(true);setError('');
    try{const value=await action();if(!alive.current)return;if(value?.cultivations)setData(value);else await load();setToast(message);return value;}
    catch(e){if(alive.current)setError((e as Error).message);throw e;}finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  const run=(action:()=>Promise<any>,message?:string)=>{void mutation(action,message).catch(()=>{});};
  const refreshChats=useCallback(async()=>{const list=await memberApi('/member/chat/conversations');if(alive.current){setConversations(normalizeConversations(list.map((c:any)=>({...c,snippet:c.snippet||''}))));setChatHasMore(list.length===20);}},[]);
  useEffect(()=>{if(data)void refreshChats().catch(e=>setError(e.message));},[!!data,refreshChats]);
  const onConversationChange=useCallback((c:ChatConversation)=>{const normalized=normalizeConversations([c])[0]||c;setConversations(prev=>[normalized,...prev.filter(p=>p.id!==c.id)]);setActiveConversationId(c.id);},[]);
  const acknowledgePhotoPrompt=useCallback(()=>setPhotoHelpRequested(false),[]);
  if(!data)return <main className="member-load"><p role={error?'alert':'status'}>{error||'Memuat kebun Anda…'}</p>{error&&<button className="app-button" onClick={()=>{setError('');void load().catch(e=>setError(e.message));}}>Coba lagi</button>}</main>;
  const userProfile:UserProfile=data.profile;
  for(const c of data.cultivations)if(c.type&&!SPECIES[c.type as PetType].some(s=>s.id===c.slug))SPECIES[c.type as PetType].push({id:c.slug,label:c.name,image:SPECIES[c.type as PetType][0].image,note:'Jenis diarsipkan',group:c.type==='tunas'?'sayuran':c.type==='koki'?'ikan':'unggas',available:false});
  const saved=Object.fromEntries(data.cultivations.map(c=>[c.slug,{...c.metrics,type:c.type,variety:c.slug,visualState:c.visual_state}]));
  const selected=Object.fromEntries((['tunas','koki','kuning'] as PetType[]).map(type=>[type,{variety:data.selected[type]}]));
  const pets=normalizePets(selected),speciesPets=normalizeSpeciesPets(saved,pets),activePetType=data.activePetType as PetType;
  const currentPet=getSpeciesPet(speciesPets,activePetType,pets[activePetType].variety);
  const allPets=Object.fromEntries((Object.keys(pets) as PetType[]).map(type=>[type,getSpeciesPet(speciesPets,type,pets[type].variety)])) as typeof pets;
  const schedules:CareSchedules=data.schedules,rank=getRankInfo(data.totalCareCount),dailyClaimed=data.dailyRewardDate===now.date;
  const farmerRank={level:rank.level,title:rank.title,subtitle:rank.subtitle,currentCare:rank.current,targetCare:rank.max,description:''};
  const ensure=async(variety:string)=>{const result=await memberApi('/member/cultivations','POST',{slug:variety});return result.cultivations.find((c:any)=>c.slug===variety).id as string;};
  const recordCare=(_type:PetType,variety:PetVariety,slot:CareSlot)=>run(async()=>{const key=data.cultivations.find(c=>c.slug===variety)?.id||await ensure(variety);return memberApi(`/member/cultivations/${key}/care-actions`,'POST',{slot,client_event_id:crypto.randomUUID()});},'Perawatan tercatat.');
  const complete=(entry:ScheduledCare)=>{const schedule=schedules[entry.key] as any;if(schedule?.id)run(()=>memberApi(`/member/schedules/${schedule.id}/complete`,'POST',{client_event_id:crypto.randomUUID()}),'Perawatan jadwal tercatat.');};
  const updateProfile=async(updated:Partial<UserProfile>)=>mutation(async()=>{
    if(updated.avatarUrl?.startsWith('data:'))await uploadDataImage(updated.avatarUrl,'/member/profile/avatar');
    if(updated.name)await memberApi('/member/profile','PATCH',{name:updated.name});
    const prefs=Object.fromEntries(Object.entries(updated).filter(([k])=>['region','careFocus','textSize','soundEnabled','reminderEnabled','language'].includes(k)));
    if(Object.keys(prefs).length)await memberApi('/member/preferences','PATCH',prefs);
  });
  const newChat=()=>{setActiveConversationId(`draft-${crypto.randomUUID()}`);navigate('chat_ai');};
  const reward=()=>run(()=>memberApi('/member/rewards/daily','POST',{}),'Kunjungan hari ini tercatat.');
  return <div className={`garden-app garden-app--${activeScreen}`}><a className="skip-link" href="#page-content">Lewati ke isi halaman</a><div className={`garden-shell garden-shell--${activeScreen} garden-shell--app`} data-screen={activeScreen}>
    {busy&&<p className="member-busy" role="status">Menyimpan…</p>}{error&&<div className="status-note status-note--warning" role="alert">{error}<button type="button" onClick={()=>setError('')}>Tutup</button></div>}
    <div id="page-content" tabIndex={-1}>
      {activeScreen==='beranda'&&<BerandaScreen currentPet={currentPet} allPets={allPets} userProfile={userProfile} now={now} schedules={schedules} totalCareCount={data.totalCareCount} totalPoints={data.totalPoints} streakDays={data.streakDays} dailyClaimed={dailyClaimed} onClaimDailyReward={reward} onSelectVariety={(_type,variety)=>run(()=>memberApi('/member/cultivations','POST',{slug:variety}))} onCareAction={slot=>recordCare(currentPet.type,currentPet.variety!,slot)} onCompleteScheduled={complete} onToggleSound={()=>{void updateProfile({soundEnabled:!userProfile.soundEnabled}).catch(()=>{});}} onPhoto={()=>{newChat();setPhotoHelpRequested(true);}} onNavigate={navigate}/>}
      {activeScreen==='jadwal'&&<ScheduleScreen currentPet={currentPet} schedules={schedules} now={now} onSave={(variety,slot,time)=>run(()=>memberApi('/member/schedules','POST',{slug:variety,slot,time}))} onRemove={(variety,slot)=>{const s=schedules[`${variety}-${slot}`] as any;if(s?.id)run(()=>memberApi(`/member/schedules/${s.id}`,'PATCH',{enabled:false}));}} onComplete={complete}/>}
      {activeScreen==='jurnal'&&<CareJournalScreen records={data.careRecords} onBack={()=>navigate('beranda')} onOpenSchedule={()=>navigate('jadwal')}/>}
      {activeScreen==='chat_ai'&&<ChatAIScreen key={activeConversationId||'new'} conversationId={activeConversationId} conversation={conversations.find(c=>c.id===activeConversationId)} onConversationChange={onConversationChange} onOpenHistory={()=>{void refreshChats().catch(e=>setError(e.message));navigate('chat_history');}} onNewChat={newChat} openPhotoOnMount={photoHelpRequested} onPhotoPromptOpened={acknowledgePhotoPrompt} cultivationSpecies={currentPet.variety}/>}
      {activeScreen==='chat_history'&&<RiwayatChatScreen conversations={conversations} activeConversationId={activeConversationId} onBackToChat={()=>navigate('chat_ai')} onSelectConversation={c=>{void memberApi(`/member/chat/conversations/${c.id}`).then(value=>{onConversationChange(value);navigate('chat_ai');}).catch(e=>setError(e.message));}} onDeleteConversation={id=>run(async()=>{await memberApi(`/member/chat/conversations/${id}`,'DELETE');await refreshChats();if(activeConversationId===id)setActiveConversationId(null);},'Percakapan dihapus.')} onNewChat={newChat} onLoadMore={chatHasMore?()=>{void memberApi(`/member/chat/conversations?offset=${conversations.length}`).then(list=>{if(alive.current){setConversations(prev=>[...prev,...normalizeConversations(list.map((c:any)=>({...c,snippet:c.snippet||''})))]);setChatHasMore(list.length===20);}}).catch(e=>setError(e.message));}:undefined}/>}
      {activeScreen==='pengaturan'&&<PengaturanScreen userProfile={userProfile} farmerRank={farmerRank} onOpenEditProfile={()=>navigate('edit_profile')} onOpenRankPetani={()=>navigate('rank_petani')} onUpdateProfile={updateProfile} onLogout={onLogout}/>}
      {activeScreen==='rank_petani'&&<RankPetaniScreen farmerRank={farmerRank} onBack={()=>navigate('pengaturan')} onClaimDailyReward={reward} dailyClaimed={dailyClaimed} totalPoints={data.totalPoints}/>}
      {activeScreen==='edit_profile'&&<EditProfileScreen userProfile={userProfile} onSaveProfile={updateProfile} onBack={()=>navigate('pengaturan')}/>}
    </div><BottomNavBar currentScreen={activeScreen} onNavigate={navigate}/>{toast&&<div className="app-toast" role="status"><Check size={20}/><span>{toast}</span></div>}
  </div></div>;
}
