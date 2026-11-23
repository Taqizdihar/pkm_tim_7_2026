-- Dewi Sri: DDL awal v1 | 19 tabel
-- Target MySQL 8.0+ / 8.4 (InnoDB); pastikan database dewi_sri sudah dibuat.
-- Jalankan via phpMyAdmin > dewi_sri > SQL. Tidak ada DROP/DELETE.
-- IF NOT EXISTS tidak mengubah definisi tabel lama: gunakan ALTER TABLE untuk revisi.
-- Jangan menaruh password atau API key asli di SQL/repository.

USE dewi_sri;
SET NAMES utf8mb4;

-- 01 users
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(191) NULL,
  password_hash VARCHAR(255) NULL,
  auth_provider VARCHAR(30) NOT NULL DEFAULT 'local',
  email_verified_at DATETIME(3) NULL,
  avatar_url VARCHAR(500) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 02 roles
CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  code VARCHAR(40) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 03 user_roles
CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role (role_id),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 04 user_preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  region VARCHAR(160) NULL,
  care_focus_json JSON NULL,
  text_size VARCHAR(16) NOT NULL DEFAULT 'medium',
  sound_enabled TINYINT(1) NOT NULL DEFAULT 1,
  reminder_enabled TINYINT(1) NOT NULL DEFAULT 0,
  language_code VARCHAR(12) NOT NULL DEFAULT 'id',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
  preferences_json JSON NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  CONSTRAINT fk_preferences_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 05 cultivation_categories
CREATE TABLE IF NOT EXISTS cultivation_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  parent_id BIGINT UNSIGNED NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  habitat_key VARCHAR(50) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_categories_slug (slug),
  KEY idx_categories_parent (parent_id, sort_order),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES cultivation_categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 06 species
