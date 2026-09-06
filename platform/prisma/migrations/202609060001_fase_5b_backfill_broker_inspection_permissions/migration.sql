-- F5B: backfill aditivo das permissoes de Vistoria para roles Broker
-- existentes. As permissoes ja existem no catalogo desde a fundacao de
-- identidade; esta migration somente completa atribuicoes ausentes.
--
-- O LEFT JOIN preserva qualquer RolePermission ja existente, inclusive scope
-- customizado. Nao ha UPDATE/DELETE e a chave primaria de role_permissions
-- torna a execucao idempotente.
INSERT INTO `role_permissions` (`role_id`, `permission_id`, `scope`)
SELECT r.`id`, p.`id`, 'shared'
FROM `roles` r
INNER JOIN `permissions` p
  ON p.`key` IN ('inspections.view', 'inspections.manage')
LEFT JOIN `role_permissions` existing
  ON existing.`role_id` = r.`id`
 AND existing.`permission_id` = p.`id`
WHERE r.`system_key` = 'broker'
  AND existing.`role_id` IS NULL;
