import {useState} from 'react';
import {Check,Users} from 'lucide-react';
import type {Cultivation} from '../../api/memberTypes.ts';
import {PetDialogFrame,useRequestId,type PetMutation} from './PetDialogs.tsx';
import {PetVisual,petDescription,quantityLabel} from './PetVisual.tsx';

export function IndividualCare({pet,mutate,onClose,onReview}:{pet:Cultivation;mutate:PetMutation;onClose:()=>void;onReview:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState('');const requestId=useRequestId();
  return <PetDialogFrame title={`Rawat ${pet.nickname}`} busy={busy} onClose={onClose}><div className="pet-form-species"><PetVisual pet={pet} compact/><p>{petDescription(pet)}{pet.locationLabel&&<><br/>{pet.locationLabel}</>}</p></div>
    {!pet.ownershipConfirmed?<><p>Catatan lama ini belum dikonfirmasi. Tinjau identitas dan kepemilikannya terlebih dahulu.</p><button className="app-button" onClick={onReview}>Tinjau Pet</button></>:<><p>Catat setelah perawatan benar-benar dilakukan. Catatan kelompok berlaku satu kali untuk seluruh {quantityLabel(pet)}.</p>
      <div className="pet-care-actions">{pet.species.careActions.map(action=><button type="button" className="pet-care-button" key={action.associationId} disabled={busy||!!saved} onClick={async()=>{setBusy(true);setError('');setSaved('');const body={slot:action.slot};try{await mutate(`/cultivations/${pet.id}/care-actions`,'POST',{...body,client_event_id:requestId(body)},'Perawatan tercatat.');setSaved(action.label); }catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><strong>Sudah {action.label.toLocaleLowerCase('id-ID')}</strong><span>{action.description||'Simpan catatan perawatan ini'}</span></button>)}</div>
      {!pet.species.careActions.length&&<p>Jenis ini belum memiliki tindakan perawatan. Hubungi pengelola katalog.</p>}
      {saved&&<p className="status-note" role="status"><Check size={20}/> {saved} berhasil dicatat.</p>}
      {saved&&<div className="pet-button-row"><button className="app-button" onClick={onClose}>Selesai</button><button className="app-button app-button--secondary" onClick={()=>{requestId.reset();setSaved('');}}>Catat kegiatan baru</button></div>}</>}
    {error&&<p className="status-note status-note--warning" role="alert">{error}</p>}
  </PetDialogFrame>;
}
export function BulkCare({pets,initialSpecies,limit,mutate,onClose}:{pets:Cultivation[];initialSpecies?:string;limit:number;mutate:PetMutation;onClose:()=>void}){
  const eligible=pets.filter(p=>p.status==='active'&&p.ownershipConfirmed&&p.species.careActions.length);
  const species=[...new Map(eligible.map(p=>[p.species.id,p.species])).values()];
  const [speciesId,setSpeciesId]=useState(species.find(s=>s.id===initialSpecies)?.id||species[0]?.id||''),[selected,setSelected]=useState<string[]>([]),[actionId,setActionId]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');const requestId=useRequestId();
  const scoped=eligible.filter(p=>p.species.id===speciesId),descriptor=species.find(s=>s.id===speciesId),action=descriptor?.careActions.find(a=>a.id===actionId)||descriptor?.careActions[0];
  const represented=scoped.filter(p=>selected.includes(p.id)).reduce((n,p)=>n+p.quantity,0),unit=descriptor?.type==='tunas'?'tanaman':'ekor';
  return <PetDialogFrame title="Rawat Bersama" onClose={onClose} busy={busy}>{success?<><p className="status-note" role="status"><Check/>{success}</p><button className="app-button" onClick={onClose}>Selesai</button></>:<form className="pet-form" onSubmit={async e=>{e.preventDefault();if(!action)return;setBusy(true);setError('');const body={cultivation_ids:[...selected].sort(),care_action_id:action.id,confirmed};try{const result=await mutate('/cultivations/bulk-care','POST',{...body,client_event_id:requestId(body)},'Rawat Bersama tercatat.');const saved=result.careResult;setSuccess(`${saved?.affectedPetCount??selected.length} Pet, mewakili ${(saved?.representedQuantity??represented).toLocaleString('id-ID')} ${unit}, berhasil dicatat.`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
      <p>Pilih Pet sejenis yang sudah Anda rawat. Satu kegiatan bersama dihitung satu kali dalam perjalanan tani.</p>
      {!eligible.length?<p>Tambahkan atau konfirmasikan Pet aktif dengan tindakan perawatan terlebih dahulu.</p>:<><label>Jenis budidaya<select disabled={busy} value={speciesId} onChange={e=>{setSpeciesId(e.target.value);setSelected([]);setActionId('');setConfirmed(false);}}>{species.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>Perawatan<select disabled={busy} value={action?.id||''} onChange={e=>{setActionId(e.target.value);setConfirmed(false);}}>{descriptor?.careActions.map(a=><option key={a.associationId} value={a.id}>{a.label}</option>)}</select></label>
      <div className="pet-select-heading"><strong>Pilih Pet</strong><button type="button" className="text-button" disabled={busy||scoped.length>limit} onClick={()=>{setSelected(selected.length===scoped.length?[]:scoped.map(p=>p.id));setConfirmed(false);}}>{selected.length===scoped.length?'Batal pilih semua':'Pilih semua jenis ini'}</button></div>
      <div className="pet-bulk-list">{scoped.map(p=><label key={p.id} className="pet-check pet-bulk-choice"><input type="checkbox" checked={selected.includes(p.id)} disabled={busy||(!selected.includes(p.id)&&selected.length>=limit)} onChange={e=>{setSelected(prev=>e.target.checked?[...prev,p.id]:prev.filter(id=>id!==p.id));setConfirmed(false);}}/><PetVisual pet={p} compact/><span><strong>{p.nickname}</strong><small>{petDescription(p)}</small><small>{p.locationLabel||'Lokasi belum diisi'}</small></span></label>)}</div>
      <p className="pet-bulk-summary" aria-live="polite"><Users size={21}/><span><strong>{selected.length} Pet dipilih</strong><br/>Mewakili {represented.toLocaleString('id-ID')} {unit}</span></p><p className="pet-help">Maksimal {limit} Pet per kegiatan. Pet arsip dan Pet yang belum dikonfirmasi tidak disertakan.</p>
      <label className="pet-check"><input required type="checkbox" disabled={busy||!selected.length} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>Saya sudah melakukan {action?.label.toLocaleLowerCase('id-ID')} untuk semua Pet yang dipilih.</span></label>
      <button className="app-button app-button--wide" disabled={busy||!selected.length||!confirmed}>{busy?'Menyimpan…':`Catat ${action?.label.toLocaleLowerCase('id-ID')||'perawatan'} bersama`}</button></>}
      {error&&<p className="status-note status-note--warning" role="alert">{error}</p>}
    </form>}</PetDialogFrame>;
}
