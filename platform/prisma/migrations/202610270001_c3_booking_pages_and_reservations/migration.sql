-- CreateTable
CREATE TABLE `booking_pages` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `owner_user_id` CHAR(36) NOT NULL,
    `property_id` CHAR(36) NULL,
    `title` VARCHAR(180) NOT NULL,
    `description` TEXT NULL,
    `service_type` VARCHAR(60) NOT NULL DEFAULT 'visit',
    `location_text` VARCHAR(240) NULL,
    `color` VARCHAR(20) NULL,
    `duration_minutes` INT NOT NULL DEFAULT 60,
    `buffer_minutes` INT NOT NULL DEFAULT 30,
    `min_notice_minutes` INT NOT NULL DEFAULT 240,
    `max_advance_days` INT NOT NULL DEFAULT 60,
    `max_bookings_per_day` INT NULL,
    `timezone` VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    `availability_starts_at` DATETIME(3) NULL,
    `availability_ends_at` DATETIME(3) NULL,
    `guests_can_invite` BOOLEAN NOT NULL DEFAULT false,
    `guests_can_see_guest_list` BOOLEAN NOT NULL DEFAULT true,
    `status` VARCHAR(20) NOT NULL DEFAULT 'active',
    `version` INT NOT NULL DEFAULT 1,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `booking_pages_company_id_owner_user_id_status_idx`(`company_id`, `owner_user_id`, `status`),
    INDEX `booking_pages_company_id_status_idx`(`company_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_weekly_availability` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `booking_page_id` CHAR(36) NOT NULL,
    `weekday` INT NOT NULL,
    `start_minute` INT NOT NULL,
    `end_minute` INT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `booking_weekly_availability_company_id_booking_page_id_weekday_idx`(`company_id`, `booking_page_id`, `weekday`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_availability_exceptions` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `booking_page_id` CHAR(36) NOT NULL,
    `date` DATE NOT NULL,
    `is_available` BOOLEAN NOT NULL,
    `start_minute` INT NULL,
    `end_minute` INT NULL,
    `reason` VARCHAR(160) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `booking_availability_exceptions_company_id_booking_page_id_date_idx`(`company_id`, `booking_page_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bookings` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `booking_page_id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NOT NULL,
    `booked_by_user_id` CHAR(36) NULL,
    `party_id` CHAR(36) NULL,
    `version` INT NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bookings_appointment_id_key`(`appointment_id`),
    INDEX `bookings_company_id_booking_page_id_created_at_idx`(`company_id`, `booking_page_id`, `created_at`),
    INDEX `bookings_company_id_party_id_idx`(`company_id`, `party_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `appointment_guests` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `appointment_id` CHAR(36) NOT NULL,
    `party_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `email` VARCHAR(180) NULL,
    `name` VARCHAR(160) NULL,
    `role` VARCHAR(20) NOT NULL DEFAULT 'guest',
    `response_status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `can_modify` BOOLEAN NOT NULL DEFAULT false,
    `can_invite` BOOLEAN NOT NULL DEFAULT false,
    `responded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `appointment_guests_company_id_appointment_id_idx`(`company_id`, `appointment_id`),
    INDEX `appointment_guests_company_id_party_id_idx`(`company_id`, `party_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `booking_pages`
    ADD CONSTRAINT `booking_pages_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `booking_pages`
    ADD CONSTRAINT `booking_pages_owner_user_id_fkey`
    FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `booking_pages`
    ADD CONSTRAINT `booking_pages_property_id_fkey`
    FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `booking_pages`
    ADD CONSTRAINT `booking_pages_created_by_fkey`
    FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_weekly_availability`
    ADD CONSTRAINT `booking_weekly_availability_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `booking_weekly_availability`
    ADD CONSTRAINT `booking_weekly_availability_booking_page_id_fkey`
    FOREIGN KEY (`booking_page_id`) REFERENCES `booking_pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_availability_exceptions`
    ADD CONSTRAINT `booking_availability_exceptions_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `booking_availability_exceptions`
    ADD CONSTRAINT `booking_availability_exceptions_booking_page_id_fkey`
    FOREIGN KEY (`booking_page_id`) REFERENCES `booking_pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `bookings`
    ADD CONSTRAINT `bookings_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `bookings`
    ADD CONSTRAINT `bookings_booking_page_id_fkey`
    FOREIGN KEY (`booking_page_id`) REFERENCES `booking_pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `bookings`
    ADD CONSTRAINT `bookings_appointment_id_fkey`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `bookings`
    ADD CONSTRAINT `bookings_booked_by_user_id_fkey`
    FOREIGN KEY (`booked_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `bookings`
    ADD CONSTRAINT `bookings_party_id_fkey`
    FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `appointment_guests`
    ADD CONSTRAINT `appointment_guests_company_id_fkey`
    FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `appointment_guests`
    ADD CONSTRAINT `appointment_guests_appointment_id_fkey`
    FOREIGN KEY (`appointment_id`) REFERENCES `appointments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `appointment_guests`
    ADD CONSTRAINT `appointment_guests_party_id_fkey`
    FOREIGN KEY (`party_id`) REFERENCES `parties`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `appointment_guests`
    ADD CONSTRAINT `appointment_guests_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
