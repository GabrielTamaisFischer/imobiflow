import { apiRequest, isUnavailableProductionApi } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import { compactPreviewMediaUrl, safeSetPreviewItem } from "./preview-storage";

const previewOwnersKey = "imobiflow.preview.property_owners";
const previewPropertiesKey = "imobiflow.preview.properties";

export type PropertyOwner = {
  id: string;
  company_id: string;
  owner_type: "individual" | "company";
  client_type: "comprador" | "construtor" | "investidor" | "locatario" | "proprietario";
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  residential_phone: string | null;
  commercial_phone: string | null;
  address_json: Record<string, unknown>;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  portal_token: string | null;
  portal_enabled: boolean;
  portal_last_access_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Property = {
  id: string;
  company_id: string;
  owner_id: string | null;
  code: string | null;
  title: string;
  description: string | null;
  property_type: "apartment" | "house" | "commercial" | "land" | "rural" | "other";
  operation: "sale" | "rent" | "both";
  status: "draft" | "available" | "reserved" | "sold" | "rented" | "inactive" | "archived";
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  condominium_name: string | null;
  nearby_highways: string[];
  responsible_user_id: string | null;
  capture_json: Record<string, unknown>;
  primary_details_json: Record<string, unknown>;
  measurements_json: Record<string, unknown>;
  bedrooms: number | null;
  bathrooms: number | null;
  suites: number | null;
  parking_spaces: number | null;
  private_area: number | null;
  total_area: number | null;
  sale_price_cents: number | null;
  rent_price_cents: number | null;
  condominium_fee_cents: number | null;
  iptu_cents: number | null;
  commercial_terms_json: Record<string, unknown>;
  features_json: Record<string, boolean>;
  amenity_groups_json: Record<string, string[]>;
  videos_json: Array<Record<string, unknown>>;
  publication_settings_json: Record<string, unknown>;
  description_template_key: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  property_owners?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  property_media?: PropertyMedia[];
};

export type PropertyMedia = {
  id: string;
  company_id: string;
  property_id: string;
  media_type: "photo" | "video" | "tour" | "floor_plan";
  url: string;
  caption: string | null;
  position: number;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  is_cover: boolean;
  created_at: string;
};

export type OwnerInput = {
  owner_type: PropertyOwner["owner_type"];
  client_type?: PropertyOwner["client_type"];
  name: string;
  document?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  residential_phone?: string;
  commercial_phone?: string;
  address_json?: Record<string, unknown>;
  notes?: string;
};

export type PropertyInput = {
  owner_id?: string;
  code?: string;
  title: string;
  description?: string;
  property_type: Property["property_type"];
  operation: Property["operation"];
  status: Property["status"];
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  country?: string;
  zip_code?: string;
  latitude?: number;
  longitude?: number;
  condominium_name?: string;
  nearby_highways?: string[];
  responsible_user_id?: string;
  bedrooms?: number;
  bathrooms?: number;
  suites?: number;
  parking_spaces?: number;
  private_area?: number;
  total_area?: number;
  sale_price_cents?: number;
  rent_price_cents?: number;
  condominium_fee_cents?: number;
  iptu_cents?: number;
  commercial_terms_json?: Record<string, unknown>;
  features_json?: Record<string, boolean>;
  capture_json?: Record<string, unknown>;
  primary_details_json?: Record<string, unknown>;
  measurements_json?: Record<string, unknown>;
  amenity_groups_json?: Record<string, string[]>;
  videos_json?: Array<Record<string, unknown>>;
  publication_settings_json?: Record<string, unknown>;
  description_template_key?: string;
};

export function isPreviewRealEstate() {
  return isPreviewToken(getStoredToken()) && isUnavailableProductionApi();
}

export async function listOwners() {
  if (isPreviewRealEstate()) {
    return { owners: readPreviewOwners().filter((owner) => owner.status !== "archived") };
  }

  const response = await apiRequest<{ owners: PropertyOwner[] }>("/real-estate/owners", {
    token: getStoredToken() ?? undefined,
  });

  return { owners: response.owners.filter((owner) => owner.status !== "archived") };
}

export async function createOwner(input: OwnerInput) {
  if (isPreviewRealEstate()) {
    const owner = createPreviewOwner(input);
    return { owner };
  }

  return apiRequest<{ owner: PropertyOwner }>("/real-estate/owners", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function updateOwner(ownerId: string, input: Partial<OwnerInput>) {
  if (isPreviewRealEstate()) {
    const owners = readPreviewOwners();
    const owner = owners.find((item) => item.id === ownerId);
    if (!owner) throw new Error("Proprietário não encontrado.");
    const updated = {
      ...owner,
      ...input,
      document: input.document ?? owner.document,
      email: input.email ?? owner.email,
      phone: input.phone ?? owner.phone,
      whatsapp: input.whatsapp ?? owner.whatsapp,
      residential_phone: input.residential_phone ?? owner.residential_phone,
      commercial_phone: input.commercial_phone ?? owner.commercial_phone,
      address_json: input.address_json ?? owner.address_json,
      notes: input.notes ?? owner.notes,
      updated_at: new Date().toISOString(),
    };
    writePreviewOwners(owners.map((item) => (item.id === ownerId ? updated : item)));
    return { owner: updated };
  }

  return apiRequest<{ owner: PropertyOwner }>(`/real-estate/owners/${ownerId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function archiveOwner(ownerId: string) {
  if (isPreviewRealEstate()) {
    const owners = readPreviewOwners();
    const owner = owners.find((item) => item.id === ownerId);
    if (!owner) throw new Error("Proprietário não encontrado.");
    const updated = { ...owner, status: "archived" as const, updated_at: new Date().toISOString() };
    writePreviewOwners(owners.map((item) => (item.id === ownerId ? updated : item)));
    return { owner: updated };
  }

  return apiRequest<{ owner: PropertyOwner }>(`/real-estate/owners/${ownerId}`, {
    method: "DELETE",
    token: getStoredToken() ?? undefined,
  });
}

export async function listProperties() {
  if (isPreviewRealEstate()) {
    return { properties: readPreviewProperties().filter((property) => property.status !== "archived") };
  }

  const response = await apiRequest<{ properties: Property[] }>("/real-estate/properties?status=all", {
    token: getStoredToken() ?? undefined,
  });

  return { properties: response.properties.filter((property) => property.status !== "archived") };
}

export async function createProperty(input: PropertyInput) {
  if (isPreviewRealEstate()) {
    ensurePreviewPropertyCodeAvailable(input.code);
    const property = createPreviewProperty(input);
    return { property };
  }

  return apiRequest<{ property: Property }>("/real-estate/properties", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function updateProperty(propertyId: string, input: Partial<PropertyInput>) {
  if (isPreviewRealEstate()) {
    ensurePreviewPropertyCodeAvailable(input.code, propertyId);
    const properties = readPreviewProperties();
    const property = properties.find((item) => item.id === propertyId);
    if (!property) throw new Error("Imóvel não encontrado.");
    const updated = mergePreviewProperty(property, input);
    writePreviewProperties(properties.map((item) => (item.id === propertyId ? updated : item)));
    return { property: updated };
  }

  return apiRequest<{ property: Property }>(`/real-estate/properties/${propertyId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function archiveProperty(propertyId: string) {
  if (isPreviewRealEstate()) {
    const properties = readPreviewProperties();
    const property = properties.find((item) => item.id === propertyId);
    if (!property) throw new Error("Imóvel não encontrado.");
    const updated = { ...property, status: "archived" as const, updated_at: new Date().toISOString() };
    writePreviewProperties(properties.map((item) => (item.id === propertyId ? updated : item)));
    return { property: updated };
  }

  return apiRequest<{ property: Property }>(`/real-estate/properties/${propertyId}`, {
    method: "DELETE",
    token: getStoredToken() ?? undefined,
  });
}

export async function uploadPropertyMedia(
  propertyId: string,
  input: {
    file_name: string;
    mime_type: string;
    size_bytes: number;
    content_base64: string;
    media_type?: PropertyMedia["media_type"];
    caption?: string;
    position?: number;
    is_cover?: boolean;
  },
) {
  if (isPreviewRealEstate()) {
    throw new Error("Upload real de arquivos exige backend e storage configurados. Nada sera salvo no navegador.");
  }

  return apiRequest<{ media: PropertyMedia }>(`/real-estate/properties/${propertyId}/media`, {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function deletePropertyMedia(propertyId: string, mediaId: string) {
  if (isPreviewRealEstate()) {
    const properties = readPreviewProperties();
    writePreviewProperties(
      properties.map((property) =>
        property.id === propertyId
          ? { ...property, property_media: property.property_media?.filter((media) => media.id !== mediaId) ?? [] }
          : property,
      ),
    );
    return { ok: true, media_id: mediaId };
  }

  return apiRequest<{ ok: boolean; media_id: string }>(`/real-estate/properties/${propertyId}/media/${mediaId}`, {
    method: "DELETE",
    token: getStoredToken() ?? undefined,
  });
}

export async function reorderPropertyMedia(
  propertyId: string,
  media: Array<Pick<PropertyMedia, "id" | "position">>,
) {
  if (isPreviewRealEstate()) {
    const positionById = new Map(media.map((item) => [item.id, item.position]));
    const properties = readPreviewProperties();
    const property = properties.find((item) => item.id === propertyId);
    const orderedMedia = (property?.property_media ?? [])
      .map((item) => ({ ...item, position: positionById.get(item.id) ?? item.position }))
      .sort((a, b) => a.position - b.position);
    writePreviewProperties(
      properties.map((item) => (item.id === propertyId ? { ...item, property_media: orderedMedia } : item)),
    );
    return { media: orderedMedia };
  }

  return apiRequest<{ media: PropertyMedia[] }>(`/real-estate/properties/${propertyId}/media-order`, {
    method: "PATCH",
    body: JSON.stringify({ media }),
    token: getStoredToken() ?? undefined,
  });
}

function readPreviewOwners() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewOwnersKey) ?? "[]") as PropertyOwner[];
  } catch {
    return [];
  }
}

function writePreviewOwners(owners: PropertyOwner[]) {
  safeSetPreviewItem(previewOwnersKey, JSON.stringify(owners));
}

function readPreviewProperties() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewPropertiesKey) ?? "[]") as Property[];
  } catch {
    return [];
  }
}

function writePreviewProperties(properties: Property[]) {
  safeSetPreviewItem(previewPropertiesKey, JSON.stringify(properties), () => JSON.stringify(compactPropertiesForPreviewStorage(properties)));
}

function compactPropertiesForPreviewStorage(properties: Property[]) {
  return properties.map((property) => ({
    ...property,
    property_media: (property.property_media ?? []).slice(0, 18).map((media) => ({
      ...media,
      url: compactPreviewMediaUrl(media.url) ?? "",
      file_size: media.file_size && media.file_size > 500_000 ? 500_000 : media.file_size,
    })),
  }));
}

function ensurePreviewPropertyCodeAvailable(code: string | undefined, exceptPropertyId?: string) {
  const normalizedCode = code?.trim().toLowerCase();
  if (!normalizedCode) return;
  const duplicate = readPreviewProperties().some(
    (property) => property.id !== exceptPropertyId && property.code?.trim().toLowerCase() === normalizedCode,
  );
  if (duplicate) {
    throw new Error("Já existe um imóvel cadastrado com este código nesta empresa.");
  }
}

function createPreviewOwner(input: OwnerInput): PropertyOwner {
  const now = new Date().toISOString();
  const owner: PropertyOwner = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    owner_type: input.owner_type,
    client_type: input.client_type ?? "proprietario",
    name: input.name,
    document: input.document || null,
    email: input.email || null,
    phone: input.phone || null,
    whatsapp: input.whatsapp || null,
    residential_phone: input.residential_phone || null,
    commercial_phone: input.commercial_phone || null,
    address_json: input.address_json ?? {},
    notes: input.notes || null,
    status: "active",
    portal_token: window.crypto.randomUUID(),
    portal_enabled: true,
    portal_last_access_at: null,
    created_at: now,
    updated_at: now,
  };

  writePreviewOwners([owner, ...readPreviewOwners()]);
  return owner;
}

