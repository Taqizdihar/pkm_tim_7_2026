type HomeAction = 'care' | 'photo' | 'schedule';

export function HomeActionIcon({ action }: { action: HomeAction }) {
  const common = {
    viewBox: '0 0 64 64',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true as const,
    focusable: false as const,
  };

  if (action === 'care') return <svg {...common}>
    <path d="M19 31h31l-2 22H22l-3-22Z" />
    <path d="M25 31v-5a10 10 0 0 1 20 0v5" />
    <path d="m19 36-8-8M50 33l10-5-10 11" />
    <path d="m7 21-4 6 7 5 5-6-8-5Z" />
    <path d="M25 38h19M26 48h18" />
  </svg>;

  if (action === 'photo') return <svg {...common}>
    <path d="M9 21h10l4-6h18l4 6h10a4 4 0 0 1 4 4v25a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V25a4 4 0 0 1 4-4Z" />
    <circle cx="32" cy="37" r="11" />
    <path d="M49 28h2" />
  </svg>;

  return <svg {...common}>
    <rect x="8" y="13" width="48" height="43" rx="6" />
    <path d="M8 25h48M20 8v11M44 8v11" />
    <circle cx="21" cy="35" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="32" cy="35" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="43" cy="35" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="21" cy="46" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="32" cy="46" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="43" cy="46" r="1.5" fill="currentColor" stroke="none" />
  </svg>;
}
