-- F8A: opaque, revocable authentication for external ContractParty portals.
-- Only a SHA-256 hash is persisted; the bearer token is returned once when
-- an authorized company operator provisions portal access.
ALTER TABLE `contract_parties_mysql`
  ADD COLUMN `portal_token_hash` CHAR(64) NULL,
  ADD COLUMN `portal_enabled` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `portal_last_access_at` DATETIME(3) NULL;

CREATE UNIQUE INDEX `contract_parties_portal_token_hash_key`
  ON `contract_parties_mysql` (`portal_token_hash`);

CREATE INDEX `contract_parties_company_party_type_portal_enabled_idx`
  ON `contract_parties_mysql` (`company_id`, `party_type`, `portal_enabled`);
