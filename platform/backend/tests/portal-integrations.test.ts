import { describe, expect, it } from "vitest";
import {
  buildPortalFeedItem,
  buildPortalFeedXml,
  normalizePortalLeadPayload,
} from "../src/services/portal-integrations.js";

describe("portal integrations", () => {
  it("normaliza lead externo de portal para o CRM", () => {
    const lead = normalizePortalLeadPayload("zap_imoveis", {
      company_id: "company-123",
      listingId: "ZAP-999",
      lead: {
        id: "lead-abc",
        name: "Maria Compradora",
        email: "maria@example.com",
        phone: "(11) 99999-0000",
      },
      message: "Tenho interesse no imóvel.",
    });

    expect(lead.provider).toBe("zap_imoveis");
    expect(lead.companyId).toBe("company-123");
    expect(lead.externalListingId).toBe("ZAP-999");
    expect(lead.externalLeadId).toBe("lead-abc");
    expect(lead.name).toBe("Maria Compradora");
    expect(lead.email).toBe("maria@example.com");
    expect(lead.phone).toBe("(11) 99999-0000");
  });

  it("gera item de feed sem expor endereco completo", () => {
    const item = buildPortalFeedItem({
      publication: {
        id: "publication-1",
        provider: "olx",
        external_listing_id: "OLX-001",
        listing_url: null,
        published_at: "2026-05-18T12:00:00.000Z",
        metadata: {},
      },
      property: {
        id: "property-1",
        code: "AP-100",
        title: "Apartamento central",
        description: "Apartamento com excelente localizacao.",
        property_type: "apartment",
        operation: "both",
        status: "available",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
        bedrooms: 2,
        bathrooms: 1,
        suites: 1,
        parking_spaces: 1,
        private_area: 72,
        total_area: 95,
        sale_price_cents: 55000000,
        rent_price_cents: 320000,
        condominium_fee_cents: 59000,
        iptu_cents: 18000,
        features_json: { elevator: true },
        published_at: "2026-05-18T12:00:00.000Z",
        property_media: [
          {
            id: "media-1",
            media_type: "photo",
            url: "https://example.com/capa.jpg",
            caption: "Capa",
            position: 1,
            is_cover: true,
          },
        ],
      },
    });

    expect(item.id).toBe("OLX-001");
    expect(item.transaction_types).toEqual(["sale", "rent"]);
    expect(item.address).toEqual({ neighborhood: "Centro", city: "São Paulo", state: "SP" });
    expect(item.media[0]?.cover).toBe(true);
  });

  it("gera XML de feed com dados publicos e caracteres escapados", () => {
    const listing = buildPortalFeedItem({
      publication: {
        id: "publication-xml",
        provider: "viva_real",
        external_listing_id: "VR-001",
        listing_url: "https://portal.example.com/imovel/vr-001",
        published_at: "2026-05-18T12:00:00.000Z",
        metadata: {},
      },
      property: {
        id: "property-xml",
        code: "CASA-1",
        title: "Casa com varanda & piscina",
        description: "Imóvel pronto para morar <alto padrão>.",
        property_type: "house",
        operation: "sale",
        status: "available",
        neighborhood: "Jardins",
        city: "São Paulo",
        state: "SP",
        bedrooms: 3,
        bathrooms: 2,
        suites: 1,
        parking_spaces: 2,
        private_area: 180,
        total_area: 240,
        sale_price_cents: 120000000,
        rent_price_cents: null,
        condominium_fee_cents: null,
        iptu_cents: 45000,
        features_json: { pool: true },
        published_at: "2026-05-18T12:00:00.000Z",
        property_media: [],
      },
    });

    const xml = buildPortalFeedXml({
      provider: "viva_real",
      providerLabel: "Viva Real",
      company: {
        id: "company-xml",
        name: "Imobiliária & Filhos",
        status: "active",
        email: "contato@example.com",
        phone: "(11) 3000-0000",
      },
      generatedAt: "2026-05-18T13:00:00.000Z",
      listings: [listing],
    });

    expect(xml).toContain("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
    expect(xml).toContain("<Provider>viva_real</Provider>");
    expect(xml).toContain("<Title>Casa com varanda &amp; piscina</Title>");
    expect(xml).toContain("<Description>Imóvel pronto para morar &lt;alto padrão&gt;.</Description>");
    expect(xml).toContain("<Neighborhood>Jardins</Neighborhood>");
    expect(xml).not.toContain("<Street>");
  });
});
