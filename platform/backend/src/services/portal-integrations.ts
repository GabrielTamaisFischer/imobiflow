export type PortalProvider = "zap_imoveis" | "olx" | "viva_real";

export type PortalLeadPayload = Record<string, unknown>;

export type NormalizedPortalLead = {
  provider: PortalProvider;
  companyId: string | null;
  propertyId: string | null;
  externalListingId: string | null;
  externalLeadId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  propertyReference: string | null;
  raw: PortalLeadPayload;
};

export type PortalFeedProperty = {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  property_type: string;
  operation: string;
  status: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
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
  features_json: Record<string, unknown> | null;
  published_at: string | null;
  property_media?: Array<{
    id: string;
    media_type: string;
    url: string;
    caption: string | null;
    position: number | null;
    is_cover: boolean | null;
  }> | null;
};

export type PortalPublication = {
  id: string;
  provider: PortalProvider;
  external_listing_id: string | null;
  listing_url: string | null;
  published_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type PortalFeedItem = ReturnType<typeof buildPortalFeedItem>;

export type PortalFeedCompany = {
  id: string;
  name: string;
  status: string;
  email?: string | null;
  phone?: string | null;
};

export const portalProviders: Record<PortalProvider, { label: string; source: string }> = {
  zap_imoveis: { label: "ZAP Imóveis", source: "zap_imoveis" },
  olx: { label: "OLX", source: "olx" },
  viva_real: { label: "Viva Real", source: "viva_real" },
};

export function isPortalProvider(value: string): value is PortalProvider {
  return value === "zap_imoveis" || value === "olx" || value === "viva_real";
}

export function normalizePortalLeadPayload(
  provider: PortalProvider,
  payload: PortalLeadPayload,
): NormalizedPortalLead {
  const name =
    findString(payload, ["name", "nome", "customer_name", "lead_name", "client_name"]) ??
    "Lead sem nome";

  return {
    provider,
    companyId: findString(payload, ["company_id", "companyId", "imobiflow_company_id"]),
    propertyId: findString(payload, ["property_id", "propertyId", "imobiflow_property_id"]),
    externalListingId: findString(payload, [
      "listing_id",
      "listingId",
      "external_listing_id",
      "externalListingId",
      "property_code",
      "propertyCode",
    ]),
    externalLeadId: findString(payload, [
      "lead_id",
      "leadId",
      "external_lead_id",
      "externalLeadId",
      "id",
      "uuid",
    ]),
    name,
    email: findString(payload, ["email", "lead_email", "customer_email", "client_email"]),
    phone: findString(payload, [
      "phone",
      "telefone",
      "mobile",
      "celular",
      "whatsapp",
      "lead_phone",
      "customer_phone",
      "client_phone",
    ]),
    message: findString(payload, ["message", "mensagem", "notes", "observations", "body"]),
    propertyReference: findString(payload, [
      "property_reference",
      "propertyReference",
      "reference",
      "codigo",
      "code",
    ]),
    raw: payload,
  };
}

export function buildPortalFeedItem(input: {
  publication: PortalPublication;
  property: PortalFeedProperty;
}) {
  const property = input.property;
  const images = (property.property_media ?? [])
    .filter((media) => media.media_type === "photo" && media.url)
    .sort((left, right) => Number(Boolean(right.is_cover)) - Number(Boolean(left.is_cover)) || (left.position ?? 0) - (right.position ?? 0))
    .map((media) => ({
      url: media.url,
      caption: media.caption,
      cover: Boolean(media.is_cover),
    }));

  return {
    id: input.publication.external_listing_id ?? property.id,
    imobiflow_property_id: property.id,
    imobiflow_publication_id: input.publication.id,
    provider: input.publication.provider,
    code: property.code,
    title: property.title,
    description: property.description,
    transaction_types: property.operation === "both" ? ["sale", "rent"] : [property.operation],
    property_type: mapPropertyType(property.property_type),
    status: property.status,
    address: {
      neighborhood: property.neighborhood,
      city: property.city,
      state: property.state,
    },
    details: {
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      suites: property.suites,
      parking_spaces: property.parking_spaces,
      private_area: property.private_area,
      total_area: property.total_area,
      features: property.features_json ?? {},
    },
    prices: {
      sale_cents: property.sale_price_cents,
      rent_cents: property.rent_price_cents,
      condominium_fee_cents: property.condominium_fee_cents,
      iptu_cents: property.iptu_cents,
    },
    media: images,
    published_at: input.publication.published_at ?? property.published_at,
    listing_url: input.publication.listing_url,
  };
}

export function buildPortalFeedXml(input: {
  provider: PortalProvider;
  providerLabel: string;
  company: PortalFeedCompany;
  generatedAt: string;
  listings: PortalFeedItem[];
}) {
  const listingsXml = input.listings.map(buildListingXml).join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ImobiFlowPortalFeed>",
    element("Provider", input.provider),
    element("ProviderLabel", input.providerLabel),
    "<Company>",
    element("Id", input.company.id),
    element("Name", input.company.name),
    element("Email", input.company.email ?? ""),
    element("Phone", input.company.phone ?? ""),
    "</Company>",
    element("GeneratedAt", input.generatedAt),
    element("Total", input.listings.length),
    "<Listings>",
    listingsXml,
    "</Listings>",
    "</ImobiFlowPortalFeed>",
  ].join("");
}

