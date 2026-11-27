import {useCallback,useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import type {ActiveScreen,ChatConversation,PetType,UserProfile} from '../../types/index.ts';
import type {Cultivation,InstanceSchedule,JournalPage,MemberBootstrap} from '../../api/memberTypes.ts';
import {memberApi,uploadDataImage} from '../../api/memberApi.ts';
import {useJakartaClock} from '../../hooks/useJakartaClock.ts';
import {getRankInfo} from '../../utils/petRules.ts';
import {normalizeConversations} from '../../utils/chatStorage.ts';
import {setAudioEnabled} from '../../utils/audioEffects.ts';
import {ChatAIScreen} from '../../components/ChatAIScreen.tsx';
import {RiwayatChatScreen} from '../../components/RiwayatChatScreen.tsx';
import {PengaturanScreen} from '../../components/PengaturanScreen.tsx';
import {RankPetaniScreen} from '../../components/RankPetaniScreen.tsx';
import {EditProfileScreen} from '../../components/EditProfileScreen.tsx';
import {BottomNavBar} from '../../components/BottomNavBar.tsx';
import {PetsHome} from './PetsHome.tsx';
import {PetLibrary,PetDetail} from './PetLibrary.tsx';
import {PetForm,PetPicker,PetArchive,type PetMutation} from './PetDialogs.tsx';
import {IndividualCare,BulkCare} from './PetCare.tsx';
import {PetSchedules} from './PetSchedules.tsx';
import {PetJournal} from './PetJournal.tsx';

const screens:ActiveScreen[]=['beranda','pet_saya','jadwal','jurnal','chat_ai','chat_history','pengaturan','rank_petani','edit_profile'];
const requestedScreen=():ActiveScreen=>{const s=new URLSearchParams(location.search).get('screen') as ActiveScreen;return screens.includes(s)?s:'beranda';};
type Panel={kind:'add'|'pick'|'bulk'}|{kind:'detail'|'edit'|'archive'|'care';id:string}|null;

export function MemberGarden({onLogout}:{onLogout:()=>void}){
  const [data,setData]=useState<MemberBootstrap|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[toast,setToast]=useState('');
  const [activeScreen,setActiveScreen]=useState<ActiveScreen>(requestedScreen),[panel,setPanel]=useState<Panel>(null),[schedulePet,setSchedulePet]=useState<string|undefined>(),[journalPet,setJournalPet]=useState<string|undefined>();
  const [conversations,setConversations]=useState<ChatConversation[]>([]),[activeConversationId,setActiveConversationId]=useState<string|null>(null),[photoHelpRequested,setPhotoHelpRequested]=useState(false),[chatHasMore,setChatHasMore]=useState(false),[chatContext,setChatContext]=useState<Cultivation|undefined>();
  const lock=useRef(false),alive=useRef(true),scheduleRequests=useRef(new Map<string,string>()),now=useJakartaClock();
  const load=useCallback(async()=>{const value:MemberBootstrap=await memberApi('/member/bootstrap');if(alive.current)setData(value);},[]);
  useEffect(()=>{alive.current=true;void load().catch(e=>setError(e.message));return()=>{alive.current=false;};},[load]);
  const navigate=useCallback((screen:ActiveScreen)=>{setPanel(null);if(screen==='beranda'){setSchedulePet(undefined);setJournalPet(undefined);}setActiveScreen(screen);history.pushState({},'',`/?screen=${screen}`);},[]);
  useEffect(()=>{const f=()=>{setPanel(null);setActiveScreen(requestedScreen());};window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f);},[]);
  useEffect(()=>{document.title=`Dewi Sri · ${activeScreen.replaceAll('_',' ')}`;window.scrollTo({top:0,behavior:'instant'});},[activeScreen]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3500);return()=>clearTimeout(t);},[toast]);
  useEffect(()=>{if(!data)return;document.documentElement.style.fontSize=data.profile.textSize==='large'?'18px':data.profile.textSize==='small'?'15px':'16px';setAudioEnabled(data.profile.soundEnabled);return()=>{document.documentElement.style.fontSize='16px';setAudioEnabled(false);};},[data?.profile.textSize,data?.profile.soundEnabled]);
  const mutation=async(action:()=>Promise<any>,message='Perubahan tersimpan.')=>{
    if(lock.current)throw new Error('Tunggu hingga penyimpanan selesai.');lock.current=true;setBusy(true);setError('');
    try{const value=await action();if(!alive.current)throw new Error('Sesi berubah.');if(value?.cultivations)setData(value);else await load();setToast(message);return value;}
    catch(e){if(alive.current)setError((e as Error).message);throw e;}finally{lock.current=false;if(alive.current)setBusy(false);}
  };
  const mutate:PetMutation=(path,method,body,message)=>mutation(()=>memberApi(`/member${path}`,method,body),message);
  const run=(action:()=>Promise<unknown>)=>{void action().catch(()=>{});};
  const refreshChats=useCallback(async()=>{const list=await memberApi('/member/chat/conversations');if(alive.current){setConversations(normalizeConversations(list.map((c:any)=>({...c,snippet:c.snippet||''}))));setChatHasMore(list.length===20);}},[]);
  useEffect(()=>{if(data)void refreshChats().catch(e=>setError(e.message));},[!!data,refreshChats]);
  const onConversationChange=useCallback((c:ChatConversation)=>{const normalized=normalizeConversations([c])[0]||c;setConversations(prev=>[normalized,...prev.filter(p=>p.id!==c.id)]);setActiveConversationId(c.id);},[]);
  const acknowledgePhotoPrompt=useCallback(()=>setPhotoHelpRequested(false),[]);
  const updateProfile=async(updated:Partial<UserProfile>)=>mutation(async()=>{
    if(updated.avatarUrl?.startsWith('data:'))await uploadDataImage(updated.avatarUrl,'/member/profile/avatar');
    if(updated.name)await memberApi('/member/profile','PATCH',{name:updated.name});
    const prefs=Object.fromEntries(Object.entries(updated).filter(([key])=>['region','careFocus','textSize','soundEnabled','reminderEnabled','language'].includes(key)));
    if(Object.keys(prefs).length)await memberApi('/member/preferences','PATCH',prefs);
  });
  if(!data)return <main className="member-load"><p role={error?'alert':'status'}>{error||'Memuat kebun Anda…'}</p>{error&&<button className="app-button" onClick={()=>{setError('');void load().catch(e=>setError(e.message));}}>Coba lagi</button>}</main>;
  const pets=data.cultivations,type=data.activePetType,pet=pets.find(p=>p.id===data.selectedCultivations[type]&&p.status==='active'),modalPet=panel&&'id'in panel?pets.find(p=>p.id===panel.id):undefined;
  const rank=getRankInfo(data.totalCareCount),farmerRank={level:rank.level,title:rank.title,subtitle:rank.subtitle,currentCare:rank.current,targetCare:rank.max,description:''},dailyClaimed=data.dailyRewardDate===now.date;
  const select=(target:Cultivation)=>mutate('/cultivations/selection','PUT',{type:target.species.type,cultivation_id:target.id});
  const category=(next:PetType)=>{if(!data.multiPetReady){setData({...data,activePetType:next});return;}const key=data.selectedCultivations[next]||pets.find(p=>p.status==='active'&&p.species.type===next)?.id||null;run(()=>mutate('/cultivations/selection','PUT',{type:next,cultivation_id:key}));};
  const complete=(entry:InstanceSchedule)=>{const key=`${entry.id}:${now.date}`;if(!scheduleRequests.current.has(key))scheduleRequests.current.set(key,crypto.randomUUID());return mutate(`/schedules/${entry.id}/complete`,'POST',{client_event_id:scheduleRequests.current.get(key)},'Perawatan jadwal tercatat.');};
  const newChat=()=>{setActiveConversationId(`draft-${crypto.randomUUID()}`);setChatContext(pet);navigate('chat_ai');};
  const photo=(target?:Cultivation)=>{setActiveConversationId(`draft-${crypto.randomUUID()}`);setChatContext(target||pet);setPhotoHelpRequested(true);navigate('chat_ai');};
  const reward=()=>run(()=>mutate('/rewards/daily','POST',{},'Kunjungan hari ini tercatat.'));
  const detail=(target:Cultivation)=>setPanel({kind:'detail',id:target.id});
  const context=chatContext||pet;
  return <div className={`garden-app garden-app--${activeScreen}`}><a className="skip-link" href="#page-content">Lewati ke isi halaman</a><div className={`garden-shell garden-shell--${activeScreen} garden-shell--app`} data-screen={activeScreen}>
    {busy&&<p className="member-busy" role="status">Menyimpan…</p>}{error&&<div className="status-note status-note--warning" role="alert">{error}<button type="button" onClick={()=>setError('')}>Tutup</button></div>}
    <div id="page-content" tabIndex={-1}>
      {activeScreen==='beranda'&&<PetsHome pet={pet} pets={pets} type={type} ready={data.multiPetReady} profile={data.profile} now={now} schedules={data.schedules} totalCareCount={data.totalCareCount} totalPoints={data.totalPoints} streakDays={data.streakDays} dailyClaimed={dailyClaimed} onSelectCategory={category} onPick={()=>setPanel({kind:'pick'})} onAdd={()=>setPanel({kind:'add'})} onDetail={()=>pet&&detail(pet)} onCare={()=>pet&&setPanel({kind:'care',id:pet.id})} onBulk={()=>setPanel({kind:'bulk'})} onPhoto={()=>photo()} onComplete={complete} onNavigate={navigate} onSound={()=>run(()=>updateProfile({soundEnabled:!data.profile.soundEnabled}))} onReward={reward}/>}
      {activeScreen==='pet_saya'&&<PetLibrary pets={pets} ready={data.multiPetReady} onBack={()=>navigate('beranda')} onAdd={()=>setPanel({kind:'add'})} onDetail={detail} onBulk={()=>setPanel({kind:'bulk'})}/>}
      {activeScreen==='jadwal'&&<PetSchedules key={schedulePet||'all'} initialPetId={schedulePet} pets={pets} schedules={data.schedules} today={now.date} ready={data.multiPetReady} onManage={()=>navigate('pet_saya')} onComplete={complete} mutate={mutate}/>}
      {activeScreen==='jurnal'&&<PetJournal key={journalPet||'all'} activities={data.careRecords} total={data.journalTotal} hasMore={data.journalHasMore} initialPetId={journalPet} onBack={()=>navigate('beranda')} onLoadMore={async()=>{const page:JournalPage=await memberApi(`/member/journal?offset=${data.careRecords.length}`);if(alive.current)setData(prev=>prev?{...prev,careRecords:[...prev.careRecords,...page.items.filter(a=>!prev.careRecords.some(p=>p.id===a.id))],journalTotal:page.total,journalHasMore:page.hasMore}:prev);}}/>}
      {activeScreen==='chat_ai'&&<ChatAIScreen key={activeConversationId||'new'} conversationId={activeConversationId} conversation={conversations.find(c=>c.id===activeConversationId)} onConversationChange={onConversationChange} onOpenHistory={()=>{void refreshChats().catch(e=>setError(e.message));navigate('chat_history');}} onNewChat={newChat} openPhotoOnMount={photoHelpRequested} onPhotoPromptOpened={acknowledgePhotoPrompt} cultivationSpecies={context?.species.slug} cultivationContext={context?`${context.nickname} · ${context.species.name}`:undefined}/>}
      {activeScreen==='chat_history'&&<RiwayatChatScreen conversations={conversations} activeConversationId={activeConversationId} onBackToChat={()=>navigate('chat_ai')} onSelectConversation={c=>{void memberApi(`/member/chat/conversations/${c.id}`).then(value=>{onConversationChange(value);navigate('chat_ai');}).catch(e=>setError(e.message));}} onDeleteConversation={id=>run(()=>mutation(async()=>{await memberApi(`/member/chat/conversations/${id}`,'DELETE');await refreshChats();if(activeConversationId===id)setActiveConversationId(null);},'Percakapan dihapus.'))} onNewChat={newChat} onLoadMore={chatHasMore?()=>{void memberApi(`/member/chat/conversations?offset=${conversations.length}`).then(list=>{if(alive.current){setConversations(prev=>[...prev,...normalizeConversations(list.map((c:any)=>({...c,snippet:c.snippet||''})))]);setChatHasMore(list.length===20);}}).catch(e=>setError(e.message));}:undefined}/>}
      {activeScreen==='pengaturan'&&<PengaturanScreen userProfile={data.profile} farmerRank={farmerRank} onOpenEditProfile={()=>navigate('edit_profile')} onOpenRankPetani={()=>navigate('rank_petani')} onUpdateProfile={updateProfile} onLogout={onLogout}/>}
      {activeScreen==='rank_petani'&&<RankPetaniScreen farmerRank={farmerRank} onBack={()=>navigate('pengaturan')} onClaimDailyReward={reward} dailyClaimed={dailyClaimed} totalPoints={data.totalPoints}/>}
      {activeScreen==='edit_profile'&&<EditProfileScreen userProfile={data.profile} onSaveProfile={updateProfile} onBack={()=>navigate('pengaturan')}/>}
    </div>
    {panel?.kind==='add'&&<PetForm pets={pets} type={type} mutate={mutate} onClose={()=>setPanel(null)}/>}
    {panel?.kind==='pick'&&<PetPicker pets={pets} type={type} onPick={select} onAdd={()=>setPanel({kind:'add'})} onManage={()=>navigate('pet_saya')} onClose={()=>setPanel(null)}/>}
    {panel?.kind==='bulk'&&<BulkCare pets={pets} initialSpecies={pet?.species.id} limit={data.bulkCareMaxPets||50} mutate={mutate} onClose={()=>setPanel(null)}/>}
    {modalPet&&panel?.kind==='edit'&&<PetForm pet={modalPet} pets={pets} mutate={mutate} onClose={()=>detail(modalPet)}/>}
    {modalPet&&panel?.kind==='archive'&&<PetArchive pet={modalPet} mutate={mutate} onClose={()=>setPanel(null)}/>}
    {modalPet&&panel?.kind==='care'&&<IndividualCare key={modalPet.id} pet={modalPet} mutate={mutate} onClose={()=>setPanel(null)} onReview={()=>setPanel({kind:'edit',id:modalPet.id})}/>}
    {modalPet&&panel?.kind==='detail'&&<PetDetail pet={modalPet} mutate={mutate} onClose={()=>setPanel(null)} onEdit={()=>setPanel({kind:'edit',id:modalPet.id})} onArchive={()=>setPanel({kind:'archive',id:modalPet.id})} onCare={()=>setPanel({kind:'care',id:modalPet.id})} onSchedule={()=>{setSchedulePet(modalPet.id);navigate('jadwal');}} onPhoto={()=>photo(modalPet)} onJournal={()=>{setJournalPet(modalPet.id);navigate('jurnal');}}/>}
    <BottomNavBar currentScreen={activeScreen} onNavigate={s=>{if(s==='jadwal')setSchedulePet(undefined);if(s==='beranda')setJournalPet(undefined);navigate(s);}}/>{toast&&<div className="app-toast" role="status"><Check size={20}/><span>{toast}</span></div>}
  </div></div>;
}
