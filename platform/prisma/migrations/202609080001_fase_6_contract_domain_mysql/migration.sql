-- F6A - contrato canônico MySQL/Prisma.
-- Aditiva e tenant-scoped; o módulo Supabase legado permanece separado.

CREATE TABLE `contracts_mysql` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `property_id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NULL,
  `created_by` CHAR(36) NULL,
  `title` VARCHAR(240) NOT NULL,
  `contract_type` VARCHAR(40) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
  `starts_at` DATETIME(3) NULL,
  `ends_at` DATETIME(3) NULL,
  `total_amount_cents` INT NULL,
  `monthly_amount_cents` INT NULL,
  `deposit_cents` INT NULL,
  `notes` TEXT NULL,
  `current_version` INT NOT NULL DEFAULT 0,
  `signed_version` INT NULL,
  `metadata_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `contracts_mysql_company_id_status_created_at_idx` (`company_id`, `status`, `created_at`),
  KEY `contracts_mysql_company_id_property_id_status_idx` (`company_id`, `property_id`, `status`),
  KEY `contracts_mysql_company_id_contract_type_created_at_idx` (`company_id`, `contract_type`, `created_at`),
  CONSTRAINT `contracts_mysql_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `contracts_mysql_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `contracts_mysql_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `contracts_mysql_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `contract_parties_mysql` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `contract_id` CHAR(36) NOT NULL,
  `party_type` VARCHAR(40) NOT NULL,
  `name` VARCHAR(180) NOT NULL,
  `document` VARCHAR(40) NULL,
  `email` VARCHAR(180) NULL,
  `phone` VARCHAR(40) NULL,
  `signature_required` BOOLEAN NOT NULL DEFAULT true,
  `signature_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `signed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `contract_parties_mysql_company_id_contract_id_idx` (`company_id`, `contract_id`),
  KEY `contract_parties_mysql_company_id_party_type_idx` (`company_id`, `party_type`),
  CONSTRAINT `contract_parties_mysql_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `contract_parties_mysql_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts_mysql`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `contract_versions_mysql` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `contract_id` CHAR(36) NOT NULL,
  `version_number` INT NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'draft',
  `snapshot_json` JSON NOT NULL,
  `document_file_id` CHAR(36) NULL,
  `document_hash` CHAR(64) NULL,
  `generated_at` DATETIME(3) NULL,
  `signed_at` DATETIME(3) NULL,
  `created_by` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `contract_versions_mysql_contract_id_version_number_key` (`contract_id`, `version_number`),
  KEY `contract_versions_mysql_company_id_contract_id_status_idx` (`company_id`, `contract_id`, `status`),
  CONSTRAINT `contract_versions_mysql_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `contract_versions_mysql_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts_mysql`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `contract_versions_mysql_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `contract_events_mysql` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `contract_id` CHAR(36) NOT NULL,
  `version_id` CHAR(36) NULL,
  `actor_user_id` CHAR(36) NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `payload_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `contract_events_mysql_company_id_contract_id_created_at_idx` (`company_id`, `contract_id`, `created_at`),
  KEY `contract_events_mysql_company_id_event_type_created_at_idx` (`company_id`, `event_type`, `created_at`),
  CONSTRAINT `contract_events_mysql_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `contract_events_mysql_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts_mysql`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `contract_events_mysql_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
