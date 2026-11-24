import { useEffect, useState } from 'react';
import { Leaf, LogOut, Plus, ArrowLeft } from 'lucide-react';
import { api, ApiError } from './api.ts';
import './admin.css';

type Row = Record<string, any>;
const navigation = [ ['/admin','Dashboard'], ['/admin/pets','Kelola Pet & Kategori'], ['/admin/care-actions','Tindakan Perawatan'], ['/admin/guides','Panduan Budidaya'], ['/admin/settings','Pengaturan'] ];
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
  const path = window.location.pathname.replace(/\/$/,'') || '/admin';
  useEffect(() => {
    document.title = 'Dewi Sri - Admin';
    api('/auth/me').then(value => {
      setUser(value);
      if (path === '/admin/login') window.location.replace('/admin');
    }).catch(err => { if (!(err instanceof ApiError && err.status===401)) setError(err.message); })
      .finally(() => setLoading(false));
  },[]);
  if (loading) return <main className="admin-shell"><p role="status">Memeriksa sesi…</p></main>;
  if (!user) return <Login initialError={error} />;
  const known = navigation.some(([url]) => url===path) || path==='/admin/categories';
  return <div className="admin-shell"><a className="admin-skip" href="#admin-main">Lewati navigasi</a>
    <header className="admin-header"><a href="/admin" className="admin-brand"><Leaf aria-hidden="true" /><span>Dewi Sri<small>Pengelola katalog</small></span></a><button type="button" onClick={async () => { try { await api('/auth/logout','POST'); window.location.replace('/admin/login'); } catch(err) { setError((err as Error).message); } }}><LogOut size={18} />Keluar</button></header>
    <div className="admin-layout"><nav aria-label="Administrasi">{navigation.map(([url,label]) => <a key={url} href={url} aria-current={(path===url || (url==='/admin/pets' && path==='/admin/categories')) ? 'page' : undefined}>{label}</a>)}</nav>
      <main id="admin-main"><p className="admin-eyebrow">Ruang kerja internal · {user.name}</p><ErrorNote text={error} />
        {!known ? <><h1>Halaman tidak ditemukan</h1><a href="/admin">Kembali ke dashboard</a></> : path==='/admin' ? <Dashboard /> : path==='/admin/settings' ? <Settings /> : <Manager key={path} resource={path==='/admin/pets' ? 'species' : path.split('/').pop()!} />}
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
  return <><h1>Dashboard katalog</h1><p>Perbarui isi yang akan ditemukan Sobat Tani di kebunnya.</p><ErrorNote text={error} />{!data && !error && <p role="status">Memuat ringkasan…</p>}{data && <>
    <dl className="admin-stats">{[['species','Total Pet'],['categories','Kategori aktif'],['published','Pet terbit'],['draft','Pet draf'],['guides','Panduan']].map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{data[key]}</dd></div>)}</dl>
    <div className="admin-shortcuts"><a href="/admin/pets">Tambah Pet <Plus size={16} /></a><a href="/admin/categories">Kelola Kategori</a><a href="/admin/guides">Kelola Panduan</a></div>
    <h2>Pet yang baru diperbarui</h2><div className="admin-list">{data.recent.length ? data.recent.map((item:Row) => <article key={item.id}><strong>{item.name}</strong><span>{statusOptions.find(([key])=>key===item.status)?.[1]} · {new Date(item.updated_at).toLocaleDateString('id-ID')}</span></article>) : <p>Belum ada Pet. Mulai dengan menambahkan jenis budidaya pertama.</p>}</div>
  </>}</>;
}

