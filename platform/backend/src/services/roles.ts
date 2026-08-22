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
  { systemKey: "read_only", name: "Somente leitura", permissions: viewPermissions },
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
    permissions: ["properties.view", "owners.view", "contracts.view", "contracts.manage"],
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
      return permissionId ? [{ roleId, permissionId }] : [];
    });
  });
  if (assignments.length) {
    await database.rolePermission.createMany({ data: assignments, skipDuplicates: true });
  }
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
  permissions: Array<{ permission: { key: string; description: string } }>;
  _count?: { users: number };
}) {
  return {
    id: role.id,
    company_id: role.companyId,
    name: role.name,
    system_key: role.systemKey,
    is_system: role.isSystem,
    permissions: role.permissions.map(({ permission }) => permission),
    users_count: role._count?.users ?? 0,
  };
}
