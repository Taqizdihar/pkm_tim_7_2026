import { useEffect, useState } from 'react';
import App from './App.tsx';
import { loadCatalog } from './data/catalog.ts';

export default function CatalogApp() {
  const [state,setState] = useState<{ ready: boolean; message: string }>({ ready: false, message: '' });
  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadCatalog().then(message => { if (alive) setState({ ready: true,message }); }); };
    refresh();
    window.addEventListener('focus',refresh);
    return () => { alive=false; window.removeEventListener('focus',refresh); };
  },[]);
  if (!state.ready) return <p role="status" style={{ padding: 24 }}>Memuat katalog Dewi Sri…</p>;
  return <>{state.message && <div role="status" style={{ padding: '10px 16px',background: '#FFEADB',color: '#2B1704' }}>{state.message}</div>}<App /></>;
}
