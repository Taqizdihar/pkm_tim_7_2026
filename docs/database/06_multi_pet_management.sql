-- Apply ONCE manually: phpMyAdmin > dewi_sri > SQL > paste > Go.
-- Additive only. Do not rerun schema/seed. Existing IDs, metrics and history stay intact.
-- Existing ownership confirmations deliberately remain NULL for member review.
USE dewi_sri;
ALTER TABLE user_cultivations
  ADD COLUMN pet_mode VARCHAR(20) NOT NULL DEFAULT 'individual',
  ADD COLUMN quantity INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN location_label VARCHAR(160) NULL,
  ADD COLUMN ownership_confirmed_at DATETIME(3) NULL,
  ADD COLUMN archived_at DATETIME(3) NULL,
  ADD COLUMN archive_reason VARCHAR(50) NULL,
  ADD COLUMN create_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN create_request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uq_uc_create_request (user_id,create_request_id),
  ADD CONSTRAINT chk_uc_mode_quantity CHECK (
    (pet_mode='individual' AND quantity=1) OR (pet_mode='group' AND quantity>=1)
  );
ALTER TABLE care_logs
  ADD COLUMN batch_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN pet_name_at_care VARCHAR(120) NULL,
  ADD COLUMN quantity_at_care INT UNSIGNED NULL,
  ADD KEY idx_care_logs_batch (batch_id);
