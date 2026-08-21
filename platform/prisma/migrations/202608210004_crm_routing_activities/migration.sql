CREATE TABLE `crm_routing_configs` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `mode` VARCHAR(30) NOT NULL DEFAULT 'manual',
  `last_assigned_user_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crm_routing_configs_company_id_key` (`company_id`),
  KEY `crm_routing_configs_last_assigned_user_id_idx` (`last_assigned_user_id`),
  CONSTRAINT `crm_routing_configs_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `crm_routing_configs_last_assigned_user_id_fkey` FOREIGN KEY (`last_assigned_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `crm_routing_members` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `crm_routing_members_company_user_key` (`company_id`, `user_id`),
  UNIQUE KEY `crm_routing_members_company_position_key` (`company_id`, `position`),
  KEY `crm_routing_members_company_active_position_idx` (`company_id`, `active`, `position`),
  CONSTRAINT `crm_routing_members_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `crm_routing_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `lead_activities` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NULL,
  `type` VARCHAR(30) NOT NULL,
  `body` TEXT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `lead_activities_company_lead_occurred_idx` (`company_id`, `lead_id`, `occurred_at`),
  KEY `lead_activities_user_id_idx` (`user_id`),
  CONSTRAINT `lead_activities_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lead_activities_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lead_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `leads` ADD COLUMN `first_contact_at` DATETIME(3) NULL;
CREATE INDEX `leads_company_first_contact_idx` ON `leads` (`company_id`, `status`, `first_contact_at`);
