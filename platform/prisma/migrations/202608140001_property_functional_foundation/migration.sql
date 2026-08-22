-- Busca e prevenção de duplicidade de proprietários permanecem isoladas por empresa.
CREATE INDEX `property_owners_company_id_document_idx`
  ON `property_owners`(`company_id`, `document`);

-- Destaques publicados precisam ser consultados antes da ordenação cronológica da vitrine.
ALTER TABLE `properties`
  ADD COLUMN `site_featured` BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX `properties_company_id_status_site_featured_published_at_idx`
  ON `properties`(`company_id`, `status`, `site_featured`, `published_at`);
