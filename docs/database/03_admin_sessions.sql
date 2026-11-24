-- Supplement to the original 19 tables. Run manually in phpMyAdmin > dewi_sri > SQL.
-- No application startup or CLI command executes this script.
USE dewi_sri;
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  KEY idx_admin_sessions_user (user_id, revoked_at),
  KEY idx_admin_sessions_expiry (expires_at),
  CONSTRAINT fk_admin_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
