import type { PetType } from '../types/index.ts';

export const GARDEN_CATEGORIES: Record<PetType, { label: string; habitat: string }> = {
  tunas: { label: 'Tanaman', habitat: 'Kebun tanaman' },
  koki: { label: 'Ikan', habitat: 'Kolam air tawar' },
  kuning: { label: 'Ayam', habitat: 'Halaman & kandang' },
};
export const ACTION_ART = {
  care: '/assets/generated/care-tools-v1.webp',
  photo: '/assets/generated/photo-leaf-v1.webp',
  schedule: '/assets/generated/daily-calendar-v2.webp',
};
