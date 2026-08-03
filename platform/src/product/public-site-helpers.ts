import type { Property } from "./real-estate";

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

export function getPropertySlug(property: Property) {
  const base = [property.code, property.title].filter(Boolean).join("-");
  return `${slugify(base || property.id)}-${property.id.slice(0, 8)}`;
}

export function getPropertyDetailUrl(siteSlug: string, property: Property) {
  return `/site/${encodeURIComponent(siteSlug)}/imoveis/${encodeURIComponent(getPropertySlug(property))}`;
}

export function getBuilderPreviewPropertyDetailUrl(websiteId: string, property: Property) {
  return `/app/site/builder/preview/${encodeURIComponent(websiteId)}/imovel/${encodeURIComponent(getPropertySlug(property))}`;
}

export function matchesPropertySlug(property: Property, propertySlug: string) {
  return (
    getPropertySlug(property) === propertySlug ||
    property.id === propertySlug ||
    property.code?.toLowerCase() === propertySlug.toLowerCase()
  );
}

export function getPropertyImages(property: Property) {
  return (
    property.property_media
      ?.filter((media) => media.media_type === "photo" || media.media_type === "tour")
      .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.position - b.position)
      .map((media) => media.url)
      .filter(Boolean) ?? []
  );
}

export function getPropertyCoverUrl(property: Property) {
  return getPropertyImages(property)[0] ?? null;
}

export function propertyTypeLabel(type: Property["property_type"]) {
  const labels: Record<Property["property_type"], string> = {
    apartment: "Apartamento",
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
    both: "Venda e locação",
  };

  return labels[operation] ?? "Imóvel";
}

export function formatCurrencyFromCents(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

export function formatPropertyPrice(property: Property) {
  const sale = property.sale_price_cents ? formatCurrencyFromCents(property.sale_price_cents) : null;
  const rent = property.rent_price_cents ? `${formatCurrencyFromCents(property.rent_price_cents)}/mês` : null;

  if (property.operation === "both") return [sale, rent].filter(Boolean).join(" ou ") || "Valor sob consulta";
  if (property.operation === "rent") return rent || "Valor sob consulta";

  return sale || "Valor sob consulta";
}

export function formatArea(value: number | null | undefined) {
  if (!value) return null;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value)} m²`;
}

export function formatPublicAddress(property: Property, showFullAddress = false) {
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
