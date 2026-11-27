import {useEffect,useState} from 'react';
import {api} from './api.ts';

const labels:Record<string,string>={not_configured:'Belum dikonfigurasi',not_tested:'Dikonfigurasi, belum diuji',verified:'Berhasil diuji',configuration_error:'Kesalahan konfigurasi',invalid_credentials:'Kunci atau izin tidak sesuai',invalid_model:'Model tidak tersedia',rate_limited:'Dibatasi kuota',quota_exhausted:'Kuota habis',unavailable:'Gangguan sementara',network:'Koneksi bermasalah',timeout:'Waktu tunggu habis',busy:'Layanan sedang sibuk',disabled:'AI eksternal dinonaktifkan',invalid_response:'Jawaban belum valid',safety_refusal:'Permintaan ditolak layanan',ready:'Siap digunakan',awaiting_contract:'Menunggu kontrak layanan'};
export function AIDiagnostics(){
  const [status,setStatus]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const load=()=>api('/ai/status').then(value=>{if(!value?.gemini)throw new Error('Status AI belum tersedia.');setStatus(value);}).catch(e=>setError(e.message));
  useEffect(()=>{void load();},[]);
  return <section className="admin-panel admin-ai" aria-labelledby="admin-ai-title"><h2 id="admin-ai-title">Integrasi AI</h2><p>Konfigurasi dikelola melalui environment backend. Uji koneksi memakai pertanyaan contoh dan mengonsumsi kuota API.</p>
    {error&&<p className="admin-error" role="alert">{error}</p>}
    {status?<><dl><div><dt>Konsultasi AI</dt><dd>{status.enabled?'Diaktifkan':'Dinonaktifkan'}</dd></div><div><dt>Provider utama / cadangan</dt><dd>{status.primary} / {status.fallback}</dd></div><div><dt>Model Gemini</dt><dd>{status.gemini.model}</dd></div><div><dt>Konfigurasi Gemini</dt><dd>{labels[status.gemini.state]||'Belum diketahui'}</dd></div><div><dt>Kunci server</dt><dd>{status.gemini.keys.map((k:any)=>`${k.slot==='primary'?'Utama':'Cadangan'}: ${labels[k.state]||k.state}`).join(' · ')||'Belum diisi'}</dd></div><div><dt>RAG</dt><dd>{labels[status.rag.state]||status.rag.state}</dd></div><div><dt>Panduan lokal</dt><dd>{status.localFallback?'Tersedia':'Dinonaktifkan'}</dd></div><div><dt>Mode eksternal</dt><dd>{status.externalMode} · {status.demoAccountCount} akun demo diizinkan</dd></div></dl>
    <button type="button" className="primary" disabled={busy||!status.enabled||!status.gemini.configured} onClick={async()=>{setBusy(true);setError('');try{await api('/ai/test','POST',{});await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'Menguji koneksi...':'Uji Koneksi AI'}</button>
    {status.lastTest&&<p role="status">Uji terakhir: {labels[status.lastTest.state]||status.lastTest.state}{typeof status.lastTest.latencyMs==='number'?` · ${status.lastTest.latencyMs} ms`:''}{status.lastTest.model?` · ${status.lastTest.model}`:''}. {new Date(status.lastTest.at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</p>}
    <p>Hasil uji teks tidak membuktikan analisis foto. Status uji disimpan dalam memori proses dan dihapus saat backend dimulai ulang.</p></>:<p role="status">Memuat konfigurasi AI...</p>}
  </section>;
}
