-- Apply ONCE manually in phpMyAdmin after 04_member_auth.sql.
-- Adds durable client request deduplication and recoverable generation leases.
-- No tables, credentials, existing conversations, or seed data are replaced.
USE dewi_sri;
ALTER TABLE chat_conversations
  ADD COLUMN client_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD UNIQUE KEY uq_conversation_client (user_id, client_request_id);
ALTER TABLE chat_messages
  ADD COLUMN client_request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN request_state VARCHAR(16) NULL,
  ADD COLUMN lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN lease_expires_at DATETIME(3) NULL,
  ADD UNIQUE KEY uq_message_client_role (conversation_id, role, client_request_id),
  ADD KEY idx_message_pending (conversation_id, request_state, lease_expires_at);
