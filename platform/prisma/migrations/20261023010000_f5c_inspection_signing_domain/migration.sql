-- F5C - domínio NOVO e SEPARADO de Assinatura Online de Vistoria.
-- Aditiva: não altera nenhuma tabela existente, não toca em `inspections`,
-- `Inspection.status` (coluna `status` de `inspections`) permanece
-- inalterada por este domínio. O mecanismo interno/presencial existente
-- (inspection_signature via stored_files.purpose) continua intacto e em
-- paralelo - nada aqui o substitui nem migra seus registros. Legado
-- Supabase (/inspections, /public/inspections) não é referenciado por
-- nenhuma FK deste arquivo.

CREATE TABLE `inspection_signing_processes` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `inspection_id` CHAR(36) NOT NULL,
  `report_stored_file_id` CHAR(36) NOT NULL,
  `document_hash` CHAR(64) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `active_slot` INT NULL,
  `created_by` CHAR(36) NULL,
  `completed_at` DATETIME(3) NULL,
  `cancelled_at` DATETIME(3) NULL,
  `expired_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `insp_signing_proc_company_inspection_report_active_key` (`company_id`, `inspection_id`, `report_stored_file_id`, `active_slot`),
  INDEX `insp_signing_proc_company_inspection_status_idx` (`company_id`, `inspection_id`, `status`),
  CONSTRAINT `inspection_signing_processes_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_signing_processes_inspection_id_fkey` FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `inspection_signing_processes_report_stored_file_id_fkey` FOREIGN KEY (`report_stored_file_id`) REFERENCES `stored_files`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `inspection_signing_processes_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_signing_parties` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `process_id` CHAR(36) NOT NULL,
  `party_id` CHAR(36) NULL,
  `role` VARCHAR(20) NOT NULL,
  `signer_name_snapshot` VARCHAR(180) NOT NULL,
  `signer_document_snapshot` VARCHAR(32) NULL,
  `signer_email_snapshot` VARCHAR(180) NULL,
  `signer_phone_snapshot` VARCHAR(40) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `token_hash` CHAR(64) NULL,
  `token_expires_at` DATETIME(3) NULL,
  `signature_method` VARCHAR(10) NULL,
  `typed_text` VARCHAR(180) NULL,
  `typed_font_id` VARCHAR(40) NULL,
  `signature_stored_file_id` CHAR(36) NULL,
  `consented_at` DATETIME(3) NULL,
  `link_created_at` DATETIME(3) NULL,
  `viewed_at` DATETIME(3) NULL,
  `signed_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `expired_at` DATETIME(3) NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(400) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `insp_signing_parties_token_hash_key` (`token_hash`),
  INDEX `insp_signing_parties_company_process_status_idx` (`company_id`, `process_id`, `status`),
  CONSTRAINT `inspection_signing_parties_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_signing_parties_process_id_fkey` FOREIGN KEY (`process_id`) REFERENCES `inspection_signing_processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_signing_parties_company_id_party_id_fkey` FOREIGN KEY (`company_id`, `party_id`) REFERENCES `parties`(`company_id`, `id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `inspection_signing_parties_signature_stored_file_id_fkey` FOREIGN KEY (`signature_stored_file_id`) REFERENCES `stored_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_signing_events` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `process_id` CHAR(36) NOT NULL,
  `party_id` CHAR(36) NULL,
  `event_type` VARCHAR(40) NOT NULL,
  `metadata_json` JSON NULL,
  `ip_address` VARCHAR(64) NULL,
  `user_agent` VARCHAR(400) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `insp_signing_events_company_process_created_idx` (`company_id`, `process_id`, `created_at`),
  CONSTRAINT `inspection_signing_events_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_signing_events_process_id_fkey` FOREIGN KEY (`process_id`) REFERENCES `inspection_signing_processes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_signing_events_party_id_fkey` FOREIGN KEY (`party_id`) REFERENCES `inspection_signing_parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
