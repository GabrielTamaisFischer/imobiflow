import type { AppModule } from "./app-modules";
import type { AccessResponse } from "./auth";

type AppUserAccess = AccessResponse["access"]["appUser"] | null | undefined;

const modulePermissions: Partial<Record<AppModule["key"], readonly string[]>> = {
  dashboard: ["dashboard.view"],
  crm: ["crm.view"],
  properties: ["properties.view"],
  owners: ["owners.view"],
  agenda: ["appointments.view"],
  inspections: ["inspections.view"],
  contracts: ["contracts.view"],
  finance: ["finance.view"],
  notifications: ["notifications.view"],
  ai: ["ai.view"],
  operations: ["operations.view"],
  site: ["site.manage"],
  imports: ["imports.view"],
  integrations: ["integrations.view"],
  settings: ["settings.manage", "users.manage"],
  costs: ["costs.view"],
};

const administrativeRoles = new Set(["owner", "admin", "manager"]);

export function canView(user: AppUserAccess, permission: string) {
  return Boolean(user?.permissions.includes(permission));
}

export function canManage(user: AppUserAccess, permission: string) {
  return canView(user, permission);
}

export function isAdministrative(user: AppUserAccess) {
  return administrativeRoles.has(user?.role.toLocaleLowerCase("pt-BR") ?? "");
}

export function canViewModule(user: AppUserAccess, module: AppModule) {
  if (module.key === "tests") return isAdministrative(user);
  const required = modulePermissions[module.key];
  return required ? required.some((permission) => canView(user, permission)) : false;
}

export function getVisibleModules(user: AppUserAccess, modules: readonly AppModule[]) {
  return modules.filter((module) => canViewModule(user, module));
}

// Fase 2.2D — reflexo em UX da regra C1 já implementada no backend
// (canManagePropertySharing/canManageLeadSharing em authorization.ts):
// Owner/Admin/Manager (company scope) OU o responsável atual do recurso
// podem gerenciar o compartilhamento; um Broker que só recebeu o recurso
// via compartilhamento não pode. Isto é SOMENTE para decidir o que mostrar
// na tela — o backend é quem decide de verdade (403 em qualquer tentativa
// fora dessa regra, independente do que a UI exibir).
export function canManageResourceSharing(
  user: AppUserAccess,
  managePermission: string,
  resourceOwnerId: string | null | undefined,
) {
  if (!canManage(user, managePermission)) return false;
  if (isAdministrative(user)) return true;
  return Boolean(user?.id && resourceOwnerId && user.id === resourceOwnerId);
}

export function getSafeApiErrorMessage(error: unknown, fallback: string) {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
  if (status === 403) return "Você não tem permissão para realizar esta ação.";
  if (status === 404) return "Recurso não encontrado ou indisponível para o seu acesso.";
  return error instanceof Error ? error.message : fallback;
}
