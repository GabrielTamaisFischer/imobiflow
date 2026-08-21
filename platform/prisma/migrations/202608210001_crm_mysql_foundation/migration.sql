-- IF NOT EXISTS makes the migration safely resumable after TiDB's DDL failure recovery.
CREATE TABLE IF NOT EXISTS `crm_pipelines` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `is_default` BOOLEAN NOT NULL DEFAULT false,
  `status` VARCHAR(40) NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crm_pipelines_company_id_name_key` (`company_id`, `name`),
  KEY `crm_pipelines_company_id_is_default_status_idx` (`company_id`, `is_default`, `status`),
  CONSTRAINT `crm_pipelines_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `crm_stages` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `pipeline_id` CHAR(36) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `position` INTEGER NOT NULL,
  `probability` INTEGER NOT NULL DEFAULT 0,
  `color` VARCHAR(32) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crm_stages_pipeline_id_position_key` (`pipeline_id`, `position`),
  UNIQUE KEY `crm_stages_pipeline_id_name_key` (`pipeline_id`, `name`),
  KEY `crm_stages_company_id_pipeline_id_status_position_idx` (`company_id`, `pipeline_id`, `status`, `position`),
  CONSTRAINT `crm_stages_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `crm_stages_pipeline_id_fkey` FOREIGN KEY (`pipeline_id`) REFERENCES `crm_pipelines`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `leads`
  ADD COLUMN `assigned_to` CHAR(36) NULL,
  ADD COLUMN `status` VARCHAR(40) NOT NULL DEFAULT 'open',
  ADD COLUMN `budget_cents` INTEGER NULL,
  ADD COLUMN `last_contact_at` DATETIME(3) NULL,
  ADD COLUMN `next_follow_up_at` DATETIME(3) NULL;

CREATE INDEX `leads_company_id_stage_id_status_created_at_idx`
  ON `leads` (`company_id`, `stage_id`, `status`, `created_at`);

ALTER TABLE `leads`
  ADD CONSTRAINT `leads_stage_id_fkey` FOREIGN KEY (`stage_id`) REFERENCES `crm_stages`(`id`) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS `lead_events` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `payload_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `lead_events_company_id_lead_id_created_at_idx` (`company_id`, `lead_id`, `created_at`),
  CONSTRAINT `lead_events_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  CONSTRAINT `lead_events_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
