const ALLOWED_PLACEHOLDERS: Record<string, (snapshot: any) => string> = {
  "property.code": (s) => String(s?.property?.code ?? ""),
  "property.address": (s) => String(s?.property?.address ?? s?.property?.title ?? ""),
  "property.city": (s) => String(s?.property?.city ?? ""),
  "owner.name": (s) => (s?.parties ?? []).filter((p: any) => p.party_type === "owner").map((p: any) => p.name).join(", "),
  "buyer.name": (s) => (s?.parties ?? []).filter((p: any) => p.party_type === "buyer").map((p: any) => p.name).join(", "),
  "tenant.name": (s) => (s?.parties ?? []).filter((p: any) => p.party_type === "tenant").map((p: any) => p.name).join(", "),
  "owners": (s) => (s?.parties ?? []).filter((p: any) => p.party_type === "owner").map((p: any) => p.name).join(", "),
  "buyers": (s) => (s?.parties ?? []).filter((p: any) => p.party_type === "buyer").map((p: any) => p.name).join(", "),
  "tenants": (s) => (s?.parties ?? []).filter((p: any) => p.party_type === "tenant").map((p: any) => p.name).join(", "),
  "rent.amount": (s) => String(s?.monthly_amount_cents ?? ""),
};

export function resolveContractPlaceholders(content: string, snapshot: any) {
  const unknown: string[] = [];
  const resolved = content.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key: string) => {
    const resolver = ALLOWED_PLACEHOLDERS[key];
    if (!resolver) { unknown.push(key); return `{{${key}}}`; }
    return resolver(snapshot);
  });
  return { resolved, unknown };
}

export function assertSafeContractContent(content: string) {
  if (/<script|javascript:|onerror\s*=|onload\s*=/i.test(content)) throw Object.assign(new Error("Conteúdo de contrato contém marcação não permitida."), { statusCode: 422, code: "UNSAFE_CONTRACT_CONTENT" });
}
