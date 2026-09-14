import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";

export const permissionCatalog = [
  ["dashboard.view", "Visualizar dashboard"],
  ["crm.view", "Visualizar CRM"],
  ["crm.manage", "Gerenciar CRM"],
  ["properties.view", "Visualizar imóveis"],
  ["properties.manage", "Gerenciar imóveis"],
  ["owners.view", "Visualizar proprietários"],
  ["owners.manage", "Gerenciar proprietários"],
  ["owners.sensitive.view", "Visualizar dados sensíveis de proprietários"],
  ["owners.financial.view", "Visualizar dados financeiros de proprietários"],
  ["owners.credit.view", "Visualizar dados de crédito de proprietários"],
  ["owners.legal.view", "Visualizar dados jurídicos de proprietários"],
  ["owners.fiscal.view", "Visualizar dados fiscais de proprietários"],
  ["owners.documents.view", "Visualizar documentos de proprietários"],
  ["owners.enrichment.run", "Executar enriquecimento de proprietários"],
  ["appointments.view", "Visualizar agenda"],
  ["appointments.manage", "Gerenciar agenda"],
  ["rentals.view", "Visualizar locações"],
  ["rentals.manage", "Gerenciar locações"],
  ["inspections.view", "Visualizar vistorias"],
  ["inspections.manage", "Gerenciar vistorias"],
  ["inspections.sign", "Assinar vistorias"],
  ["inspections.pdf", "Gerar PDF de vistorias"],
  ["contracts.view", "Visualizar contratos"],
  ["contracts.manage", "Gerenciar contratos"],
  ["proposals.view", "Visualizar propostas"],
  ["proposals.manage", "Gerenciar propostas"],
  ["finance.view", "Visualizar financeiro"],
  ["finance.manage", "Gerenciar financeiro"],
  ["ai.view", "Visualizar IA"],
  ["ai.use", "Usar IA"],
  ["ai.manage", "Gerenciar IA"],
  ["notifications.view", "Visualizar notificações"],
  ["notifications.manage", "Gerenciar notificações"],
  ["operations.view", "Visualizar operações"],
  ["operations.manage", "Gerenciar operações"],
  ["integrations.view", "Visualizar integrações"],
  ["integrations.manage", "Gerenciar integrações"],
  ["imports.view", "Visualizar importações"],
  ["imports.manage", "Gerenciar importações"],
  ["costs.view", "Visualizar custos"],
  ["costs.manage", "Gerenciar custos"],
  ["site.manage", "Gerenciar site"],
  ["settings.manage", "Gerenciar empresa"],
  ["users.manage", "Gerenciar usuários e papéis"],
  ["data.export", "Exportar dados administrativos"],
] as const;

export type SystemRoleKey =
  | "owner"
  | "admin"
  | "manager"
  | "broker"
  | "assistant"
  | "read_only"
  | "financial"
  | "inspector"
  | "legal";

const allPermissions = permissionCatalog.map(([key]) => key);
const viewPermissions = allPermissions.filter((key) => key.endsWith(".view"));
const ownerSensitivePermissions = new Set([
  "owners.sensitive.view",
  "owners.financial.view",
  "owners.credit.view",
  "owners.legal.view",
  "owners.fiscal.view",
  "owners.documents.view",
]);
export const readOnlyPermissions = viewPermissions.filter((key) => !ownerSensitivePermissions.has(key));
export const brokerResourceScopedPermissions = [
  "properties.view",
  "properties.manage",
  "crm.view",
  "crm.manage",
  "inspections.view",
  "inspections.manage",
  "contracts.view",
  "proposals.view",
  "proposals.manage",
  "appointments.view",
  "appointments.manage",
] as const;

