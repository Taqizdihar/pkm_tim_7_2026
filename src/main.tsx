import {createRoot} from 'react-dom/client';
import CatalogApp from './CatalogApp.tsx';
import AdminApp from './admin/AdminApp.tsx';
import './index.css';
import './garden.css';
import './styles/responsive.css';
import './styles/pets.css';

createRoot(document.getElementById('root')!).render(window.location.pathname.startsWith('/admin') ? <AdminApp /> : <CatalogApp />);
