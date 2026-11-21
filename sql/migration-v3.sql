-- Troc Local V3 : modération des annonces par l'IA
--   mysql -u root -p troc_local < sql/migration-v3.sql
USE troc_local;

ALTER TABLE items
  ADD COLUMN moderation_status ENUM('pending','approved','refused') NOT NULL DEFAULT 'approved',
  ADD COLUMN moderation_reason VARCHAR(300) NULL,
  ADD INDEX idx_items_moderation (moderation_status);
