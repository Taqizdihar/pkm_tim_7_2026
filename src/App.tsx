import {useCallback,useEffect,useState} from 'react';
import {memberApi,MemberApiError,clearMemberMemory} from './api/memberApi.ts';
import {WelcomeScreen} from './components/WelcomeScreen.tsx';
import {LoginScreen} from './components/LoginScreen.tsx';
import {ChangePasswordScreen} from './components/ChangePasswordScreen.tsx';
import type {MemberSession} from './api/memberTypes.ts';
import {MemberGarden} from './features/pets/MemberGarden.tsx';
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
