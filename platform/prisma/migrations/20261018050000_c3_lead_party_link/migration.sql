-- C3 — Compradores: vínculo aditivo Lead -> Party.
-- Um Party pode possuir vários Leads; por isso não existe UNIQUE em
-- (company_id, party_id). A FK composta preserva isolamento de tenant.

ALTER TABLE `leads`
  ADD COLUMN `party_id` CHAR(36) NULL;

CREATE INDEX `leads_company_id_party_id_idx`
  ON `leads`(`company_id`, `party_id`);

ALTER TABLE `leads`
  ADD CONSTRAINT `leads_company_id_party_id_fkey`
  FOREIGN KEY (`company_id`, `party_id`)
  REFERENCES `parties`(`company_id`, `id`)
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
