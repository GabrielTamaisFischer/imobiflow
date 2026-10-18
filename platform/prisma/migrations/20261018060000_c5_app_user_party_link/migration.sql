ALTER TABLE `users`
  ADD COLUMN `party_id` CHAR(36) NULL;

CREATE UNIQUE INDEX `users_company_id_party_id_key`
  ON `users`(`company_id`, `party_id`);

CREATE INDEX `users_company_id_party_id_idx`
  ON `users`(`company_id`, `party_id`);

ALTER TABLE `users`
  ADD CONSTRAINT `users_company_id_party_id_fkey`
  FOREIGN KEY (`company_id`, `party_id`)
  REFERENCES `parties`(`company_id`, `id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
