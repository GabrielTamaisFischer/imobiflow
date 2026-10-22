import { describe, expect, it } from "vitest";
import {
  buildInspectionPropertyBrief,
  formatPropertyAddress,
  getUtilityAvailability,
  propertyStatusLabels,
  propertyTypeLabels,
} from "./inspection-property-brief";
import type { Property } from "./real-estate";

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "property-1",
    company_id: "company-a",
    owner_id: null,
    code: "IMV-001",
    title: "Apartamento teste",
    description: null,
    property_type: "apartment",
    operation: "rent",
    status: "available",
    street: "Rua das Flores",
    number: "100",
    complement: null,
    neighborhood: "Centro",
    city: "São Paulo",
    state: "SP",
    country: "BR",
    zip_code: null,
    latitude: null,
    longitude: null,
    condominium_name: null,
    nearby_highways: [],
    responsible_user_id: null,
    capture_json: {},
    primary_details_json: {},
    measurements_json: {},
    bedrooms: 3,
    bathrooms: 2,
    suites: 1,
    parking_spaces: 1,
    private_area: 80,
    total_area: 90,
    sale_price_cents: null,
    rent_price_cents: null,
    condominium_fee_cents: null,
    iptu_cents: null,
    commercial_terms_json: {},
    features_json: {},
    amenity_groups_json: {},
    videos_json: [],
    publication_settings_json: {},
    description_template_key: null,
    published_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("formatPropertyAddress", () => {
  it("joins street, number, neighborhood, city and state", () => {
    const address = formatPropertyAddress(makeProperty());
    expect(address).toContain("Rua das Flores, 100");
    expect(address).toContain("Centro");
    expect(address).toContain("São Paulo");
  });

  it("does not break when every address field is missing", () => {
    const address = formatPropertyAddress(
      makeProperty({ street: null, number: null, complement: null, neighborhood: null, city: null, state: null }),
    );
    expect(address).toBe("");
  });
});

describe("getUtilityAvailability", () => {
  it("marks energia and água as available only when the exact checklist item exists", () => {
    const utilities = getUtilityAvailability(
      makeProperty({ amenity_groups_json: { infraestrutura: ["Energia", "Água", "Elevador"] } }),
    );
    expect(utilities).toEqual({ energia: "available", agua: "available", gas: "unknown" });
  });

  it("never fabricates gás availability, even when a gas-related amenity exists", () => {
    const utilities = getUtilityAvailability(
      makeProperty({ amenity_groups_json: { infraestrutura: ["Chuveiro a gás"] } }),
    );
    expect(utilities.gas).toBe("unknown");
  });

  it("does not break when amenity_groups_json is empty or missing the group", () => {
    expect(getUtilityAvailability(makeProperty({ amenity_groups_json: {} }))).toEqual({
      energia: "unknown",
      agua: "unknown",
      gas: "unknown",
    });
  });
});

describe("buildInspectionPropertyBrief", () => {
  it("normalizes primary structured fields as-is, without inventing room counts", () => {
    const brief = buildInspectionPropertyBrief(makeProperty({ bedrooms: 3, suites: 1, bathrooms: 2, parking_spaces: 1 }));
    expect(brief.bedrooms).toBe(3);
    expect(brief.suites).toBe(1);
    expect(brief.bathrooms).toBe(2);
    expect(brief.parkingSpaces).toBe(1);
  });

  it("keeps raw amenities untouched and derives a curated room-relevant subset", () => {
    const brief = buildInspectionPropertyBrief(
      makeProperty({
        amenity_groups_json: {
          lazer: ["Piscina", "Sauna"],
          servicos: ["Área de serviço"],
          infraestrutura: ["Elevador", "Varanda"],
        },
      }),
    );
    expect(brief.amenities.lazer).toEqual(["Piscina", "Sauna"]);
    expect(brief.suggestedFeatures).toEqual(expect.arrayContaining(["Piscina", "Área de serviço", "Varanda"]));
    expect(brief.suggestedFeatures).not.toContain("Sauna");
    expect(brief.suggestedFeatures).not.toContain("Elevador");
  });

  it("does not break when amenity_groups_json has no groups at all", () => {
    const brief = buildInspectionPropertyBrief(makeProperty({ amenity_groups_json: {} }));
    expect(brief.suggestedFeatures).toEqual([]);
  });
});

describe("label maps", () => {
  it("cover every PropertyType and property status value used by the card", () => {
    const property: Property["property_type"][] = [
      "apartment", "house", "studio", "land", "office", "other",
    ];
    for (const type of property) expect(propertyTypeLabels[type]).toBeTruthy();
    const statuses: Property["status"][] = ["draft", "available", "reserved", "sold", "rented", "inactive", "archived"];
    for (const status of statuses) expect(propertyStatusLabels[status]).toBeTruthy();
  });
});
