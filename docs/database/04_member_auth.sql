-- Jalankan manual: phpMyAdmin > dewi_sri > SQL > tempel > Go.
-- ALTER TABLE hanya SEKALI, bila keenam kolom belum tersedia. Jangan ulangi schema/seed.
USE dewi_sri;
ALTER TABLE users
  ADD COLUMN username VARCHAR(50) CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  ADD COLUMN phone_number VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN temporary_password_expires_at DATETIME(3) NULL,
  ADD COLUMN password_changed_at DATETIME(3) NULL,
  ADD COLUMN created_by BIGINT UNSIGNED NULL,
  ADD UNIQUE KEY uq_users_username (username),
  ADD UNIQUE KEY uq_users_phone_number (phone_number),
  ADD CONSTRAINT fk_users_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS member_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  KEY idx_member_sessions_user (user_id, revoked_at),
  KEY idx_member_sessions_expiry (expires_at),
  CONSTRAINT fk_member_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
