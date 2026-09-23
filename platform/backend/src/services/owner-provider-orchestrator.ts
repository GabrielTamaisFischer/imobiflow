import {
  OWNER_INTELLIGENCE_CAPABILITIES,
  type OwnerIntelligenceCapability,
  type OwnerIntelligenceConfidence,
  type OwnerProviderAdapter,
  type OwnerProviderCostProfile,
  type OwnerProviderHealth,
  type OwnerProviderPriority,
  type OwnerProviderQueryMode,
  type OwnerProviderQueryStatus,
  type OwnerProviderResult,
  type OwnerProviderSubjectType,
  ownerIntelligenceRegistry,
  type OwnerEnrichmentProviderRegistry,
} from "./owner-intelligence.js";

export type OwnerDocumentIdentity = {
  subjectType: OwnerProviderSubjectType;
  document: string;
};

export type OwnerProviderFreshnessRule = {
  lastCheckedAt?: string | null;
  maxAgeSeconds?: number | null;
};

export type OwnerProviderQueryContext = {
  companyId: string;
  actorUserId: string;
  document: string;
  subjectType?: OwnerProviderSubjectType;
  capabilities: OwnerIntelligenceCapability[];
  mode?: OwnerProviderQueryMode;
  idempotencyKey: string;
  allowPaid?: boolean;
  freshness?: Partial<Record<OwnerIntelligenceCapability, OwnerProviderFreshnessRule>>;
  authorize?: (capability: OwnerIntelligenceCapability) => boolean;
};

export type OwnerProviderAuditEvent = {
  event: "owner.provider.query.requested" | "owner.provider.query.skipped" | "owner.provider.query.completed" | "owner.provider.query.failed" | "owner.intelligence.orchestration.completed";
  companyId: string;
  actorUserId: string;
  provider: string;
  capability?: OwnerIntelligenceCapability;
  status?: OwnerProviderQueryStatus;
  reason?: OwnerProviderQueryStatus;
  protocol?: string | null;
  durationMs?: number;
};

export type OwnerProviderOrchestrationResult = {
  companyId: string;
  subject: OwnerDocumentIdentity;
  mode: OwnerProviderQueryMode;
  idempotencyKey: string;
  status: OwnerProviderQueryStatus;
  results: OwnerProviderResult[];
  normalized: Record<string, unknown>;
  provenance: Record<string, { provider: string; source: string; checkedAt: string; confidence: OwnerIntelligenceConfidence; freshUntil: string | null }>;
  conflicts: Array<{ capability: OwnerIntelligenceCapability; field: string; values: unknown[]; providers: string[] }>;
  warnings: string[];
};

export const OWNER_PROVIDER_CAPABILITIES = [...OWNER_INTELLIGENCE_CAPABILITIES] as readonly OwnerIntelligenceCapability[];

const forbiddenKeys = /^(?:cpf|cnpj|document|password|token|secret|api[_-]?key|raw|payload|biometric|health|religion|political|sexual|race|ethnicity|creditor|debt|amount)$/i;
const capabilityAllowlist: Record<OwnerIntelligenceCapability, Set<string>> = {
  IDENTITY: new Set(["full_name", "fullName", "name", "registration_status", "registrationStatus", "birth_date", "birthDate", "occupation", "profession", "status", "parentage", "mother_name"]),
  ADDRESS: new Set(["postal_code", "cep", "street", "address", "number", "complement", "neighborhood", "district", "city", "state", "uf", "country", "current"]),
  CIVIL: new Set(["marital_status", "maritalStatus", "property_regime", "propertyRegime"]),
  EMPLOYMENT: new Set(["employment_type", "current_employer", "employer", "role", "position", "status", "history"]),
  PROFESSIONAL: new Set(["profession", "occupation", "employment_type", "current_employer", "role", "status"]),
  INCOME: new Set(["income_declared_monthly", "income_proven_monthly", "family_income_monthly", "variable_income_monthly", "income_sources", "financial_capacity", "status"]),
  CREDIT: new Set(["status", "score_range", "score_scale", "has_restrictions", "has_negative_listings", "restriction_count", "debt_count", "protest_count", "negative_listing_count", "checked_at", "expires_at"]),
  LEGAL: new Set(["status", "process_count", "active_process_count", "has_records", "filing_date", "last_movement_date", "court", "tribunal", "jurisdiction", "state", "city", "procedural_class", "person_role", "secrecy_level", "sealed", "checked_at", "expires_at"]),
  FISCAL: new Set(["status", "registration_status", "tax_regular", "tax_pending", "declarations", "certificates", "checked_at", "expires_at"]),
  COMPANY: new Set(["legal_name", "trade_name", "foundation_date", "registration_status", "address", "city", "state", "status"]),
  CORPORATE_RELATIONS: new Set(["qsa", "partners", "administrators", "relationships", "participation"]),
  PROPERTY_REGISTRY: new Set(["property_id", "registration_status", "relationship", "ownership_percentage"]),
  DOCUMENT_VALIDATION: new Set(["document_type", "status", "verified", "verified_at", "expires_at"]),
  DOCUMENTS: new Set(["document_type", "status", "verified", "verified_at", "expires_at"]),
};

