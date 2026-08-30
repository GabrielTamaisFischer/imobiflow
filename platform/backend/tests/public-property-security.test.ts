import { beforeEach, describe, expect, it, vi } from "vitest";

const { database } = vi.hoisted(() => ({
  database: {
    property: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({
  getPrisma: () => database,
}));

import {
  loadMysqlPublicProperties,
  loadMysqlPublicPropertyByReference,
  publicSiteView,
  serializeProperty,
} from "../src/services/mysql-real-estate.js";

const publishedProperty = {
  id: "11111111-1111-4111-8111-111111111111",
  companyId: "company-a",
  ownerId: "owner-a",
  code: "PUB-1",
  title: "Casa publicada",
  description: "Descrição pública",
  propertyType: "house",
  operation: "sale",
  status: "available",
  street: "Rua pública",
  number: "10",
  complement: "Fundos",
  neighborhood: "Centro",
  city: "Curitiba",
  state: "PR",
  country: "Brasil",
  zipCode: "80000-000",
  latitude: -25.4,
  longitude: -49.2,
  condominiumName: null,
  nearbyHighways: [],
  responsibleUserId: "user-internal",
  captureJson: { internal_source: "proprietário" },
  primaryDetailsJson: { visible: true },
  measurementsJson: {},
  bedrooms: 3,
  bathrooms: 2,
  suites: 1,
  parkingSpaces: 2,
  privateArea: 120,
  totalArea: 150,
  salePriceCents: 750_000_00,
  rentPriceCents: null,
  condominiumFeeCents: null,
  iptuCents: null,
  commercialTermsJson: { private_note: "negociável" },
  featuresJson: { pool: true },
  amenityGroupsJson: { leisure: ["Piscina"] },
  videosJson: [],
  publicationSettingsJson: { internal_channel: "portal-x" },
  descriptionTemplateKey: "internal-template",
  publishedAt: new Date("2026-08-05T12:00:00.000Z"),
  createdAt: new Date("2026-08-01T12:00:00.000Z"),
  updatedAt: new Date("2026-08-05T12:00:00.000Z"),
  owner: {
    id: "owner-a",
    name: "Pessoa Proprietária",
    phone: "+55 41 99999-0000",
    whatsapp: "+55 41 99999-0000",
    email: "owner@example.test",
  },
  media: [{
    id: "media-internal",
    companyId: "company-a",
    propertyId: "11111111-1111-4111-8111-111111111111",
    mediaType: "photo",
    url: "https://cdn.example.test/property.jpg",
    caption: "Fachada",
    position: 0,
    storageBucket: "private-bucket",
    storagePath: "company-a/private/object.jpg",
    mimeType: "image/jpeg",
    fileSize: 123_456,
    isCover: true,
    createdAt: new Date("2026-08-05T12:00:00.000Z"),
  }],
};

beforeEach(() => {
  vi.clearAllMocks();
  database.property.findMany.mockResolvedValue([publishedProperty]);
  database.property.findFirst.mockResolvedValue(publishedProperty);
});

describe("public property data boundary", () => {
  it("does not expose tenant, owner or storage internals in the public listing", async () => {
    const [property] = await loadMysqlPublicProperties(
      { companyId: "company-a", settingsJson: { show_full_address: false, show_prices: true } },
      6,
    );

    expect(property).not.toHaveProperty("company_id");
    expect(property).not.toHaveProperty("owner_id");
    expect(property).not.toHaveProperty("responsible_user_id");
    expect(property).not.toHaveProperty("capture_json");
    expect(property).not.toHaveProperty("commercial_terms_json");
    expect(property).not.toHaveProperty("publication_settings_json");
    expect(property).not.toHaveProperty("description_template_key");
    expect(property).not.toHaveProperty("property_owners");
    expect(property).toMatchObject({ latitude: null, longitude: null, condominium_name: null });
    expect(property.property_media[0]).toEqual({
      media_type: "photo",
      url: "https://cdn.example.test/property.jpg",
      caption: "Fachada",
      position: 0,
      is_cover: true,
    });
    expect(database.property.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: "company-a" }),
      select: expect.not.objectContaining({ owner: expect.anything() }),
    }));
  });

  it("keeps the public detail tenant-scoped and hides the full address by default", async () => {
    const property = await loadMysqlPublicPropertyByReference(
      { companyId: "company-a", settingsJson: { show_full_address: false } },
      publishedProperty.id,
    );

    expect(database.property.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: publishedProperty.id, companyId: "company-a" }),
    }));
    expect(property).toMatchObject({ street: null, number: null, complement: null, zip_code: null });
    expect(property).not.toHaveProperty("property_owners");
  });

  it("preserves private owner data only in the administrative serializer", () => {
    expect(serializeProperty(publishedProperty)).toMatchObject({
      company_id: "company-a",
      owner_id: "owner-a",
      property_owners: {
        id: "owner-a",
        name: "Pessoa Proprietária",
        phone: "+55 41 99999-0000",
        email: "owner@example.test",
      },
    });
  });

  it("still resolves an old shared slug by id suffix after the title/code changes (B2 — não quebra link público após edição)", async () => {
    // O slug público é derivado de code+title (texto de leitura), mas quem
    // realmente identifica o imóvel é o sufixo de 8 caracteres do id no
    // final do slug. Um link já compartilhado (WhatsApp, indexação, favorito
    // do cliente) foi gerado com o título ANTIGO — precisa continuar
    // resolvendo o mesmo imóvel mesmo depois que title/code mudam.
    const staleSlugFromBeforeTheEdit = "casa-antiga-11111111";

    const property = await loadMysqlPublicPropertyByReference(
      { companyId: "company-a", settingsJson: {} },
      staleSlugFromBeforeTheEdit,
    );

    expect(property.id).toBe(publishedProperty.id);
    expect(database.property.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId: "company-a",
        OR: expect.arrayContaining([{ id: { startsWith: "11111111" } }]),
      }),
    }));
  });

  it("preserves explicitly configured public address, prices and company contact", async () => {
    const property = await loadMysqlPublicPropertyByReference(
      { companyId: "company-a", settingsJson: { show_full_address: true, show_prices: true } },
      publishedProperty.id,
    );
    const site = publicSiteView({
      id: "site-a",
      slug: "company-a",
      customDomain: null,
      brandName: "Imobiliária A",
      headline: null,
      description: null,
      phone: "(41) 3000-0000",
      whatsapp: "554130000000",
      email: "contato@example.test",
      logoUrl: null,
      primaryColor: "#000000",
      settingsJson: {},
      seoJson: {},
      publishedAt: new Date("2026-08-05T12:00:00.000Z"),
    });

    expect(property).toMatchObject({
      street: "Rua pública",
      number: "10",
      latitude: -25.4,
      sale_price_cents: 750_000_00,
    });
    expect(site).toMatchObject({
      phone: "(41) 3000-0000",
      whatsapp: "554130000000",
      email: "contato@example.test",
    });
  });
});
