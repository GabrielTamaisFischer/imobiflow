-- F5B - domínio canônico de Vistoria em MySQL/Prisma.
-- Aditiva: não altera nem migra as tabelas/objetos Supabase legados.
-- Inspection usa UUID e versionamento do agregado para compatibilidade com a
-- futura fila offline. Arquivos permanecem no StoredFile/provider existente.

CREATE TABLE `inspections` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `property_id` CHAR(36) NOT NULL,
  `assigned_user_id` CHAR(36) NOT NULL,
  `created_by` CHAR(36) NOT NULL,
  `type` VARCHAR(20) NOT NULL DEFAULT 'entry',
  `status` VARCHAR(20) NOT NULL DEFAULT 'draft',
  `notes` TEXT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `completed_at` DATETIME(3) NULL,
  `archived_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `inspections_company_id_status_created_at_idx` (`company_id`, `status`, `created_at`),
  KEY `inspections_company_id_property_id_created_at_idx` (`company_id`, `property_id`, `created_at`),
  KEY `inspections_company_id_assigned_user_id_status_idx` (`company_id`, `assigned_user_id`, `status`),
  CONSTRAINT `inspections_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspections_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `inspections_assigned_user_id_fkey` FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `inspections_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_rooms` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `inspection_id` CHAR(36) NOT NULL,
  `name` VARCHAR(140) NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `inspection_rooms_company_id_inspection_id_position_idx` (`company_id`, `inspection_id`, `position`),
  CONSTRAINT `inspection_rooms_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_rooms_inspection_id_fkey` FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_items` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `room_id` CHAR(36) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `condition` VARCHAR(30) NOT NULL DEFAULT 'not_inspected',
  `position` INT NOT NULL DEFAULT 0,
  `notes` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `inspection_items_company_id_room_id_position_idx` (`company_id`, `room_id`, `position`),
  CONSTRAINT `inspection_items_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_items_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `inspection_rooms`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_evidence` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `inspection_id` CHAR(36) NOT NULL,
  `room_id` CHAR(36) NULL,
  `item_id` CHAR(36) NULL,
  `stored_file_id` CHAR(36) NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `caption` VARCHAR(240) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `inspection_evidence_stored_file_id_key` (`stored_file_id`),
  KEY `inspection_evidence_company_id_inspection_id_position_idx` (`company_id`, `inspection_id`, `position`),
  CONSTRAINT `inspection_evidence_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_evidence_inspection_id_fkey` FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_evidence_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `inspection_rooms`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `inspection_evidence_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `inspection_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `inspection_evidence_stored_file_id_fkey` FOREIGN KEY (`stored_file_id`) REFERENCES `stored_files`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `inspection_events` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `inspection_id` CHAR(36) NOT NULL,
  `actor_id` CHAR(36) NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `inspection_events_company_id_inspection_id_created_at_idx` (`company_id`, `inspection_id`, `created_at`),
  CONSTRAINT `inspection_events_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_events_inspection_id_fkey` FOREIGN KEY (`inspection_id`) REFERENCES `inspections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `inspection_events_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
