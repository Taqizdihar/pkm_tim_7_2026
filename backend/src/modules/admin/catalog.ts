import { z } from 'zod';
import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { transaction } from './provision.js';
import { HttpError } from '../../utils/http.js';

export const idSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const order = z.number().int().min(0).max(100000);
const status = z.enum(['draft','published','archived']);
const optionalText = (limit: number) => z.string().trim().max(limit).nullable().default(null);
const definitions = {
  categories: { table: 'cultivation_categories', schema: z.object({
    name: z.string().trim().min(1).max(100), slug: slug.max(100), parent_id: idSchema.nullable().default(null),
    habitat_key: z.enum(['kebun','kolam','kandang']).nullable().default(null), sort_order: order.default(0), is_active: z.boolean().default(true),
  }).strict() },
  species: { table: 'species', schema: z.object({
    name: z.string().trim().min(1).max(120), slug, category_id: idSchema,
    scientific_name: optionalText(150), short_note: optionalText(255), description: optionalText(20000),
    status: status.default('draft'), sort_order: order.default(0), config_json: z.object({}).catchall(z.unknown()).nullable().default(null),
  }).strict() },
  'care-actions': { table: 'care_actions', schema: z.object({
    name: z.string().trim().min(1).max(100), code: z.string().regex(/^[a-z0-9_]+$/).max(60),
    description: optionalText(255), icon_key: z.enum(['water','plant','sun','feed','clean']).default('plant'), is_active: z.boolean().default(true),
  }).strict() },
  guides: { table: 'cultivation_guides', schema: z.object({
    species_id: idSchema, title: z.string().trim().min(1).max(200), guide_type: slug.max(40).default('budidaya'),
    body_text: z.string().trim().min(1).max(100000), status: status.default('draft'), sort_order: order.default(0),
  }).strict() },
} as const;
export type Resource = keyof typeof definitions;
export const resources = Object.keys(definitions) as Resource[];
const effects = z.object({ stat1: z.number().int().min(0).max(100).optional(), stat2: z.number().int().min(0).max(100).optional(), stat3: z.number().int().min(0).max(100).optional() }).strict();
export const assignmentsSchema = z.array(z.object({
  care_action_id: idSchema, slot_key: z.enum(['action1','action2','action3']), description: optionalText(255),
  effect_config_json: effects.default({}), sort_order: order.default(0),
}).strict()).max(3).refine((items) => new Set(items.map(a => a.slot_key)).size === items.length && new Set(items.map(a => a.care_action_id)).size === items.length, 'Tindakan dan slot harus unik.');