CREATE TABLE IF NOT EXISTS species (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  scientific_name VARCHAR(150) NULL,
  description TEXT NULL,
  short_note VARCHAR(255) NULL,
  config_json JSON NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'published',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_species_slug (slug),
  KEY idx_species_category_status (category_id, status, sort_order),
  CONSTRAINT fk_species_category FOREIGN KEY (category_id) REFERENCES cultivation_categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 07 media_assets
CREATE TABLE IF NOT EXISTS media_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  storage_path VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  width_px INT UNSIGNED NULL,
  height_px INT UNSIGNED NULL,
  alt_text VARCHAR(255) NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'public',
  uploaded_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_media_storage_path (storage_path),
  KEY idx_media_uploaded_by (uploaded_by),
  CONSTRAINT fk_media_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 08 species_media
CREATE TABLE IF NOT EXISTS species_media (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  species_id BIGINT UNSIGNED NOT NULL,
  media_asset_id BIGINT UNSIGNED NOT NULL,
  state_key VARCHAR(50) NOT NULL DEFAULT 'normal',
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_species_media_pair (species_id, state_key, media_asset_id),
  KEY idx_species_media_state (species_id, state_key, sort_order),
  KEY idx_species_media_asset (media_asset_id),
  CONSTRAINT fk_species_media_species FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE CASCADE,
  CONSTRAINT fk_species_media_asset FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 09 care_actions
CREATE TABLE IF NOT EXISTS care_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  code VARCHAR(60) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  icon_key VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_actions_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10 species_care_actions
CREATE TABLE IF NOT EXISTS species_care_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  species_id BIGINT UNSIGNED NOT NULL,
  care_action_id BIGINT UNSIGNED NOT NULL,
  slot_key VARCHAR(20) NULL,
  description VARCHAR(255) NULL,
  effect_config_json JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_species_care_action (species_id, care_action_id),
  UNIQUE KEY uq_species_slot (species_id, slot_key),
  KEY idx_sca_action_id (care_action_id),
  CONSTRAINT fk_sca_species FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sca_action FOREIGN KEY (care_action_id) REFERENCES care_actions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11 cultivation_guides
CREATE TABLE IF NOT EXISTS cultivation_guides (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  species_id BIGINT UNSIGNED NOT NULL,
  guide_type VARCHAR(40) NOT NULL DEFAULT 'budidaya',
  title VARCHAR(200) NOT NULL,
  body_text LONGTEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  sort_order INT NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_guides_species_status (species_id, status, sort_order),
  KEY idx_guides_updated_by (updated_by),
  CONSTRAINT fk_guides_species FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE RESTRICT,
  CONSTRAINT fk_guides_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12 user_cultivations
CREATE TABLE IF NOT EXISTS user_cultivations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  user_id BIGINT UNSIGNED NOT NULL,
  species_id BIGINT UNSIGNED NOT NULL,
  nickname VARCHAR(120) NULL,
  metrics_json JSON NULL,
  visual_state VARCHAR(50) NOT NULL DEFAULT 'normal',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_uc_user_status (user_id, status),
  KEY idx_uc_species (species_id),
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_species FOREIGN KEY (species_id) REFERENCES species(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13 care_schedules
CREATE TABLE IF NOT EXISTS care_schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  user_cultivation_id BIGINT UNSIGNED NOT NULL,
  species_care_action_id BIGINT UNSIGNED NOT NULL,
  care_time TIME NOT NULL,
  recurrence VARCHAR(30) NOT NULL DEFAULT 'daily',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_schedules_cultivation (user_cultivation_id, is_enabled, care_time),
  KEY idx_schedules_sca (species_care_action_id),
  CONSTRAINT fk_schedules_cultivation FOREIGN KEY (user_cultivation_id) REFERENCES user_cultivations(id) ON DELETE CASCADE,
  CONSTRAINT fk_schedules_sca FOREIGN KEY (species_care_action_id) REFERENCES species_care_actions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14 care_logs
CREATE TABLE IF NOT EXISTS care_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  user_cultivation_id BIGINT UNSIGNED NOT NULL,
  species_care_action_id BIGINT UNSIGNED NOT NULL,
  schedule_id BIGINT UNSIGNED NULL,
  client_event_id VARCHAR(100) NULL,
  performed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  local_date DATE NOT NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_care_logs_client_event (user_cultivation_id, client_event_id),
  KEY idx_care_logs_history (user_cultivation_id, performed_at),
  KEY idx_care_logs_schedule_day (schedule_id, local_date),
  KEY idx_care_logs_action (species_care_action_id),
  CONSTRAINT fk_care_logs_cultivation FOREIGN KEY (user_cultivation_id) REFERENCES user_cultivations(id) ON DELETE CASCADE,
  CONSTRAINT fk_care_logs_action FOREIGN KEY (species_care_action_id) REFERENCES species_care_actions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_care_logs_schedule FOREIGN KEY (schedule_id) REFERENCES care_schedules(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15 point_transactions
CREATE TABLE IF NOT EXISTS point_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  user_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(40) NOT NULL,
  source_reference VARCHAR(120) NOT NULL,
  points INT NOT NULL,
  note VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_points_source (user_id, source_type, source_reference),
  KEY idx_points_user_time (user_id, created_at),
  CONSTRAINT fk_points_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16 chat_conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'Percakapan baru',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_conversations_user_updated (user_id, updated_at),
  CONSTRAINT fk_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17 chat_messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  conversation_id BIGINT UNSIGNED NOT NULL,
  role VARCHAR(20) NOT NULL,
  content LONGTEXT NOT NULL,
  media_asset_id BIGINT UNSIGNED NULL,
  rag_metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_messages_conversation_time (conversation_id, created_at),
  KEY idx_messages_media (media_asset_id),
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_media FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18 app_settings
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(100) NOT NULL,
  value_json JSON NOT NULL,
  description VARCHAR(255) NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key),
  KEY idx_settings_updated_by (updated_by),
  CONSTRAINT fk_settings_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19 admin_audit_logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, PRIMARY KEY (id),
  admin_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(100) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_admin_time (admin_user_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_admin FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SHOW TABLES;
