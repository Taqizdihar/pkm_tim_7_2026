import {useState} from 'react';
import {Brand} from './ui/Brand.tsx';
import {memberApi} from '../api/memberApi.ts';
import type {MemberSession} from '../api/memberTypes.ts';
import '../styles/onboarding.css';
import '../styles/member-auth.css';

export function ChangePasswordScreen({required,onSuccess,onLogout}:{required:boolean;onSuccess:(member:MemberSession)=>void;onLogout:()=>void}) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(false);
  return <div className="ob-screen ob-auth member-auth"><header className="ob-auth-header"><Brand /></header><main className="ob-auth-main"><h1>Ubah Kata Sandi</h1>
    <p>{required?'Sebelum membuka kebun, ganti kata sandi awal dengan kata sandi milik Anda.':'Masukkan kata sandi saat ini dan kata sandi baru.'}</p>
    <p>Gunakan frasa yang mudah diingat, sedikitnya 15 karakter. Spasi diperbolehkan.</p>
    <form className="ob-auth-form" onSubmit={async e=>{e.preventDefault();const form=e.currentTarget,d=new FormData(form);setError('');if(d.get('password')!==d.get('confirm_password')){setError('Konfirmasi kata sandi tidak sama.');return;}setBusy(true);try{const m=await memberApi('/auth/change-password','POST',Object.fromEntries(d));form.reset();onSuccess(m);}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
      {[['current_password','Kata sandi saat ini'],['password','Kata sandi baru'],['confirm_password','Konfirmasi kata sandi baru']].map(([name,label])=><div className="field" key={name}><label htmlFor={name}>{label}</label><input id={name} name={name} type={show?'text':'password'} autoComplete={name==='current_password'?'current-password':'new-password'} required minLength={name==='current_password'?1:15} maxLength={200}/></div>)}
      <label className="member-checkbox"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Tampilkan kata sandi</label>
      {error&&<p role="alert" className="field-error">{error}</p>}<button className="app-button" disabled={busy}>{busy?'Menyimpan…':'Simpan kata sandi'}</button>
    </form><button className="text-button" type="button" onClick={onLogout} disabled={busy}>Keluar dari akun</button>{!required&&<a href="/?screen=pengaturan">Kembali ke profil</a>}
  </main></div>;
}
