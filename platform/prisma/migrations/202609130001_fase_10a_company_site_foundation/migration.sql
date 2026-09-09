-- F10A: snapshot publicado e versionamento otimista do CompanySite canônico.
-- A migração é aditiva e não altera dados existentes: sites publicados sem
-- snapshot continuam usando os campos legados até a próxima publicação.
ALTER TABLE `company_sites`
  ADD COLUMN `published_config_json` JSON NULL,
  ADD COLUMN `template_key` VARCHAR(100) NULL,
  ADD COLUMN `version` INT NOT NULL DEFAULT 1;

CREATE INDEX `company_sites_company_id_status_version_idx`
  ON `company_sites` (`company_id`, `status`, `version`);
