import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/website-builder-prisma.js", () => ({
  getPrisma: () => {
    throw new Error("Tests must inject the authorization database.");
  },
}));

import {
  assertLeadAccess,
  assertPropertyAccess,
  buildLeadScopeFilter,
  buildPropertyScopeFilter,
  canAccessLead,
  canAccessProperty,
  canManageLeadSharing,
  canManagePropertySharing,
  resolveScope,
} from "../src/services/authorization.js";
import { buildPropertyListWhere } from "../src/services/mysql-real-estate.js";
import { permissionCatalog, roleTemplates } from "../src/services/roles.js";
import type { AccessContext, ResourceScope } from "../src/types/access.js";

function access(params: {
  companyId?: string;
  userId?: string;
  role?: string;
  permissions?: string[];
  scopes?: Record<string, ResourceScope>;
} = {}): AccessContext {
  const companyId = params.companyId ?? "company-a";
  return {
    authUser: { id: params.userId ?? "broker-a1", email: "qa@example.test", name: "QA" },
    appUser: {
      id: params.userId ?? "broker-a1",
      company_id: companyId,
      name: "QA",
      email: "qa@example.test",
      status: "active",
      role: params.role ?? "broker",
      permissions: params.permissions ?? ["properties.view", "properties.manage", "crm.view", "crm.manage"],
      permissionScopes: params.scopes ?? {
        "properties.view": "shared",
        "properties.manage": "shared",
        "crm.view": "shared",
        "crm.manage": "shared",
      },
    },
    company: { id: companyId, name: "Empresa QA", status: "active" },
    subscription: { id: "sub", status: "ACTIVE", plan_slug: "qa", expires_at: null, grace_ends_at: null },
  };
}