function Manager({ resource }: { resource: string }) {
  const [rows,setRows]=useState<Row[]>([]), [categories,setCategories]=useState<Row[]>([]), [species,setSpecies]=useState<Row[]>([]);
  const [edit,setEdit]=useState<Row | null>(null), [error,setError]=useState(''), [message,setMessage]=useState(''), [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [query,setQuery]=useState(''),[category,setCategory]=useState(''),[status,setStatus]=useState('');
  const reload = async () => { const [items,cats,pets] = await Promise.all([api(`/${resource}`),api('/categories'),api('/species')]);setRows(items);setCategories(cats);setSpecies(pets); };
  useEffect(() => { reload().catch(err => setError(err.message)).finally(()=>setLoading(false)); },[resource]);
  const title: Record<string,string>={ species:'Kelola Pet',categories:'Kelola Kategori','care-actions':'Tindakan Perawatan',guides:'Panduan Budidaya' };
  const open = async (row: Row) => { setError('');setMessage('');try { setEdit(resource==='species' ? await api(`/species/${row.id}`) : row); } catch(err) {setError((err as Error).message);} };
  const defaults = { name:'',slug:'',category_id:'',parent_id:null,habitat_key:null,is_active:true,status:'draft',sort_order:0,species_id:'',title:'',guide_type:'budidaya',body_text:'',code:'',icon_key:'plant' };
  return <><h1>{title[resource]}</h1>{['species','categories'].includes(resource) && <div className="admin-tabs"><a href="/admin/pets" aria-current={resource==='species' ? 'page' : undefined}>Pet</a><a href="/admin/categories" aria-current={resource==='categories' ? 'page' : undefined}>Kategori</a></div>}
    <ErrorNote text={error} />{message && <p className="admin-success" role="status">{message}</p>}
    {edit ? <section className="admin-editor"><button type="button" onClick={()=>setEdit(null)}><ArrowLeft size={18} />Kembali ke daftar</button><h2>{edit.id ? 'Edit' : 'Tambah'} {resource==='species' ? 'Pet' : title[resource]}</h2>
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
          return <label key={key} className={['body_text','description'].includes(key) ? 'wide' : ''}>{labels[key]}{key==='is_active' ? <input type="checkbox" checked={!!edit[key]} onChange={e=>setEdit({...edit,[key]:e.target.checked})} /> : options ? <select value={edit[key] ?? ''} required={required} onChange={e=>setEdit({...edit,[key]:e.target.value || null})}><option value="">{required ? 'Pilih…' : 'Tanpa induk / ikuti induk'}</option>{options.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select> : ['body_text','description'].includes(key) ? <textarea rows={key==='body_text'?10:4} required={required} maxLength={key==='body_text'?100000:resource==='species'?20000:255} value={edit[key] || ''} onChange={e=>setEdit({...edit,[key]:e.target.value})} /> : <input pattern={key==='slug' ? '[a-z0-9]+(?:-[a-z0-9]+)*' : key==='code' ? '[a-z0-9_]+' : undefined} type={key==='sort_order' ? 'number':'text'} min={0} max={key==='sort_order'?100000:undefined} required={required} maxLength={key==='short_note'?255:key==='slug'||key==='name'?120:200} value={edit[key] ?? ''} onChange={e=>setEdit({...edit,[key]:key==='sort_order'?Number(e.target.value):e.target.value})} />}</label>;
        })}</div><button className="primary" disabled={busy}>{busy?'Menyimpan…':'Simpan'}</button>
      </form>{resource==='categories' && <p className="admin-muted">Kategori induk menentukan habitat. Pilih habitat untuk kategori utama. Kategori yang dipakai tetap disimpan; nonaktifkan untuk menyembunyikannya.</p>}
      {resource==='species' && (edit.id ? <SpeciesExtras id={edit.id} detail={edit} onChanged={async()=>setEdit(await api(`/species/${edit.id}`))} /> : <p className="admin-muted">Simpan Pet sebagai draf dahulu untuk menambahkan ilustrasi dan tindakan.</p>)}
    </section> : <><div className="admin-toolbar"><label>Cari<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Nama atau judul" /></label><button className="primary" type="button" onClick={()=>{setEdit({...defaults});setError('');setMessage('');}}><Plus size={18} />Tambah</button></div>
      {resource==='species' && <div className="admin-fields"><label>Filter kategori<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Semua kategori</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Filter status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Semua status</option>{statusOptions.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>}
      {loading && <p role="status">Memuat data…</p>}<div className="admin-list">{rows.filter(row=>(row.name||row.title||'').toLocaleLowerCase().includes(query.toLocaleLowerCase())&&(!category||row.category_id===category)&&(!status||row.status===status)).map(row=><article key={row.id}><div><strong>{row.name||row.title}</strong><span>{row.slug||row.code||row.guide_type} · {row.status || (row.is_active?'Aktif':'Nonaktif')}</span></div><button type="button" onClick={()=>void open(row)}>Edit<span className="sr-only"> {row.name||row.title}</span></button></article>)}</div>{!loading && !rows.length && <p>Belum ada data. Gunakan Tambah untuk membuat entri pertama.</p>}
    </>}
  </>;
}

function SpeciesExtras({id,detail,onChanged}:{id:string;detail:Row;onChanged:()=>Promise<void>}) {
  const [actions,setActions]=useState<Row[]>([]),[assigned,setAssigned]=useState<Row[]>(detail.actions || []),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{api('/care-actions').then(setActions).catch(err=>setError(err.message));},[]);
  useEffect(()=>setAssigned([1,2,3].map(i => detail.actions?.find((a:Row) => a.slot_key===`action${i}`) || {})),[detail]);
  const update=(index:number,changes:Row)=>setAssigned(previous=>{const copy=[...previous];copy[index]={...copy[index],...changes};return copy;});
  return <><h2>Ilustrasi Pet</h2><div className="admin-media">{detail.media?.map((m:Row)=><figure key={m.id}><img width={104} height={104} src={m.storage_path} alt={m.alt_text||''}/><figcaption>{m.state_key}</figcaption></figure>)}</div>
    <form onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');const body=new FormData(event.currentTarget);body.set('species_id',id);try{await api('/media','POST',body);await onChanged();setMessage('Ilustrasi tersimpan.');}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}>
      <label>Keadaan visual<input name="state_key" defaultValue="normal" required pattern="[a-z][a-z0-9_-]{0,49}" maxLength={50}/><small>normal, wilted, sick, atau keadaan tambahan</small></label><label>Teks alternatif<input name="alt_text" maxLength={255}/></label><label>Gambar (maksimal 5 MB)<input name="image" type="file" accept="image/png,image/jpeg,image/webp" required /></label><button disabled={busy}>Unggah ilustrasi</button>
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
