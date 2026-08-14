CREATE TABLE `permissions` (
  `id` CHAR(36) NOT NULL,
  `key` VARCHAR(120) NOT NULL,
  `description` VARCHAR(240) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `permissions_key_key` (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `roles` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `system_key` VARCHAR(60) NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `roles_company_id_name_key` (`company_id`, `name`),
  UNIQUE KEY `roles_company_id_system_key_key` (`company_id`, `system_key`),
  KEY `roles_company_id_is_system_idx` (`company_id`, `is_system`),
  CONSTRAINT `roles_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Dono', 'owner', true FROM `companies`;
INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Administrador', 'admin', true FROM `companies`;
INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Gerente', 'manager', true FROM `companies`;
INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Corretor', 'broker', true FROM `companies`;
INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Atendente', 'assistant', true FROM `companies`;
INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Somente leitura', 'read_only', true FROM `companies`;
INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Financeiro', 'financial', true FROM `companies`;
INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Vistoriador', 'inspector', true FROM `companies`;
INSERT INTO `roles` (`id`, `company_id`, `name`, `system_key`, `is_system`)
SELECT UUID(), `id`, 'Jurídico/Contratos', 'legal', true FROM `companies`;

UPDATE `users` AS `u`
INNER JOIN `roles` AS `r`
  ON `r`.`company_id` = `u`.`company_id`
 AND `r`.`system_key` = `u`.`role`
SET `u`.`role_id` = `r`.`id`;

UPDATE `users` AS `u`
INNER JOIN `roles` AS `r`
  ON `r`.`company_id` = `u`.`company_id`
 AND `r`.`system_key` = 'broker'
SET `u`.`role_id` = `r`.`id`
WHERE `u`.`role_id` IS NULL;

ALTER TABLE `users`
  ADD COLUMN `password_changed_at` DATETIME(3) NULL,
  ADD COLUMN `last_login_at` DATETIME(3) NULL,
  ADD COLUMN `failed_login_attempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `locked_until` DATETIME(3) NULL,
  ADD UNIQUE KEY `users_email_key` (`email`),
  ADD KEY `users_company_id_status_idx` (`company_id`, `status`),
  MODIFY `role_id` CHAR(36) NOT NULL,
  ADD CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE `role_permissions` (
  `role_id` CHAR(36) NOT NULL,
  `permission_id` CHAR(36) NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  KEY `role_permissions_permission_id_idx` (`permission_id`),
  CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_invitations` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `role_id` CHAR(36) NOT NULL,
  `invited_by` CHAR(36) NULL,
  `email` VARCHAR(180) NOT NULL,
  `name` VARCHAR(160) NULL,
  `token_hash` CHAR(64) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'pending',
  `expires_at` DATETIME(3) NOT NULL,
  `accepted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_invitations_token_hash_key` (`token_hash`),
  KEY `user_invitations_company_id_status_created_at_idx` (`company_id`, `status`, `created_at`),
  KEY `user_invitations_email_status_idx` (`email`, `status`),
  CONSTRAINT `user_invitations_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_invitations_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_invitations_invited_by_fkey` FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `auth_sessions` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `access_token_jti` CHAR(36) NOT NULL,
  `refresh_token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  `last_used_at` DATETIME(3) NULL,
  `ip_address` VARCHAR(80) NULL,
  `user_agent` VARCHAR(300) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_sessions_access_token_jti_key` (`access_token_jti`),
  UNIQUE KEY `auth_sessions_refresh_token_hash_key` (`refresh_token_hash`),
  KEY `auth_sessions_company_id_user_id_revoked_at_idx` (`company_id`, `user_id`, `revoked_at`),
  KEY `auth_sessions_expires_at_idx` (`expires_at`),
  CONSTRAINT `auth_sessions_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `password_reset_tokens` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_reset_tokens_token_hash_key` (`token_hash`),
  KEY `password_reset_tokens_company_id_user_id_used_at_idx` (`company_id`, `user_id`, `used_at`),
  KEY `password_reset_tokens_expires_at_idx` (`expires_at`),
  CONSTRAINT `password_reset_tokens_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `auth_audit_logs` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `actor_user_id` CHAR(36) NULL,
  `action` VARCHAR(120) NOT NULL,
  `entity_type` VARCHAR(80) NOT NULL,
  `entity_id` CHAR(36) NULL,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `auth_audit_logs_company_id_created_at_idx` (`company_id`, `created_at`),
  KEY `auth_audit_logs_company_id_entity_type_entity_id_idx` (`company_id`, `entity_type`, `entity_id`),
  CONSTRAINT `auth_audit_logs_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `auth_audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
