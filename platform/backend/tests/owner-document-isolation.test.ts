import { beforeEach, describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => ({ database: { propertyOwner: { findFirst: vi.fn() } } }));
vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));

import { ensureOwnerDocumentAvailable } from "../src/services/mysql-real-estate.js";

describe("owner document tenant isolation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalizes and checks duplicates only inside the authenticated company", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(null);
    await expect(ensureOwnerDocumentAvailable("company-a", "529.982.247-25")).resolves.toBe("52998224725");
    expect(database.propertyOwner.findFirst).toHaveBeenCalledWith({
      where: { companyId: "company-a", document: "52998224725" },
      select: { id: true },
    });
  });

  it("returns a conflict for a duplicate and excludes the edited record", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-b" });
    await expect(ensureOwnerDocumentAvailable("company-a", "52998224725", "owner-a")).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_OWNER_DOCUMENT" });
    expect(database.propertyOwner.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "company-a", id: { not: "owner-a" } }),
    }));
  });
});
