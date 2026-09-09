-- F7A.2: reconcile appointment permissions for existing Broker roles.
-- Additive and idempotent: preserve existing permissions and custom scopes.

INSERT IGNORE INTO role_permissions (role_id, permission_id, scope)
SELECT r.id, p.id, 'shared'
FROM roles r
INNER JOIN permissions p
  ON p.key IN ('appointments.view', 'appointments.manage')
LEFT JOIN role_permissions existing
  ON existing.role_id = r.id
 AND existing.permission_id = p.id
WHERE r.system_key = 'broker'
  AND existing.role_id IS NULL;

UPDATE role_permissions rp
INNER JOIN roles r ON r.id = rp.role_id
INNER JOIN permissions p ON p.id = rp.permission_id
SET rp.scope = 'shared'
WHERE r.system_key = 'broker'
  AND rp.scope = 'company'
  AND p.key IN ('appointments.view', 'appointments.manage');
