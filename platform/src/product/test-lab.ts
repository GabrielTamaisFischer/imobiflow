import { createAppointment, listAppointments, type AppointmentInput } from "./agenda";
import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import {
  createInspection,
  createInspectionItem,
  createInspectionMedia,
  generateInspectionPdf,
  listInspections,
  loadInspectionRooms,
  updateInspectionRoom,
  type Inspection,
  type InspectionItemInput,
} from "./inspections";
import {
  createOwner,
  createProperty,
  getProperty,
  listAllProperties,
  uploadPropertyMedia,
  type OwnerInput,
  type Property,
  type PropertyInput,
} from "./real-estate";

const previewOwnersKey = "imobiflow.preview.property_owners";
const previewPropertiesKey = "imobiflow.preview.properties";
const previewAppointmentsKey = "imobiflow.preview.appointments";
const previewInspectionsKey = "imobiflow.preview.inspections";
const previewRoomsKey = "imobiflow.preview.inspection_rooms";
const previewItemsKey = "imobiflow.preview.inspection_items";
const previewMediaKey = "imobiflow.preview.inspection_media";
const previewSignaturesKey = "imobiflow.preview.inspection_signatures";

export type TestPropertyScenario = {
  key: string;
  label: string;
  normalized_type: PropertyInput["property_type"];
  operation: PropertyInput["operation"];
  status: PropertyInput["status"];
  code: string;
  title: string;
  owner: OwnerInput;
  property: PropertyInput;
};

export type TestScenarioPlan = {
  properties: TestPropertyScenario[];
  appointments: Array<{ property_code: string; input: Omit<AppointmentInput, "property_id"> }>;
  inspections: Array<{
    property_code: string;
    inspection_type: Inspection["inspection_type"];
    title: string;
    summary: string;
  }>;
  coverage: {
    property_type_options: string[];
    normalized_property_types: PropertyInput["property_type"][];
    operations: PropertyInput["operation"][];
    statuses: PropertyInput["status"][];
    feature_groups: string[];
    media_per_property: number;
    media_per_inspection_room: number;
    inspection_property_limit: number;
    media_source: "real_external_images";
  };
};

export type TestLabRunResult = {
  created: {
    owners: number;
    properties: number;
    media: number;
    appointments: number;
    inspections: number;
    inspection_items: number;
    inspection_media: number;
    pdfs: number;
    leads?: number;
    site_leads?: number;
    site?: number;
  };
  skipped: {
    properties: number;
    appointments: number;
    inspections: number;
  };
  totals: {
    planned_properties: number;
    planned_appointments: number;
    planned_inspections: number;
  };
};

export type TestLabClearResult = {
  properties: number;
  owners: number;
  appointments: number;
  inspections: number;
  rooms: number;
  items: number;
  media: number;
  signatures: number;
  leads?: number;
  site_leads?: number;
};

const propertyTypeScenarios = [
  ["apartment", "Apartamento", "apartment"],
  ["industrial_area", "Área Industrial", "commercial"],
  ["garage_box", "BOX/Garagem", "other"],
  ["house", "Casa", "house"],
  ["commercial_house", "Casa Comercial", "commercial"],
  ["condo_house", "Casa de condomínio", "house"],
  ["village_house", "Casa de vila", "house"],
  ["farm_house", "Chácara", "rural"],
  ["penthouse", "Cobertura", "apartment"],
  ["office", "Conjunto comercial / Sala", "commercial"],
  ["farm", "Fazenda", "rural"],
  ["flat", "Flat", "apartment"],
  ["warehouse", "Galpão/Depósito/Armazém", "commercial"],
  ["haras", "Haras", "rural"],
  ["hotel", "Hotel", "commercial"],
  ["industry", "Indústria", "commercial"],
  ["kitnet", "Kitnet", "apartment"],
  ["loft", "Loft", "apartment"],
  ["mall_store", "Loja shopping/CT comercial", "commercial"],
  ["store", "Loja/Salão", "commercial"],
  ["land_condo", "Loteamento/Condomínio", "land"],
  ["motel", "Motel", "commercial"],
  ["inn", "Pousada/Chalé", "commercial"],
  ["building", "Prédio inteiro", "commercial"],
  ["ranch", "Sítio", "rural"],
  ["townhouse", "Sobrado", "house"],
  ["studio", "Studio", "apartment"],
  ["land", "Terreno", "land"],
  ["other", "Outro", "other"],
] as const;

