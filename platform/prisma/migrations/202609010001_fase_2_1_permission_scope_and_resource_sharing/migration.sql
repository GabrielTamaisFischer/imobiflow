-- Fase 2.1 (Diretriz Mestre do MVP, Secoes 9.1/9.2/9.3 — Conta do Corretor,
-- Compartilhamento entre corretores, Matriz de Permissoes).
--
-- Esta migracao NAO cria um sistema de permissoes paralelo (proibido pelas
-- Regras para IA, Secao 17): ela estende a estrutura RBAC canonica ja
-- existente (permissions / roles / role_permissions).
--
-- 1) Adiciona `scope` em role_permissions: dimensao de visibilidade por
--    atribuicao role+permission. Default 'company' preserva o comportamento
--    de TODAS as atribuicoes ja existentes (nenhuma regressao de acesso para
--    Owner/Admin/Manager nem para papeis customizados ja criados por
--    empresas). Valores validos aplicados pelo backend: 'own' | 'shared' |
--    'company' (nao usamos ENUM do banco para permitir estender sem nova
--    migracao, igual ao padrao ja usado em permission/role.key).
--
-- 2) Cria property_access: concessao explicita de acesso a um imovel
--    especifico para um usuario especifico (Secao 9.2). Aditiva —- nao
--    substitui properties.responsible_user_id.
--
-- 3) Cria lead_access: mesma logica aplicada a Lead, por pedido explicito
--    desta fase (nao esta nomeada na Diretriz Mestre; extensao documentada
--    do padrao ja aprovado para Property).
--
-- Nenhuma tabela existente perde dados. Nenhuma coluna existente e removida.

ALTER TABLE `role_permissions`
  ADD COLUMN `scope` VARCHAR(20) NOT NULL DEFAULT 'company';

CREATE TABLE IF NOT EXISTS `property_access` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `property_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `permission` VARCHAR(20) NOT NULL,
  `granted_by` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `property_access_property_id_user_id_permission_key` (`property_id`, `user_id`, `permission`),
  KEY `property_access_company_id_user_id_idx` (`company_id`, `user_id`),
  KEY `property_access_property_id_idx` (`property_id`),
  CONSTRAINT `property_access_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `property_access_property_id_fkey` FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `property_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `property_access_granted_by_fkey` FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lead_access` (
  `id` CHAR(36) NOT NULL,
  `company_id` CHAR(36) NOT NULL,
  `lead_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `permission` VARCHAR(20) NOT NULL,
  `granted_by` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `lead_access_lead_id_user_id_permission_key` (`lead_id`, `user_id`, `permission`),
  KEY `lead_access_company_id_user_id_idx` (`company_id`, `user_id`),
  KEY `lead_access_lead_id_idx` (`lead_id`),
  CONSTRAINT `lead_access_company_id_fkey` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lead_access_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lead_access_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lead_access_granted_by_fkey` FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Escopo restrito por papel (Secao 9.1): somente o template do papel
-- "broker" (Corretor) recebe escopo 'shared' para permissoes de recurso.
-- Owner/Admin/Manager e quaisquer outros papeis (inclusive customizados por
-- empresas) permanecem 'company' pelo DEFAULT acima — nenhuma regressao.
UPDATE `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`role_id`
JOIN `permissions` p ON p.`id` = rp.`permission_id`
SET rp.`scope` = 'shared'
WHERE r.`system_key` = 'broker'
  AND p.`key` IN ('properties.view', 'properties.manage', 'crm.view', 'crm.manage');
