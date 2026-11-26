import {useEffect,useState} from 'react';
import {Plus,Users,X} from 'lucide-react';
import {api} from './api.ts';
import {Dialog} from '../components/ui/Dialog.tsx';
import './members.css';

interface Member {id:string;name:string;phone_number:string|null;username:string|null;email:string|null;status:'active'|'disabled';must_change_password:number;last_login_at:string|null;created_at:string}
type Mode={kind:'create'|'edit'|'reset'|'status';member?:Member}|null;
const date=(value:string|null)=>value?new Date(value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'}):'Belum pernah masuk';
export function Members() {
  const [items,setItems]=useState<Member[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[search,setSearch]=useState(''),[status,setStatus]=useState('');
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[message,setMessage]=useState(''),[mode,setMode]=useState<Mode>(null),[revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');api(`/members?${new URLSearchParams({search,status,page:String(page)})}`).then(d=>{if(active){setItems(d.items);setTotal(d.total);}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[page,search,status,revision]);
  const open=(mode:Mode)=>{setMessage('');setMode(mode);};
  return <><div className="admin-page-heading"><div><p className="admin-kicker">Keanggotaan Dewi Sri</p><h1>Kelola Anggota KWT</h1><p>Buat akun dan bantu anggota mengelola aksesnya.</p></div><button className="primary" onClick={()=>open({kind:'create'})}><Plus size={18}/>Tambah Anggota KWT</button></div>
    <div className="admin-toolbar"><label>Cari anggota<input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Nama, nomor HP, username, email" maxLength={100}/></label><label>Status akun<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">Semua status</option><option value="active">Aktif</option><option value="disabled">Nonaktif</option></select></label></div>
    {error&&<p className="admin-error" role="alert">{error}</p>}{message&&<p className="admin-success" role="status">{message}</p>}
    {loading?<p className="admin-state" role="status">Memuat anggota…</p>:error?<button onClick={()=>setRevision(r=>r+1)}>Coba lagi</button>:<><p className="admin-muted">{total} anggota sesuai pencarian</p><div className="member-list">{items.map(m=><article key={m.id}>
      <div className="member-identity"><span className="admin-list-mark"><Users size={21} aria-hidden="true"/></span><div><h2>{m.name}</h2><span className={`admin-badge admin-badge--${m.status==='active'?'published':'archived'}`}>{m.status==='active'?'Aktif':'Nonaktif'}</span>{!!m.must_change_password&&<p>Wajib ganti kata sandi</p>}</div></div>
      <dl><div><dt>Nomor HP</dt><dd>{m.phone_number||'Belum diisi'}</dd></div><div><dt>Username</dt><dd>{m.username||'Belum diisi'}</dd></div><div><dt>Email</dt><dd>{m.email||'Belum diisi'}</dd></div><div><dt>Terakhir masuk</dt><dd>{date(m.last_login_at)}</dd></div><div><dt>Dibuat</dt><dd>{date(m.created_at)}</dd></div></dl>
      <div className="member-actions"><button onClick={()=>open({kind:'edit',member:m})}>Ubah anggota</button><button onClick={()=>open({kind:'reset',member:m})}>Atur Ulang Kata Sandi</button><button onClick={()=>open({kind:'status',member:m})}>{m.status==='active'?'Nonaktifkan':'Aktifkan'} anggota</button></div>
    </article>)}</div>{!items.length&&<p className="admin-empty">Belum ada anggota yang sesuai pencarian.</p>}<div className="member-pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>Sebelumnya</button><span>Halaman {page} dari {Math.max(1,Math.ceil(total/20))}</span><button disabled={page*20>=total} onClick={()=>setPage(p=>p+1)}>Berikutnya</button></div></>}
    {mode&&<MemberEditor key={`${mode.kind}-${mode.member?.id||'new'}`} mode={mode} onClose={()=>setMode(null)} onSaved={()=>{setMode(null);setRevision(r=>r+1);setMessage('Perubahan anggota tersimpan.');}}/>}
  </>;
}
function MemberEditor({mode,onClose,onSaved}:{mode:NonNullable<Mode>;onClose:()=>void;onSaved:()=>void}) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(false);
  const m=mode.member,creating=mode.kind==='create',reset=mode.kind==='reset',status=mode.kind==='status';
  const title=creating?'Tambah Anggota KWT':reset?'Atur Ulang Kata Sandi':status?`${m!.status==='active'?'Nonaktifkan':'Aktifkan'} anggota`:'Ubah anggota KWT';
  return <Dialog labelledBy="member-dialog-title" onClose={()=>{if(!busy)onClose();}} className="member-admin-dialog"><div className="member-dialog-heading"><h2 id="member-dialog-title">{title}</h2><button type="button" aria-label="Tutup formulir anggota" disabled={busy} onClick={onClose}><X size={20}/></button></div>
    {m&&<p><strong>{m.name}</strong><br/>{m.phone_number||m.username||m.email}</p>}
    {reset&&<p>Kata sandi lama tidak akan berlaku. Anggota harus masuk kembali menggunakan kata sandi baru yang Anda berikan.</p>}
    {status&&<p>{m!.status==='active'?'Anggota akan keluar dari semua sesi. Riwayat budidaya dan konsultasi tetap disimpan.':'Anggota dapat masuk kembali. Sesi lama tetap tidak berlaku.'}</p>}
    <form onSubmit={async e=>{
      e.preventDefault();const form=e.currentTarget,d=new FormData(form);setError('');
      if((creating||reset)&&d.get('password')!==d.get('confirm_password')){setError('Konfirmasi kata sandi tidak sama.');return;}
      setBusy(true);
      try {
        if(status)await api(`/members/${m!.id}/status`,'PATCH',{status:m!.status==='active'?'disabled':'active'});
        else if(reset)await api(`/members/${m!.id}/reset-password`,'POST',{password:d.get('password'),confirm_password:d.get('confirm_password'),must_change_password:d.has('must_change_password')});
        else {
          const body={...Object.fromEntries(d),...(creating?{must_change_password:d.has('must_change_password')}:{})};
          await api(`/members${creating?'':`/${m!.id}`}`,creating?'POST':'PATCH',body);
        }
        form.reset();onSaved();
      }catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }}>
      {!reset&&!status&&<><div className="admin-fields"><label>Nama lengkap<input name="name" autoComplete="name" required maxLength={100} defaultValue={m?.name}/></label>
        <div><label htmlFor="cms-member-phone">Nomor HP</label><input id="cms-member-phone" name="phone_number" type="tel" inputMode="tel" autoComplete="tel-national" aria-describedby="cms-phone-help" maxLength={30} defaultValue={m?.phone_number||''}/><p id="cms-phone-help" className="admin-muted">Gunakan nomor HP dengan awalan 0, bukan +62. Contoh: 0812xxxxxxxx.</p></div>
        <div><label htmlFor="cms-member-username">Username</label><input id="cms-member-username" name="username" pattern="[a-zA-Z][a-zA-Z0-9._\-]{2,49}" maxLength={50} autoCapitalize="none" aria-describedby="cms-username-help" defaultValue={m?.username||''}/><p id="cms-username-help" className="admin-muted">3–50 karakter, diawali huruf, tanpa spasi. Titik, garis bawah, dan tanda minus diperbolehkan.</p></div>
        <label>Email<input name="email" type="email" maxLength={191} autoComplete="email" defaultValue={m?.email||''}/></label>{!creating&&<label>Status akun<select name="status" defaultValue={m?.status||'active'}><option value="active">Aktif</option><option value="disabled">Nonaktif</option></select></label>}</div><p className="admin-muted">Nomor HP disarankan. Username dan email opsional bila nomor HP diisi. Sedikitnya satu identitas login wajib tersedia.</p></>}
      {(creating||reset)&&<fieldset><legend>{creating?'Kata sandi awal':'Kata sandi baru'}</legend><p>Gunakan frasa sedikitnya 6 karakter, maksimal 200 karakter. Sampaikan secara pribadi kepada anggota.</p>{[['password',creating?'Kata sandi awal':'Kata sandi baru'],['confirm_password','Konfirmasi kata sandi']].map(([name,label])=><label key={name}>{label}<input name={name} type={show?'text':'password'} autoComplete="new-password" required minLength={6} maxLength={200}/></label>)}<label className="member-check"><input type="checkbox" checked={show} onChange={e=>setShow(e.target.checked)}/>Tampilkan kata sandi</label><label className="member-check"><input type="checkbox" name="must_change_password" defaultChecked/>Wajib mengganti kata sandi saat login berikutnya</label></fieldset>}
      {error&&<p className="admin-error" role="alert">{error}</p>}<div className="member-actions"><button className="primary" disabled={busy}>{busy?'Menyimpan…':status?'Konfirmasi perubahan':reset?'Simpan kata sandi':'Simpan anggota'}</button><button type="button" disabled={busy} onClick={onClose}>Batal</button></div>
    </form>
  </Dialog>;
}
