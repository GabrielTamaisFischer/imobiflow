import { describe, expect, it } from "vitest";
import { buildSuggestedInspectionRooms, normalizeRoomKey, resolveRoomCategory, type SuggestedInspectionRoom } from "./inspection-rooms";
import type { InspectionPropertyBrief } from "./inspection-property-brief";

function brief(overrides: Partial<InspectionPropertyBrief> = {}): InspectionPropertyBrief {
  return {
    bedrooms: null,
    suites: null,
    bathrooms: null,
    parkingSpaces: null,
    propertyType: "apartment",
    privateArea: null,
    totalArea: null,
    amenities: {},
    suggestedFeatures: [],
    ...overrides,
  };
}

function names(rooms: SuggestedInspectionRoom[]) {
  return rooms.map((room) => room.name);
}

describe("buildSuggestedInspectionRooms", () => {
  it("apartamento com 3 quartos (1 suíte), 2 banheiros e vaga: sala/cozinha + quartos sem duplicar suíte", () => {
    const rooms = buildSuggestedInspectionRooms(
      brief({ propertyType: "apartment", bedrooms: 3, suites: 1, bathrooms: 2, parkingSpaces: 1 }),
    );
    expect(names(rooms)).toEqual(["Sala", "Cozinha", "Quarto 1", "Quarto 2", "Suíte", "Banheiro 1", "Banheiro 2", "Garagem"]);
  });

  it("casa com 0 suítes: todos os quartos ficam numerados, sem sugerir Suíte", () => {
    const rooms = buildSuggestedInspectionRooms(brief({ propertyType: "house", bedrooms: 2, suites: 0, bathrooms: 1 }));
    expect(names(rooms)).toEqual(["Sala", "Cozinha", "Quarto 1", "Quarto 2", "Banheiro"]);
  });

  it("suites nunca excede bedrooms mesmo com dado inconsistente no cadastro", () => {
    const rooms = buildSuggestedInspectionRooms(brief({ propertyType: "house", bedrooms: 2, suites: 5 }));
    // suites é travado em 2 (= bedrooms): não sobra quarto comum, e não aparecem 5 suítes.
    expect(names(rooms)).toEqual(["Sala", "Cozinha", "Suíte 1", "Suíte 2"]);
  });

  it("1 banheiro fica no singular, múltiplos ficam numerados", () => {
    expect(names(buildSuggestedInspectionRooms(brief({ bathrooms: 1 })))).toContain("Banheiro");
    expect(names(buildSuggestedInspectionRooms(brief({ bathrooms: 3 })))).toEqual(
      expect.arrayContaining(["Banheiro 1", "Banheiro 2", "Banheiro 3"]),
    );
  });

  it("terreno (land, sem dormitórios/banheiros no cadastro) não sugere nenhum ambiente", () => {
    const rooms = buildSuggestedInspectionRooms(brief({ propertyType: "land" }));
    expect(names(rooms)).toEqual([]);
  });

  it("tipo não residencial não sugere sala/cozinha mesmo quando bedrooms/bathrooms vêm preenchidos no cadastro", () => {
    const rooms = buildSuggestedInspectionRooms(brief({ propertyType: "office", bedrooms: 2, bathrooms: 1 }));
    expect(names(rooms)).not.toContain("Sala");
    expect(names(rooms)).not.toContain("Cozinha");
    // Quarto/Banheiro vêm de campos estruturados (bedrooms/bathrooms), não do
    // tipo do imóvel — se o cadastro tiver esses números, a sugestão reflete.
    expect(names(rooms)).toEqual(["Quarto 1", "Quarto 2", "Banheiro"]);
  });

  it("amenity relevante (Jardim) gera ambiente; amenity irrelevante (ex.: Churrasqueira Condominial) não gera", () => {
    const rooms = buildSuggestedInspectionRooms(
      brief({ propertyType: "house", suggestedFeatures: ["Jardim", "Churrasqueira Condominial"] }),
    );
    expect(names(rooms)).toContain("Jardim");
    expect(names(rooms)).not.toContain("Área gourmet");
    expect(names(rooms).some((name) => normalizeRoomKey(name).includes("condomini"))).toBe(false);
  });

  it("deduplica amenities equivalentes (Varanda/Sacada/Terraço e Área de serviço/Lavanderia)", () => {
    const rooms = buildSuggestedInspectionRooms(
      brief({
        propertyType: "apartment",
        suggestedFeatures: ["Varanda", "Sacada", "Terraço", "Área de serviço", "Lavanderia"],
      }),
    );
    expect(names(rooms).filter((name) => name === "Varanda")).toHaveLength(1);
    expect(names(rooms).filter((name) => name === "Área de serviço")).toHaveLength(1);
  });

  it("churrasqueira do próprio imóvel (não condominial) cai em Área gourmet, sem duplicar com Área gourmet já presente", () => {
    const rooms = buildSuggestedInspectionRooms(
      brief({ propertyType: "house", suggestedFeatures: ["Área gourmet", "Churrasqueira"] }),
    );
    expect(names(rooms).filter((name) => name === "Área gourmet")).toHaveLength(1);
  });

  it("é idempotente: mesma entrada produz sempre a mesma lista, na mesma ordem", () => {
    const input = brief({ propertyType: "apartment", bedrooms: 2, suites: 1, bathrooms: 1, parkingSpaces: 1, suggestedFeatures: ["Varanda"] });
    expect(buildSuggestedInspectionRooms(input)).toEqual(buildSuggestedInspectionRooms(input));
  });
});

describe("resolveRoomCategory", () => {
  it.each([
    ["Sala", "sala"],
    ["Cozinha", "cozinha"],
    ["Quarto 1", "quarto"],
    ["Suíte", "quarto"],
    ["Banheiro 2", "banheiro"],
    ["Lavabo", "banheiro"],
    ["Área de serviço", "area_servico"],
    ["Garagem", "garagem"],
    ["Quintal", "quintal"],
    ["Varanda", "varanda"],
    ["Escritório", "escritorio"],
    ["Depósito", "generic"],
    ["Outros", "generic"],
  ] as const)("%s → %s", (name, expected) => {
    expect(resolveRoomCategory(name)).toBe(expected);
  });
});
