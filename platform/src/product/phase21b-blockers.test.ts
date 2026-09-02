import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { appModules } from "./app-modules";
import { canViewModule } from "./app-access";
import type { AccessResponse } from "./auth";

const moduleByKey = (key: string) => appModules.find((module) => module.key === key)!;

function user(role: string, permissions: string[]): NonNullable<AccessResponse["access"]["appUser"]> {
  return { id: `${role}-id`, name: role, email: `${role}@example.test`, role, permissions };
}

describe("Phase 2.1B blocker regressions", () => {
  it("builds the lead update with the explicitly selected assignee", async () => {
    const source = await readFile(new URL("../routes/app.crm.tsx", import.meta.url), "utf8");
    expect(source).toContain("buildLeadDetailUpdateInput(form, assignedTo)");
    expect(source).toContain("assigned_to: assignedTo || undefined");
  });

  it("keeps settings denied to Broker and available to Admin and Owner", () => {
    const settings = moduleByKey("settings");
    expect(canViewModule(user("broker", ["crm.manage", "properties.manage"]), settings)).toBe(false);
    expect(canViewModule(user("admin", ["settings.manage"]), settings)).toBe(true);
    expect(canViewModule(user("owner", ["users.manage"]), settings)).toBe(true);
  });

  it("uses the module permission guard before rendering protected children", async () => {
    const source = await readFile(new URL("../components/app/module-page.tsx", import.meta.url), "utf8");
    expect(source).toContain("canViewModule(session?.access.appUser, module)");
    expect(source).toContain("Acesso não permitido");
  });

  it("confirms persistence by reloading the lead and exposes save failures", async () => {
    const source = await readFile(new URL("../routes/app.crm.tsx", import.meta.url), "utf8");
    expect(source).toContain("const persisted = await getLead(lead.id)");
    expect(source).toContain("setSaveError(getSafeApiErrorMessage");
    expect(source).toContain('role="alert"');
  });

  it("does not offer inline owner creation without owners.manage", async () => {
    const source = await readFile(new URL("../routes/app.imoveis.tsx", import.meta.url), "utf8");
    expect(source).toContain('canManage(session?.access.appUser, "owners.manage")');
    expect(source).toContain("!selectedOwner && canCreateOwner");
    expect(source).toContain("Seu perfil pode vincular um proprietário existente");
  });
});
