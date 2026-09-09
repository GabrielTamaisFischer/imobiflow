-- F6J: adiciona somente leitura de contratos ao Broker com resource-scope.
-- INSERT IGNORE preserva permissões/scopes customizados já existentes.
INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`, `scope`)
SELECT r.`id`, p.`id`, 'shared'
FROM `roles` r
JOIN `permissions` p ON p.`key` = 'contracts.view'
WHERE r.`system_key` = 'broker';
