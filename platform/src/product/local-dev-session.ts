import type { AccessResponse } from "./auth";

const localAdminPermissions = [
  "dashboard.view",
  "crm.view",
  "crm.manage",
  "properties.view",
  "properties.manage",
  "owners.view",
  "owners.manage",
  "contracts.view",
  "contracts.manage",
  "users.manage",
  "appointments.view",
  "appointments.manage",
  "inspections.view",
  "inspections.manage",
  "finance.view",
  "finance.manage",
  "notifications.view",
  "notifications.manage",
  "ai.view",
  "ai.manage",
  "operations.view",
  "operations.manage",
  "site.manage",
  "imports.view",
  "imports.manage",
  "integrations.view",
  "integrations.manage",
  "settings.manage",
  "costs.view",
] as const;

export function isLocalFrontend() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
}

export function getLocalDevSession(): AccessResponse {
  return {
    access: {
      company: {
        id: "local-dev-company",
        name: "ImobiFlow Local",
        status: "active",
      },
      appUser: {
        id: "local-dev-user",
        company_id: "local-dev-company",
        name: "Desenvolvedor Local",
        email: "local@imobiflow.dev",
        role: "admin",
        permissions: [...localAdminPermissions],
      },
      subscription: {
        id: "local-dev-subscription",
        status: "ACTIVE",
        plan_slug: "preview",
        expires_at: null,
        grace_ends_at: null,
      },
      billing: {
        enforcement: "DISABLED",
        entitlement: "STAGING_QA",
      },
    },
  };
}