function createPreviewProperty(input: PropertyInput): Property {
  const now = new Date().toISOString();
  const owner = readPreviewOwners().find((item) => item.id === input.owner_id);
  const property: Property = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    owner_id: input.owner_id || null,
    code: input.code || null,
    title: input.title,
    description: input.description || null,
    property_type: input.property_type,
    operation: input.operation,
    status: input.status,
    street: input.street || null,
    number: input.number || null,
    complement: input.complement || null,
    neighborhood: input.neighborhood || null,
    city: input.city || null,
    state: input.state || null,
    country: input.country || "Brasil",
    zip_code: input.zip_code || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    condominium_name: input.condominium_name || null,
    nearby_highways: input.nearby_highways ?? [],
    responsible_user_id: input.responsible_user_id || "preview-user",
    capture_json: input.capture_json ?? {},
    primary_details_json: input.primary_details_json ?? {},
    measurements_json: input.measurements_json ?? {},
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    suites: input.suites ?? null,
    parking_spaces: input.parking_spaces ?? null,
    private_area: input.private_area ?? null,
    total_area: input.total_area ?? null,
    sale_price_cents: input.sale_price_cents ?? null,
    rent_price_cents: input.rent_price_cents ?? null,
    condominium_fee_cents: input.condominium_fee_cents ?? null,
    iptu_cents: input.iptu_cents ?? null,
    commercial_terms_json: input.commercial_terms_json ?? {},
    features_json: input.features_json ?? {},
    amenity_groups_json: input.amenity_groups_json ?? {},
    videos_json: input.videos_json ?? [],
    publication_settings_json: input.publication_settings_json ?? {},
    description_template_key: input.description_template_key || null,
    published_at: null,
    created_at: now,
    updated_at: now,
    property_owners: owner
      ? { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email }
      : null,
  };

  writePreviewProperties([property, ...readPreviewProperties()]);
  return property;
}