const featureGroups = {
  infraestrutura: ["220V", "Água", "Ar condicionado", "Energia solar", "Portão eletrônico", "Vista para o mar"],
  lazer: ["Academia", "Área gourmet", "Churrasqueira", "Piscina", "Playground", "Salão de festas"],
  piso: ["Cerâmica", "Granito", "Laminado", "Mármore", "Porcelanato", "Vinílico"],
  servicos: ["Área de serviço", "Caseiro", "Cozinha", "Despensa", "Recepção", "Zelador"],
  estrutura: ["Acesso asfaltado", "Área murada", "Heliponto", "Poço artesiano", "Pomar", "Rio"],
  culturas: ["Cana de açúcar", "Citrus", "Fruticultura", "Grãos", "Pastagem", "Pecuária"],
};

const realImagePools: Partial<Record<PropertyInput["property_type"], string[]>> = {
  apartment: [
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1600210492493-0946911123ea?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1400&q=82",
  ],
  house: [
    "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1600607687644-c7171b42498b?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1572120360610-d971b9d7767c?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=1400&q=82",
  ],
  commercial: [
    "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1564069114553-7215e1ff1890?auto=format&fit=crop&w=1400&q=82",
  ],
  land: [
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1473773508845-188df298d2d1?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1400&q=82",
  ],
  rural: [
    "https://images.unsplash.com/photo-1500076656116-558758c991c1?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1523741543316-beb7fc7023d8?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1444858291040-58f756a3bdd6?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1400&q=82",
  ],
  other: [
    "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1560184897-ae75f418493e?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1599423300746-b62533397364?auto=format&fit=crop&w=1400&q=82",
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1400&q=82",
  ],
};

const inspectionRoomSeedImages: Record<string, string> = {
  Sala: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=82",
  Cozinha: "https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1200&q=82",
  Banheiro: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=1200&q=82",
  "Entrega de chaves e acessórios":
    "https://images.unsplash.com/photo-1582407947304-fd86f028f716?auto=format&fit=crop&w=1200&q=82",
};

const propertyImageQueries: Partial<Record<PropertyInput["property_type"], string[]>> = {
  apartment: [
    "apartment interior",
    "modern apartment",
    "living room apartment",
    "apartment bedroom",
    "apartment kitchen",
    "apartment bathroom",
    "balcony apartment",
    "condominium pool",
    "apartment facade",
    "home office apartment",
    "laundry room apartment",
    "garage apartment",
  ],
  house: [
    "house facade",
    "modern house interior",
    "house living room",
    "house kitchen",
    "house bedroom",
    "house bathroom",
    "backyard house",
    "garage house",
    "home garden",
    "house dining room",
    "house balcony",
    "family home",
  ],
  commercial: [
    "commercial office",
    "office interior",
    "meeting room",
    "retail store",
    "warehouse",
    "industrial building",
    "commercial facade",
    "logistics warehouse",
    "coworking office",
    "showroom",
    "factory floor",
    "commercial hall",
  ],
  land: [
    "empty land",
    "building lot",
    "urban land",
    "green field",
    "construction land",
    "roadside land",
    "landscape plot",
    "development land",
    "open terrain",
    "rural road",
    "mountain land",
    "forest land",
  ],
  rural: [
    "farm house",
    "rural property",
    "country house",
    "farm field",
    "barn farm",
    "ranch landscape",
    "lake farm",
    "rural road",
    "orchard farm",
    "horse ranch",
    "countryside house",
    "farm interior",
  ],
  other: [
    "real estate interior",
    "property facade",
    "home interior",
    "modern room",
    "garage property",
    "building exterior",
    "real estate kitchen",
    "real estate bathroom",
    "real estate bedroom",
    "property details",
    "architecture interior",
    "real estate tour",
  ],
};

