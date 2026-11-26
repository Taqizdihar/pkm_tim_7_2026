import { useEffect, useRef, useState } from 'react';
import { Leaf, LogOut, Plus, ArrowLeft, LayoutDashboard, Sprout, ListChecks, BookOpen, Settings2, Menu, X, Layers3, CheckCircle2, FilePenLine, Users } from 'lucide-react';
import {Members} from './Members.tsx';
import { api, ApiError } from './api.ts';
import './admin.css';
import './admin-refined.css';

type Row = Record<string, any>;
const navigation = [
  { url: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { url: '/admin/pets', label: 'Kelola Pet & Kategori', icon: Sprout },
  { url: '/admin/care-actions', label: 'Tindakan Perawatan', icon: ListChecks },
  { url: '/admin/guides', label: 'Panduan Budidaya', icon: BookOpen },
  { url: '/admin/members', label: 'Kelola Anggota KWT', icon: Users },
  { url: '/admin/settings', label: 'Pengaturan', icon: Settings2 },
];
const statusOptions = [['draft','Draf'],['published','Terbit'],['archived','Arsip']];
const labels: Record<string,string> = { name:'Nama',slug:'Slug',category_id:'Kategori',scientific_name:'Nama ilmiah',short_note:'Catatan singkat',description:'Deskripsi',status:'Status',sort_order:'Urutan tampil',parent_id:'Kategori induk',habitat_key:'Habitat',is_active:'Aktif',code:'Kode',icon_key:'Ikon',species_id:'Pet',title:'Judul',guide_type:'Jenis panduan',body_text:'Isi panduan' };
const fieldSets: Record<string,string[]> = {
  species: ['name','slug','category_id','scientific_name','short_note','description','status','sort_order'],
  categories: ['name','slug','parent_id','habitat_key','sort_order','is_active'],
  'care-actions': ['name','code','description','icon_key','is_active'],
  guides: ['species_id','title','guide_type','body_text','status','sort_order'],
};
function ErrorNote({ text }: { text: string }) { return text ? <p className="admin-error" role="alert">{text}</p> : null; }

export default function AdminApp() {
  const [user,setUser] = useState<Row | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [menuOpen,setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const path = window.location.pathname.replace(/\/$/,'') || '/admin';
  useEffect(() => {
    document.title = 'Dewi Sri - Admin';
    api('/auth/me').then(value => {
      setUser(value);
      if (path === '/admin/login') window.location.replace('/admin');
    }).catch(err => { if (!(err instanceof ApiError && err.status===401)) setError(err.message); })
      .finally(() => setLoading(false));
  },[]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButtonRef.current?.focus(); }
      if (event.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('.admin-layout nav a, .admin-layout nav button'));
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.querySelector<HTMLElement>('.admin-layout nav a')?.focus();
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [menuOpen]);
  if (loading) return <main className="admin-shell admin-loading"><p role="status">Memeriksa sesi…</p></main>;
  if (!user) return <Login initialError={error} />;
  const known = navigation.some(({url}) => url===path) || path==='/admin/categories';
  const logout = async () => { try { await api('/auth/logout','POST'); window.location.replace('/admin/login'); } catch(err) { setError((err as Error).message); } };
  return <div className="admin-shell"><a className="admin-skip" href="#admin-main">Lewati navigasi</a>
    <header className="admin-header"><a href="/admin" className="admin-brand"><span className="admin-brand-mark"><Leaf aria-hidden="true" /></span><span>Dewi Sri<small>Ruang administrator</small></span></a><button ref={menuButtonRef} className="admin-menu-toggle" type="button" aria-label={menuOpen ? 'Tutup menu administrasi' : 'Buka menu administrasi'} aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}<span>Menu</span></button></header>
    {menuOpen && <button type="button" className="admin-nav-backdrop" aria-label="Tutup menu administrasi" onClick={() => { setMenuOpen(false); menuButtonRef.current?.focus(); }} />}
    <div className="admin-layout"><nav id="admin-navigation" className={menuOpen ? 'is-open' : ''} aria-label="Administrasi" role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen ? true : undefined}><a href="/admin" className="admin-brand admin-sidebar-brand"><span className="admin-brand-mark"><Leaf aria-hidden="true" /></span><span>Dewi Sri<small>Ruang administrator</small></span></a><p className="admin-nav-caption">Katalog budidaya</p><div className="admin-nav-links">{navigation.map(({url,label,icon:Icon}) => <a key={url} href={url} aria-current={(path===url || (url==='/admin/pets' && path==='/admin/categories')) ? 'page' : undefined}><Icon size={19} aria-hidden="true" /><span>{label}</span></a>)}</div><div className="admin-nav-account"><span className="admin-account-avatar" aria-hidden="true">{String(user.name || 'A').slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>Administrator</small></span></div><button type="button" className="admin-logout" onClick={logout}><LogOut size={18} />Keluar</button></nav>
      <main id="admin-main"><p className="admin-eyebrow">Ruang kerja internal · {user.name}</p><ErrorNote text={error} />
        {!known ? <><h1>Halaman tidak ditemukan</h1><a href="/admin">Kembali ke dashboard</a></> : path==='/admin' ? <Dashboard /> : path==='/admin/members' ? <Members /> : path==='/admin/settings' ? <Settings /> : <Manager key={path} resource={path==='/admin/pets' ? 'species' : path.split('/').pop()!} />}
      </main></div>
  </div>;
}