function mergePreviewProperty(property: Property, input: Partial<PropertyInput>): Property {
  const owner = input.owner_id ? readPreviewOwners().find((item) => item.id === input.owner_id) : undefined;
  return {
    ...property,
    owner_id: input.owner_id !== undefined ? input.owner_id || null : property.owner_id,
    code: input.code !== undefined ? input.code || null : property.code,
    title: input.title ?? property.title,
    description: input.description !== undefined ? input.description || null : property.description,
    property_type: input.property_type ?? property.property_type,
    operation: input.operation ?? property.operation,
    status: input.status ?? property.status,
    street: input.street !== undefined ? input.street || null : property.street,
    number: input.number !== undefined ? input.number || null : property.number,
    complement: input.complement !== undefined ? input.complement || null : property.complement,
    neighborhood: input.neighborhood !== undefined ? input.neighborhood || null : property.neighborhood,
    city: input.city !== undefined ? input.city || null : property.city,
    state: input.state !== undefined ? input.state || null : property.state,
    country: input.country !== undefined ? input.country || null : property.country,
    zip_code: input.zip_code !== undefined ? input.zip_code || null : property.zip_code,
    sale_price_cents: input.sale_price_cents !== undefined ? input.sale_price_cents ?? null : property.sale_price_cents,
    rent_price_cents: input.rent_price_cents !== undefined ? input.rent_price_cents ?? null : property.rent_price_cents,
    condominium_fee_cents:
      input.condominium_fee_cents !== undefined ? input.condominium_fee_cents ?? null : property.condominium_fee_cents,
    iptu_cents: input.iptu_cents !== undefined ? input.iptu_cents ?? null : property.iptu_cents,
    publication_settings_json: input.publication_settings_json ?? property.publication_settings_json,
    updated_at: new Date().toISOString(),
    property_owners: owner
      ? { id: owner.id, name: owner.name, phone: owner.phone, email: owner.email }
      : property.property_owners,
  };
}
