import type { Property, PropertySummary } from "./real-estate";

type PropertyCardData = Property | PropertySummary;

export const magnificentHeroImage = "/site-templates/magnifico-hero.jpg";

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function slugify(value: string) {
  const normalized = normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "imovel";
}

export function getPropertySlug(property: PropertyCardData) {
  const base = [property.code, property.title].filter(Boolean).join("-");
  return `${slugify(base || property.id)}-${property.id.slice(0, 8)}`;
}

export function getPropertyDetailUrl(siteSlug: string, property: PropertyCardData) {
  return `/site/${encodeURIComponent(siteSlug)}/imoveis/${encodeURIComponent(getPropertySlug(property))}`;
}

export function getBuilderPreviewPropertyDetailUrl(websiteId: string, property: PropertyCardData) {
  return `/app/site/builder/preview/${encodeURIComponent(websiteId)}/imovel/${encodeURIComponent(getPropertySlug(property))}`;
}

export function matchesPropertySlug(property: PropertyCardData, propertySlug: string) {
  return (
    getPropertySlug(property) === propertySlug ||
    property.id === propertySlug ||
    property.code?.toLowerCase() === propertySlug.toLowerCase()
  );
}

export function getPropertyImages(property: PropertyCardData) {
  return (
    property.property_media
      ?.filter((media) => media.media_type === "photo" || media.media_type === "tour")
      .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position)
      .map((media) => media.url)
      .filter(Boolean) ?? []
  );
}

export function getPropertyCoverUrl(property: PropertyCardData) {
  return getPropertyImages(property)[0] ?? null;
}

export function propertyTypeLabel(type: Property["property_type"]) {
  const labels: Partial<Record<Property["property_type"], string>> = {
    apartment: "Apartamento",
    industrial_area: "Área industrial", garage_box: "Box/Garagem", commercial_house: "Casa comercial",
    condo_house: "Casa de condomínio", village_house: "Casa de vila", farm_house: "Chácara",
    penthouse: "Cobertura", office: "Sala comercial", farm: "Fazenda", flat: "Flat",
    warehouse: "Galpão", haras: "Haras", hotel: "Hotel", industry: "Indústria", kitnet: "Kitnet",
    loft: "Loft", mall_store: "Loja em shopping", store: "Loja/Salão", land_condo: "Loteamento",
    motel: "Motel", inn: "Pousada/Chalé", building: "Prédio", ranch: "Sítio", townhouse: "Sobrado", studio: "Studio",
    house: "Casa",
    commercial: "Comercial",
    land: "Terreno",
    rural: "Rural",
    other: "Imóvel",
  };

  return labels[type] ?? "Imóvel";
}

export function operationLabel(operation: Property["operation"]) {
  const labels: Record<Property["operation"], string> = {
    sale: "Venda",
    rent: "Locação",
    season: "Temporada",
    both: "Venda e locação",
  };

  return labels[operation] ?? "Imóvel";
}

export function formatCurrencyFromCents(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

export function formatPropertyPrice(property: PropertyCardData) {
  const sale = property.sale_price_cents ? formatCurrencyFromCents(property.sale_price_cents) : null;
  const rent = property.rent_price_cents ? `${formatCurrencyFromCents(property.rent_price_cents)}/mês` : null;
  const season = "commercial_terms_json" in property
    ? Number((property as Property).commercial_terms_json?.season_price_cents ?? 0)
    : 0;

  if (property.operation === "both") return [sale, rent].filter(Boolean).join(" ou ") || "Valor sob consulta";
  if (property.operation === "rent") return rent || "Valor sob consulta";
  if (property.operation === "season") return season ? `${formatCurrencyFromCents(season)}/temporada` : "Valor sob consulta";

  return sale || "Valor sob consulta";
}

export function formatArea(value: number | null | undefined) {
  if (!value) return null;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} m²`;
}

export function formatPublicAddress(property: PropertyCardData, showFullAddress = false) {
  const publicParts = [property.neighborhood, property.city, property.state].filter(Boolean);
  if (!showFullAddress) return publicParts.join(", ") || "Localização sob consulta";

  return [
    [property.street, property.number].filter(Boolean).join(", "),
    property.complement,
    property.neighborhood,
    property.city,
    property.state,
  ]
    .filter(Boolean)
    .join(" • ") || "Localização sob consulta";
}

export function getFeatureList(property: Property, limit = 18) {
  const booleanFeatures = Object.entries(property.features_json ?? {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([name]) => name);

  const groupedFeatures = Object.values(property.amenity_groups_json ?? {})
    .flat()
    .filter(Boolean);

  return Array.from(new Set([...booleanFeatures, ...groupedFeatures])).slice(0, limit);
}

export function createWhatsAppLink(phone: string, message: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