const inspectionRoomImageQueries: Record<string, string[]> = {
  Sala: [
    "living room",
    "sofa interior",
    "wall paint",
    "home flooring",
    "window living room",
    "electrical outlet",
    "living room door",
    "ceiling interior",
    "light switch",
    "room details",
    "empty living room",
    "home inspection",
  ],
  Cozinha: [
    "kitchen sink",
    "kitchen cabinets",
    "kitchen faucet",
    "kitchen counter",
    "kitchen floor",
    "kitchen wall",
    "stove kitchen",
    "kitchen window",
    "kitchen plumbing",
    "kitchen details",
    "empty kitchen",
    "kitchen inspection",
  ],
  Banheiro: [
    "bathroom sink",
    "bathroom shower",
    "toilet bathroom",
    "bathroom tile",
    "bathroom mirror",
    "bathroom floor",
    "bathroom faucet",
    "bathroom box",
    "bathroom wall",
    "bathroom details",
    "empty bathroom",
    "bathroom inspection",
  ],
  Quarto: [
    "bedroom interior",
    "empty bedroom",
    "bedroom wall",
    "bedroom window",
    "bedroom floor",
    "closet bedroom",
    "bedroom door",
    "bedroom ceiling",
    "bedroom outlet",
    "bedroom details",
    "wardrobe bedroom",
    "bedroom inspection",
  ],
  "Área de serviço": [
    "laundry room",
    "service area",
    "washing machine area",
    "laundry sink",
    "laundry floor",
    "laundry wall",
    "service area window",
    "cleaning area",
    "utility room",
    "laundry details",
    "empty laundry room",
    "laundry inspection",
  ],
  "Entrega de chaves e acessórios": [
    "house keys",
    "door keys",
    "garage remote control",
    "door lock",
    "keychain",
    "access control",
    "intercom",
    "electronic lock",
    "mailbox key",
    "property keys",
    "home keys",
    "key handover",
  ],
};

const mediaPerProperty = 24;
const mediaPerInspectionRoom = 12;
const inspectionPropertyLimit = 12;

const inspectionChecklist: Record<string, Array<InspectionItemInput & { label: string }>> = {
  Sala: [
    { label: "Pintura da parede", category: "Sala", condition: "good", notes: "Pintura em bom estado, sem avarias aparentes." },
    { label: "Piso", category: "Sala", condition: "good", notes: "Piso limpo, com pequenos sinais de uso." },
    { label: "Tomadas", category: "Elétrica", condition: "not_checked", notes: "Tomadas pendentes de teste funcional." },
  ],
  Cozinha: [
    { label: "Pia", category: "Cozinha", condition: "good", notes: "Pia em bom estado, sem vazamentos aparentes." },
    { label: "Armários", category: "Cozinha", condition: "regular", notes: "Armários em estado regular, com marcas de uso." },
    { label: "Torneira", category: "Hidráulica", condition: "good", notes: "Torneira funcionando no momento da vistoria." },
  ],
  Banheiro: [
    { label: "Vaso sanitário", category: "Banheiro", condition: "good", notes: "Vaso sanitário em bom estado." },
    { label: "Box", category: "Banheiro", condition: "regular", notes: "Box com pequenos sinais de uso." },
    { label: "Chuveiro", category: "Hidráulica", condition: "not_checked", notes: "Chuveiro pendente de teste." },
  ],
  "Entrega de chaves e acessórios": [
    { label: "Chaves do imóvel", category: "Entrega de chaves", condition: "good", notes: "Chaves conferidas no ato da vistoria." },
    { label: "Controles da garagem", category: "Entrega de chaves", condition: "not_checked", notes: "Controle pendente de teste funcional." },
    { label: "Fechadura eletrônica", category: "Entrega de chaves", condition: "good", notes: "Senha entregue para conferência." },
  ],
};