export function normalizeOwnerDocument(document: string): string {
  return document.replace(/\D/g, "");
}

export function detectOwnerSubject(document: string): OwnerDocumentIdentity | null {
  const normalized = normalizeOwnerDocument(document);
  if (normalized.length === 11 && isValidCpf(normalized)) return { subjectType: "PERSON", document: normalized };
  if (normalized.length === 14 && isValidCnpj(normalized)) return { subjectType: "COMPANY", document: normalized };
  return null;
}

export function isValidCpf(document: string): boolean {
  if (!/^\d{11}$/.test(document) || /^([0-9])\1{10}$/.test(document)) return false;
  const digits = [...document].map(Number);
  const first = calculateCheckDigit(digits.slice(0, 9));
  const second = calculateCheckDigit(digits.slice(0, 10));
  return digits[9] === first && digits[10] === second;
}

export function isValidCnpj(document: string): boolean {
  if (!/^\d{14}$/.test(document) || /^([0-9])\1{13}$/.test(document)) return false;
  const digits = [...document].map(Number);
  const first = calculateCnpjDigit(digits.slice(0, 12));
  const second = calculateCnpjDigit(digits.slice(0, 13));
  return digits[12] === first && digits[13] === second;
}

function calculateCheckDigit(digits: number[]) {
  const weight = digits.length + 1;
  const sum = digits.reduce((total, digit, index) => total + digit * (weight - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function calculateCnpjDigit(digits: number[]) {
  const weights = digits.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const remainder = digits.reduce((total, digit, index) => total + digit * weights[index], 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export const ownerProviderFreshnessDefaults: Partial<Record<OwnerIntelligenceCapability, OwnerProviderFreshnessRule>> = {
  IDENTITY: {},
  ADDRESS: {},
  CIVIL: {},
  PROFESSIONAL: {},
  EMPLOYMENT: {},
  INCOME: {},
  CREDIT: {},
  LEGAL: {},
  FISCAL: {},
  COMPANY: {},
  CORPORATE_RELATIONS: {},
  PROPERTY_REGISTRY: {},
  DOCUMENT_VALIDATION: {},
  DOCUMENTS: {},
};

export class OwnerProviderOrchestrator {
  private readonly executions = new Map<string, { fingerprint: string; result: OwnerProviderOrchestrationResult }>();

  constructor(
    private readonly registry: OwnerEnrichmentProviderRegistry = ownerIntelligenceRegistry,
    private readonly audit: (event: OwnerProviderAuditEvent) => void = () => undefined,
  ) {}

  async query(context: OwnerProviderQueryContext): Promise<OwnerProviderOrchestrationResult> {
    const subject = detectOwnerSubject(context.document);
    if (!subject) throw Object.assign(new Error("CPF ou CNPJ inválido."), { statusCode: 400, code: "OWNER_DOCUMENT_INVALID" });
    if (context.subjectType && context.subjectType !== subject.subjectType) throw Object.assign(new Error("Tipo de documento incompatível."), { statusCode: 400, code: "OWNER_DOCUMENT_TYPE_MISMATCH" });
    if (!context.companyId.trim() || !context.actorUserId.trim()) throw Object.assign(new Error("Contexto de empresa e usuário é obrigatório."), { statusCode: 401, code: "OWNER_PROVIDER_CONTEXT_REQUIRED" });
    const capabilities = [...new Set(context.capabilities)];
    if (!capabilities.length) throw Object.assign(new Error("Informe ao menos uma capability."), { statusCode: 400, code: "OWNER_PROVIDER_CAPABILITY_REQUIRED" });
    for (const capability of capabilities) {
      if (!OWNER_INTELLIGENCE_CAPABILITIES.includes(capability)) throw Object.assign(new Error("Capability não suportada."), { statusCode: 400, code: "OWNER_PROVIDER_CAPABILITY_UNSUPPORTED" });
      if (context.authorize && !context.authorize(capability)) throw Object.assign(new Error("Permissão insuficiente para consultar esta capability."), { statusCode: 403, code: "OWNER_PROVIDER_PERMISSION_REQUIRED" });
    }
    const idempotencyKey = context.idempotencyKey.trim().slice(0, 160);
    if (!idempotencyKey) throw Object.assign(new Error("Idempotency-Key é obrigatório."), { statusCode: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
    const fingerprint = `${context.companyId}:${subject.subjectType}:${subject.document}:${capabilities.sort().join(",")}:${context.mode ?? "FULL"}`;
    const executionKey = `${context.companyId}:${idempotencyKey}`;
    const previous = this.executions.get(executionKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw Object.assign(new Error("Idempotency-Key já utilizada para outra consulta."), { statusCode: 409, code: "OWNER_PROVIDER_IDEMPOTENCY_CONFLICT" });
      return previous.result;
    }
    const mode = context.mode ?? "FULL";
    const results: OwnerProviderResult[] = [];
    for (const capability of capabilities) {
      const result = await this.queryCapability(subject, capability, context, mode);
      results.push(result);
    }
    const normalized = results.reduce<Record<string, unknown>>((all, result) => ({ ...all, ...result.data }), {});
    const provenance = results.reduce<OwnerProviderOrchestrationResult["provenance"]>((all, result) => {
      all[result.capability] = { provider: result.provider, source: result.source, checkedAt: result.queriedAt, confidence: result.confidence, freshUntil: result.freshUntil };
      return all;
    }, {});
    const status = aggregateProviderStatus(results);
    const result: OwnerProviderOrchestrationResult = { companyId: context.companyId, subject, mode, idempotencyKey, status, results, normalized, provenance, conflicts: [], warnings: results.flatMap((entry) => entry.warnings) };
    this.executions.set(executionKey, { fingerprint, result });
    this.audit({ event: "owner.intelligence.orchestration.completed", companyId: context.companyId, actorUserId: context.actorUserId, provider: results.map((entry) => entry.provider).join(","), status });
    return result;
  }

  async health(): Promise<Array<{ provider: string; health: OwnerProviderHealth }>> {
    const providers = this.registry.list().map((entry) => this.registry.get(entry.name)).filter((provider): provider is OwnerProviderAdapter => Boolean(provider && "healthCheck" in provider));
    return Promise.all(providers.map(async (provider) => ({ provider: provider.name, health: await provider.healthCheck() })));
  }

  private async queryCapability(subject: OwnerDocumentIdentity, capability: OwnerIntelligenceCapability, context: OwnerProviderQueryContext, mode: OwnerProviderQueryMode): Promise<OwnerProviderResult> {
    const chain = this.registry.selectChain(capability, subject.subjectType);
    const resolved = this.registry.resolve(capability);
    const candidates = chain.length ? chain : [resolved].filter((provider): provider is OwnerProviderAdapter => Boolean(provider && "isConfigured" in provider));
    for (const provider of candidates) {
      this.audit({ event: "owner.provider.query.requested", companyId: context.companyId, actorUserId: context.actorUserId, provider: provider.name, capability });
      const freshness = context.freshness?.[capability] ?? ownerProviderFreshnessDefaults[capability];
      if (mode !== "REFRESH" && isFresh(freshness)) {
        this.audit({ event: "owner.provider.query.skipped", companyId: context.companyId, actorUserId: context.actorUserId, provider: provider.name, capability, status: "SKIPPED_FRESH", reason: "SKIPPED_FRESH" });
        return emptyProviderResult(provider, capability, "SKIPPED_FRESH", "Freshness policy skipped the external query.");
      }
      if (!provider.isConfigured()) {
        this.audit({ event: "owner.provider.query.skipped", companyId: context.companyId, actorUserId: context.actorUserId, provider: provider.name, capability, status: "NOT_CONFIGURED", reason: "NOT_CONFIGURED" });
        continue;
      }
      if (provider.costProfile.isPaid && context.allowPaid !== true) {
        this.audit({ event: "owner.provider.query.skipped", companyId: context.companyId, actorUserId: context.actorUserId, provider: provider.name, capability, status: "SKIPPED_COST", reason: "SKIPPED_COST" });
        return emptyProviderResult(provider, capability, "SKIPPED_COST", "Consulta paga requer confirmação explícita.");
      }
      const startedAt = Date.now();
      try {
        const raw = await provider.query({ document: subject.document, capabilities: [capability] });
        const status = mapProviderStatus(raw.status);
        const data = status === "SUCCESS" || status === "PARTIAL" ? filterProviderData(raw.values, capability) : {};
        const result: OwnerProviderResult = { provider: provider.name, capability, status, protocol: raw.protocol ?? null, queriedAt: raw.consultedAt, freshUntil: null, estimatedCost: provider.costProfile.estimatedCost, source: providerSource(provider), confidence: status === "SUCCESS" ? "high" : "unknown", data: provider.normalize(data, capability), errors: [], warnings: raw.warnings };
        if (["NOT_FOUND", "TIMEOUT", "RATE_LIMITED", "PROVIDER_ERROR"].includes(status) && chain.length > 1) continue;
        this.audit({ event: status === "SUCCESS" || status === "PARTIAL" ? "owner.provider.query.completed" : "owner.provider.query.failed", companyId: context.companyId, actorUserId: context.actorUserId, provider: provider.name, capability, status, reason: status === "AUTH_ERROR" ? "AUTH_ERROR" : undefined, protocol: raw.protocol ?? null, durationMs: Date.now() - startedAt });
        return result;
      } catch (error) {
        const status = classifyProviderError(error);
        this.audit({ event: "owner.provider.query.failed", companyId: context.companyId, actorUserId: context.actorUserId, provider: provider.name, capability, status, reason: status, durationMs: Date.now() - startedAt });
        if (chain.length > 1 && ["TIMEOUT", "RATE_LIMITED", "PROVIDER_ERROR"].includes(status)) continue;
        return emptyProviderResult(provider, capability, status, "Provider query failed.");
      }
    }
    const resolvedFallback = this.registry.resolve(capability);
    const fallback = resolvedFallback && "costProfile" in resolvedFallback ? resolvedFallback as OwnerProviderAdapter : notConfiguredFallback(capability);
    return emptyProviderResult(fallback, capability, "NOT_CONFIGURED", "Nenhum provider configurado para esta capability.");
  }
}

function notConfiguredFallback(capability: OwnerIntelligenceCapability): OwnerProviderAdapter {
  return {
    id: "not_configured",
    name: "NOT_CONFIGURED",
    type: "SYSTEM",
    capabilities: [capability],
    priorities: ["FALLBACK"],
    envNames: [],
    costProfile: { pricingModel: "free", estimatedCost: 0, currency: "BRL", isPaid: false },
    isConfigured: () => false,
    supports: () => true,
    query: async () => ({ status: "not_configured", provider: "NOT_CONFIGURED", consultedAt: new Date().toISOString(), sections: [capability], values: {}, warnings: ["Nenhum provider configurado."] }),
    normalize: (value) => value,
    healthCheck: async () => "NOT_CONFIGURED",
  };
}

function emptyProviderResult(provider: OwnerProviderAdapter, capability: OwnerIntelligenceCapability, status: OwnerProviderQueryStatus, warning: string): OwnerProviderResult {
  return { provider: provider.name, capability, status, protocol: null, queriedAt: new Date().toISOString(), freshUntil: null, estimatedCost: provider.costProfile.estimatedCost, source: providerSource(provider), confidence: "unknown", data: {}, errors: [], warnings: [warning] };
}

function providerSource(provider: OwnerProviderAdapter): OwnerProviderResult["source"] {
  if (provider.type === "OFFICIAL") return "official";
  if (provider.type === "OFFICIAL_DATASET") return "official_dataset";
  if (provider.type === "COMMERCIAL_ENRICHMENT") return "commercial_enrichment";
  if (provider.type === "COMMERCIAL") return "commercial";
  return provider.type === "TEST" ? "test" : "system";
}

function mapProviderStatus(status: string): OwnerProviderQueryStatus {
  const normalized = status.toUpperCase();
  if (["SUCCESS", "VERIFIED"].includes(normalized)) return "SUCCESS";
  if (["PARTIAL"].includes(normalized)) return "PARTIAL";
  if (["NOT_FOUND", "NOTFOUND"].includes(normalized)) return "NOT_FOUND";
  if (["NOT_CONFIGURED", "NOTCONFIGURED"].includes(normalized)) return "NOT_CONFIGURED";
  if (["UNSUPPORTED"].includes(normalized)) return "UNSUPPORTED";
  if (["RATE_LIMITED", "RATELIMITED"].includes(normalized)) return "RATE_LIMITED";
  if (["TIMEOUT"].includes(normalized)) return "TIMEOUT";
  if (["AUTH_ERROR", "AUTHERROR"].includes(normalized)) return "AUTH_ERROR";
  if (["SKIPPED_FRESH"].includes(normalized)) return "SKIPPED_FRESH";
  if (["SKIPPED_COST"].includes(normalized)) return "SKIPPED_COST";
  return "PROVIDER_ERROR";
}

function classifyProviderError(error: unknown): OwnerProviderQueryStatus {
  const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: unknown }).status) : 0;
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 429) return "RATE_LIMITED";
  return "PROVIDER_ERROR";
}

function isFresh(rule?: OwnerProviderFreshnessRule) {
  if (!rule?.lastCheckedAt || !rule.maxAgeSeconds || rule.maxAgeSeconds <= 0) return false;
  const checkedAt = Date.parse(rule.lastCheckedAt);
  return Number.isFinite(checkedAt) && Date.now() - checkedAt < rule.maxAgeSeconds * 1000;
}

function aggregateProviderStatus(results: OwnerProviderResult[]): OwnerProviderQueryStatus {
  if (!results.length) return "NOT_CONFIGURED";
  if (results.every((result) => result.status === "NOT_CONFIGURED")) return "NOT_CONFIGURED";
  if (results.some((result) => result.status === "SUCCESS")) return results.every((result) => result.status === "SUCCESS") ? "SUCCESS" : "PARTIAL";
  if (results.some((result) => result.status === "PARTIAL")) return "PARTIAL";
  return results[0].status;
}

function filterProviderData(value: unknown, capability: OwnerIntelligenceCapability): Record<string, unknown> {
  const allowlist = capabilityAllowlist[capability];
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return sanitizeRecord(value as Record<string, unknown>, allowlist);
}

function sanitizeRecord(input: Record<string, unknown>, allowlist: Set<string>): Record<string, unknown> {
  return Object.entries(input).reduce<Record<string, unknown>>((result, [key, value]) => {
    if (forbiddenKeys.test(key) || !allowlist.has(key)) return result;
    if (Array.isArray(value)) {
      result[key] = value.map((entry) => entry && typeof entry === "object" && !Array.isArray(entry) ? sanitizeRecord(entry as Record<string, unknown>, allowlist) : entry);
    } else if (value && typeof value === "object") {
      result[key] = sanitizeRecord(value as Record<string, unknown>, allowlist);
    } else {
      result[key] = value;
    }
    return result;
  }, {});
}

export function createOwnerProviderOrchestrator(options?: { registry?: OwnerEnrichmentProviderRegistry; audit?: (event: OwnerProviderAuditEvent) => void }) {
  return new OwnerProviderOrchestrator(options?.registry ?? ownerIntelligenceRegistry, options?.audit);
}
