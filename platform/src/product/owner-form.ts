import { normalizeBrazilianDocument } from "@/product/brazilian-document";
import type { OwnerInput } from "@/product/real-estate";

export function ownerInputFromForm(form: FormData, prefix = ""): OwnerInput {
  const value = (field: string) => String(form.get(`${prefix}${field}`) ?? "").trim();

  return {
    owner_type: value("owner_type") === "company" ? "company" : "individual",
    client_type: (value("client_type") || "proprietario") as OwnerInput["client_type"],
    name: value("name"),
    document: normalizeBrazilianDocument(value("document")),
    email: value("email"),
    phone: value("phone"),
    whatsapp: value("whatsapp"),
    residential_phone: value("residential_phone"),
    commercial_phone: value("commercial_phone"),
    address_json: {
      zip_code: value("zip_code").replace(/\D/g, ""),
      street: value("street"),
      number: value("number"),
      complement: value("complement"),
      neighborhood: value("neighborhood"),
      city: value("city"),
      state: value("state").toUpperCase(),
      country: value("country") || "Brasil",
    },
    notes: value("notes"),
  };
}