export function createTestScenarioPlan(): TestScenarioPlan {
  const properties = propertyTypeScenarios.map(([key, label, normalizedType], index) => {
    const operation = chooseOperation(index);
    const status = chooseStatus(index);
    const code = `QA-${String(index + 1).padStart(4, "0")}`;
    const city = index % 3 === 0 ? "São Paulo" : index % 3 === 1 ? "São Caetano do Sul" : "Santo André";
    const neighborhood = index % 4 === 0 ? "Centro" : index % 4 === 1 ? "Jardim São Caetano" : index % 4 === 2 ? "Barcelona" : "Campestre";
    const title = `${label} QA ${index + 1}`;
    const salePrice = 380_000_00 + index * 23_500_00;
    const rentPrice = 2_100_00 + index * 120_00;

    const owner: OwnerInput = {
      owner_type: index % 5 === 0 ? "company" : "individual",
      client_type: "proprietario",
      name: `Proprietário QA ${String(index + 1).padStart(2, "0")}`,
      document: index % 5 === 0 ? `12.345.67${index}/0001-00` : `123.456.78${index}-00`,
      email: `proprietario.qa.${index + 1}@imobiflow.test`,
      phone: `(11) 400${index}-1000`,
      whatsapp: `(11) 9${String(8000 + index).padStart(4, "0")}-0000`,
      residential_phone: `(11) 300${index}-2000`,
      commercial_phone: `(11) 500${index}-3000`,
      address_json: {
        zip_code: `095${String(100 + index).padStart(3, "0")}00`,
        state: "SP",
        city,
        neighborhood,
        street: `Rua QA Proprietário ${index + 1}`,
        number: String(100 + index),
        complement: index % 2 === 0 ? "Sala 12" : "Casa",
        country: "Brasil",
      },
      notes: "Registro gerado automaticamente pelo laboratório de testes em modo preview.",
    };

    const property: PropertyInput = {
      owner_id: undefined,
      responsible_user_id: "preview-user",
      code,
      title,
      description: buildPropertyDescription(label, city, neighborhood, operation),
      property_type: normalizedType,
      operation,
      status,
      street: `Rua QA Imóvel ${index + 1}`,
      number: String(200 + index),
      complement: normalizedType === "apartment" ? `Apto ${10 + index}` : "",
      neighborhood,
      city,
      state: "SP",
      country: "Brasil",
      zip_code: `095${String(200 + index).padStart(3, "0")}00`,
      latitude: -23.55 + index / 1000,
      longitude: -46.63 - index / 1000,
      condominium_name: normalizedType === "apartment" ? `Condomínio QA ${index + 1}` : "",
      nearby_highways: ["Anchieta", "Imigrantes"].slice(0, index % 2 === 0 ? 2 : 1),
      bedrooms: normalizedType === "commercial" || normalizedType === "land" ? 0 : (index % 4) + 1,
      bathrooms: (index % 3) + 1,
      suites: normalizedType === "commercial" || normalizedType === "land" ? 0 : index % 2,
      parking_spaces: index % 5,
      private_area: 45 + index * 8,
      total_area: 80 + index * 12,
      sale_price_cents: operation === "rent" ? undefined : salePrice,
      rent_price_cents: operation === "sale" ? undefined : rentPrice,
      condominium_fee_cents: normalizedType === "apartment" ? 550_00 + index * 25_00 : undefined,
      iptu_cents: 120_00 + index * 12_00,
      capture_json: {
        source_type_key: key,
        source_type_label: label,
        captador: "Equipe QA",
        key_location: "Portaria",
        has_sign: index % 2 === 0,
        is_exclusive: index % 3 === 0,
        exclusive_until: "2026-12-31",
        partnership: index % 4 === 0,
      },
      primary_details_json: {
        source_type_key: key,
        source_type_label: label,
        accepts_exchange: index % 2 === 0,
        accepts_financing: index % 3 !== 0,
        topography: index % 3 === 0 ? "Plano" : index % 3 === 1 ? "Aclive" : "Declive",
        docks_total: normalizedType === "commercial" ? index % 4 : 0,
        floor_resistance_ton_m2: normalizedType === "commercial" ? 5 + index : 0,
      },
      measurements_json: {
        ceiling_height: normalizedType === "commercial" ? 6 + index / 10 : 2.8,
        land_area_m2: 100 + index * 15,
        built_area_m2: 60 + index * 9,
        office_area_m2: normalizedType === "commercial" ? 30 + index : 0,
        yard_area_m2: normalizedType === "house" || normalizedType === "rural" ? 25 + index : 0,
      },
      commercial_terms_json: {
        original_sale_price_cents: operation === "rent" ? undefined : salePrice,
        original_rent_price_cents: operation === "sale" ? undefined : rentPrice,
        adjustment_type: index % 2 === 0 ? "percentage_add" : "fixed_discount",
        adjustment_value: index % 2 === 0 ? 5 : 10_000_00,
        commission_type: index % 2 === 0 ? "percentage" : "fixed",
        commission_value: index % 2 === 0 ? 6 : 20_000_00,
        season_price_cents: index % 6 === 0 ? 650_00 + index * 30_00 : undefined,
        season_notes: index % 6 === 0 ? "Cenário QA de temporada para teste de vistoria." : "",
        rent_notes: operation !== "sale" ? "Aceita seguro fiança, caução e análise cadastral." : "",
      },
      features_json: Object.fromEntries(Object.values(featureGroups).flat().map((item) => [item, true])),
      amenity_groups_json: featureGroups,
      videos_json: [
        { type: "link", url: `https://videos.imobiflow.test/${code.toLowerCase()}.mp4`, title: "Vídeo QA" },
        { type: "tour", url: `https://tour.imobiflow.test/${code.toLowerCase()}`, title: "Tour 360 QA" },
      ],
      publication_settings_json: {
        site_enabled: status === "available",
        site_featured: index % 4 === 0,
        site_banner: index % 7 === 0,
        zap_enabled: index % 2 === 0,
        olx_enabled: index % 3 === 0,
        viva_real_enabled: index % 4 === 0,
        facebook_enabled: index % 5 === 0,
        instagram_enabled: index % 5 === 1,
        operation_hints: operation === "rent" ? ["locacao", "temporada"] : operation === "both" ? ["venda", "locacao"] : ["venda"],
      },
      description_template_key: `qa_template_${(index % 20) + 1}`,
    };

    return { key, label, normalized_type: normalizedType, operation, status, code, title, owner, property };
  });

  return {
    properties,
    appointments: buildAppointmentScenarios(properties),
    inspections: buildInspectionScenarios(properties),
    coverage: {
      property_type_options: propertyTypeScenarios.map(([, label]) => label),
      normalized_property_types: [...new Set(properties.map((item) => item.normalized_type))],
      operations: [...new Set(properties.map((item) => item.operation))],
      statuses: [...new Set(properties.map((item) => item.status))],
      feature_groups: Object.keys(featureGroups),
      media_per_property: mediaPerProperty,
      media_per_inspection_room: mediaPerInspectionRoom,
      inspection_property_limit: inspectionPropertyLimit,
      media_source: "real_external_images",
    },
  };
}