export const roleTemplates: ReadonlyArray<{
  systemKey: SystemRoleKey;
  name: string;
  permissions: readonly string[];
}> = [
  { systemKey: "owner", name: "Dono", permissions: allPermissions },
  { systemKey: "admin", name: "Administrador", permissions: allPermissions },
  {
    systemKey: "manager",
    name: "Gerente",
    permissions: allPermissions.filter(
      (key) => !["users.manage", "settings.manage", "costs.manage"].includes(key),
    ),
  },
  {
    systemKey: "broker",
    name: "Corretor",
    permissions: [
      "dashboard.view",
      "crm.view",
      "crm.manage",
      "properties.view",
      "properties.manage",
      "inspections.view",
      "inspections.manage",
      "contracts.view",
      "proposals.view",
      "proposals.manage",
      "owners.view",
      "appointments.view",
      "appointments.manage",
      "site.manage",
      "ai.view",
      "ai.use",
    ],
  },
  {
    systemKey: "assistant",
    name: "Atendente",
    permissions: [
      "dashboard.view",
      "crm.view",
      "crm.manage",
      "properties.view",
      "owners.view",
      "appointments.view",
      "appointments.manage",
      "notifications.view",
    ],
  },
  { systemKey: "read_only", name: "Somente leitura", permissions: readOnlyPermissions },
  {
    systemKey: "financial",
    name: "Financeiro",
    permissions: [
      "dashboard.view",
      "finance.view",
      "finance.manage",
      "rentals.view",
      "rentals.manage",
      "costs.view",
    ],
  },
  {
    systemKey: "inspector",
    name: "Vistoriador",
    permissions: [
      "properties.view",
      "inspections.view",
      "inspections.manage",
      "inspections.sign",
      "inspections.pdf",
    ],
  },
  {
    systemKey: "legal",
    name: "Jurídico/Contratos",
    permissions: ["properties.view", "owners.view", "owners.legal.view", "owners.documents.view", "contracts.view", "contracts.manage"],
  },
];

type AuthDatabase = PrismaClient | Prisma.TransactionClient;

export async function ensureDefaultCompanyRoles(
  companyId: string,
  database: AuthDatabase = getPrisma(),
) {
  await database.permission.createMany({
    data: permissionCatalog.map(([key, description]) => ({ key, description })),
    skipDuplicates: true,
  });
  await database.role.createMany({
    data: roleTemplates.map((template) => ({
      companyId,
      systemKey: template.systemKey,
      name: template.name,
      isSystem: true,
    })),
    skipDuplicates: true,
  });

  await reconcileCompanyRolePermissions(companyId, database);
}

/**
 * Reconciles only missing assignments for canonical system roles. Existing
 * RolePermission rows (including custom scopes) are never updated or removed.
 * This is intentionally callable by a controlled one-off staging operation so
 * existing tenants do not depend on a future login/activation.
 */
export async function reconcileCompanyRolePermissions(
  companyId: string,
  database: AuthDatabase = getPrisma(),
) {

  const [permissionRows, roleRows] = await Promise.all([
    database.permission.findMany({
      where: { key: { in: [...allPermissions] } },
      select: { id: true, key: true },
    }),
    database.role.findMany({
      where: { companyId, systemKey: { in: roleTemplates.map(({ systemKey }) => systemKey) } },
      select: { id: true, systemKey: true },
    }),
  ]);
  const permissions = new Map(permissionRows.map((permission) => [permission.key, permission.id]));
  const roles = new Map(roleRows.map((role) => [role.systemKey, role.id]));
  const assignments = roleTemplates.flatMap((template) => {
    const roleId = roles.get(template.systemKey);
    if (!roleId) return [];
    return template.permissions.flatMap((key) => {
      const permissionId = permissions.get(key);
      const resourceScoped =
        template.systemKey === "broker" &&
        brokerResourceScopedPermissions.includes(key as (typeof brokerResourceScopedPermissions)[number]);
      return permissionId
        ? [{ roleId, permissionId, scope: resourceScoped ? "shared" : "company" }]
        : [];
    });
  });
  if (assignments.length) await database.rolePermission.createMany({ data: assignments, skipDuplicates: true });
}

export async function reconcileExistingCompanyRolePermissions(database: AuthDatabase = getPrisma()) {
  await database.permission.createMany({
    data: permissionCatalog.map(([key, description]) => ({ key, description })),
    skipDuplicates: true,
  });
  const companies = await database.company.findMany({ select: { id: true } });
  for (const company of companies) await reconcileCompanyRolePermissions(company.id, database);
}

export async function getCompanyRoleBySystemKey(
  companyId: string,
  systemKey: string,
  database: AuthDatabase = getPrisma(),
) {
  return database.role.findFirst({
    where: { companyId, systemKey },
    include: { permissions: { include: { permission: true } } },
  });
}

export async function listCompanyRoles(companyId: string, database: AuthDatabase = getPrisma()) {
  return database.role.findMany({
    where: { companyId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      permissions: { include: { permission: true } },
      _count: { select: { users: true } },
    },
  });
}

export function serializeRole(role: {
  id: string;
  companyId: string;
  name: string;
  systemKey: string | null;
  isSystem: boolean;
  permissions: Array<{ scope: string; permission: { key: string; description: string } }>;
  _count?: { users: number };
}) {
  return {
    id: role.id,
    company_id: role.companyId,
    name: role.name,
    system_key: role.systemKey,
    is_system: role.isSystem,
    permissions: role.permissions.map(({ permission, scope }) => ({ ...permission, scope })),
    users_count: role._count?.users ?? 0,
  };
}
