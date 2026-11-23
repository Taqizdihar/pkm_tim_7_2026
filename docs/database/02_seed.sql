-- Dewi Sri: DML awal v1 (aman diulang; tidak menimpa edit CMS)
-- Jalankan SETELAH 01_schema.sql melalui phpMyAdmin > dewi_sri > SQL.
-- Semua duplikat berdasarkan UNIQUE diabaikan (no-op); tidak ada akun/password contoh.
USE dewi_sri;
SET NAMES utf8mb4;

-- A. Tiga peran dasar
INSERT INTO roles (code,name,description) VALUES
  ('admin','Administrator','Akses CMS pengembang'),
  ('member','Anggota KWT','Pengguna aplikasi Dewi Sri'),
  ('educator','Penyuluh','Pengelola panduan budidaya')
ON DUPLICATE KEY UPDATE id=id;

-- B. Kategori utama dan subkategori
INSERT INTO cultivation_categories (name,slug,habitat_key,sort_order,is_active) VALUES
  ('Tanaman','tanaman','kebun',1,1),
  ('Ikan','ikan','kolam',2,1),
  ('Ayam','ayam','kandang',3,1)
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO cultivation_categories (parent_id,name,slug,habitat_key,sort_order,is_active)
SELECT p.id, t.name, t.slug, 'kebun', t.sort_order, 1
FROM cultivation_categories p
JOIN (
  SELECT 'Sayuran' AS name, 'sayuran' AS slug, 1 AS sort_order
  UNION ALL SELECT 'Buah' AS name, 'buah' AS slug, 2 AS sort_order
  UNION ALL SELECT 'Biji-bijian' AS name, 'bijian' AS slug, 3 AS sort_order
) t ON p.slug='tanaman'
ON DUPLICATE KEY UPDATE id=id;

-- C. Sebelas jenis sesuai src/data/species.ts (tanpa menimpa perubahan pengguna)
INSERT INTO species (category_id,name,slug,short_note,sort_order)
SELECT c.id,t.name,t.slug,t.short_note,t.sort_order
FROM (
  SELECT 'bijian' AS category_slug, 'Sorgum' AS name, 'sorgum' AS slug, 'Biji-bijian' AS short_note, 1 AS sort_order
  UNION ALL SELECT 'sayuran' AS category_slug, 'Kangkung' AS name, 'kangkung' AS slug, 'Sayuran daun' AS short_note, 2 AS sort_order
  UNION ALL SELECT 'sayuran' AS category_slug, 'Sawi' AS name, 'sawi' AS slug, 'Sayuran daun' AS short_note, 3 AS sort_order
  UNION ALL SELECT 'sayuran' AS category_slug, 'Selada' AS name, 'selada' AS slug, 'Sayuran daun' AS short_note, 4 AS sort_order
  UNION ALL SELECT 'buah' AS category_slug, 'Melon' AS name, 'melon' AS slug, 'Buah' AS short_note, 5 AS sort_order
  UNION ALL SELECT 'buah' AS category_slug, 'Semangka' AS name, 'semangka' AS slug, 'Buah' AS short_note, 6 AS sort_order
  UNION ALL SELECT 'sayuran' AS category_slug, 'Cabai' AS name, 'cabai' AS slug, 'Sayuran buah' AS short_note, 7 AS sort_order
  UNION ALL SELECT 'ikan' AS category_slug, 'Lele' AS name, 'lele' AS slug, 'Ikan air tawar' AS short_note, 8 AS sort_order
  UNION ALL SELECT 'ikan' AS category_slug, 'Nila' AS name, 'nila' AS slug, 'Ikan air tawar' AS short_note, 9 AS sort_order
  UNION ALL SELECT 'ikan' AS category_slug, 'Ikan mas' AS name, 'mas' AS slug, 'Ikan air tawar' AS short_note, 10 AS sort_order
  UNION ALL SELECT 'ayam' AS category_slug, 'Ayam petelur' AS name, 'petelur' AS slug, 'Unggas darat' AS short_note, 11 AS sort_order
) t JOIN cultivation_categories c ON c.slug=t.category_slug
ON DUPLICATE KEY UPDATE id=id;

-- D. Tindakan perawatan standar
INSERT INTO care_actions (code,name,description,icon_key) VALUES
  ('siram', 'Siram', 'Periksa media, lalu catat penyiraman.', 'water'),
  ('beri_pupuk', 'Beri pupuk', 'Catat pemupukan sesuai kebutuhan.', 'plant'),
  ('cek_cahaya', 'Cek cahaya', 'Catat pemeriksaan cahaya tanaman.', 'sun'),
  ('beri_makan', 'Beri makan', 'Catat pemberian pakan.', 'feed'),
  ('ganti_air', 'Ganti air', 'Catat pergantian air secara bertahap.', 'water'),
  ('bersihkan_kolam', 'Bersihkan kolam', 'Catat pembersihan area kolam.', 'clean'),
  ('beri_minum', 'Beri minum', 'Catat pengisian air minum bersih.', 'water'),
  ('bersihkan_kandang', 'Bersihkan kandang', 'Catat pembersihan alas dan kandang.', 'clean')
ON DUPLICATE KEY UPDATE id=id;