function Login({ initialError }: { initialError: string }) {
  const [error,setError]=useState(initialError), [busy,setBusy]=useState(false);
  return <main className="admin-shell admin-login"><section><Leaf size={32} /><p className="admin-eyebrow">Dewi Sri · Pengelola katalog</p><h1>Masuk administrator</h1><p>Kelola jenis budidaya, panduan, dan ilustrasi Dewi Sri.</p>
    <form onSubmit={async event => { event.preventDefault(); setBusy(true);setError(''); const data = new FormData(event.currentTarget); try { await api('/auth/login','POST',{ email:data.get('email'),password:data.get('password') }); window.location.replace('/admin'); } catch(err) { setError((err as Error).message); } finally { setBusy(false); } }}>
      <label>Email<input name="email" type="email" autoComplete="username" required maxLength={191} /></label>
      <label>Kata sandi<input name="password" type="password" autoComplete="current-password" required maxLength={200} /></label>
      <ErrorNote text={error} /><button className="primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
    </form><p className="admin-muted">Akun dibuat oleh pengembang melalui terminal.</p><a href="/">Kembali ke aplikasi</a>
  </section></main>;
}

function Dashboard() {
  const [data,setData]=useState<Row | null>(null), [error,setError]=useState('');
  useEffect(() => { api('/dashboard').then(setData).catch(err => setError(err.message)); },[]);
  const metrics = [
    { key: 'species', label: 'Total Pet', icon: Sprout },
    { key: 'categories', label: 'Kategori aktif', icon: Layers3 },
    { key: 'published', label: 'Pet terbit', icon: CheckCircle2 },
    { key: 'draft', label: 'Pet draf', icon: FilePenLine },
    { key: 'guides', label: 'Panduan', icon: BookOpen },
  ];
  return <><div className="admin-page-heading"><div><p className="admin-kicker">Ikhtisar katalog</p><h1>Dashboard katalog</h1><p>Kelola jenis budidaya dan panduan yang tampil di aplikasi.</p></div><a className="admin-primary-link" href="/admin/pets?create=1"><Plus size={18} />Tambah Pet</a></div><ErrorNote text={error} />{!data && !error && <p className="admin-state" role="status">Memuat ringkasan…</p>}{data && <>
    <dl className="admin-stats">{metrics.map(({key,label,icon:Icon},index) => <div key={key} className={index === 0 ? 'admin-stat-primary' : ''}><span className="admin-stat-icon"><Icon size={20} aria-hidden="true" /></span><dt>{label}</dt><dd>{data[key]}</dd></div>)}</dl>
    <div className="admin-dashboard-grid"><section className="admin-panel"><div className="admin-section-heading"><div><p className="admin-kicker">Aktivitas katalog</p><h2>Pet yang baru diperbarui</h2></div><a href="/admin/pets">Lihat semua</a></div><div className="admin-list admin-recent-list">{data.recent.length ? data.recent.map((item:Row) => <article key={item.id}><span className="admin-list-mark"><Sprout size={19} aria-hidden="true" /></span><div className="admin-list-copy"><strong>{item.name}</strong><span>Diperbarui {new Date(item.updated_at).toLocaleDateString('id-ID')}</span></div><span className={`admin-badge admin-badge--${item.status}`}>{statusOptions.find(([key])=>key===item.status)?.[1] || item.status}</span></article>) : <p className="admin-empty">Belum ada Pet. Tambahkan jenis budidaya pertama.</p>}</div></section>
    <section className="admin-panel admin-quick-panel"><p className="admin-kicker">Akses cepat</p><h2>Kelola isi aplikasi</h2><div className="admin-shortcuts"><a href="/admin/categories"><Layers3 size={19} />Kelola Kategori</a><a href="/admin/guides"><BookOpen size={19} />Kelola Panduan</a><a href="/admin/care-actions"><ListChecks size={19} />Tindakan Perawatan</a></div></section></div>
  </>}</>;
}