function buildListingXml(listing: PortalFeedItem) {
  return [
    "<Listing>",
    element("Id", listing.id),
    element("ImobiFlowPropertyId", listing.imobiflow_property_id),
    element("ImobiFlowPublicationId", listing.imobiflow_publication_id),
    element("Code", listing.code ?? ""),
    element("Title", listing.title),
    element("Description", listing.description ?? ""),
    element("PropertyType", listing.property_type),
    element("Status", listing.status),
    "<TransactionTypes>",
    listing.transaction_types.map((transactionType) => element("TransactionType", transactionType)).join(""),
    "</TransactionTypes>",
    "<Address>",
    element("Neighborhood", listing.address.neighborhood ?? ""),
    element("City", listing.address.city ?? ""),
    element("State", listing.address.state ?? ""),
    "</Address>",
    "<Details>",
    element("Bedrooms", listing.details.bedrooms ?? ""),
    element("Bathrooms", listing.details.bathrooms ?? ""),
    element("Suites", listing.details.suites ?? ""),
    element("ParkingSpaces", listing.details.parking_spaces ?? ""),
    element("PrivateArea", listing.details.private_area ?? ""),
    element("TotalArea", listing.details.total_area ?? ""),
    "<Features>",
    Object.entries(listing.details.features ?? {})
      .map(([key, value]) => `<Feature key="${escapeXml(key)}">${escapeXml(String(value))}</Feature>`)
      .join(""),
    "</Features>",
    "</Details>",
    "<Prices>",
    element("SaleCents", listing.prices.sale_cents ?? ""),
    element("RentCents", listing.prices.rent_cents ?? ""),
    element("CondominiumFeeCents", listing.prices.condominium_fee_cents ?? ""),
    element("IptuCents", listing.prices.iptu_cents ?? ""),
    "</Prices>",
    "<Media>",
    listing.media
      .map(
        (media) =>
          `<Image cover="${media.cover ? "true" : "false"}">${element("Url", media.url)}${element("Caption", media.caption ?? "")}</Image>`,
      )
      .join(""),
    "</Media>",
    element("PublishedAt", listing.published_at ?? ""),
    element("ListingUrl", listing.listing_url ?? ""),
    "</Listing>",
  ].join("");
}

function element(name: string, value: unknown) {
  return `<${name}>${escapeXml(String(value))}</${name}>`;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function mapPropertyType(type: string) {
  const map: Record<string, string> = {
    apartment: "apartment",
    house: "house",
    commercial: "commercial",
    land: "land",
    rural: "rural",
  };
  return map[type] ?? "other";
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findString(input: unknown, keys: string[], depth = 0): string | null {
  if (!input || depth > 8) return null;
  const normalizedKeys = new Set(keys.map(normalizeKey));

  if (Array.isArray(input)) {
    for (const item of input) {
      const value = findString(item, keys, depth + 1);
      if (value) return value;
    }
    return null;
  }

  if (typeof input !== "object") return null;

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!normalizedKeys.has(normalizeKey(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  for (const value of Object.values(input as Record<string, unknown>)) {
    const nested = findString(value, keys, depth + 1);
    if (nested) return nested;
  }

  return null;
}