export async function runBackendTestLab(): Promise<TestLabRunResult> {
  return apiRequest<TestLabRunResult>("/test-lab/generate", {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

export async function clearBackendTestLab(): Promise<TestLabClearResult> {
  return apiRequest<TestLabClearResult>("/test-lab/clear", {
    method: "DELETE",
    token: getStoredToken() ?? undefined,
  });
}

export async function runPreviewTestLab(): Promise<TestLabRunResult> {
  if (!isPreviewToken(getStoredToken())) {
    throw new Error("O laboratório de testes só gera dados automáticos no modo preview.");
  }

  const plan = createTestScenarioPlan();
  const result: TestLabRunResult = {
    created: {
      owners: 0,
      properties: 0,
      media: 0,
      appointments: 0,
      inspections: 0,
      inspection_items: 0,
      inspection_media: 0,
      pdfs: 0,
    },
    skipped: { properties: 0, appointments: 0, inspections: 0 },
    totals: {
      planned_properties: plan.properties.length,
      planned_appointments: plan.appointments.length,
      planned_inspections: plan.inspections.length,
    },
  };

  const propertySummaryByCode = new Map((await listAllProperties()).properties.map((property) => [property.code, property]));
  const propertyByCode = new Map<string | null, Property>();

  for (const scenario of plan.properties) {
    const existingSummary = propertySummaryByCode.get(scenario.code);
    if (existingSummary) {
      const existingProperty = (await getProperty(existingSummary.id)).property;
      propertyByCode.set(scenario.code, existingProperty);
      result.skipped.properties += 1;
      result.created.media += await ensureScenarioMedia(existingProperty, scenario);
      continue;
    }

    const ownerResponse = await createOwner(scenario.owner);
    result.created.owners += 1;

    const propertyResponse = await createProperty({
      ...scenario.property,
      owner_id: ownerResponse.owner.id,
    });
    propertyByCode.set(scenario.code, propertyResponse.property);
    result.created.properties += 1;

    const uploaded = await uploadScenarioMedia(propertyResponse.property, scenario);
    result.created.media += uploaded;
  }

  await createScenarioAppointments(plan, propertyByCode, result);
  await createScenarioInspections(plan, propertyByCode, result);

  return result;
}

export function clearPreviewTestLab(): TestLabClearResult {
  if (typeof window === "undefined") {
    return { properties: 0, owners: 0, appointments: 0, inspections: 0, rooms: 0, items: 0, media: 0, signatures: 0 };
  }

  const properties = readPreviewArray<Property>(previewPropertiesKey);
  const qaPropertyIds = new Set(
    properties.filter((property) => property.code?.startsWith("QA-") || property.title.startsWith("QA ")).map((property) => property.id),
  );
  const nextProperties = properties.filter((property) => !qaPropertyIds.has(property.id));

  const owners = readPreviewArray<{ id: string; name?: string; email?: string | null }>(previewOwnersKey);
  const nextOwners = owners.filter(
    (owner) => !owner.name?.startsWith("Proprietário QA") && !owner.email?.endsWith("@imobiflow.test"),
  );

  const appointments = readPreviewArray<{ title?: string; metadata?: Record<string, unknown> }>(previewAppointmentsKey);
  const nextAppointments = appointments.filter(
    (appointment) => !appointment.title?.startsWith("QA ") && !String(appointment.metadata?.test_lab_key ?? "").startsWith("appointment:QA-"),
  );

  const inspections = readPreviewArray<Inspection>(previewInspectionsKey);
  const qaInspectionIds = new Set(
    inspections
      .filter((inspection) => inspection.title.startsWith("QA ") || qaPropertyIds.has(inspection.property_id))
      .map((inspection) => inspection.id),
  );
  const nextInspections = inspections.filter((inspection) => !qaInspectionIds.has(inspection.id));

  const rooms = readPreviewArray<{ id: string; inspection_id: string }>(previewRoomsKey);
  const nextRooms = rooms.filter((room) => !qaInspectionIds.has(room.inspection_id));

  const items = readPreviewArray<{ id: string; inspection_id: string }>(previewItemsKey);
  const nextItems = items.filter((item) => !qaInspectionIds.has(item.inspection_id));

  const media = readPreviewArray<{ id: string; inspection_id: string }>(previewMediaKey);
  const nextMedia = media.filter((item) => !qaInspectionIds.has(item.inspection_id));

  const signatures = readPreviewArray<{ id: string; inspection_id: string }>(previewSignaturesKey);
  const nextSignatures = signatures.filter((signature) => !qaInspectionIds.has(signature.inspection_id));

  writePreviewArray(previewPropertiesKey, nextProperties);
  writePreviewArray(previewOwnersKey, nextOwners);
  writePreviewArray(previewAppointmentsKey, nextAppointments);
  writePreviewArray(previewInspectionsKey, nextInspections);
  writePreviewArray(previewRoomsKey, nextRooms);
  writePreviewArray(previewItemsKey, nextItems);
  writePreviewArray(previewMediaKey, nextMedia);
  writePreviewArray(previewSignaturesKey, nextSignatures);

  return {
    properties: properties.length - nextProperties.length,
    owners: owners.length - nextOwners.length,
    appointments: appointments.length - nextAppointments.length,
    inspections: inspections.length - nextInspections.length,
    rooms: rooms.length - nextRooms.length,
    items: items.length - nextItems.length,
    media: media.length - nextMedia.length,
    signatures: signatures.length - nextSignatures.length,
  };
}

function readPreviewArray<T>(key: string): T[] {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function writePreviewArray<T>(key: string, value: T[]) {
  window.localStorage.removeItem(key);
  if (value.length > 0) window.localStorage.setItem(key, JSON.stringify(value));
}

function chooseOperation(index: number): PropertyInput["operation"] {
  if (index % 4 === 0) return "both";
  if (index % 4 === 1) return "rent";
  return "sale";
}

function chooseStatus(index: number): PropertyInput["status"] {
  if (index % 13 === 0) return "draft";
  if (index % 11 === 0) return "reserved";
  if (index % 17 === 0) return "rented";
  if (index % 19 === 0) return "inactive";
  return "available";
}

function buildPropertyDescription(label: string, city: string, neighborhood: string, operation: PropertyInput["operation"]) {
  const operationLabel = operation === "both" ? "venda e locação" : operation === "rent" ? "locação" : "venda";
  return `${label} de teste localizado em ${neighborhood}, ${city}, criado pelo laboratório QA para validar cadastro completo, mídia, publicação, agenda e vistoria de ${operationLabel}.`;
}

function buildAppointmentScenarios(properties: TestPropertyScenario[]) {
  return properties.slice(0, 12).map((scenario, index) => {
    const startsAt = new Date(Date.UTC(2026, 4, 25 + index, 12 + (index % 5), 0, 0));
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    return {
      property_code: scenario.code,
      input: {
        appointment_type: index % 3 === 0 ? "inspection" : index % 3 === 1 ? "visit" : "meeting",
        title: `QA ${index % 3 === 0 ? "vistoria" : index % 3 === 1 ? "visita" : "reunião"} - ${scenario.code}`,
        description: `Compromisso automático para validar agenda vinculada ao imóvel ${scenario.code}.`,
        location_text: `${scenario.property.street}, ${scenario.property.number} - ${scenario.property.city}/${scenario.property.state}`,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        reminder_at: new Date(startsAt.getTime() - 30 * 60 * 1000).toISOString(),
        metadata: { test_lab_key: `appointment:${scenario.code}` },
      },
    };
  });
}

function buildInspectionScenarios(properties: TestPropertyScenario[]) {
  const inspectionProperties = properties
    .filter((scenario) => scenario.operation !== "sale" || scenario.property.commercial_terms_json?.season_price_cents)
    .slice(0, inspectionPropertyLimit);

  return inspectionProperties.flatMap((scenario, index) => [
    {
      property_code: scenario.code,
      inspection_type: "entry" as const,
      title: `QA Entrada - ${scenario.code}`,
      summary: `Vistoria inicial automática do imóvel ${scenario.code}, com checklist por cômodo, fotos e texto técnico.`,
    },
    {
      property_code: scenario.code,
      inspection_type: "exit" as const,
      title: `QA Saída - ${scenario.code}`,
      summary: `Vistoria final automática do imóvel ${scenario.code}, preparada para comparação com a entrada e conferência de reparos.`,
    },
  ]);
}

type ScenarioMediaAsset = {
  image: string;
  index: number;
  media_type: "photo" | "tour";
  caption: string;
};

async function uploadScenarioMedia(
  property: Property,
  scenario: TestPropertyScenario,
  assets = getScenarioMediaAssets(scenario),
) {
  let uploaded = 0;

  for (const asset of assets) {
    const response = await uploadPropertyMedia(property.id, {
      file_name: `${scenario.code}-${String(asset.index + 1).padStart(2, "0")}.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 250_000,
      content_base64: asset.image,
      media_type: asset.media_type,
      caption: asset.caption,
      position: asset.index,
      is_cover: asset.index === 0,
    });

    if (response.media) uploaded += 1;
  }

  return uploaded;
}

async function ensureScenarioMedia(property: Property, scenario: TestPropertyScenario) {
  const existingUrls = new Set((property.property_media ?? []).map((media) => media.url));
  const missingAssets = getScenarioMediaAssets(scenario).filter((asset) => !existingUrls.has(asset.image));

  if (missingAssets.length === 0) return 0;
  return uploadScenarioMedia(property, scenario, missingAssets);
}

export function getScenarioImages(scenario: Pick<TestPropertyScenario, "normalized_type" | "key">) {
  const pool = realImagePools[scenario.normalized_type] ?? realImagePools.other!;
  const queries = propertyImageQueries[scenario.normalized_type] ?? propertyImageQueries.other!;
  const offset = hashString(scenario.key) % pool.length;
  const queryOffset = hashString(`${scenario.key}:${scenario.normalized_type}`) % queries.length;

  return Array.from({ length: mediaPerProperty }, (_, index) => {
    if (index < pool.length) return pool[(offset + index) % pool.length];

    const query = queries[(queryOffset + index) % queries.length];
    const seed = hashString(`${scenario.key}:${query}:${index}`);
    return createExternalPhotoUrl(query, seed, index === mediaPerProperty - 1 ? 1600 : 1400, 950);
  });
}

export function getInspectionRoomImages(roomName: string, scenarioKey: string) {
  const seedImage = inspectionRoomSeedImages[roomName];
  const queries = inspectionRoomImageQueries[roomName] ?? inspectionRoomImageQueries.Sala;
  const queryOffset = hashString(`${scenarioKey}:${roomName}`) % queries.length;

  return Array.from({ length: mediaPerInspectionRoom }, (_, index) => {
    if (index === 0 && seedImage) return seedImage;

    const query = queries[(queryOffset + index) % queries.length];
    const seed = hashString(`${scenarioKey}:${roomName}:${query}:${index}`);
    return createExternalPhotoUrl(query, seed, 1200, 850);
  });
}

function getScenarioMediaAssets(scenario: TestPropertyScenario): ScenarioMediaAsset[] {
  const images = getScenarioImages(scenario);

  return images.map((image, index) => ({
    image,
    index,
    media_type: index === images.length - 1 ? "tour" : "photo",
    caption:
      index === 0
        ? `Foto principal realista QA - ${scenario.label}`
        : index === images.length - 1
          ? `Imagem panorâmica/tour QA - ${scenario.label}`
          : `Foto realista QA ${index} - ${scenario.label}`,
  }));
}

function createExternalPhotoUrl(query: string, seed: number, width: number, height: number) {
  const normalizedQuery = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9,\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  return `https://loremflickr.com/${width}/${height}/${normalizedQuery}?lock=${seed}`;
}

function hashString(value: string) {
  return Math.abs(
    value.split("").reduce((total, char) => {
      return (total * 31 + char.charCodeAt(0)) % 1_000_000_007;
    }, 17),
  );
}

async function createScenarioAppointments(
  plan: TestScenarioPlan,
  propertyByCode: Map<string | null, Property>,
  result: TestLabRunResult,
) {
  const existingAppointments = (await listAppointments()).appointments;
  const existingKeys = new Set(existingAppointments.map((item) => String(item.metadata?.test_lab_key ?? "")));

  for (const scenario of plan.appointments) {
    const key = `appointment:${scenario.property_code}`;
    if (existingKeys.has(key)) {
      result.skipped.appointments += 1;
      continue;
    }

    const property = propertyByCode.get(scenario.property_code);
    if (!property) continue;

    await createAppointment({ ...scenario.input, property_id: property.id });
    result.created.appointments += 1;
  }
}

async function createScenarioInspections(
  plan: TestScenarioPlan,
  propertyByCode: Map<string | null, Property>,
  result: TestLabRunResult,
) {
  const existingInspections = (await listInspections()).inspections;
  const existingByTitle = new Map(existingInspections.map((inspection) => [inspection.title, inspection]));

  for (const scenario of plan.inspections) {
    const existingInspection = existingByTitle.get(scenario.title);
    if (existingInspection) {
      result.skipped.inspections += 1;
      result.created.inspection_media += await ensureInspectionMedia(existingInspection.id, scenario);
      continue;
    }

    const property = propertyByCode.get(scenario.property_code);
    if (!property) continue;

    const response = await createInspection({
      property_id: property.id,
      inspection_type: scenario.inspection_type,
      status: scenario.inspection_type === "entry" ? "completed" : "in_progress",
      scheduled_at: new Date(Date.UTC(2026, 4, 27, 13, 0, 0)).toISOString(),
      title: scenario.title,
      summary: scenario.summary,
      tenant_name: "Locatário QA",
      tenant_document: "123.456.789-00",
      owner_name: property.property_owners?.name ?? "Proprietário QA",
      create_default_rooms: true,
    });
    result.created.inspections += 1;

    const detail = await loadInspectionRooms(response.inspection.id);
    for (const room of detail.rooms) {
      await updateInspectionRoom(response.inspection.id, room.id, {
        name: room.name,
        general_condition: room.name === "Entrega de chaves e acessórios" ? "not_checked" : "good",
        notes: `Ambiente ${room.name} preenchido automaticamente pelo laboratório QA.`,
      });

      const checklist = inspectionChecklist[room.name] ?? [
        { label: "Pintura da parede", category: room.name, condition: "good", notes: "Pintura em bom estado." },
        { label: "Piso", category: room.name, condition: "good", notes: "Piso em bom estado de conservação." },
      ];

      for (const item of checklist) {
        await createInspectionItem(response.inspection.id, {
          room_id: room.id,
          label: item.label,
          category: item.category,
          condition: item.condition,
          notes: item.notes,
          repair_required: item.condition === "regular" && scenario.inspection_type === "exit",
        });
        result.created.inspection_items += 1;
      }

      result.created.inspection_media += await ensureRoomInspectionMedia(
        response.inspection.id,
        room.id,
        room.name,
        scenario,
        [],
      );
    }

    await generateInspectionPdf(response.inspection.id);
    result.created.pdfs += 1;
  }
}

async function ensureInspectionMedia(
  inspectionId: string,
  scenario: TestScenarioPlan["inspections"][number],
) {
  const detail = await loadInspectionRooms(inspectionId);
  let uploaded = 0;

  for (const room of detail.rooms) {
    const existingMedia = detail.media.filter((media) => media.room_id === room.id);
    uploaded += await ensureRoomInspectionMedia(inspectionId, room.id, room.name, scenario, existingMedia);
  }

  return uploaded;
}

async function ensureRoomInspectionMedia(
  inspectionId: string,
  roomId: string,
  roomName: string,
  scenario: TestScenarioPlan["inspections"][number],
  existingMedia: Array<{ file_url: string | null }>,
) {
  const existingUrls = new Set(existingMedia.map((media) => media.file_url).filter(Boolean));
  const images = getInspectionRoomImages(roomName, scenario.title);
  let uploaded = 0;

  for (const [index, image] of images.entries()) {
    if (existingUrls.has(image)) continue;

    await createInspectionMedia(inspectionId, {
      room_id: roomId,
      media_type: "photo",
      file_url: image,
      file_name: `${scenario.title}-${roomName}-${String(index + 1).padStart(2, "0")}.jpg`,
      mime_type: "image/jpeg",
      file_size: 250_000,
      caption: `Registro fotográfico realista QA ${index + 1} - ${roomName}`,
      position: index,
    });
    uploaded += 1;
  }

  return uploaded;
}
