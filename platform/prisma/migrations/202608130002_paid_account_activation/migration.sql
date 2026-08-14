ALTER TABLE `companies`
  ADD COLUMN `is_synthetic` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `users`
  ADD COLUMN `is_synthetic` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `plans` (
  `id` CHAR(36) NOT NULL,
  `slug` VARCHAR(80) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` VARCHAR(500) NULL,
  `billing_interval` VARCHAR(40) NOT NULL DEFAULT 'monthly',
  `price_cents` INTEGER NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'BRL',
  `features_json` JSON NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `is_synthetic` BOOLEAN NOT NULL DEFAULT false,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `plans_slug_key` (`slug`),
  KEY `plans_active_is_synthetic_price_cents_idx` (`active`, `is_synthetic`, `price_cents`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `plans`
  (`id`, `slug`, `name`, `description`, `billing_interval`, `price_cents`, `currency`, `features_json`, `active`, `is_synthetic`)
VALUES
  (UUID(), 'start-monthly', 'Start', 'Para corretores autonomos e imobiliarias com operacao inicial.', 'monthly', 7900, 'BRL', JSON_ARRAY('Cadastro de imoveis e clientes', 'CRM basico e agenda', 'Upload de fotos'), true, false),
  (UUID(), 'pro-monthly', 'Pro', 'Para imobiliarias que precisam de automacao e equipe.', 'monthly', 19700, 'BRL', JSON_ARRAY('Tudo do Start', 'Vistoria inteligente', 'Multiusuario e analytics'), true, false),
  (UUID(), 'enterprise-monthly', 'Enterprise AI', 'Para operacoes estruturadas e multifilial.', 'monthly', 49700, 'BRL', JSON_ARRAY('Tudo do Pro', 'Financeiro avancado', 'White label e auditoria'), true, false);

ALTER TABLE `subscriptions`
  ADD COLUMN `plan_id` CHAR(36) NULL,
  ADD COLUMN `billing_provider` VARCHAR(60) NULL,
  ADD COLUMN `external_subscription_id` VARCHAR(180) NULL,
  ADD COLUMN `current_period_start` DATETIME(3) NULL,
  ADD COLUMN `current_period_end` DATETIME(3) NULL,
  ADD COLUMN `grace_ends_at` DATETIME(3) NULL,
  ADD COLUMN `cancelled_at` DATETIME(3) NULL,
  ADD COLUMN `is_synthetic` BOOLEAN NOT NULL DEFAULT false,
  MODIFY `status` VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  ADD KEY `subscriptions_plan_id_status_idx` (`plan_id`, `status`),
  ADD UNIQUE KEY `subscriptions_billing_provider_external_subscription_id_key` (`billing_provider`, `external_subscription_id`),
  ADD CONSTRAINT `subscriptions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE `subscriptions` AS `s`
INNER JOIN `plans` AS `p` ON `p`.`slug` = `s`.`plan_slug`
SET `s`.`plan_id` = `p`.`id`
WHERE `s`.`plan_id` IS NULL;

CREATE TABLE `checkout_sessions` (
  `id` CHAR(36) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(60) NOT NULL,
  `external_session_id` VARCHAR(180) NULL,
  `external_subscription_id` VARCHAR(180) NULL,
  `purchaser_email` VARCHAR(180) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  `amount_cents` INTEGER NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'BRL',
  `checkout_url` VARCHAR(1200) NULL,
  `expires_at` DATETIME(3) NULL,
  `confirmed_at` DATETIME(3) NULL,
  `is_synthetic` BOOLEAN NOT NULL DEFAULT false,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `checkout_sessions_provider_external_session_id_key` (`provider`, `external_session_id`),
  KEY `checkout_sessions_purchaser_email_status_created_at_idx` (`purchaser_email`, `status`, `created_at`),
  KEY `checkout_sessions_plan_id_status_idx` (`plan_id`, `status`),
  CONSTRAINT `checkout_sessions_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `payment_events` (
  `id` CHAR(36) NOT NULL,
  `checkout_session_id` CHAR(36) NOT NULL,
  `provider` VARCHAR(60) NOT NULL,
  `external_event_id` VARCHAR(180) NOT NULL,
  `event_type` VARCHAR(100) NOT NULL,
  `status` VARCHAR(40) NOT NULL,
  `amount_cents` INTEGER NULL,
  `currency` CHAR(3) NULL,
  `payload_hash` CHAR(64) NOT NULL,
  `occurred_at` DATETIME(3) NOT NULL,
  `processed_at` DATETIME(3) NULL,
  `is_synthetic` BOOLEAN NOT NULL DEFAULT false,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `payment_events_provider_external_event_id_key` (`provider`, `external_event_id`),
  KEY `payment_events_checkout_session_id_status_idx` (`checkout_session_id`, `status`),
  CONSTRAINT `payment_events_checkout_session_id_fkey` FOREIGN KEY (`checkout_session_id`) REFERENCES `checkout_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `account_provisionings` (
  `id` CHAR(36) NOT NULL,
  `checkout_session_id` CHAR(36) NOT NULL,
  `plan_id` CHAR(36) NOT NULL,
  `purchaser_email` VARCHAR(180) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `status` VARCHAR(40) NOT NULL DEFAULT 'READY',
  `expires_at` DATETIME(3) NOT NULL,
  `activated_at` DATETIME(3) NULL,
  `company_id` CHAR(36) NULL,
  `owner_user_id` CHAR(36) NULL,
  `subscription_id` CHAR(36) NULL,
  `is_synthetic` BOOLEAN NOT NULL DEFAULT false,
  `metadata_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_provisionings_checkout_session_id_key` (`checkout_session_id`),
  UNIQUE KEY `account_provisionings_token_hash_key` (`token_hash`),
  UNIQUE KEY `account_provisionings_company_id_key` (`company_id`),
  UNIQUE KEY `account_provisionings_owner_user_id_key` (`owner_user_id`),
  UNIQUE KEY `account_provisionings_subscription_id_key` (`subscription_id`),
  KEY `account_provisionings_purchaser_email_status_expires_at_idx` (`purchaser_email`, `status`, `expires_at`),
  CONSTRAINT `account_provisionings_checkout_session_id_fkey` FOREIGN KEY (`checkout_session_id`) REFERENCES `checkout_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `account_provisionings_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `account_provisionings_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `account_provisionings_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `account_provisionings_subscription_id_fkey` FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