-- E. Relasi aktivitas spesies sesuai slot action1-3 yang berlaku di frontend sekarang
INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action1','Periksa media, lalu catat penyiraman.',JSON_OBJECT('stat2',30,'stat3',15),1
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='siram'
WHERE COALESCE(p.slug,c.slug)='tanaman'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action2','Catat pemupukan sesuai kebutuhan.',JSON_OBJECT('stat1',35,'stat3',20),2
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='beri_pupuk'
WHERE COALESCE(p.slug,c.slug)='tanaman'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action3','Catat pemeriksaan cahaya tanaman.',JSON_OBJECT('stat3',30,'stat1',10),3
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='cek_cahaya'
WHERE COALESCE(p.slug,c.slug)='tanaman'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action1','Catat pemberian pakan ikan.',JSON_OBJECT('stat1',35,'stat3',20),1
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='beri_makan'
WHERE COALESCE(p.slug,c.slug)='ikan'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action2','Catat pergantian air kolam.',JSON_OBJECT('stat2',30,'stat3',15),2
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='ganti_air'
WHERE COALESCE(p.slug,c.slug)='ikan'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action3','Catat pembersihan kolam.',JSON_OBJECT('stat2',40,'stat3',25),3
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='bersihkan_kolam'
WHERE COALESCE(p.slug,c.slug)='ikan'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action1','Catat pemberian pakan ayam.',JSON_OBJECT('stat1',35,'stat3',20),1
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='beri_makan'
WHERE COALESCE(p.slug,c.slug)='ayam'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action2','Catat pengisian air minum ayam.',JSON_OBJECT('stat3',20,'stat1',10),2
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='beri_minum'
WHERE COALESCE(p.slug,c.slug)='ayam'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_care_actions (species_id,care_action_id,slot_key,description,effect_config_json,sort_order)
SELECT s.id,a.id,'action3','Catat pembersihan kandang.',JSON_OBJECT('stat2',35,'stat3',25),3
FROM species s JOIN cultivation_categories c ON c.id=s.category_id
LEFT JOIN cultivation_categories p ON p.id=c.parent_id
JOIN care_actions a ON a.code='bersihkan_kandang'
WHERE COALESCE(p.slug,c.slug)='ayam'
ON DUPLICATE KEY UPDATE id=id;

-- F. Referensi aset publik yang SUDAH ada di public/assets/generated/
-- size_bytes=0 bermakna belum dihitung; bukan ukuran file asli.
INSERT INTO media_assets (storage_path,original_name,mime_type,size_bytes,alt_text) VALUES
  ('/assets/generated/sorgum.webp','sorgum.webp','image/webp',0,'Ilustrasi sorgum'),
  ('/assets/generated/sorgum-wilted.webp','sorgum-wilted.webp','image/webp',0,'Ilustrasi sorgum layu'),
  ('/assets/generated/kangkung.webp','kangkung.webp','image/webp',0,'Ilustrasi kangkung'),
  ('/assets/generated/sawi.webp','sawi.webp','image/webp',0,'Ilustrasi sawi'),
  ('/assets/generated/selada.webp','selada.webp','image/webp',0,'Ilustrasi selada'),
  ('/assets/generated/melon.webp','melon.webp','image/webp',0,'Ilustrasi melon'),
  ('/assets/generated/semangka.webp','semangka.webp','image/webp',0,'Ilustrasi semangka'),
  ('/assets/generated/cabai.webp','cabai.webp','image/webp',0,'Ilustrasi cabai'),
  ('/assets/generated/lele.webp','lele.webp','image/webp',0,'Ilustrasi lele'),
  ('/assets/generated/nila.webp','nila.webp','image/webp',0,'Ilustrasi nila'),
  ('/assets/generated/ikan-mas.webp','ikan-mas.webp','image/webp',0,'Ilustrasi mas'),
  ('/assets/generated/ayam-petelur.webp','ayam-petelur.webp','image/webp',0,'Ilustrasi petelur')
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/sorgum.webp'
WHERE s.slug='sorgum'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'wilted',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/sorgum-wilted.webp'
WHERE s.slug='sorgum'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/kangkung.webp'
WHERE s.slug='kangkung'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/sawi.webp'
WHERE s.slug='sawi'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/selada.webp'
WHERE s.slug='selada'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/melon.webp'
WHERE s.slug='melon'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/semangka.webp'
WHERE s.slug='semangka'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/cabai.webp'
WHERE s.slug='cabai'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/lele.webp'
WHERE s.slug='lele'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/nila.webp'
WHERE s.slug='nila'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/ikan-mas.webp'
WHERE s.slug='mas'
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO species_media (species_id,media_asset_id,state_key,sort_order)
SELECT s.id,m.id,'normal',0 FROM species s JOIN media_assets m ON m.storage_path='/assets/generated/ayam-petelur.webp'
WHERE s.slug='petelur'
ON DUPLICATE KEY UPDATE id=id;

-- G. Konfigurasi publik non-rahasia (RAG/vision/cuaca belum aktif)
INSERT INTO app_settings (setting_key,value_json,description,is_public) VALUES
 ('app_name',JSON_QUOTE('Dewi Sri'),'Nama aplikasi',1),
 ('default_timezone',JSON_QUOTE('Asia/Jakarta'),'Zona waktu bawaan',1),
 ('feature_flags',JSON_OBJECT('rag_chat',false,'photo_ai',false,'weather',false),'Tandai aktif hanya setelah backend siap',1)
ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- H. Verifikasi hasil seed (jumlah di database bisa lebih tinggi bila sudah ada tambahan)
SELECT 'categories' AS entity,COUNT(*) AS total FROM cultivation_categories
UNION ALL SELECT 'species',COUNT(*) FROM species
UNION ALL SELECT 'care_actions',COUNT(*) FROM care_actions
UNION ALL SELECT 'species_care_actions',COUNT(*) FROM species_care_actions
UNION ALL SELECT 'media_assets',COUNT(*) FROM media_assets
UNION ALL SELECT 'species_media',COUNT(*) FROM species_media;
