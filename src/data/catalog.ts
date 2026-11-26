import { SPECIES } from './species.ts';
import type { Species } from './species.ts';
import type { PetType } from '../types/index.ts';
import type { CareAction } from './care.ts';

interface Category { id: string; parentId: string | null; slug: string; habitatKey: string | null }
interface CatalogSpecies {
  slug: string; name: string; categoryId: string; shortNote: string | null;
  media: { stateKey: string; storagePath: string }[];
  available?: boolean;
  guides?: { title: string; bodyText: string }[];
  careActions: { slotKey: string; name: string; speciesDescription: string; description: string; iconKey: string; effects: CareAction['effects'] }[];
}
export interface Catalog { categories: Category[]; species: CatalogSpecies[] }
const cacheKey = 'dewi_sri_catalog_v1';
const safeImage = (value: string) => /^\/(?:assets\/generated\/[a-zA-Z0-9._/-]+|api\/v1\/media\/[a-f0-9-]+\.webp)$/.test(value);
export function applyCatalog(catalog: Catalog, fresh = true) {
  if (!Array.isArray(catalog.categories) || !Array.isArray(catalog.species)) throw Error('Katalog tidak valid.');
  const groups: Record<string, Species['group']> = { sayuran: 'sayuran', buah: 'buah', bijian: 'bijian' };
  if (fresh) for (const species of Object.values(SPECIES).flat()) species.available = false;
  for (const item of catalog.species) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug)) continue;
    let category = catalog.categories.find(c => c.id === item.categoryId);
    const visited = new Set<string>();
    let habitat: string | null = null;
    while (category && !visited.has(category.id)) {
      visited.add(category.id); habitat = category.habitatKey || habitat;
      category = catalog.categories.find(c => c.id === category?.parentId);
    }
    const type: PetType | undefined = habitat === 'kebun' ? 'tunas' : habitat === 'kolam' ? 'koki' : habitat === 'kandang' ? 'kuning' : undefined;
    if (!type) continue;
    const existing = SPECIES[type].find(s => s.id === item.slug);
    const image = item.media.find(m => m.stateKey === 'normal' && safeImage(m.storagePath))?.storagePath;
    const wiltedImage = item.media.find(m => m.stateKey === 'wilted' && safeImage(m.storagePath))?.storagePath;
    const actions: CareAction[] = item.careActions.filter(a => ['action1','action2','action3'].includes(a.slotKey)).map(a => ({
      slot: a.slotKey as CareAction['slot'], label: a.name, description: a.speciesDescription || a.description || '',
      icon: ['water','plant','sun','feed','clean'].includes(a.iconKey) ? a.iconKey as CareAction['icon'] : 'plant', effects: a.effects,
    }));
    const next: Species = { id: item.slug, label: item.name, image: image || existing?.image || SPECIES[type][0].image,
      wiltedImage, stateImages:item.media.reduce<Record<string,string>>((images,m)=>{if(safeImage(m.storagePath)&&!images[m.stateKey])images[m.stateKey]=m.storagePath;return images;},{}), note: item.shortNote || '', group: groups[catalog.categories.find(c => c.id === item.categoryId)?.slug || ''] || (type === 'koki' ? 'ikan' : type === 'kuning' ? 'unggas' : 'sayuran'),
      available: item.available !== false, careActions: actions, guides: item.guides };
    if (existing) Object.assign(existing,next); else SPECIES[type].push(next);
  }
}

export async function loadCatalog(): Promise<string> {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) applyCatalog(JSON.parse(cached),false);
  } catch { /* An invalid cache cannot prevent startup. */ }
  try {
    const response = await fetch('/api/v1/catalog', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error();
    const result = await response.json();
    applyCatalog(result.data);
    // Retain historical species metadata so archived species still resolve in local records.
    const previous = JSON.parse(localStorage.getItem(cacheKey) || '{"species":[],"categories":[]}') as Catalog;
    const history = previous.species.filter(p => !result.data.species.some((s: CatalogSpecies) => s.slug === p.slug)).map(p => ({ ...p, available: false }));
    const oldCategories = previous.categories.filter(p => !result.data.categories.some((c: Category) => c.id===p.id));
    localStorage.setItem(cacheKey,JSON.stringify({ ...result.data, categories: [...result.data.categories,...oldCategories], species: [...result.data.species,...history] }));
    return '';
  } catch {
    return 'Katalog server belum tersedia. Menggunakan katalog tersimpan di perangkat ini.';
  }
}
