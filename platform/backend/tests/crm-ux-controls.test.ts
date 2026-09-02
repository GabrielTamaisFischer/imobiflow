import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { toDateTimeLocalValue, toIsoOrEmpty } from "../../src/product/crm-date";

describe("CRM follow-up and permission UX", () => {
  it("converts datetime-local values to ISO and clears with an empty string", () => {
    expect(toIsoOrEmpty("2026-08-22T14:00")).toBe(new Date("2026-08-22T14:00").toISOString());
    expect(toIsoOrEmpty("")).toBe("");
  });

  it("converts persisted ISO values back to datetime-local", () => {
    const persisted = new Date("2026-08-22T17:00:00.000Z");
    const pad = (part: number) => String(part).padStart(2, "0");
    expect(toDateTimeLocalValue(persisted.toISOString())).toBe(`${persisted.getFullYear()}-${pad(persisted.getMonth() + 1)}-${pad(persisted.getDate())}T${pad(persisted.getHours())}:${pad(persisted.getMinutes())}`);
    expect(toDateTimeLocalValue(null)).toBe("");
  });

  it("keeps CRM controls read-only without crm.manage and refreshes full activity detail", async () => {
    const source = await readFile(new URL("../../src/routes/app.crm.tsx", import.meta.url), "utf8");
    expect(source).toContain('const canManageCrm = canManage(session?.access.appUser, "crm.manage")');
    expect(source).toMatch(/\{canManageCrm \? <button[\s\S]*Adicionar manualmente[\s\S]*<\/button> : null\}/);
    expect(source).toContain("showForm && canManageCrm");
    expect(source).toContain("...(canManageCrm ? { actionLabel: \"Cadastrar lead\", onAction: () => setShowForm(true) } : {})");
    expect(source).not.toContain('actionLabel="Cadastrar lead"');
    expect(source).toContain("draggable={canManage}");
    expect(source).toContain("canManage && lead.status === \"open\"");
    expect(source).toContain("disabled={!canManage}");
    expect(source).toContain("onSaved({ ...refreshed.lead, interests: refreshed.interests, activities: refreshed.activities, events: refreshed.events })");
  });

  it("keeps both registration controls available for crm.manage", async () => {
    const source = await readFile(new URL("../../src/routes/app.crm.tsx", import.meta.url), "utf8");
    expect(source).toContain("onClick={() => setShowForm((current) => !current)}");
    expect(source).toContain("actionLabel: \"Cadastrar lead\"");
  });
});