function Manager({ resource }: { resource: string }) {
  const defaults = { name:'',slug:'',category_id:'',parent_id:null,habitat_key:null,is_active:true,status:'draft',sort_order:0,species_id:'',title:'',guide_type:'budidaya',body_text:'',code:'',icon_key:'plant' };
  const [rows,setRows]=useState<Row[]>([]), [categories,setCategories]=useState<Row[]>([]), [species,setSpecies]=useState<Row[]>([]);
  const [edit,setEdit]=useState<Row | null>(() => new URLSearchParams(window.location.search).has('create') ? { ...defaults } : null), [error,setError]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [query,setQuery]=useState(''),[category,setCategory]=useState(''),[status,setStatus]=useState('');
  const reload = async () => { const [items,cats,pets] = await Promise.all([api(`/${resource}`),api('/categories'),api('/species')]);setRows(items);setCategories(cats);setSpecies(pets); };
  useEffect(() => { reload().catch(err => setError(err.message)).finally(()=>setLoading(false)); },[resource]);
  const title: Record<string,string>={ species:'Kelola Pet',categories:'Kelola Kategori','care-actions':'Tindakan Perawatan',guides:'Panduan Budidaya' };
  const open = async (row: Row) => { setError('');setMessage('');try { setEdit(resource==='species' ? await api(`/species/${row.id}`) : row); } catch(err) {setError((err as Error).message);} };
  const filteredRows = rows.filter(row=>(row.name||row.title||'').toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(!category||row.category_id===category)&&(!status||row.status===status));
  return <><div className="admin-page-heading"><div><p className="admin-kicker">Pengelolaan katalog</p><h1>{title[resource]}</h1><p>{resource === 'species' ? 'Atur jenis, ilustrasi, dan penerbitan Pet.' : resource === 'categories' ? 'Susun kelompok budidaya yang tampil di aplikasi.' : resource === 'care-actions' ? 'Atur tindakan yang dapat dipilih saat merawat.' : 'Tulis panduan untuk jenis budidaya.'}</p></div></div>{['species','categories'].includes(resource) && <div className="admin-tabs"><a href="/admin/pets" aria-current={resource==='species' ? 'page' : undefined}>Pet</a><a href="/admin/categories" aria-current={resource==='categories' ? 'page' : undefined}>Kategori</a></div>}
    <ErrorNote text={error} />{message && <p className="admin-success" role="status">{message}</p>}
    {edit ? <section className="admin-editor"><button className="admin-back" type="button" onClick={()=>setEdit(null)}><ArrowLeft size={18} />Kembali ke daftar</button><h2>{edit.id ? 'Edit' : 'Tambah'} {resource==='species' ? 'Pet' : title[resource]}</h2>
      <form onSubmit={async event => { event.preventDefault(); setBusy(true);setError('');try { const body=Object.fromEntries(fieldSets[resource].map(key=>[key,edit[key] ?? (['parent_id','habitat_key','scientific_name','short_note','description'].includes(key) ? null : '')]));
        const result=await api(`/${resource}${edit.id ? `/${edit.id}` : ''}`, edit.id ? 'PATCH':'POST',body); await reload();setMessage('Perubahan tersimpan.');
        if(resource==='species') setEdit(await api(`/species/${result.id}`)); else setEdit(null);
      }catch(err){setError((err as Error).message);}finally{setBusy(false);} }}>
        <div className="admin-fields">{fieldSets[resource].map(key=>{
          let options: string[][] | undefined;
          if(key==='status') options=statusOptions;
          if(key==='category_id' || key==='parent_id') options=categories.filter(c=>key!=='parent_id'||c.id!==edit.id).map(c=>[c.id,c.name]);
          if(key==='species_id') options=species.map(s=>[s.id,s.name]);
          if(key==='habitat_key') options=[['kebun','Kebun'],['kolam','Kolam'],['kandang','Kandang']];
          if(key==='icon_key') options=[['water','Air'],['plant','Tanaman'],['sun','Cahaya'],['feed','Pakan'],['clean','Bersih']];
          const required=['name','slug','category_id','species_id','title','body_text','code','guide_type','status','icon_key'].includes(key);
          return <div key={key} className={`admin-field ${['body_text','description'].includes(key) ? 'wide' : ''}`}>
            {(key === fieldSets[resource][0] || (resource === 'species' && key === 'status')) && <h3 className="admin-field-heading">{key === 'status' ? 'Penerbitan' : resource === 'species' ? 'Informasi dasar' : resource === 'categories' ? 'Informasi kategori' : resource === 'guides' ? 'Isi panduan' : 'Rincian tindakan'}</h3>}
            <label>{labels[key]}{key==='is_active' ? <input type="checkbox" checked={!!edit[key]} onChange={e=>setEdit({...edit,[key]:e.target.checked})} /> : options ? <select value={edit[key] ?? ''} required={required} onChange={e=>setEdit({...edit,[key]:e.target.value || null})}><option value="">{required ? 'Pilih…' : 'Tanpa induk / ikuti induk'}</option>{options.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select> : ['body_text','description'].includes(key) ? <textarea rows={key==='body_text'?10:4} required={required} maxLength={key==='body_text'?100000:resource==='species'?20000:255} value={edit[key] || ''} onChange={e=>setEdit({...edit,[key]:e.target.value})} /> : <input pattern={key==='slug' ? '[a-z0-9]+(?:-[a-z0-9]+)*' : key==='code' ? '[a-z0-9_]+' : undefined} type={key==='sort_order' ? 'number':'text'} min={0} max={key==='sort_order'?100000:undefined} required={required} maxLength={key==='short_note'?255:key==='slug'||key==='name'?120:200} value={edit[key] ?? ''} onChange={e=>setEdit({...edit,[key]:key==='sort_order'?Number(e.target.value):e.target.value})} />}</label></div>;
        })}</div><button className="primary" disabled={busy}>{busy?'Menyimpan…':'Simpan'}</button>
      </form>{resource==='categories' && <p className="admin-muted">Kategori induk menentukan habitat. Pilih habitat untuk kategori utama. Kategori yang dipakai tetap disimpan; nonaktifkan untuk menyembunyikannya.</p>}
      {resource==='species' && (edit.id ? <SpeciesExtras id={edit.id} detail={edit} onChanged={async()=>setEdit(await api(`/species/${edit.id}`))} /> : <p className="admin-muted">Simpan Pet sebagai draf dahulu untuk menambahkan ilustrasi dan tindakan.</p>)}
    </section> : <><div className="admin-toolbar"><label>Cari<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nama atau judul" /></label><button className="primary" type="button" onClick={()=>{setEdit({...defaults});setError('');setMessage('');}}><Plus size={18} />Tambah {resource === 'species' ? 'Pet' : resource === 'categories' ? 'kategori' : resource === 'guides' ? 'panduan' : 'tindakan'}</button></div>
      {resource==='species' && <div className="admin-fields"><label>Filter kategori<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Semua kategori</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Filter status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Semua status</option>{statusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>}
      {loading && <p className="admin-state" role="status">Memuat data…</p>}<div className="admin-list admin-manager-list">{filteredRows.map(row=><article key={row.id} className={resource === 'categories' && row.parent_id ? 'admin-child-category' : ''}><span className="admin-list-mark">{resource === 'guides' ? <BookOpen size={19} /> : resource === 'care-actions' ? <ListChecks size={19} /> : resource === 'categories' ? <Layers3 size={19} /> : <Sprout size={19} />}</span><div className="admin-list-copy"><strong>{row.name||row.title}</strong><span>{resource === 'species' ? `${categories.find(item => item.id === row.category_id)?.name || 'Kategori belum tersedia'} · ${row.slug}` : resource === 'guides' ? `${species.find(item => item.id === row.species_id)?.name || 'Pet belum tersedia'} · ${row.guide_type}` : resource === 'categories' ? `${row.parent_id ? `Anak dari ${categories.find(item => item.id === row.parent_id)?.name || 'kategori lain'}` : 'Kategori utama'} · ${row.slug}` : row.code || row.description || ''}</span></div><span className={`admin-badge admin-badge--${row.status || (row.is_active ? 'active' : 'inactive')}`}>{statusOptions.find(([key]) => key === row.status)?.[1] || (row.is_active ? 'Aktif' : 'Nonaktif')}</span><button type="button" onClick={()=>void open(row)}>Edit<span className="sr-only"> {row.name||row.title}</span></button></article>)}</div>{!loading && !filteredRows.length && <p className="admin-empty">{rows.length ? 'Tidak ada data yang cocok dengan pencarian atau filter.' : 'Belum ada data. Gunakan tombol Tambah untuk membuat entri pertama.'}</p>}
    </>}
  </>;
}

function SpeciesExtras({id,detail,onChanged}:{id:string;detail:Row;onChanged:()=>Promise<void>}) {
  const [actions,setActions]=useState<Row[]>([]),[assigned,setAssigned]=useState<Row[]>(detail.actions || []),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [preview,setPreview]=useState('');
  useEffect(()=>{api('/care-actions').then(setActions).catch(err=>setError(err.message));},[]);
  useEffect(()=>setAssigned([1,2,3].map(i => detail.actions?.find((a:Row) => a.slot_key===`action${i}`) || {})),[detail]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const update=(index:number,changes:Row)=>setAssigned(previous=>{const copy=[...previous];copy[index]={...copy[index],...changes};return copy;});
  return <><h2>Ilustrasi Pet</h2><div className="admin-media">{detail.media?.map((m:Row)=><figure key={m.id}><img width={104} height={104} src={m.storage_path} alt={m.alt_text||''}/><figcaption>{m.state_key}{m.alt_text && <small>{m.alt_text}</small>}</figcaption></figure>)}</div>
    <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');const form=event.currentTarget;const body=new FormData(form);body.set('species_id',id);try{await api('/media','POST',body);await onChanged();setMessage('Ilustrasi tersimpan.');setPreview('');form.reset();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
      <label>Keadaan visual<input name="state_key" defaultValue="normal" required pattern="[a-z][a-z0-9_-]{0,49}" maxLength={50}/><small>normal, wilted, sick, atau keadaan tambahan</small></label><label>Teks alternatif<input name="alt_text" maxLength={255}/></label><label>Gambar (maksimal 5 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required onChange={event => { const file=event.target.files?.[0]; setPreview(file ? URL.createObjectURL(file) : ''); }} /></label>{preview && <figure className="admin-upload-preview"><img src={preview} alt="Pratinjau ilustrasi yang dipilih" /><figcaption>Pratinjau sebelum diunggah</figcaption></figure>}<button disabled={busy}>{busy ? 'Mengunggah…' : 'Unggah ilustrasi'}</button>
    </form>
    <h2>Tindakan perawatan</h2><p>Atur paling banyak tiga tindakan. Efek menambah indikator lokal dari 0 sampai 100.</p>
    <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await api(`/species/${id}/care-actions`,'PUT',assigned.map((a,index)=>({care_action_id:a.care_action_id,slot_key:`action${index+1}`,description:a.description||null,effect_config_json:a.effect_config_json||{},sort_order:index+1})).filter(a=>a.care_action_id));await onChanged();setMessage('Tindakan tersimpan.');}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
      {[0,1,2].map(index=><fieldset key={index}><legend>Tindakan {index+1}</legend><label>Tindakan<select value={assigned[index]?.care_action_id||''} onChange={e=>update(index,{care_action_id:e.target.value})}><option value="">Tidak digunakan</option>{actions.filter(a=>a.is_active).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Petunjuk khusus<input value={assigned[index]?.description||''} maxLength={255} onChange={e=>update(index,{description:e.target.value})}/></label><div className="admin-effects">{['stat1','stat2','stat3'].map((stat,i)=><label key={stat}>{['Nutrisi / pakan','Air / kandang','Senang'][i]}<input type="number" min={0} max={100} value={assigned[index]?.effect_config_json?.[stat]||0} onChange={e=>update(index,{effect_config_json:{...assigned[index]?.effect_config_json,[stat]:Number(e.target.value)}})}/></label>)}</div></fieldset>)}
      <button disabled={busy}>Simpan tindakan</button>
    </form><ErrorNote text={error}/>{message&&<p className="admin-success" role="status">{message}</p>}
  </>;
}

function Settings() {
  const [data,setData]=useState<Row>({app_name:'Dewi Sri',welcome_message:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{api('/settings').then(value=>setData(previous=>({...previous,...value}))).catch(err=>setError(err.message));},[]);
  return <><h1>Pengaturan aplikasi</h1><p>Pengaturan tampilan publik. Integrasi RAG, cuaca langsung, dan analisis foto AI belum tersedia.</p><form onSubmit={async event=>{event.preventDefault();setBusy(true);try{await api('/settings','PATCH',data);setMessage('Pengaturan tersimpan.');setError('');}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
    <label>Nama aplikasi<input value={data.app_name} required maxLength={100} onChange={e=>setData({...data,app_name:e.target.value})}/></label><label>Pesan sambutan<textarea value={data.welcome_message} maxLength={500} onChange={e=>setData({...data,welcome_message:e.target.value})}/></label><button className="primary" disabled={busy}>Simpan pengaturan</button><ErrorNote text={error}/>{message&&<p className="admin-success" role="status">{message}</p>}
  </form></>;
}
