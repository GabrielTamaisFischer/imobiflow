import type { Property } from "./real-estate";

export const propertyStatusLabels: Record<Property["status"], string> = {
  draft: "Rascunho",
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
  rented: "Alugado",
  inactive: "Inativo",
  archived: "Arquivado",
};

export const propertyTypeLabels: Record<Property["property_type"], string> = {
  apartment: "Apartamento",
  industrial_area: "Área industrial",
  garage_box: "Box de garagem",
  house: "Casa",
  commercial_house: "Casa comercial",
  condo_house: "Casa em condomínio",
  village_house: "Casa em vila",
  farm_house: "Casa de fazenda",
  penthouse: "Cobertura",
  office: "Conjunto/sala comercial",
  farm: "Fazenda",
  flat: "Flat",
  warehouse: "Galpão",
  haras: "Haras",
  hotel: "Hotel",
  industry: "Indústria",
  kitnet: "Kitnet",
  loft: "Loft",
  mall_store: "Loja em shopping",
  store: "Loja/salão",
  land_condo: "Lote em condomínio",
  motel: "Motel",
  inn: "Pousada",
  building: "Prédio comercial",
  ranch: "Rancho",
  townhouse: "Sobrado",
  studio: "Studio",
  land: "Terreno",
  commercial: "Comercial (outro)",
  rural: "Rural (outro)",
  other: "Outro",
};

export function formatPropertyAddress(
  property: Pick<Property, "street" | "number" | "complement" | "neighborhood" | "city" | "state">,
) {
  const line1 = [property.street, property.number].filter(Boolean).join(", ");
  const withComplement = [line1, property.complement].filter(Boolean).join(" — ");
  const line2 = [property.neighborhood, property.city, property.state].filter(Boolean).join(", ");
  return [withComplement, line2].filter(Boolean).join(" · ");
}

/**
 * Checklist de infraestrutura (amenity_groups_json.infraestrutura) é texto
 * livre, não um booleano dedicado por utilidade. "Energia" e "Água" têm um
 * item exato nesse checklist (ver featureGroups em app.imoveis.tsx), então
 * dá para responder com segurança. "Gás" não tem um item equivalente único
 * (só combinações como "Chuveiro a gás"/"Estação gás") — inferir aqui seria
 * inventar dado, então fica sempre "não informado".
 */
export type UtilityAvailability = "available" | "unknown";

export function getUtilityAvailability(
  property: Pick<Property, "amenity_groups_json">,
): { energia: UtilityAvailability; agua: UtilityAvailability; gas: UtilityAvailability } {
  const infraestrutura = (property.amenity_groups_json?.infraestrutura ?? []).map((item) =>
    item.trim().toLocaleLowerCase("pt-BR"),
  );
  return {
    energia: infraestrutura.includes("energia") ? "available" : "unknown",
    agua: infraestrutura.includes("água") ? "available" : "unknown",
    gas: "unknown",
  };
}

/**
 * Itens de amenity_groups_json (lazer/serviços/infraestrutura) que podem
 * virar ambiente/área na vistoria. Lista curada e determinística — nenhuma
 * amenity fora desta lista é tratada como cômodo (ver diretriz do Sub-bloco
 * 3: "não tratar qualquer amenity como cômodo sem uma regra explícita").
 * Esta função só filtra; a geração real dos ambientes é do Sub-bloco 3.
 */
const ROOM_RELEVANT_FEATURES = new Set(
  [
    "Quintal", "Varanda", "Varanda Gourmet", "Varanda Envidraçada", "Churrasqueira",
    "Churrasqueira na varanda", "Churrasqueira Condominial", "Área gourmet", "Espaço gourmet",
    "Jardim", "Jardim de inverno", "Lavabo", "Escritório", "Home office", "Área de serviço",
    "Lavanderia", "Piscina", "Piscina adulto", "Piscina infantil", "Sacada", "Terraço",
    "Closet", "Despensa", "Copa", "Edícula",
  ].map((item) => item.toLocaleLowerCase("pt-BR")),
);

export type InspectionPropertyBrief = {
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  propertyType: Property["property_type"];
  privateArea: number | null;
  totalArea: number | null;
  /** Grupos de amenities como vieram do cadastro, sem filtrar. */
  amenities: Record<string, string[]>;
  /** Subconjunto curado de amenities que podem indicar um ambiente/área
   * extra na vistoria — entrada crua para o Sub-bloco 3, não o resultado
   * final de ambientes. */
  suggestedFeatures: string[];
};

/**
 * Normaliza os campos reais do imóvel que o Sub-bloco 3 vai usar para
 * sugerir ambientes. Não cria ambiente nenhum aqui — só organiza o dado.
 * Determinístico, sem IA, sem I/O.
 */
export function buildInspectionPropertyBrief(property: Property): InspectionPropertyBrief {
  const amenities = property.amenity_groups_json ?? {};
  const allAmenityItems = Object.values(amenities).flat();
  const suggestedFeatures = Array.from(
    new Set(allAmenityItems.filter((item) => ROOM_RELEVANT_FEATURES.has(item.trim().toLocaleLowerCase("pt-BR")))),
  );

  return {
    bedrooms: property.bedrooms,
    suites: property.suites,
    bathrooms: property.bathrooms,
    parkingSpaces: property.parking_spaces,
    propertyType: property.property_type,
    privateArea: property.private_area,
    totalArea: property.total_area,
    amenities,
    suggestedFeatures,
  };
}
