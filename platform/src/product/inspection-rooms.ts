import type { InspectionPropertyBrief } from "./inspection-property-brief";
import type { Property } from "./real-estate";

/**
 * SUB-BLOCO 3 — geração determinística de ambientes sugeridos a partir do
 * cadastro do imóvel (buildInspectionPropertyBrief, Sub-bloco 2). Sem IA,
 * sem efeitos colaterais: só calcula uma lista de nomes. A decisão de criar
 * (ou não) os ambientes sugeridos, e de não sobrescrever uma vistoria que já
 * tem rooms, é da camada que chama esta função (ver app.vistorias.$inspectionId.tsx).
 */

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Chave de deduplicação: mesma grafia aparte acento/caixa/espaço nas bordas. */
export function normalizeRoomKey(name: string) {
  return stripAccents(name.trim().toLocaleLowerCase("pt-BR"));
}

/**
 * Tipos de imóvel em que "Sala" e "Cozinha" são ambientes previsíveis do
 * cadastro. Fora desta lista (terreno, box de garagem, galpão, loja, sala
 * comercial etc.) a sugestão fica mais enxuta — a ideia é acelerar o usuário,
 * não sugerir cômodos que normalmente não existem nesses tipos de imóvel.
 */
const RESIDENTIAL_TYPES_WITH_LIVING_KITCHEN = new Set<Property["property_type"]>([
  "apartment",
  "house",
  "commercial_house",
  "condo_house",
  "village_house",
  "farm_house",
  "penthouse",
  "flat",
  "kitnet",
  "loft",
  "townhouse",
  "studio",
]);

/**
 * Amenity (do checklist amenity_groups_json, já filtrado por
 * buildInspectionPropertyBrief em suggestedFeatures) → nome canônico de
 * ambiente. Mapeamento explícito e testável (diretriz do Sub-bloco 3): nem
 * toda amenity vira ambiente — só as deste mapa. Itens de área comum do
 * CONDOMÍNIO (ex.: "Churrasqueira Condominial") são ignorados de propósito:
 * a vistoria é da unidade, não das áreas comuns do prédio.
 */
const FEATURE_TO_ROOM_NAME: Record<string, string> = {
  "quintal": "Quintal",
  "jardim": "Jardim",
  "jardim de inverno": "Jardim",
  "lavabo": "Lavabo",
  "escritorio": "Escritório",
  "home office": "Escritório",
  "area de servico": "Área de serviço",
  "lavanderia": "Área de serviço",
  "closet": "Closet",
  "despensa": "Despensa",
  "copa": "Copa",
  "edicula": "Edícula",
  // Varanda/sacada/terraço/varanda envidraçada são tratados como a mesma
  // área externa de acesso pelo imóvel (dedup — diretriz "não duplicar").
  "varanda": "Varanda",
  "varanda envidracada": "Varanda",
  "sacada": "Varanda",
  "terraco": "Varanda",
  // Churrasqueira (não condominial) e área/espaço gourmet caem no mesmo
  // ambiente: a churrasqueira do próprio imóvel normalmente faz parte da
  // área gourmet, não é um cômodo isolado.
  "area gourmet": "Área gourmet",
  "espaco gourmet": "Área gourmet",
  "churrasqueira": "Área gourmet",
  "churrasqueira na varanda": "Área gourmet",
  // Piscina: sem dado estruturado que diga se é privativa ou de área comum.
  // Gera a sugestão (o corretor remove se for do condomínio, não da unidade).
  "piscina": "Piscina",
  "piscina adulto": "Piscina",
  "piscina infantil": "Piscina",
};

/** Amenities que NUNCA viram ambiente — ficam como item/feature de um
 * ambiente (ou apenas registradas no cadastro do imóvel), nunca cômodo. */
export const NON_ROOM_FEATURES = [
  "interfone",
  "ar-condicionado",
  "ar condicionado",
  "portão eletrônico",
  "aquecimento",
  "internet",
  "armário",
  "armários",
  "iluminação",
  "piso",
  "pintura",
  "churrasqueira condominial",
];

function pluralOrSingular(base: string, count: number, startAt = 1) {
  if (count <= 0) return [];
  if (count === 1) return [base];
  return Array.from({ length: count }, (_, index) => `${base} ${index + startAt}`);
}

export type SuggestedInspectionRoom = { name: string };

/**
 * Sugere ambientes a partir dos dados reais do imóvel. Determinístico, sem
 * IA. bedrooms/suites: assume-se que "suites" está DENTRO de "bedrooms" (ex.:
 * bedrooms=3, suites=1 → 2 quartos comuns + 1 suíte, nunca 3+1) — é a
 * convenção usual do mercado imobiliário brasileiro ("3 dormitórios, sendo 1
 * suíte") e não há, no cadastro atual, nenhum campo que contradiga essa
 * leitura. suites é sempre travado em <= bedrooms para nunca gerar números
 * negativos com dados inconsistentes.
 */
export function buildSuggestedInspectionRooms(brief: InspectionPropertyBrief): SuggestedInspectionRoom[] {
  const names: string[] = [];
  const seen = new Set<string>();
  function add(name: string) {
    const key = normalizeRoomKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    names.push(name);
  }

  if (RESIDENTIAL_TYPES_WITH_LIVING_KITCHEN.has(brief.propertyType)) {
    add("Sala");
    add("Cozinha");
  }

  const bedrooms = Math.max(brief.bedrooms ?? 0, 0);
  const suites = Math.min(Math.max(brief.suites ?? 0, 0), bedrooms);
  const plainBedrooms = bedrooms - suites;
  for (const name of pluralOrSingular("Quarto", plainBedrooms)) add(name);
  for (const name of pluralOrSingular("Suíte", suites)) add(name);

  const bathrooms = Math.max(brief.bathrooms ?? 0, 0);
  for (const name of pluralOrSingular("Banheiro", bathrooms)) add(name);

  if ((brief.parkingSpaces ?? 0) > 0) add("Garagem");

  for (const feature of brief.suggestedFeatures) {
    const key = normalizeRoomKey(feature);
    const roomName = FEATURE_TO_ROOM_NAME[key];
    if (roomName) add(roomName);
  }

  return names.map((name) => ({ name }));
}

export type InspectionRoomCategory =
  | "sala"
  | "cozinha"
  | "quarto"
  | "banheiro"
  | "area_servico"
  | "garagem"
  | "quintal"
  | "varanda"
  | "escritorio"
  | "generic";

/**
 * Resolve a categoria de presets de item a partir do NOME do ambiente —
 * funciona tanto para os nomes sugeridos (Sub-bloco 3) quanto para um
 * ambiente criado manualmente com um desses nomes ("Suíte 2", "Banheiro
 * social" etc.). Nome não reconhecido cai no preset genérico (generic).
 */
export function resolveRoomCategory(roomName: string): InspectionRoomCategory {
  const key = normalizeRoomKey(roomName);
  if (key.startsWith("sala")) return "sala";
  if (key.startsWith("cozinha")) return "cozinha";
  if (key.startsWith("quarto") || key.startsWith("suite")) return "quarto";
  if (key.startsWith("banheiro") || key.startsWith("lavabo")) return "banheiro";
  if (key.startsWith("area de servico") || key.startsWith("lavanderia")) return "area_servico";
  if (key.startsWith("garagem")) return "garagem";
  if (key.startsWith("quintal") || key.startsWith("area externa")) return "quintal";
  if (key.startsWith("varanda") || key.startsWith("terraco") || key.startsWith("sacada")) return "varanda";
  if (key.startsWith("escritorio") || key.startsWith("home office")) return "escritorio";
  return "generic";
}
