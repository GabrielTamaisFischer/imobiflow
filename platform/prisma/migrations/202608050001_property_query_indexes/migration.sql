-- Supports stable company-scoped pagination ordered by created_at DESC, id DESC.
CREATE INDEX `properties_company_id_created_at_id_idx`
  ON `properties`(`company_id`, `created_at`, `id`);

-- Supports the authenticated property_type filter without scanning other companies.
CREATE INDEX `properties_company_id_property_type_idx`
  ON `properties`(`company_id`, `property_type`);
