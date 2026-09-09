-- F6D: tenant-safe clause library and immutable contract clause instances.
CREATE TABLE `contract_clauses_mysql` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NULL,
  `contract_type` VARCHAR(40) NOT NULL,
  `category` VARCHAR(80) NOT NULL,
  `title` VARCHAR(240) NOT NULL,
  `content` TEXT NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `contract_clauses_mysql_company_type_active_idx` (`company_id`,`contract_type`,`active`),
  KEY `contract_clauses_mysql_type_active_idx` (`contract_type`,`active`),
  CONSTRAINT `contract_clauses_mysql_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `contract_clause_instances_mysql` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `contract_id` CHAR(36) NOT NULL,
  `source_clause_id` CHAR(36) NULL,
  `title` VARCHAR(240) NOT NULL,
  `content` TEXT NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  `metadata_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `contract_clause_instances_company_contract_position_idx` (`company_id`,`contract_id`,`position`),
  KEY `contract_clause_instances_company_source_idx` (`company_id`,`source_clause_id`),
  CONSTRAINT `contract_clause_instances_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `contract_clause_instances_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts_mysql`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `contract_clause_instances_source_clause_id_fkey` FOREIGN KEY (`source_clause_id`) REFERENCES `contract_clauses_mysql`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
