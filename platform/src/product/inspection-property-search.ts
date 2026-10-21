import type { PropertySummary } from "./real-estate";

/** Rótulo do imóvel na busca da vistoria: código · título · endereço. */
export function formatPropertySearchLabel(
  property: Pick<PropertySummary, "code" | "title" | "street" | "number" | "neighborhood" | "city">,
) {
  const street = [property.street, property.number].filter(Boolean).join(", ");
  const place = [street, property.neighborhood, property.city].filter(Boolean).join(" — ");
  return [property.code || "Sem código", property.title, place].filter(Boolean).join(" · ");
}
