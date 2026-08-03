import { supabaseAdmin } from "../lib/supabase.js";

const roleTemplates = [
  {
    system_key: "owner",
    name: "Dono",
    permissions: "all",
  },
  {
    system_key: "admin",
    name: "Administrador",
    permissions: [
      "dashboard.view",
      "crm.view",
      "crm.manage",
      "properties.view",
      "properties.manage",
      "owners.view",
      "owners.manage",
      "appointments.view",
      "appointments.manage",
      "rentals.view",
      "rentals.manage",
      "inspections.view",
      "inspections.manage",
      "contracts.view",
      "contracts.manage",
      "finance.view",
      "finance.manage",
      "ai.view",
      "ai.use",
      "ai.manage",
      "settings.manage",
      "users.manage",
    ],
  },
  {
    system_key: "manager",
    name: "Gerente",
    permissions: [
      "dashboard.view",
      "crm.view",
      "crm.manage",
      "properties.view",
      "properties.manage",
      "owners.view",
      "owners.manage",
      "appointments.view",
      "appointments.manage",
      "rentals.view",
      "rentals.manage",
      "inspections.view",
      "contracts.view",
      "contracts.manage",
      "ai.view",
      "ai.use",
    ],
  },
  {
    system_key: "broker",
    name: "Corretor",
    permissions: [
      "dashboard.view",
      "crm.view",
      "crm.manage",
      "properties.view",
      "appointments.view",
      "appointments.manage",
      "ai.view",
      "ai.use",
    ],
  },
  {
    system_key: "financial",
    name: "Financeiro",
    permissions: [
      "dashboard.view",
      "finance.view",
      "finance.manage",
      "billing.manage",
      "rentals.view",
      "rentals.manage",
    ],
  },
  {
    system_key: "inspector",
    name: "Vistoriador",
    permissions: ["properties.view", "inspections.view", "inspections.manage", "ai.view", "ai.use"],
  },
  {
    system_key: "legal",
    name: "Jurídico/Contratos",
    permissions: [
      "properties.view",
      "owners.view",
      "contracts.view",
      "contracts.manage",
      "ai.view",
      "ai.use",
    ],
  },
] as const;

type RoleTemplate = (typeof roleTemplates)[number];

export async function ensureDefaultCompanyRoles(companyId: string) {
  const { data: permissions, error: permissionsError } = await supabaseAdmin
    .from("permissions")
    .select("id, key");

  if (permissionsError) throw permissionsError;

  const permissionCatalog = new Map((permissions ?? []).map((permission) => [permission.key, permission.id]));
  const allPermissionIds = [...permissionCatalog.values()];

  for (const template of roleTemplates) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from("roles")
      .upsert(
        {
          company_id: companyId,
          name: template.name,
          system_key: template.system_key,
          is_system: true,
        },
        { onConflict: "company_id,system_key" },
      )
      .select("id")
      .single();

    if (roleError) throw roleError;

    const rolePermissionIds = resolvePermissionIds(template, permissionCatalog, allPermissionIds);
    if (rolePermissionIds.length === 0) continue;

    const { error: rolePermissionsError } = await supabaseAdmin.from("role_permissions").upsert(
      rolePermissionIds.map((permissionId) => ({
        role_id: role.id,
        permission_id: permissionId,
      })),
      { onConflict: "role_id,permission_id" },
    );

    if (rolePermissionsError) throw rolePermissionsError;
  }
}

export async function getCompanyRoleBySystemKey(companyId: string, systemKey: string) {
  await ensureDefaultCompanyRoles(companyId);

  const { data: role, error } = await supabaseAdmin
    .from("roles")
    .select("id, system_key, name")
    .eq("company_id", companyId)
    .eq("system_key", systemKey)
    .maybeSingle<{ id: string; system_key: string; name: string }>();

  if (error) throw error;
  return role;
}

function resolvePermissionIds(
  template: RoleTemplate,
  permissionCatalog: Map<string, string>,
  allPermissionIds: string[],
) {
  if (template.permissions === "all") return allPermissionIds;

  return template.permissions
    .map((permissionKey) => permissionCatalog.get(permissionKey))
    .filter((permissionId): permissionId is string => Boolean(permissionId));
}
