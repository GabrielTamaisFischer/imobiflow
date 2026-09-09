import { describe, expect, it } from "vitest";
import { loadBuyerPortal, loadTenantPortal, partyWhere, portalDocumentDto, portalInspectionDto } from "../src/services/portal-f8a.js";
import { requirePortalParty } from "../src/routes/portal-mysql.js";

const tenant = { id: "party-tenant-a", companyId: "company-a", name: "Tenant A", email: "tenant@example.test", partyType: "tenant" as const };
const buyer = { id: "party-buyer-a", companyId: "company-a", name: "Buyer A", email: "buyer@example.test", partyType: "buyer" as const };
const contract = {
  id: "contract-a", propertyId: "property-a", leadId: "lead-a", entryInspectionId: null, exitInspectionId: null,
  title: "Contrato QA", contractType: "rental", status: "waiting_signature", startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: null,
  currentVersion: 1, signedVersion: null, property: { id: "property-a", code: "QA-A", title: "Imóvel A", city: "São Paulo", state: "SP" },
  parties: [
    { id: tenant.id, partyType: "tenant", name: tenant.name, signatureRequired: true, signatureStatus: "pending", signedAt: null },
    { id: buyer.id, partyType: "buyer", name: buyer.name, signatureRequired: true, signatureStatus: "pending", signedAt: null },
    { id: "party-other", partyType: "tenant", name: "Other Tenant", signatureRequired: true, signatureStatus: "pending", signedAt: null },
  ],
  versions: [], events: [{ eventType: "contract.created", createdAt: new Date("2026-09-01T00:00:00Z") }],
};

describe("F8A — portais externos tenant/buyer", () => {
  it("normaliza email apenas para consultas auxiliares", () => {
    expect(partyWhere("company-a", " Tenant@Example.Test ", "tenant")).toEqual({ companyId: "company-a", email: "tenant@example.test", partyType: "tenant" });
  });

  it("não expõe provider, publicId ou secureUrl em documento", () => {
    const dto = portalDocumentDto({ id: "file-a", purpose: "contract_document", originalFilename: "contrato.pdf", mimeType: "application/pdf", sizeBytes: 10, createdAt: new Date("2026-09-01T00:00:00Z"), provider: "cloudinary", publicId: "internal", secureUrl: "https://provider.invalid" }, contract.id, "version-a", "tenant");
    expect(dto.download_path).toBe("/portal/tenant/contracts/contract-a/document?version_id=version-a");
    expect(dto).not.toHaveProperty("provider");
    expect(dto).not.toHaveProperty("publicId");
    expect(dto).not.toHaveProperty("secureUrl");
  });

  it("serializa inspeção sem internals de storage", () => {
    const dto = portalInspectionDto({ id: "inspection-a", propertyId: "property-a", type: "entry", status: "completed", completedAt: new Date("2026-09-02T00:00:00Z"), archivedAt: null, createdAt: new Date("2026-09-01T00:00:00Z"), updatedAt: new Date("2026-09-02T00:00:00Z"), rooms: [{ id: "room-a", name: "Sala", position: 0, notes: null, items: [{ id: "item-a", name: "Piso", condition: "good", position: 0, notes: null }] }], evidence: [{ id: "evidence-a", roomId: "room-a", itemId: "item-a", caption: null, position: 0, createdAt: new Date("2026-09-01T00:00:00Z"), storedFile: { originalFilename: "foto.jpg", mimeType: "image/jpeg", sizeBytes: 2, publicId: "internal" } }], events: [] });
    expect(dto.rooms[0].items[0].condition).toBe("good");
    expect(dto.evidence[0]).not.toHaveProperty("publicId");
  });

  it("tenant consulta por partyId + company e não vaza outra parte do mesmo contrato", async () => {
    const calls: any[] = [];
    const db = {
      contract: { findMany: async (args: any) => { calls.push(args); return [contract]; } },
      storedFile: { findMany: async () => [] },
      inspection: { findMany: async () => [] },
    };
    const result = await loadTenantPortal(db, tenant);
    expect(calls[0].where).toMatchObject({ companyId: "company-a", parties: { some: { id: tenant.id, companyId: "company-a", partyType: "tenant" } } });
    expect(result?.contracts[0].party.map((party: any) => party.id)).toEqual([tenant.id]);
    expect(result?.contracts[0].party.map((party: any) => party.name)).not.toContain("Other Tenant");
  });

  it("buyer limita commercial context aos leads referenciados nos próprios contratos", async () => {
    const calls: any[] = [];
    const db = {
      contract: { findMany: async (args: any) => { calls.push(["contract", args]); return [contract]; } },
      lead: { findMany: async (args: any) => { calls.push(["lead", args]); return [{ id: "lead-a", name: "Buyer A", email: buyer.email, status: "open", propertyReference: null, stage: { id: "stage-a", name: "Novo", position: 0 }, siteLeads: [] }]; } },
      appointment: { findMany: async (args: any) => { calls.push(["appointment", args]); return []; } },
      storedFile: { findMany: async () => [] },
      inspection: { findMany: async () => [] },
    };
    const result = await loadBuyerPortal(db, buyer);
    expect(calls[0][1].where).toMatchObject({ companyId: "company-a", parties: { some: { id: buyer.id, companyId: "company-a", partyType: "buyer" } } });
    expect(calls[1][1].where).toMatchObject({ companyId: "company-a", id: { in: ["lead-a"] } });
    expect(result?.commercial[0].id).toBe("lead-a");
    expect(result?.contracts[0].party.map((party: any) => party.id)).toEqual([buyer.id]);
  });

  it("buyer sem contrato não recebe agregado", async () => {
    const db = { contract: { findMany: async () => [] } };
    await expect(loadBuyerPortal(db, buyer)).resolves.toBeNull();
  });

  it("portal sem bearer token responde 401 controlado", async () => {
    const middleware = requirePortalParty("tenant");
    let statusCode = 200;
    let body: any = null;
    const req: any = { headers: {} };
    const res: any = { status(code: number) { statusCode = code; return this; }, json(value: any) { body = value; return this; } };
    await middleware(req, res, () => undefined);
    expect(statusCode).toBe(401);
    expect(body.error).toBe("PORTAL_AUTH_REQUIRED");
  });
});
