-- CreateTable
CREATE TABLE `agenda_user_preferences` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `locale` VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    `country` VARCHAR(2) NOT NULL DEFAULT 'BR',
    `date_format` VARCHAR(3) NOT NULL DEFAULT 'DMY',
    `time_format` VARCHAR(3) NOT NULL DEFAULT '24h',
    `week_start` INT NOT NULL DEFAULT 1,
    `timezone` VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    `secondary_timezone` VARCHAR(60) NULL,
    `show_world_clock` BOOLEAN NOT NULL DEFAULT false,
    `default_event_duration_minutes` INT NOT NULL DEFAULT 60,
    `shorten_meetings` BOOLEAN NOT NULL DEFAULT false,
    `notify_enabled` BOOLEAN NOT NULL DEFAULT true,
    `notify_default_lead_minutes` INT NOT NULL DEFAULT 15,
    `notify_sound` BOOLEAN NOT NULL DEFAULT false,
    `notify_only_confirmed` BOOLEAN NOT NULL DEFAULT false,
    `notify_tasks_enabled` BOOLEAN NOT NULL DEFAULT true,
    `show_weekends` BOOLEAN NOT NULL DEFAULT true,
    `show_cancelled` BOOLEAN NOT NULL DEFAULT false,
    `show_completed_tasks` BOOLEAN NOT NULL DEFAULT true,
    `show_week_numbers` BOOLEAN NOT NULL DEFAULT false,
    `compact_short_events` BOOLEAN NOT NULL DEFAULT false,
    `dim_past_events` BOOLEAN NOT NULL DEFAULT true,
    `show_brokers_side_by_side` BOOLEAN NOT NULL DEFAULT false,
    `custom_view_days` INT NULL,
    `default_visibility` VARCHAR(20) NOT NULL DEFAULT 'shared',
    `keyboard_shortcuts_enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agenda_user_preferences_company_id_user_id_key`(`company_id`, `user_id`),
    INDEX `agenda_user_preferences_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `agenda_company_settings` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `default_timezone` VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    `guests_can_modify_max` BOOLEAN NOT NULL DEFAULT false,
    `guests_can_invite_max` BOOLEAN NOT NULL DEFAULT false,
    `guests_can_see_guest_list_max` BOOLEAN NOT NULL DEFAULT true,
    `default_visibility` VARCHAR(20) NOT NULL DEFAULT 'shared',
    `notify_channel_system_enabled` BOOLEAN NOT NULL DEFAULT true,
    `notify_channel_email_enabled` BOOLEAN NOT NULL DEFAULT false,
    `notify_channel_whatsapp_enabled` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `agenda_company_settings_company_id_key`(`company_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Additive support index for the tenant-scoped composite user foreign key.
CREATE UNIQUE INDEX `users_company_id_id_key` ON `users`(`company_id`, `id`);

-- AddForeignKey
ALTER TABLE `agenda_user_preferences`
    ADD CONSTRAINT `agenda_user_preferences_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agenda_user_preferences`
    ADD CONSTRAINT `agenda_user_preferences_company_id_user_id_fkey`
    FOREIGN KEY (`company_id`, `user_id`) REFERENCES `users`(`company_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agenda_company_settings`
    ADD CONSTRAINT `agenda_company_settings_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
