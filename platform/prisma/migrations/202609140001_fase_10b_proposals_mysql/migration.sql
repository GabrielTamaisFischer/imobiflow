CREATE TABLE `proposals_mysql` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `property_id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `created_by` CHAR(36) NULL,
  `amount` DECIMAL(15,2) NOT NULL,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'BRL',
  `status` VARCHAR(30) NOT NULL DEFAULT 'draft',
  `terms_public` TEXT NULL,
  `internal_notes` TEXT NULL,
  `expires_at` DATETIME(3) NULL,
  `version` INT NOT NULL DEFAULT 1,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `proposals_company_status_created_idx` (`company_id`, `status`, `created_at`),
  INDEX `proposals_company_property_status_idx` (`company_id`, `property_id`, `status`),
  INDEX `proposals_company_lead_status_idx` (`company_id`, `lead_id`, `status`),
  CONSTRAINT `proposals_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `proposals_property_fk` FOREIGN KEY (`property_id`) REFERENCES `properties` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `proposals_lead_fk` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `proposals_created_by_fk` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `proposal_events_mysql` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `proposal_id` CHAR(36) NOT NULL,
  `actor_id` CHAR(36) NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `proposal_events_company_proposal_created_idx` (`company_id`, `proposal_id`, `created_at`),
  CONSTRAINT `proposal_events_company_fk` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `proposal_events_proposal_fk` FOREIGN KEY (`proposal_id`) REFERENCES `proposals_mysql` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `proposal_events_actor_fk` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO `permissions` (`id`, `key`, `description`, `created_at`, `updated_at`)
VALUES
  (UUID(), 'proposals.view', 'Visualizar propostas', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
  (UUID(), 'proposals.manage', 'Gerenciar propostas', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `scope`)
SELECT r.`id`, p.`id`, CASE WHEN r.`system_key` = 'broker' THEN 'shared' ELSE 'company' END
FROM `roles` r
JOIN `permissions` p ON p.`key` IN ('proposals.view', 'proposals.manage')
WHERE r.`system_key` IN ('owner', 'admin', 'manager', 'broker');
