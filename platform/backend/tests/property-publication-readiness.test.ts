import { beforeEach, describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => ({
  database: {
    property: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));

import { syncMysqlPropertyPublication } from "../src/services/mysql-real-estate.js";

const completeProperty = {
  id: "property-a",
  companyId: "company-a",
  ownerId: "owner-a",
  title: "Apartamento sintético",
  description: "Descrição sintética completa.",
  zipCode: "01001000",
  city: "São Paulo",
  state: "SP",
  operation: "sale",
  salePriceCents: 500_000_00,
  rentPriceCents: null,
  commercialTermsJson: {},
  publicationSettingsJson: { site_enabled: true, site_featured: true },
  status: "available",
  publishedAt: null,
  siteFeatured: false,
  media: [{ id: "cover-a" }],
};

describe("property site publication readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database.property.findFirst.mockResolvedValue({ ...completeProperty });
    database.property.update.mockResolvedValue({});
  });

  it("publishes only a complete property and synchronizes featured state", async () => {
    await expect(syncMysqlPropertyPublication("company-a", "property-a")).resolves.toEqual({ ready: true, published: true });
    expect(database.property.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "property-a", companyId: "company-a" } }));
    expect(database.property.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ publishedAt: expect.any(Date), siteFeatured: true }) }));
  });

  it.each([
    ["owner", { ownerId: null }],
    ["title", { title: "Rascunho sem título" }],
    ["address", { zipCode: null }],
    ["price", { salePriceCents: null }],
    ["cover", { media: [] }],
    ["status", { status: "draft" }],
  ])("keeps an incomplete property unpublished when %s is missing", async (_label, change) => {
    database.property.findFirst.mockResolvedValue({ ...completeProperty, ...change });
    await expect(syncMysqlPropertyPublication("company-a", "property-a")).resolves.toEqual({ ready: false, published: false });
  });

  it("unpublishes without deleting data when site permission is disabled", async () => {
    database.property.findFirst.mockResolvedValue({
      ...completeProperty,
      publishedAt: new Date("2026-08-14T12:00:00.000Z"),
      siteFeatured: true,
      publicationSettingsJson: { site_enabled: false, site_featured: true },
    });
    await syncMysqlPropertyPublication("company-a", "property-a");
    expect(database.property.update).toHaveBeenCalledWith(expect.objectContaining({ data: { publishedAt: null, siteFeatured: false } }));
  });

  it("preserves an existing publication only when explicitly requested for a commercial edit", async () => {
    const publishedAt = new Date("2026-08-14T12:00:00.000Z");
    database.property.findFirst.mockResolvedValue({
      ...completeProperty,
      ownerId: null,
      zipCode: null,
      media: [],
      publishedAt,
    });
    await expect(syncMysqlPropertyPublication("company-a", "property-a", { preserveExistingOnIncomplete: true }))
      .resolves.toEqual({ ready: false, published: true });
    expect(database.property.update).toHaveBeenCalledWith(expect.objectContaining({ data: { publishedAt, siteFeatured: true } }));
  });
});
