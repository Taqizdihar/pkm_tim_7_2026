import {useState} from 'react';
import {ArrowLeft,NotebookPen,Users} from 'lucide-react';
import type {JournalActivity} from '../../api/memberTypes.ts';

export function PetJournal({activities,total,hasMore,onLoadMore,onBack,initialPetId}:{activities:JournalActivity[];total:number;hasMore:boolean;onLoadMore:()=>Promise<void>;onBack:()=>void;initialPetId?:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[onlyPet,setOnlyPet]=useState(!!initialPetId);
  const visible=onlyPet?activities.filter(a=>a.entries.some(e=>e.cultivationId===initialPetId)):activities;
  return <main className="schedule-page app-content"><header className="page-heading"><button className="icon-button" onClick={onBack} aria-label="Kembali ke beranda"><ArrowLeft/></button><div><h1>Jurnal perawatan</h1><p>Catatan kegiatan yang sudah dilakukan</p></div></header><p>{activities.length} dari {total} kegiatan dimuat. Rawat Bersama ditampilkan sebagai satu kegiatan.</p>
    {initialPetId&&<label className="pet-check"><input type="checkbox" checked={onlyPet} onChange={e=>setOnlyPet(e.target.checked)}/>Tampilkan kegiatan Pet ini</label>}
    <div className="pet-journal-list">{visible.map(activity=>{const first=activity.entries[0],quantity=activity.representedQuantity,unit=first?.type==='tunas'?'tanaman':'ekor';return <article key={activity.id} className="pet-journal-entry"><div className="pet-journal-heading">{activity.batchId?<Users size={23}/>:<NotebookPen size={23}/>}<div><h2>{activity.batchId?'Rawat Bersama':first?.petName} · {activity.actionLabel}</h2><time dateTime={activity.createdAt}>{new Date(activity.createdAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})} WIB</time></div></div>
      {activity.batchId&&<p>{activity.entries.length} Pet · {quantity===null?'Jumlah saat perawatan tidak tercatat':`${quantity.toLocaleString('id-ID')} ${unit}`}</p>}
      {activity.batchId?<details><summary>Lihat {activity.entries.length} Pet yang dirawat</summary><ul>{activity.entries.map(e=><li key={e.id}><strong>{e.petName}</strong> · {e.speciesName}<br/>{e.quantity===null?'Jumlah saat perawatan tidak tercatat':`${e.quantity.toLocaleString('id-ID')} ${e.type==='tunas'?'tanaman':'ekor'}`}</li>)}</ul></details>:<p>{first?.speciesName} · {first?.quantity==null?'Jumlah saat perawatan tidak tercatat':`${first.quantity.toLocaleString('id-ID')} ${unit}`}</p>}
    </article>;})}</div>
    {!visible.length&&<div className="pet-empty"><h2>Belum ada catatan yang ditampilkan</h2><p>Setelah melakukan perawatan, catat melalui Rawat, Rawat Bersama, atau jadwal Pet Anda.</p></div>}
    {hasMore&&<button className="app-button app-button--secondary app-button--wide" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onLoadMore();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Memuat…':'Muat kegiatan sebelumnya'}</button>}{error&&<p role="alert">{error}</p>}
  </main>;
}
