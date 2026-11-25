import { CalendarDays, House, MessageCircle, UserRound } from 'lucide-react';
import type { ActiveScreen } from '../types/index.ts';
import { Brand } from './ui/Brand.tsx';

const items = [
  { screen: 'beranda' as const, label: 'Beranda', icon: House, screens: ['beranda', 'jurnal'] },
  { screen: 'jadwal' as const, label: 'Jadwal', icon: CalendarDays, screens: ['jadwal'] },
  { screen: 'chat_ai' as const, label: 'Tanya Tani', icon: MessageCircle, screens: ['chat_ai', 'chat_history'] },
  { screen: 'pengaturan' as const, label: 'Profil', icon: UserRound, screens: ['pengaturan', 'edit_profile', 'rank_petani'] },
];

export function BottomNavBar({ currentScreen, onNavigate }: { currentScreen: ActiveScreen; onNavigate: (screen: ActiveScreen) => void }) {
  return <nav className="app-nav" aria-label="Navigasi utama"><div className="app-nav__brand"><Brand /></div><div className="app-nav__links">{items.map(({ screen, label, icon: Icon, screens }) => { const active = screens.includes(currentScreen); return <button key={screen} type="button" className={`app-nav__item ${active ? 'is-active' : ''}`} onClick={() => onNavigate(screen)} aria-current={active ? 'page' : undefined}><Icon size={23} strokeWidth={active ? 2.4 : 1.8} aria-hidden="true" /><span>{label}</span></button>; })}</div></nav>;
}
