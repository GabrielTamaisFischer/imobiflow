ALTER TABLE `leads`
  ADD COLUMN `email_normalized` VARCHAR(180) NULL,
  ADD COLUMN `phone_normalized` VARCHAR(40) NULL;

CREATE INDEX `leads_company_id_email_normalized_status_idx`
  ON `leads` (`company_id`, `email_normalized`, `status`);

CREATE INDEX `leads_company_id_phone_normalized_status_idx`
  ON `leads` (`company_id`, `phone_normalized`, `status`);
