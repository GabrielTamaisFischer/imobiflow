ALTER TABLE `properties`
  ADD COLUMN `import_source` VARCHAR(80) NULL,
  ADD COLUMN `import_external_id` VARCHAR(180) NULL,
  ADD COLUMN `import_job_id` CHAR(36) NULL,
  ADD COLUMN `imported_at` DATETIME(3) NULL;

ALTER TABLE `stored_files`
  ADD COLUMN `source_url` VARCHAR(1200) NULL,
  ADD COLUMN `import_job_id` CHAR(36) NULL,
  ADD COLUMN `import_source` VARCHAR(80) NULL,
  ADD COLUMN `metadata_json` JSON NULL;

CREATE TABLE `import_jobs` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `created_by` CHAR(36) NULL,
  `import_type` VARCHAR(40) NOT NULL DEFAULT 'owners_properties',
  `source_type` VARCHAR(40) NOT NULL,
  `source_name` VARCHAR(240) NOT NULL,
  `mode` VARCHAR(20) NOT NULL DEFAULT 'test',
  `status` VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  `total_rows` INTEGER NOT NULL DEFAULT 0,
  `processed_rows` INTEGER NOT NULL DEFAULT 0,
  `imported_rows` INTEGER NOT NULL DEFAULT 0,
  `updated_rows` INTEGER NOT NULL DEFAULT 0,
  `skipped_rows` INTEGER NOT NULL DEFAULT 0,
  `duplicate_rows` INTEGER NOT NULL DEFAULT 0,
  `failed_rows` INTEGER NOT NULL DEFAULT 0,
  `imported_photos` INTEGER NOT NULL DEFAULT 0,
  `failed_photos` INTEGER NOT NULL DEFAULT 0,
  `batch_size` INTEGER NOT NULL DEFAULT 25,
  `next_cursor` INTEGER NOT NULL DEFAULT 1,
  `confirm_full_import` BOOLEAN NOT NULL DEFAULT false,
  `mapping_json` JSON NOT NULL,
  `metadata_json` JSON NOT NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `last_error` TEXT NULL,
  `lock_token` CHAR(36) NULL,
  `lock_expires_at` DATETIME(3) NULL,
  `rolled_back_at` DATETIME(3) NULL,
  `rollback_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `import_jobs_company_status_created_idx` (`company_id`, `status`, `created_at`),
  INDEX `import_jobs_company_updated_idx` (`company_id`, `updated_at`),
  CONSTRAINT `import_jobs_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `import_rows` (
  `id` CHAR(36) NOT NULL,
  `import_job_id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `row_number` INTEGER NOT NULL,
  `external_id` VARCHAR(180) NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  `action` VARCHAR(40) NULL,
  `property_id` CHAR(36) NULL,
  `owner_id` CHAR(36) NULL,
  `error_code` VARCHAR(100) NULL,
  `error_message` TEXT NULL,
  `source_payload_json` JSON NOT NULL,
  `mapped_data_json` JSON NOT NULL,
  `processed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `import_rows_job_row_key` (`import_job_id`, `row_number`),
  INDEX `import_rows_company_job_status_row_idx` (`company_id`, `import_job_id`, `status`, `row_number`),
  INDEX `import_rows_company_external_idx` (`company_id`, `external_id`),
  CONSTRAINT `import_rows_job_fk` FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `import_rows_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  CONSTRAINT `import_rows_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE SET NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `properties_company_import_external_idx`
  ON `properties` (`company_id`, `import_source`, `import_external_id`);
CREATE INDEX `properties_company_import_job_idx`
  ON `properties` (`company_id`, `import_job_id`);
CREATE INDEX `stored_files_company_import_job_idx`
  ON `stored_files` (`company_id`, `import_job_id`);

ALTER TABLE `properties`
  ADD CONSTRAINT `properties_import_job_fk` FOREIGN KEY (`import_job_id`) REFERENCES `import_jobs` (`id`) ON DELETE SET NULL;
