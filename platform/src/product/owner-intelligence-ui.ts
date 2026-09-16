import type { OwnerCheck, OwnerProfile } from "./real-estate";

export const OWNER_INTELLIGENCE_UI_CAPABILITIES = ["IDENTITY", "ADDRESS", "CIVIL", "CREDIT", "LEGAL", "FISCAL"] as const;
export type OwnerIntelligenceUiCapability = (typeof OWNER_INTELLIGENCE_UI_CAPABILITIES)[number];

export const OWNER_INTELLIGENCE_CAPABILITY_LABELS: Record<OwnerIntelligenceUiCapability, string> = {
  IDENTITY: "Identidade",
  ADDRESS: "Endereço",
  CIVIL: "Dados civis",
  CREDIT: "Crédito",
  LEGAL: "Jurídico",
  FISCAL: "Fiscal",
};

export function hasValidTreatmentConsent(profile: OwnerProfile | null | undefined) {
  const consent = profile?.treatment_consent;
  return Boolean(consent && typeof consent.authorized_at === "string" && consent.authorized_at.trim() && typeof consent.purpose === "string" && consent.purpose.trim());
}

export function latestIntelligenceCheck(checks: OwnerCheck[]) {
  return checks.find((check) => check.check_type === "intelligence") ?? null;
}

export function capabilityStatus(checks: OwnerCheck[], capability: OwnerIntelligenceUiCapability) {
  const check = latestIntelligenceCheck(checks);
  if (!check) return { label: "Não consultado", tone: "muted" as const };
  if (check.status === "NOT_CONFIGURED") return { label: "Provider não configurado", tone: "warning" as const };
  if (["VERIFIED", "UPDATED", "verified"].includes(check.status)) return { label: "Atualizado", tone: "success" as const };
  if (["PARTIAL", "PARTIALLY_CONFIGURED", "partial"].includes(check.status)) return { label: "Parcial", tone: "warning" as const };
  if (["NOT_FOUND", "not_found"].includes(check.status)) return { label: "Não encontrado", tone: "muted" as const };
  if (["EXPIRED", "expired"].includes(check.status)) return { label: "Desatualizado", tone: "warning" as const };
  if (["ERROR", "error"].includes(check.status)) return { label: "Erro", tone: "danger" as const };
  const sections = check.summary?.sections;
  if (Array.isArray(sections) && !sections.includes(capability)) return { label: "Não consultado", tone: "muted" as const };
  return { label: check.status || "Não consultado", tone: "muted" as const };
}

export function intelligenceErrorMessage(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "OWNER_TREATMENT_CONSENT_REQUIRED") return "É necessário registrar a autorização de tratamento de dados antes de realizar consultas.";
  if (code === "OWNER_FISCAL_PERMISSION_REQUIRED") return "Você não possui permissão para consultar dados fiscais.";
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível consultar a inteligência cadastral. Tente novamente.";
}