describe("Phase 2.1 resource authorization", () => {
  it.each(["owner", "admin", "manager"])("keeps %s at company scope", (role) => {
    expect(resolveScope(access({ role, scopes: {} }), "properties.view")).toBe("company");
  });

  it("fails closed for a broker without a persisted scope", () => {
    expect(resolveScope(access({ scopes: {} }), "properties.view")).toBe("own");
  });

  it("builds company-scoped Property filter for Admin A", () => {
    expect(buildPropertyScopeFilter(access({ role: "admin", scopes: {} }))).toEqual({ companyId: "company-a" });
  });

  it("builds own/shared Property filter only for Broker A1", () => {
    expect(buildPropertyScopeFilter(access())).toEqual({
      companyId: "company-a",
      OR: [
        { responsibleUserId: "broker-a1" },
        { accessGrants: { some: { companyId: "company-a", userId: "broker-a1", permission: { in: ["VIEW", "EDIT", "VISIT", "INSPECT", "NEGOTIATE"] } } } },
      ],
    });
  });

  it("requires EDIT grant for a Broker Property mutation", () => {
    const filter = buildPropertyScopeFilter(access(), "properties.manage", "EDIT");
    expect(filter).toMatchObject({ companyId: "company-a", OR: [{ responsibleUserId: "broker-a1" }, { accessGrants: { some: { permission: { in: ["EDIT"] } } } }] });
  });

  it("does not accept client companyId or role in the Property filter", () => {
    const clientPayload = { companyId: "company-b", role: "admin" };
    const filter = buildPropertyScopeFilter(access());
    expect(filter.companyId).toBe("company-a");
    expect(JSON.stringify(filter)).not.toContain(clientPayload.companyId);
    expect(JSON.stringify(filter)).not.toContain(clientPayload.role);
  });

  it("keeps resource scope AND search OR without an OR collision", () => {
    const scope = buildPropertyScopeFilter(access());
    const where = buildPropertyListWhere("company-a", { page: 1, pageSize: 25, search: "A2" }, scope);
    expect(where.companyId).toBe("company-a");
    expect(where.AND).toHaveLength(2);
    expect(where.AND).toEqual(expect.arrayContaining([scope, expect.objectContaining({ OR: expect.any(Array) })]));
  });

  it("returns false when Property A2 is outside Broker A1 scope", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(canAccessProperty(access(), "property-a2", "properties.view", "VIEW", { property: { findFirst }, lead: {} } as never)).resolves.toBe(false);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "property-a2", AND: [expect.objectContaining({ companyId: "company-a" })] }) }));
  });

  it("maps out-of-scope Property GET/PATCH/DELETE to tenant-safe 404", async () => {
    const database = { property: { findFirst: vi.fn().mockResolvedValue(null) }, lead: {} } as never;
    await expect(assertPropertyAccess(access(), "property-a2", "properties.view", "VIEW", database)).rejects.toMatchObject({ statusCode: 404, code: "PROPERTY_NOT_FOUND" });
    await expect(assertPropertyAccess(access(), "property-a2", "properties.manage", "EDIT", database)).rejects.toMatchObject({ statusCode: 404, code: "PROPERTY_NOT_FOUND" });
  });

  it("allows Broker A2 to retain its own Property scope", () => {
    expect(buildPropertyScopeFilter(access({ userId: "broker-a2" }))).toMatchObject({ OR: [{ responsibleUserId: "broker-a2" }, expect.anything()] });
  });

  it("builds own/shared Lead filter only for Broker A1", () => {
    expect(buildLeadScopeFilter(access())).toEqual({
      companyId: "company-a",
      OR: [
        { assignedTo: "broker-a1" },
        { accessGrants: { some: { companyId: "company-a", userId: "broker-a1", permission: { in: ["VIEW", "EDIT", "VISIT", "INSPECT", "NEGOTIATE"] } } } },
      ],
    });
  });

  it("requires EDIT grant for a Broker Lead mutation", () => {
    expect(buildLeadScopeFilter(access(), "crm.manage", "EDIT")).toMatchObject({
      companyId: "company-a",
      OR: [{ assignedTo: "broker-a1" }, { accessGrants: { some: { permission: { in: ["EDIT"] } } } }],
    });
  });

  it("returns false for Lead A2 and cross-company Lead B", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const database = { property: {}, lead: { findFirst } } as never;
    await expect(canAccessLead(access(), "lead-a2", "crm.view", "VIEW", database)).resolves.toBe(false);
    await expect(canAccessLead(access(), "lead-b1", "crm.view", "VIEW", database)).resolves.toBe(false);
  });

  it("maps out-of-scope Lead IDOR to tenant-safe 404", async () => {
    const database = { property: {}, lead: { findFirst: vi.fn().mockResolvedValue(null) } } as never;
    await expect(assertLeadAccess(access(), "lead-a2", "crm.view", "VIEW", database)).rejects.toMatchObject({ statusCode: 404, code: "LEAD_NOT_FOUND" });
    await expect(assertLeadAccess(access(), "lead-a2", "crm.manage", "EDIT", database)).rejects.toMatchObject({ statusCode: 404, code: "LEAD_NOT_FOUND" });
  });

  it("allows a resource found inside the authenticated scope", async () => {
    const database = {
      property: { findFirst: vi.fn().mockResolvedValue({ id: "property-a1" }) },
      lead: { findFirst: vi.fn().mockResolvedValue({ id: "lead-a1" }) },
    } as never;
    await expect(canAccessProperty(access(), "property-a1", "properties.view", "VIEW", database)).resolves.toBe(true);
    await expect(canAccessLead(access(), "lead-a1", "crm.view", "VIEW", database)).resolves.toBe(true);
  });

  it("allows sharing management only at company scope", () => {
    expect(canManagePropertySharing(access())).toBe(false);
    expect(canManageLeadSharing(access())).toBe(false);
    const admin = access({ role: "admin", scopes: { "properties.manage": "company", "crm.manage": "company" } });
    expect(canManagePropertySharing(admin)).toBe(true);
    expect(canManageLeadSharing(admin)).toBe(true);
  });

  it("gives Broker properties.manage but not data.export", () => {
    const broker = roleTemplates.find((role) => role.systemKey === "broker")!;
    expect(broker.permissions).toContain("properties.manage");
    expect(broker.permissions).not.toContain("data.export");
  });

  it("keeps data.export in the canonical catalog for elevated roles", () => {
    expect(permissionCatalog.map(([key]) => key)).toContain("data.export");
    expect(roleTemplates.find((role) => role.systemKey === "admin")!.permissions).toContain("data.export");
  });
});
