import { describe, expect, it } from "vitest";
import { appModules } from "./app-modules";
import {
  canManage,
  canManageResourceSharing,
  canView,
  getSafeApiErrorMessage,
  getVisibleModules,
  isAdministrative,
} from "./app-access";
import type { AccessResponse } from "./auth";

const broker = user("broker", [
  "dashboard.view",
  "crm.view",
  "crm.manage",
  "properties.view",
  "properties.manage",
  "owners.view",
  "appointments.view",
  "appointments.manage",
  "site.manage",
  "ai.view",
  "ai.use",
]);
const admin = user(
  "admin",
  appModules.flatMap((module) => modulePermission(module.key)),
);
const owner = user("owner", [...admin.permissions]);

describe("frontend access projection for Phase 2.1B", () => {
  it("shows the Broker operational menu", () => {
    expect(keys(broker)).toEqual(
      expect.arrayContaining(["dashboard", "crm", "properties", "owners", "agenda", "site", "ai"]),
    );
  });

  it("does not show administrative modules to Broker", () => {
    expect(keys(broker)).not.toEqual(
      expect.arrayContaining([
        "settings",
        "costs",
        "imports",
        "integrations",
        "operations",
        "tests",
      ]),
    );
  });

  it("keeps administrative navigation available to Admin", () => {
    expect(keys(admin)).toEqual(
      expect.arrayContaining(["settings", "costs", "imports", "integrations", "tests"]),
    );
  });

  it("keeps administrative navigation available to Owner", () => {
    expect(keys(owner)).toEqual(
      expect.arrayContaining(["settings", "costs", "imports", "integrations", "tests"]),
    );
  });

  it("recognizes Broker property list permission from the authenticated session", () => {
    expect(canView(broker, "properties.view")).toBe(true);
  });

  it("preserves an empty allowed list without fabricating modules", () => {
    expect(getVisibleModules(user("broker", []), appModules)).toEqual([]);
  });

  it("maps 403 to a permission-safe message", () => {
    expect(getSafeApiErrorMessage({ status: 403 }, "fallback")).toBe(
      "Você não tem permissão para realizar esta ação.",
    );
  });

  it("maps 404 without revealing another Broker or tenant", () => {
    expect(getSafeApiErrorMessage({ status: 404 }, "fallback")).toBe(
      "Recurso não encontrado ou indisponível para o seu acesso.",
    );
  });

  it("maps 401 to session recovery guidance", () => {
    expect(getSafeApiErrorMessage({ status: 401 }, "fallback")).toBe(
      "Sua sessão expirou. Entre novamente para continuar.",
    );
  });

  it("allows Broker to list and open leads returned by the protected API", () => {
    expect(canView(broker, "crm.view")).toBe(true);
  });

  it("keeps Broker CRM mutations while withholding administrative identity", () => {
    expect(canManage(broker, "crm.manage")).toBe(true);
    expect(isAdministrative(broker)).toBe(false);
  });

  it("recognizes Admin and Owner as administrative without changing backend authority", () => {
    expect(isAdministrative(admin)).toBe(true);
    expect(isAdministrative(owner)).toBe(true);
  });

  // Fase 2.2D — canManageResourceSharing é só reflexo de UX da regra C1 já
  // aplicada no backend (canManagePropertySharing/canManageLeadSharing);
  // estes testes cobrem os itens 6/7/32/33 da matriz de testes obrigatória.
  it("lets Owner/Admin/Manager manage sharing via company scope regardless of who owns the resource (#6, #32)", () => {
    const administrativeOwner = user("owner", ["properties.manage"]);
    const administrativeAdmin = user("admin", ["crm.manage"]);
    expect(canManageResourceSharing(administrativeOwner, "properties.manage", "someone-else-id")).toBe(true);
    expect(canManageResourceSharing(administrativeAdmin, "crm.manage", null)).toBe(true);
  });

  it("lets the Broker who is the resource's current owner manage its sharing (#6)", () => {
    expect(canManageResourceSharing(broker, "properties.manage", "broker-id")).toBe(true);
  });

  it("blocks a Broker who only received the resource via sharing from managing it (#7, #33)", () => {
    expect(canManageResourceSharing(broker, "properties.manage", "someone-else-id")).toBe(false);
    expect(canManageResourceSharing(broker, "crm.manage", null)).toBe(false);
  });

  it("blocks sharing management entirely without the base manage permission", () => {
    const readOnlyBroker = user("broker", ["properties.view"]);
    expect(canManageResourceSharing(readOnlyBroker, "properties.manage", "broker-id")).toBe(false);
  });

  it("passes through the backend's specific message for 422 instead of a generic override", () => {
    // Diferente de 401/403/404 (mensagens fixas e seguras), 422 deve manter
    // a mensagem específica que o backend já envia em português (ex.: Zod).
    expect(
      getSafeApiErrorMessage(
        Object.assign(new Error("Permissões duplicadas não são permitidas."), { status: 422 }),
        "fallback",
      ),
    ).toBe("Permissões duplicadas não são permitidas.");
  });

  it("falls back to a friendly message for an unexpected 5xx without exposing internals", () => {
    expect(
      getSafeApiErrorMessage(Object.assign(new Error("ECONNRESET"), { status: 500 }), "Não foi possível atualizar o acesso. Tente novamente."),
    ).toBe("ECONNRESET");
    // 5xx sem Error real (ex.: falha de rede genérica) usa o fallback amigável.
    expect(getSafeApiErrorMessage({ status: 500 }, "Não foi possível atualizar o acesso. Tente novamente.")).toBe(
      "Não foi possível atualizar o acesso. Tente novamente.",
    );
  });
});

function keys(appUser: AccessResponse["access"]["appUser"]) {
  return getVisibleModules(appUser, appModules).map((module) => module.key);
}

function user(
  role: string,
  permissions: string[],
): NonNullable<AccessResponse["access"]["appUser"]> {
  return { id: `${role}-id`, name: role, email: `${role}@example.test`, role, permissions };
}

function modulePermission(key: string) {
  const permissions: Record<string, string[]> = {
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
  return permissions[key] ?? [];
}
