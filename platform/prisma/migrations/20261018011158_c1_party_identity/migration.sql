-- AlterTable
ALTER TABLE `property_owners` ADD COLUMN `party_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `contract_parties_mysql` ADD COLUMN `source_party_id` CHAR(36) NULL;

-- CreateTable
CREATE TABLE `parties` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `party_type` VARCHAR(20) NOT NULL DEFAULT 'individual',
    `name` VARCHAR(180) NOT NULL,
    `tax_id` VARCHAR(40) NULL,
    `tax_id_normalized` VARCHAR(20) NULL,
    `email` VARCHAR(180) NULL,
    `phone` VARCHAR(40) NULL,
    `whatsapp` VARCHAR(40) NULL,
    `address_json` JSON NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'active',
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `parties_company_id_status_idx`(`company_id`, `status`),
    UNIQUE INDEX `parties_company_id_id_key`(`company_id`, `id`),
    UNIQUE INDEX `parties_company_id_tax_id_normalized_key`(`company_id`, `tax_id_normalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `party_roles` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `party_id` CHAR(36) NOT NULL,
    `role` VARCHAR(30) NOT NULL,
    `status` VARCHAR(40) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `party_roles_company_id_role_idx`(`company_id`, `role`),
    UNIQUE INDEX `party_roles_company_id_id_key`(`company_id`, `id`),
    UNIQUE INDEX `party_roles_company_id_party_id_role_key`(`company_id`, `party_id`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `buyer_profiles` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `party_role_id` CHAR(36) NOT NULL,
    `interest_json` JSON NULL,
    `financial_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `buyer_profiles_company_id_party_role_id_key`(`company_id`, `party_role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tenant_profiles` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `party_role_id` CHAR(36) NOT NULL,
    `rental_json` JSON NULL,
    `guarantor_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenant_profiles_company_id_party_role_id_key`(`company_id`, `party_role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `broker_profiles` (
    `id` CHAR(36) NOT NULL,
    `company_id` CHAR(36) NOT NULL,
    `party_role_id` CHAR(36) NOT NULL,
    `creci_number` VARCHAR(40) NULL,
    `bio_text` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `broker_profiles_company_id_party_role_id_key`(`company_id`, `party_role_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `property_owners_company_id_party_id_idx` ON `property_owners`(`company_id`, `party_id`);

-- CreateIndex
CREATE INDEX `contract_parties_mysql_company_id_source_party_id_idx` ON `contract_parties_mysql`(`company_id`, `source_party_id`);

-- AddForeignKey
ALTER TABLE `property_owners` ADD CONSTRAINT `property_owners_company_id_party_id_fkey` FOREIGN KEY (`company_id`, `party_id`) REFERENCES `parties`(`company_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parties` ADD CONSTRAINT `parties_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `party_roles` ADD CONSTRAINT `party_roles_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `party_roles` ADD CONSTRAINT `party_roles_company_id_party_id_fkey` FOREIGN KEY (`company_id`, `party_id`) REFERENCES `parties`(`company_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `buyer_profiles` ADD CONSTRAINT `buyer_profiles_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `buyer_profiles` ADD CONSTRAINT `buyer_profiles_company_id_party_role_id_fkey` FOREIGN KEY (`company_id`, `party_role_id`) REFERENCES `party_roles`(`company_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_profiles` ADD CONSTRAINT `tenant_profiles_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenant_profiles` ADD CONSTRAINT `tenant_profiles_company_id_party_role_id_fkey` FOREIGN KEY (`company_id`, `party_role_id`) REFERENCES `party_roles`(`company_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broker_profiles` ADD CONSTRAINT `broker_profiles_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broker_profiles` ADD CONSTRAINT `broker_profiles_company_id_party_role_id_fkey` FOREIGN KEY (`company_id`, `party_role_id`) REFERENCES `party_roles`(`company_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_parties_mysql` ADD CONSTRAINT `contract_parties_mysql_company_id_source_party_id_fkey` FOREIGN KEY (`company_id`, `source_party_id`) REFERENCES `parties`(`company_id`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;
