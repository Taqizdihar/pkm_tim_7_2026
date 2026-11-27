import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {Dialog} from '../../components/ui/Dialog.tsx';
import {memberApi} from '../../api/memberApi.ts';
import type {Cultivation,MemberBootstrap} from '../../api/memberTypes.ts';
import type {PetType} from '../../types/index.ts';
import {PET_CATEGORIES,PetVisual,petDescription,quantityLabel} from './PetVisual.tsx';

export type PetMutation=(path:string,method:'POST'|'PATCH'|'PUT',body:unknown,message?:string)=>Promise<MemberBootstrap>;
export function useRequestId(){
  const request=useRef({signature:'',id:''});
  return Object.assign((body:unknown)=>{const signature=JSON.stringify(body);if(signature!==request.current.signature)request.current={signature,id:crypto.randomUUID()};return request.current.id;},{reset:()=>{request.current={signature:'',id:''};}});
}
export function PetDialogFrame({title,children,onClose,busy=false}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean}){
  const id=useId();return <Dialog className="pet-dialog" labelledBy={id} dismissible={!busy} onClose={onClose}><div className="dialog-top"><h2 id={id}>{title}</h2><button type="button" className="icon-button" disabled={busy} onClick={onClose} aria-label={`Tutup ${title.toLowerCase()}`}><X size={21}/></button></div>{children}</Dialog>;
}
interface Choice {slug:string;name:string;type:PetType}
function catalogChoices(value:{categories:{id:string;parentId:string|null;habitatKey:string|null}[];species:{slug:string;name:string;categoryId:string;available?:boolean}[]}):Choice[]{
  return value.species.flatMap(s=>{let cat=value.categories.find(c=>c.id===s.categoryId);const seen=new Set<string>();let habitat:string|null=null;
    while(cat&&!seen.has(cat.id)){seen.add(cat.id);habitat ||= cat.habitatKey;cat=value.categories.find(c=>c.id===cat?.parentId);}
    const type=({kebun:'tunas',kolam:'koki',kandang:'kuning'} as Record<string,PetType>)[habitat||''];return type&&s.available!==false?[{slug:s.slug,name:s.name,type}]:[];});
}
export function PetForm({pet,pets,type='tunas',mutate,onClose}:{pet?:Cultivation;pets:Cultivation[];type?:PetType;mutate:PetMutation;onClose:()=>void}){
  const confirming=!!pet&&!pet.ownershipConfirmed;
  const [category,setCategory]=useState(type),[choices,setChoices]=useState<Choice[]>([]),[species,setSpecies]=useState(''),[loaded,setLoaded]=useState(!!pet);
  const [nickname,setNickname]=useState(pet?.nickname||''),[nameEdited,setNameEdited]=useState(!!pet),[mode,setMode]=useState<'individual'|'group'>(pet?.petMode||'individual');
  const [catalogAttempt,setCatalogAttempt]=useState(0);
  const [quantity,setQuantity]=useState(String(pet?.quantity||1)),[location,setLocation]=useState(pet?.locationLabel||''),[confirmed,setConfirmed]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const requestId=useRequestId();
  useEffect(()=>{if(pet)return;let active=true;memberApi('/catalog').then(v=>{if(active){setChoices(catalogChoices(v));setLoaded(true);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[pet,catalogAttempt]);
  const options=choices.filter(c=>c.type===category),selected=options.find(c=>c.slug===species)||options[0];
  const suggested=selected?`${selected.name} ${pets.filter(p=>p.species.slug===selected.slug).length+1}`:'';
  const displayedName=nameEdited?nickname:suggested;
  return <PetDialogFrame title={pet?(confirming?'Tinjau Pet':'Ubah Pet'):'Tambah Pet'} onClose={onClose} busy={busy}>
    <p>{pet?'Identitas dan riwayat Pet ini tetap tersimpan.':'Tambahkan tanaman atau hewan yang benar-benar Anda miliki atau rawat.'}</p>
    <form className="pet-form" onSubmit={async e=>{e.preventDefault();if(busy)return;setError('');setBusy(true);
      const body={nickname:displayedName.trim(),pet_mode:mode,quantity:mode==='individual'?1:Number(quantity),location_label:location.trim()};
      try{if(pet)await mutate(`/cultivations/${pet.id}${confirming?'/confirm':''}`,confirming?'POST':'PATCH',{...body,...(confirming?{ownership_confirmed:confirmed}:{})},confirming?'Pet dikonfirmasi.':'Pet diperbarui.');
        else{if(!selected)throw new Error('Pilih jenis budidaya yang tersedia.');const payload={...body,species_slug:selected.slug,ownership_confirmed:confirmed};await mutate('/cultivations','POST',{...payload,client_request_id:requestId(payload)},'Pet ditambahkan.');}onClose();
      }catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
      {pet?<div className="pet-form-species"><PetVisual pet={pet} compact/><span><strong>{pet.species.name}</strong><small>Jenis budidaya tetap</small></span></div>:<><label>Kategori<select value={category} disabled={busy} onChange={e=>{setCategory(e.target.value as PetType);setSpecies('');}}>{Object.entries(PET_CATEGORIES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Jenis budidaya<select value={selected?.slug||''} required disabled={!loaded||busy||!options.length} onChange={e=>setSpecies(e.target.value)}>{!options.length&&<option value="">{loaded?'Belum ada jenis tersedia':'Memuat katalog…'}</option>}{options.map(c=><option value={c.slug} key={c.slug}>{c.name}</option>)}</select></label></>}
      <label>Nama Pet<input required maxLength={120} value={displayedName} disabled={busy} placeholder="Contoh: Sawi depan rumah" onChange={e=>{setNameEdited(true);setNickname(e.target.value);}}/></label>
      <fieldset disabled={busy}><legend>Pet ini mewakili</legend><div className="pet-mode-options"><label><input type="radio" name="pet-mode" value="individual" checked={mode==='individual'} onChange={()=>{setMode('individual');setQuantity('1');}}/>Satu tanaman / hewan</label><label><input type="radio" name="pet-mode" value="group" checked={mode==='group'} onChange={()=>setMode('group')}/>Kelompok budidaya</label></div></fieldset>
      <label>Jumlah {pet?.species.type==='tunas'||(!pet&&category==='tunas')?'tanaman':'ekor'}<input type="number" inputMode="numeric" min={1} max={1000000} step={1} required value={mode==='individual'?'1':quantity} readOnly={mode==='individual'} disabled={busy} onChange={e=>setQuantity(e.target.value)}/></label>
      <p className="pet-help">Kelompok boleh berjumlah satu. Perawatan dicatat satu kali per Pet. Perubahan jumlah tidak mengubah catatan lama.</p>
      <label>Lokasi <span className="pet-help">(opsional)</span><input maxLength={160} value={location} disabled={busy} onChange={e=>setLocation(e.target.value)} placeholder="Contoh: Pekarangan depan"/></label>
      {(!pet||confirming)&&<label className="pet-check"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span>Saya benar-benar memiliki atau merawat tanaman / hewan ini.</span></label>}
      {error&&<p className="status-note status-note--warning" role="alert">{error}</p>}
      {!pet&&!loaded&&error&&<button type="button" className="app-button app-button--secondary" onClick={()=>{setError('');setCatalogAttempt(n=>n+1);}}>Muat ulang katalog</button>}
      <button className="app-button app-button--wide" disabled={busy||(!pet&&(!loaded||!selected))}>{busy?'Menyimpan…':confirming?'Konfirmasi Pet':pet?'Simpan perubahan':'Tambahkan Pet'}</button>
    </form>
  </PetDialogFrame>;
}
export function PetPicker({pets,type,onPick,onAdd,onManage,onClose}:{pets:Cultivation[];type:PetType;onPick:(pet:Cultivation)=>Promise<unknown>;onAdd:()=>void;onManage:()=>void;onClose:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('');const available=pets.filter(p=>p.status==='active'&&p.species.type===type&&`${p.nickname} ${p.species.name} ${p.locationLabel}`.toLocaleLowerCase('id-ID').includes(search.toLocaleLowerCase('id-ID')));
  return <PetDialogFrame title={`Pilih Pet · ${PET_CATEGORIES[type]}`} onClose={onClose} busy={busy}><label className="pet-filter-label">Cari Pet<input className="pet-picker-search" type="search" value={search} maxLength={120} disabled={busy} onChange={e=>setSearch(e.target.value)} placeholder="Nama, jenis, atau lokasi"/></label><div className="pet-picker">{available.map(p=><button type="button" disabled={busy} key={p.id} onClick={async()=>{setBusy(true);try{await onPick(p);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><PetVisual pet={p} compact/><span><strong>{p.nickname}</strong><small>{petDescription(p)}</small><small>{p.locationLabel||'Lokasi belum diisi'}{!p.ownershipConfirmed?' · Perlu konfirmasi':''}</small></span></button>)}</div>{!available.length&&<p>{search?'Tidak ada Pet sesuai pencarian.':'Belum ada Pet aktif di kategori ini.'}</p>}{error&&<p role="alert">{error}</p>}<div className="pet-button-row"><button className="app-button" disabled={busy} onClick={onAdd}>Tambah Pet</button><button className="app-button app-button--secondary" disabled={busy} onClick={onManage}>Buka Pet Saya</button></div></PetDialogFrame>;
}
export const archiveLabels:Record<string,string>={harvested:'Sudah panen',sold:'Sudah dijual',no_longer_cared:'Tidak lagi dirawat',died:'Mati',incorrect:'Salah mencatat',other:'Lainnya'};
export function PetArchive({pet,mutate,onClose}:{pet:Cultivation;mutate:PetMutation;onClose:()=>void}){
  const [reason,setReason]=useState('harvested'),[busy,setBusy]=useState(false),[error,setError]=useState('');return <PetDialogFrame title="Arsipkan Pet" busy={busy} onClose={onClose}><p><strong>{pet.nickname}</strong> ({quantityLabel(pet)}) akan dipindahkan ke arsip. Jadwalnya dinonaktifkan; riwayat tetap tersimpan.</p><form className="pet-form" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await mutate(`/cultivations/${pet.id}/archive`,'POST',{reason},'Pet diarsipkan.');onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><label>Alasan<select value={reason} onChange={e=>setReason(e.target.value)} disabled={busy}>{Object.entries(archiveLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label>{error&&<p role="alert">{error}</p>}<button className="app-button" disabled={busy}>{busy?'Menyimpan…':'Arsipkan Pet'}</button></form></PetDialogFrame>;
}
