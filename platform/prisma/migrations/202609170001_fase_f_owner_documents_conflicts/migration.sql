-- Fase F Owner Intelligence 360. Additive-only metadata and conflict history.
-- No existing rows are deleted or rewritten.
ALTER TABLE `owner_document_records`
  ADD COLUMN `title` VARCHAR(240) NULL,
  ADD COLUMN `source` VARCHAR(80) NULL,
  ADD COLUMN `provider` VARCHAR(100) NULL,
  ADD COLUMN `issued_at` DATETIME(3) NULL,
  ADD COLUMN `document_number` VARCHAR(120) NULL,
  ADD COLUMN `linked_domain` VARCHAR(40) NULL,
  ADD COLUMN `provenance` VARCHAR(40) NULL,
  ADD COLUMN `confidence` VARCHAR(20) NULL,
  ADD COLUMN `content_hash` VARCHAR(128) NULL,
  ADD COLUMN `metadata_json` JSON NULL;

-- TiDB resolves newly-added columns conservatively when an index is declared
-- in the same ALTER statement, so keep the additive index in its own step.
ALTER TABLE `owner_document_records`
  ADD INDEX `owner_document_records_company_owner_domain_status_idx` (`company_id`, `owner_id`, `linked_domain`, `status`);

CREATE TABLE `owner_conflicts` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `owner_id` CHAR(36) NOT NULL,
  `domain` VARCHAR(40) NOT NULL,
  `field` VARCHAR(100) NOT NULL,
  `values_json` JSON NOT NULL,
  `sources_json` JSON NOT NULL,
  `canonical_value_json` JSON NULL,
  `canonical_source` VARCHAR(80) NULL,
  `status` VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  `detected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `resolved_at` DATETIME(3) NULL,
  `resolved_by` CHAR(36) NULL,
  `resolution_note` VARCHAR(1000) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `owner_conflicts_company_owner_status_idx` (`company_id`, `owner_id`, `status`),
  KEY `owner_conflicts_company_owner_domain_field_idx` (`company_id`, `owner_id`, `domain`, `field`),
  KEY `owner_conflicts_company_detected_idx` (`company_id`, `detected_at`),
  CONSTRAINT `owner_conflicts_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `owner_conflicts_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `property_owners` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `owner_conflicts_resolved_by_fkey` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
