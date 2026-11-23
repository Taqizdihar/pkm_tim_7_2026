import type { Pool, RowDataPacket } from 'mysql2/promise';

export interface Category extends RowDataPacket {
  id: string; parentId: string | null; name: string; slug: string;
  habitatKey: string | null; sortOrder: number;
}
export interface Species extends RowDataPacket {
  id: string; name: string; slug: string; scientificName: string | null;
  description: string | null; shortNote: string | null;
  categoryId: string; categoryName: string; categorySlug: string;
  parentCategoryId: string | null; sortOrder: number;
}
export interface Media extends RowDataPacket {
  id: string; stateKey: string; storagePath: string; mimeType: string;
  altText: string | null; sortOrder: number;
}
export interface CareAction extends RowDataPacket {
  id: string; code: string; name: string; description: string | null;
  iconKey: string | null; slotKey: string | null;
  speciesDescription: string | null; sortOrder: number;
}
export interface Guide extends RowDataPacket {
  id: string; guideType: string; title: string; bodyText: string; sortOrder: number;
}

export function createCatalogRepository(pool: Pool) {
  return {
    async categories(): Promise<Category[]> {
      const [rows] = await pool.execute<Category[]>(`SELECT c.id, c.parent_id AS parentId,
        c.name, c.slug, c.habitat_key AS habitatKey, c.sort_order AS sortOrder
        FROM cultivation_categories c
        LEFT JOIN cultivation_categories p ON p.id = c.parent_id
        WHERE c.is_active = 1 AND (c.parent_id IS NULL OR p.is_active = 1)
        ORDER BY c.sort_order, c.id`);
      return rows;
    },
    async species(): Promise<Species[]> {
      const [rows] = await pool.execute<Species[]>(`${speciesSelect}
        WHERE s.status = 'published' AND c.is_active = 1
        AND (c.parent_id IS NULL OR p.is_active = 1)
        ORDER BY s.sort_order, s.id`);
      return rows;
    },
    async speciesBySlug(slug: string): Promise<Species | null> {
      const [rows] = await pool.execute<Species[]>(`${speciesSelect}
        WHERE s.slug = ? AND s.status = 'published' AND c.is_active = 1
        AND (c.parent_id IS NULL OR p.is_active = 1) LIMIT 1`, [slug]);
      return rows[0] ?? null;
    },
    async media(speciesId: string): Promise<Media[]> {
      const [rows] = await pool.execute<Media[]>(`SELECT ma.id, sm.state_key AS stateKey,
        ma.storage_path AS storagePath, ma.mime_type AS mimeType,
        ma.alt_text AS altText, sm.sort_order AS sortOrder
        FROM species_media sm JOIN media_assets ma ON ma.id = sm.media_asset_id
        WHERE sm.species_id = ? AND ma.visibility = 'public'
        ORDER BY sm.sort_order, sm.id`, [speciesId]);
      return rows;
    },
    async careActions(speciesId: string): Promise<CareAction[]> {
      const [rows] = await pool.execute<CareAction[]>(`SELECT ca.id, ca.code, ca.name,
        ca.description, ca.icon_key AS iconKey, sca.slot_key AS slotKey,
        sca.description AS speciesDescription, sca.sort_order AS sortOrder
        FROM species_care_actions sca JOIN care_actions ca ON ca.id = sca.care_action_id
        WHERE sca.species_id = ? AND sca.is_active = 1 AND ca.is_active = 1
        ORDER BY sca.sort_order, sca.id`, [speciesId]);
      return rows;
    },
    async guides(speciesId: string): Promise<Guide[]> {
      const [rows] = await pool.execute<Guide[]>(`SELECT id, guide_type AS guideType,
        title, body_text AS bodyText, sort_order AS sortOrder
        FROM cultivation_guides WHERE species_id = ? AND status = 'published'
        ORDER BY sort_order, id`, [speciesId]);
      return rows;
    },
  };
}

const speciesSelect = `SELECT s.id, s.name, s.slug, s.scientific_name AS scientificName,
  s.description, s.short_note AS shortNote, s.category_id AS categoryId,
  c.name AS categoryName, c.slug AS categorySlug,
  c.parent_id AS parentCategoryId, s.sort_order AS sortOrder
  FROM species s JOIN cultivation_categories c ON c.id = s.category_id
  LEFT JOIN cultivation_categories p ON p.id = c.parent_id`;

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
