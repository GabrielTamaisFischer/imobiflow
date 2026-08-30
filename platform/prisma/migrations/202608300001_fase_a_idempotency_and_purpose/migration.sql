-- Fase A (auditoria de 2026-08-30): correções A4 (idempotência financeira)
-- e A6 (purpose real em StoredFile). Ver log de desenvolvimento
-- "2026-08-30 - Fase A - Correcoes de fundacao" no Obsidian.

-- A6: persiste o propósito do documento armazenado (antes só documentado,
-- nunca gravado). Usado pelo controle mínimo de acesso por propósito.
ALTER TABLE `stored_files` ADD COLUMN `purpose` VARCHAR(40) NULL;
CREATE INDEX `stored_files_company_id_purpose_idx` ON `stored_files` (`company_id`, `purpose`);

-- A4: ledger de idempotência para operações financeiras sensíveis a
-- duplicação por duplo clique/retry/concorrência. A constraint única em
-- (company_id, scope, idempotency_key) é a proteção real de banco: apenas
-- uma execução concorrente consegue inserir a chave; as demais leem o
-- resultado já registrado em vez de duplicar o efeito colateral.
CREATE TABLE `idempotency_keys` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `scope` VARCHAR(80) NOT NULL,
  `idempotency_key` VARCHAR(200) NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  `response_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idempotency_keys_company_id_scope_idempotency_key_key` (`company_id`, `scope`, `idempotency_key`),
  KEY `idempotency_keys_company_id_scope_created_at_idx` (`company_id`, `scope`, `created_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
