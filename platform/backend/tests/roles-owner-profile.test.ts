import { describe, expect, it } from "vitest";
import { readOnlyPermissions, roleTemplates } from "../src/services/roles.js";

describe("owner profile permission templates", () => {
  it("keeps sensitive owner sections out of read-only roles", () => {
    expect(readOnlyPermissions).toContain("owners.view");
    expect(readOnlyPermissions).not.toEqual(expect.arrayContaining([
      "owners.sensitive.view",
      "owners.financial.view",
      "owners.credit.view",
      "owners.legal.view",
      "owners.fiscal.view",
      "owners.documents.view",
    ]));
  });

  it("grants granular owner access only to canonical roles that need it", () => {
    const owner = roleTemplates.find((role) => role.systemKey === "owner")!;
    const admin = roleTemplates.find((role) => role.systemKey === "admin")!;
    const manager = roleTemplates.find((role) => role.systemKey === "manager")!;
    const legal = roleTemplates.find((role) => role.systemKey === "legal")!;
    const broker = roleTemplates.find((role) => role.systemKey === "broker")!;
    for (const role of [owner, admin, manager]) {
      expect(role.permissions).toEqual(expect.arrayContaining([
        "owners.sensitive.view",
        "owners.financial.view",
        "owners.credit.view",
        "owners.legal.view",
        "owners.fiscal.view",
        "owners.documents.view",
        "owners.enrichment.run",
      ]));
    }
    expect(legal.permissions).toEqual(expect.arrayContaining(["owners.legal.view", "owners.documents.view"]));
    expect(broker.permissions).not.toContain("owners.sensitive.view");
    expect(broker.permissions).not.toContain("owners.documents.view");
  });
});
