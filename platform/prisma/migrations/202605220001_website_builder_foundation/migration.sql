CREATE TABLE `website_templates` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `category` VARCHAR(80) NOT NULL DEFAULT 'system',
  `thumbnail_url` VARCHAR(500) NULL,
  `structure_json` JSON NOT NULL,
  `theme_json` JSON NOT NULL,
  `is_system` BOOLEAN NOT NULL DEFAULT false,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_templates_company_id_slug_key` (`company_id`, `slug`),
  KEY `website_templates_company_id_is_active_idx` (`company_id`, `is_active`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `websites` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `template_id` CHAR(36) NULL,
  `name` VARCHAR(160) NOT NULL,
  `slug` VARCHAR(100) NOT NULL,
  `status` ENUM('draft', 'published', 'offline', 'archived') NOT NULL DEFAULT 'draft',
  `settings_json` JSON NOT NULL,
  `theme_json` JSON NOT NULL,
  `created_by_id` CHAR(36) NULL,
  `updated_by_id` CHAR(36) NULL,
  `published_at` DATETIME(3) NULL,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `websites_company_id_slug_key` (`company_id`, `slug`),
  KEY `websites_company_id_status_idx` (`company_id`, `status`),
  KEY `websites_template_id_idx` (`template_id`),
  CONSTRAINT `websites_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `website_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_pages` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `website_id` CHAR(36) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `slug` VARCHAR(120) NOT NULL,
  `page_type` ENUM('home', 'property', 'about', 'contact', 'landing', 'blog', 'terms', 'privacy', 'custom') NOT NULL DEFAULT 'custom',
  `status` ENUM('draft', 'published', 'hidden', 'archived') NOT NULL DEFAULT 'draft',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `seo_json` JSON NOT NULL,
  `settings_json` JSON NOT NULL,
  `created_by_id` CHAR(36) NULL,
  `updated_by_id` CHAR(36) NULL,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_pages_website_id_slug_key` (`website_id`, `slug`),
  KEY `website_pages_company_id_website_id_status_idx` (`company_id`, `website_id`, `status`),
  CONSTRAINT `website_pages_website_id_fkey` FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_sections` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `website_id` CHAR(36) NOT NULL,
  `page_id` CHAR(36) NOT NULL,
  `name` VARCHAR(160) NOT NULL,
  `section_type` VARCHAR(80) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `props_json` JSON NOT NULL,
  `style_json` JSON NOT NULL,
  `responsive_json` JSON NOT NULL,
  `animation_json` JSON NOT NULL,
  `is_visible` BOOLEAN NOT NULL DEFAULT true,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `website_sections_company_id_website_id_page_id_idx` (`company_id`, `website_id`, `page_id`),
  KEY `website_sections_page_id_sort_order_idx` (`page_id`, `sort_order`),
  CONSTRAINT `website_sections_page_id_fkey` FOREIGN KEY (`page_id`) REFERENCES `website_pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_components` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `website_id` CHAR(36) NOT NULL,
  `page_id` CHAR(36) NOT NULL,
  `section_id` CHAR(36) NOT NULL,
  `parent_component_id` CHAR(36) NULL,
  `name` VARCHAR(160) NOT NULL,
  `component_type` VARCHAR(80) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `props_json` JSON NOT NULL,
  `style_json` JSON NOT NULL,
  `responsive_json` JSON NOT NULL,
  `animation_json` JSON NOT NULL,
  `interaction_json` JSON NOT NULL,
  `is_visible` BOOLEAN NOT NULL DEFAULT true,
  `is_locked` BOOLEAN NOT NULL DEFAULT false,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `website_components_company_id_website_id_page_id_section_id_idx` (`company_id`, `website_id`, `page_id`, `section_id`),
  KEY `website_components_section_id_sort_order_idx` (`section_id`, `sort_order`),
  CONSTRAINT `website_components_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `website_sections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_assets` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `website_id` CHAR(36) NULL,
  `asset_type` ENUM('image', 'video', 'document', 'icon', 'font', 'other') NOT NULL DEFAULT 'other',
  `status` ENUM('pending_upload', 'uploaded', 'failed', 'deleted') NOT NULL DEFAULT 'pending_upload',
  `file_name` VARCHAR(220) NOT NULL,
  `mime_type` VARCHAR(120) NOT NULL,
  `file_size` INTEGER NULL,
  `storage_provider` VARCHAR(60) NOT NULL DEFAULT 'cloudflare_r2',
  `storage_bucket` VARCHAR(160) NULL,
  `storage_key` VARCHAR(700) NOT NULL,
  `public_url` VARCHAR(900) NULL,
  `metadata_json` JSON NOT NULL,
  `created_by_id` CHAR(36) NULL,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `website_assets_company_id_website_id_asset_type_idx` (`company_id`, `website_id`, `asset_type`),
  CONSTRAINT `website_assets_website_id_fkey` FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_domains` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `website_id` CHAR(36) NOT NULL,
  `domain` VARCHAR(180) NOT NULL,
  `status` ENUM('pending', 'verified', 'failed', 'disabled') NOT NULL DEFAULT 'pending',
  `is_primary` BOOLEAN NOT NULL DEFAULT false,
  `dns_json` JSON NOT NULL,
  `verified_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_domains_company_id_domain_key` (`company_id`, `domain`),
  KEY `website_domains_website_id_status_idx` (`website_id`, `status`),
  CONSTRAINT `website_domains_website_id_fkey` FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_seo` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `website_id` CHAR(36) NOT NULL,
  `page_id` CHAR(36) NULL,
  `title` VARCHAR(180) NULL,
  `description` VARCHAR(320) NULL,
  `canonical_url` VARCHAR(500) NULL,
  `og_image_asset_id` CHAR(36) NULL,
  `schema_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `website_seo_company_id_website_id_page_id_idx` (`company_id`, `website_id`, `page_id`),
  CONSTRAINT `website_seo_website_id_fkey` FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `website_seo_page_id_fkey` FOREIGN KEY (`page_id`) REFERENCES `website_pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_versions` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `website_id` CHAR(36) NOT NULL,
  `version_number` INTEGER NOT NULL,
  `label` VARCHAR(160) NULL,
  `snapshot_json` JSON NOT NULL,
  `created_by_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `website_versions_website_id_version_number_key` (`website_id`, `version_number`),
  KEY `website_versions_company_id_website_id_idx` (`company_id`, `website_id`),
  CONSTRAINT `website_versions_website_id_fkey` FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `website_publish_logs` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `website_id` CHAR(36) NOT NULL,
  `status` ENUM('queued', 'success', 'failed') NOT NULL DEFAULT 'queued',
  `message` TEXT NULL,
  `metadata_json` JSON NOT NULL,
  `created_by_id` CHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `website_publish_logs_company_id_website_id_status_idx` (`company_id`, `website_id`, `status`),
  CONSTRAINT `website_publish_logs_website_id_fkey` FOREIGN KEY (`website_id`) REFERENCES `websites`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
