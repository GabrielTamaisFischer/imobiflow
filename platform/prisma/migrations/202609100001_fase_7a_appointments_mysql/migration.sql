-- F7A: evolucao aditiva do agendamento legado para o dominio MySQL canonico.
-- As colunas sao nullable para preservar linhas legadas criadas antes da
-- API canonica; o endpoint /real-estate/appointments exige os tres vinculos.
ALTER TABLE `appointments` ADD COLUMN `lead_id` CHAR(36) NULL;
ALTER TABLE `appointments` ADD COLUMN `assigned_to` CHAR(36) NULL;
ALTER TABLE `appointments` ADD COLUMN `version` INT NOT NULL DEFAULT 1;

CREATE INDEX `appointments_company_id_lead_id_idx`
  ON `appointments` (`company_id`, `lead_id`);
CREATE INDEX `appointments_company_id_assigned_to_starts_at_idx`
  ON `appointments` (`company_id`, `assigned_to`, `starts_at`);

ALTER TABLE `appointments`
  ADD CONSTRAINT `appointments_lead_id_fkey`
  FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `appointments`
  ADD CONSTRAINT `appointments_assigned_to_fkey`
  FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `appointment_events` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `appointment_id` CHAR(36) NOT NULL,
  `actor_id` CHAR(36) NULL,
  `event_type` VARCHAR(80) NOT NULL,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `appointment_events_company_id_appointment_id_created_at_idx`
    (`company_id`, `appointment_id`, `created_at`),
  CONSTRAINT `appointment_events_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `appointment_events_appointment_id_fkey`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `appointment_events_actor_id_fkey`
    FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Existing Broker role permissions are reconciled to resource scope without
-- touching non-Broker roles or custom own/shared scopes.
UPDATE `role_permissions` rp
INNER JOIN `roles` r ON r.`id` = rp.`role_id`
INNER JOIN `permissions` p ON p.`id` = rp.`permission_id`
SET rp.`scope` = 'shared'
WHERE r.`system_key` = 'broker'
  AND rp.`scope` = 'company'
  AND p.`key` IN ('appointments.view', 'appointments.manage');
