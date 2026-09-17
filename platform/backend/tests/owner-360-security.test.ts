import { beforeEach, describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => ({
  database: {
    propertyOwner: { findFirst: vi.fn() },
    ownerProfile: { findFirst: vi.fn() },
    ownerDocumentRecord: { findMany: vi.fn() },
    ownerCheck: { findMany: vi.fn() },
    ownerConflict: { findMany: vi.fn() },
    authAuditLog: { create: vi.fn() },
  },
}));
vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));

import { getOwner360Data } from "../src/services/owner-360.js";

describe("Owner 360 permission and tenant boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.ownerProfile.findFirst.mockResolvedValue({
      identityJson: { full_name: "Pessoa QA" }, contactJson: {}, addressJson: {}, professionalJson: {}, financialJson: { income: 5000 }, creditJson: { score: 700 }, legalJson: { processes: [{ process_number: "secret" }] }, fiscalJson: { status: "REGULAR" }, provenanceJson: {}, confidenceJson: {}, treatmentConsentJson: {},
    });
    database.ownerDocumentRecord.findMany.mockResolvedValue([{ id: "doc-a", ownerId: "owner-a", storedFileId: "file-a", documentType: "CPF", title: "CPF QA", source: "manual", provider: "private", issuedAt: null, expiresAt: null, createdAt: new Date("2026-01-01"), linkedDomain: "identity", provenance: "document", confidence: "high", status: "VALID", verified: true, verifiedAt: new Date("2026-01-01"), documentNumber: "52998224725", contentHash: "hash" }]);
    database.ownerCheck.findMany.mockResolvedValue([]);
    database.ownerConflict.findMany.mockResolvedValue([]);
  });

  it("masks sensitive domains and private document metadata for a Broker", async () => {
    const result = await getOwner360Data({ companyId: "company-a", ownerId: "owner-a", actorUserId: "broker-a", permissions: ["owners.view", "owners.documents.view"] });
    expect(result.profile.financial).toBeNull();
    expect(result.profile.credit).toBeNull();
    expect(result.profile.legal).toBeNull();
    expect(result.profile.fiscal).toBeNull();
    expect(result.documents[0]).toMatchObject({ document_type: "CPF", verified: true });
    expect(result.documents[0].document_number).toBeNull();
    expect(result.documents[0].content_hash).toBeNull();
    expect(database.authAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "owner.360.viewed", companyId: "company-a" }) }));
  });

  it("returns tenant-safe 404 before reading another company's profile", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(null);
    await expect(getOwner360Data({ companyId: "company-a", ownerId: "owner-b", actorUserId: "admin-a", permissions: ["owners.view"] })).rejects.toMatchObject({ statusCode: 404, code: "OWNER_NOT_FOUND" });
    expect(database.ownerProfile.findFirst).not.toHaveBeenCalled();
  });
});