export async function audit(db: PoolConnection, userId: string, action: string, entity: string, id: string) {
  await db.execute('INSERT INTO admin_audit_logs (admin_user_id,action,entity_type,entity_id) VALUES (?,?,?,?)', [userId,action,entity,id]);
}
async function required(db: PoolConnection, table: string, id: string) {
  const [rows] = await db.execute<RowDataPacket[]>(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [id]);
  if (!rows[0]) throw new HttpError(404,'Data tidak ditemukan.');
  return rows[0];
}
export function adminCatalog(pool: Pool) {
  return {
    async dashboard() {
      const [counts] = await pool.query<RowDataPacket[]>(`SELECT
        (SELECT COUNT(*) FROM species) AS species,
        (SELECT COUNT(*) FROM cultivation_categories WHERE is_active=1) AS categories,
        (SELECT COUNT(*) FROM species WHERE status='published') AS published,
        (SELECT COUNT(*) FROM species WHERE status='draft') AS draft,
        (SELECT COUNT(*) FROM cultivation_guides) AS guides`);
      const [recent] = await pool.query<RowDataPacket[]>('SELECT id,name,status,updated_at FROM species ORDER BY updated_at DESC LIMIT 5');
      return { ...counts[0], recent };
    },
    async list(resource: Resource) {
      const [rows] = await pool.query<RowDataPacket[]>(`SELECT * FROM ${definitions[resource].table} ORDER BY id DESC`);
      return rows;
    },
    async detail(id: string) {
      const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM species WHERE id=?', [id]);
      if (!rows[0]) throw new HttpError(404,'Pet tidak ditemukan.');
      const [actions] = await pool.execute<RowDataPacket[]>('SELECT * FROM species_care_actions WHERE species_id=? AND is_active=1 ORDER BY sort_order', [id]);
      const [media] = await pool.execute<RowDataPacket[]>(`SELECT sm.id,sm.state_key,ma.storage_path,ma.alt_text FROM species_media sm
        JOIN media_assets ma ON ma.id=sm.media_asset_id WHERE sm.species_id=? AND ma.visibility='public' ORDER BY sm.sort_order`, [id]);
      return { ...rows[0], actions, media };
    },
    async save(resource: Resource, id: string | null, input: unknown, actor: string) {
      const definition = definitions[resource];
      return transaction(pool, async db => {
        // Serialize catalog edits and hierarchy checks through an existing root row.
        await db.query('SELECT id FROM cultivation_categories ORDER BY id FOR UPDATE');
        const before: Record<string, any> = id ? await required(db,definition.table,id) : {};
        const existing = Object.fromEntries(Object.keys(definition.schema.shape).map(key => [key,
          key === 'is_active' ? Boolean(before[key]) : before[key]]));
        const data = definition.schema.parse(id ? { ...existing, ...(input as object) } : input) as Record<string, unknown>;
        if (resource === 'categories') {
          if (!data.parent_id && !data.habitat_key) throw new HttpError(422,'Kategori utama harus memiliki habitat.');
          let parent = data.parent_id as string | null;
          const seen = new Set(id ? [id] : []);
          while (parent) {
            if (seen.has(parent)) throw new HttpError(409,'Kategori induk membentuk lingkaran.');
            seen.add(parent); const row = await required(db,'cultivation_categories',parent); parent = row.parent_id;
          }
        }
        if (resource === 'species') await required(db,'cultivation_categories',data.category_id as string);
        if (resource === 'guides') { await required(db,'species',data.species_id as string); data.updated_by = actor; }
        const keys = Object.keys(data);
        const values = keys.map(key => key.endsWith('_json') && data[key] !== null ? JSON.stringify(data[key]) : data[key]) as any[];
        let entityId = id;
        if (id) await db.execute(`UPDATE ${definition.table} SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`, [...values,id]);
        else {
          const [result] = await db.execute<ResultSetHeader>(`INSERT INTO ${definition.table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`, values);
          entityId = String(result.insertId);
        }
        await audit(db,actor,id ? 'update' : 'create',definition.table,entityId!);
        return { id: entityId };
      });
    },
    async assign(id: string, input: unknown, actor: string) {
      const actions = assignmentsSchema.parse(input);
      await transaction(pool, async db => {
        await required(db,'species',id);
        for (const action of actions) await required(db,'care_actions',action.care_action_id);
        // Keep historical IDs referenced by schedules/logs; free slots before reassignment.
        await db.execute('UPDATE species_care_actions SET is_active=0,slot_key=NULL WHERE species_id=?', [id]);
        for (const action of actions) await db.execute(`INSERT INTO species_care_actions
          (species_id,care_action_id,slot_key,description,effect_config_json,sort_order,is_active) VALUES (?,?,?,?,?,?,1)
          ON DUPLICATE KEY UPDATE slot_key=VALUES(slot_key),description=VALUES(description),effect_config_json=VALUES(effect_config_json),sort_order=VALUES(sort_order),is_active=1`,
          [id,action.care_action_id,action.slot_key,action.description,JSON.stringify(action.effect_config_json),action.sort_order]);
        await audit(db,actor,'assign-actions','species',id);
      });
    },
    async settings() {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT setting_key,value_json FROM app_settings WHERE setting_key IN ('app_name','welcome_message')");
      return Object.fromEntries(rows.map(row => [row.setting_key,row.value_json]));
    },
    async saveSettings(input: unknown, actor: string) {
      const data = z.object({ app_name: z.string().trim().min(1).max(100), welcome_message: z.string().trim().max(500) }).strict().parse(input);
      await transaction(pool, async db => {
        for (const [key,value] of Object.entries(data)) await db.execute(`INSERT INTO app_settings (setting_key,value_json,is_public,updated_by) VALUES (?,?,1,?)
          ON DUPLICATE KEY UPDATE value_json=VALUES(value_json),updated_by=VALUES(updated_by)`, [key,JSON.stringify(value),actor]);
        await audit(db,actor,'update','app_settings','public-display');
      });
    },
  };
}
