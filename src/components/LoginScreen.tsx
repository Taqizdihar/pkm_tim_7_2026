import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Brand } from './ui/Brand.tsx';
import { memberApi } from '../api/memberApi.ts';
import type {MemberSession} from '../api/memberTypes.ts';
import '../styles/onboarding.css';
import '../styles/member-auth.css';

export function LoginScreen({onLoginSuccess}:{onLoginSuccess:(member:MemberSession)=>void}) {
  const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="ob-screen ob-auth member-auth"><header className="ob-auth-header"><Brand /></header><main className="ob-auth-main">
    <div className="ob-auth-art"><img src="/assets/generated/care-tools-v1.webp" alt="" width="240" height="150" /></div>
    <div className="ob-auth-heading"><h1>Selamat datang kembali</h1><p>Masuk untuk merawat dan mencatat kegiatan bersama KWT Dewi Sri.</p></div>
    <form className="ob-auth-form" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,data=new FormData(form);setBusy(true);setError('');try {const member=await memberApi('/auth/login','POST',{identifier:data.get('identifier'),password:data.get('password')});form.reset();onLoginSuccess(member);}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
      <div className="field"><label htmlFor="member-identifier">Nomor HP, username, atau email</label><input id="member-identifier" name="identifier" autoComplete="username" required maxLength={191} aria-describedby="phone-help" /><p id="phone-help" className="sc-field-help">Gunakan nomor HP dengan awalan 0, bukan +62. Contoh: 0812xxxxxxxx.</p></div>
      <div className="field"><label htmlFor="member-password">Kata sandi</label><div className="member-password"><input id="member-password" name="password" type={show?'text':'password'} autoComplete="current-password" required maxLength={200} /><button type="button" aria-label={show?'Sembunyikan kata sandi':'Tampilkan kata sandi'} aria-pressed={show} onClick={()=>setShow(!show)}>{show?<EyeOff size={20}/>:<Eye size={20}/>}</button></div></div>
      {error&&<p className="field-error" role="alert">{error}</p>}<button className="app-button app-button--wide" disabled={busy}>{busy?'Memeriksa akun…':'Masuk'}</button>
    </form><p className="member-assistance">Belum memiliki akun atau lupa kata sandi? Hubungi pengelola KWT Dewi Sri.</p>
  </main></div>;
}
