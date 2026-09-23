import { createBigDataCorpProvider } from "./bigdatacorp-provider.js";

/**
 * Owner Intelligence 360 foundation.
 *
 * The domain stores normalized internal DTOs and provenance instead of
 * exposing provider-specific payloads. Providers are optional: a capability
 * without configured credentials is represented explicitly as NOT_CONFIGURED.
 */

export const OWNER_INTELLIGENCE_CAPABILITIES = [
  "IDENTITY",
  "ADDRESS",
  "CIVIL",
  "EMPLOYMENT",
  "PROFESSIONAL",
  "INCOME",
  "CREDIT",
  "LEGAL",
  "FISCAL",
  "COMPANY",
  "CORPORATE_RELATIONS",
  "PROPERTY_REGISTRY",
  "DOCUMENT_VALIDATION",
  "DOCUMENTS",
] as const;

export type OwnerIntelligenceCapability = (typeof OWNER_INTELLIGENCE_CAPABILITIES)[number];
export type OwnerIntelligenceSource = "provider" | "manual" | "declared" | "document" | "system";
export type OwnerIntelligenceStatus =
  | "verified"
  | "declared"
  | "suggested"
  | "pending"
  | "conflict"
  | "expired"
  | "not_configured";
export type OwnerIntelligenceConfidence = "high" | "medium" | "low" | "unknown";

export type ProvenancedValue<T> = {
  value: T | null;
  source: OwnerIntelligenceSource;
  provider: string | null;
  consultedAt: string | null;
  verifiedAt: string | null;
  status: OwnerIntelligenceStatus;
  confidence: OwnerIntelligenceConfidence;
};

export type OwnerIdentityDTO = {
  cpf: ProvenancedValue<string>;
  registrationStatus: ProvenancedValue<string>;
  fullName: ProvenancedValue<string>;
  socialName: ProvenancedValue<string>;
  birthDate: ProvenancedValue<string>;
  parentage: ProvenancedValue<string[]>;
  rg: ProvenancedValue<string>;
  issuingAuthority: ProvenancedValue<string>;
  issuingState: ProvenancedValue<string>;
  issueDate: ProvenancedValue<string>;
  birthplace: ProvenancedValue<string>;
  nationality: ProvenancedValue<string>;
  occupation: ProvenancedValue<string>;
};

export type OwnerAddressDTO = {
  postalCode: ProvenancedValue<string>;
  street: ProvenancedValue<string>;
  number: ProvenancedValue<string>;
  complement: ProvenancedValue<string>;
  neighborhood: ProvenancedValue<string>;
  city: ProvenancedValue<string>;
  state: ProvenancedValue<string>;
  country: ProvenancedValue<string>;
  residencySince: ProvenancedValue<string>;
  current: ProvenancedValue<boolean>;
};

export type OwnerCivilDTO = {
  maritalStatus: ProvenancedValue<string>;
  propertyRegime: ProvenancedValue<string>;
  spouseName: ProvenancedValue<string>;
  spouseCpf: ProvenancedValue<string>;
  evidenceDocumentId: ProvenancedValue<string>;
};

export type OwnerCreditStatus = "NOT_CHECKED" | "NOT_CONFIGURED" | "CURRENT" | "EXPIRED" | "PARTIAL" | "CLEAR" | "HAS_RESTRICTIONS" | "ERROR";
export type OwnerCreditRestriction = { id: string | null; type: string | null; description: string | null; creditor: string | null; amount: number | null; occurrence_date: string | null; status: string | null; source: string | null; checked_at: string | null; protocol: string | null };
export type OwnerCreditDebt = { id: string | null; creditor: string | null; amount: number | null; due_date: string | null; origin: string | null; status: string | null; source: string | null; protocol: string | null };
export type OwnerCreditProtest = { id: string | null; registry_office: string | null; city: string | null; state: string | null; amount: number | null; occurrence_date: string | null; status: string | null; source: string | null; protocol: string | null };
export type OwnerCreditNegativeListing = { id: string | null; source: string | null; creditor: string | null; amount: number | null; occurrence_date: string | null; status: string | null; checked_at: string | null; protocol: string | null };
export type OwnerCreditData = {
  status: OwnerCreditStatus;
  score: number | null;
  score_range: string | null;
  score_scale: string | null;
  has_restrictions: boolean | null;
  has_negative_listings: boolean | null;
  restriction_count: number | null;
  debt_count: number | null;
  total_debt_amount: number | null;
  protest_count: number | null;
  negative_listing_count: number | null;
  restrictions: OwnerCreditRestriction[];
  debts: OwnerCreditDebt[];
  protests: OwnerCreditProtest[];
  negative_listings: OwnerCreditNegativeListing[];
  provider: string | null;
  protocol: string | null;
  checked_at: string | null;
  expires_at: string | null;
  provenance: OwnerIntelligenceSource;
  confidence: OwnerIntelligenceConfidence;
};

export type OwnerLegalStatus = "NOT_CHECKED" | "NOT_CONFIGURED" | "NO_RECORDS_FOUND" | "RECORDS_FOUND" | "NOT_AVAILABLE" | "EXPIRED" | "PARTIAL" | "ERROR";
export type OwnerLegalProcess = {
  process_number: string | null;
  court: string | null;
  tribunal: string | null;
  jurisdiction: string | null;
  state: string | null;
  city: string | null;
  court_unit: string | null;
  procedural_class: string | null;
  subject: string | null;
  person_role: string | null;
  opposing_parties: string[];
  filing_date: string | null;
  last_movement_date: string | null;
  status: string | null;
  case_value: number | null;
  secrecy_level: string | null;
  sealed: boolean | null;
  source: string | null;
  provider: string | null;
  protocol: string | null;
  checked_at: string | null;
};
export type OwnerLegalCertificate = {
  type: string | null;
  jurisdiction: string | null;
  issuing_authority: string | null;
  result_status: string | null;
  issued_at: string | null;
  expires_at: string | null;
  protocol: string | null;
  document_record_id: string | null;
  provider: string | null;
  provenance: OwnerIntelligenceSource;
  confidence: OwnerIntelligenceConfidence;
};
export type OwnerLegalData = {
  status: OwnerLegalStatus;
  has_records: boolean | null;
  process_count: number | null;
  active_process_count: number | null;
  processes: OwnerLegalProcess[];
  certificates: OwnerLegalCertificate[];
  provider: string | null;
  protocol: string | null;
  checked_at: string | null;
  expires_at: string | null;
  provenance: OwnerIntelligenceSource;
  confidence: OwnerIntelligenceConfidence;
};

export type OwnerFiscalDeclaration = {
  year: string | null;
  status: string | null;
  received_at: string | null;
  source: string | null;
  provider: string | null;
  protocol: string | null;
};
export type OwnerFiscalCertificate = {
  type: string | null;
  issuing_authority: string | null;
  jurisdiction: string | null;
  result_status: string | null;
  issued_at: string | null;
  expires_at: string | null;
  protocol: string | null;
  document_record_id: string | null;
  provider: string | null;
  provenance: OwnerIntelligenceSource;
  confidence: OwnerIntelligenceConfidence;
};
export type OwnerFiscalPendingItem = {
  type: string | null;
  authority: string | null;
  reference: string | null;
  status: string | null;
  amount: number | null;
  checked_at: string | null;
  source: string | null;
  provider: string | null;
  protocol: string | null;
};
export type OwnerFiscalActiveDebt = {
  has_active_debt: boolean | null;
  active_debt_count: number | null;
  amount: number | null;
  authority: string | null;
  reference: string | null;
  status: string | null;
  checked_at: string | null;
};
export type OwnerFiscalStatus = "NOT_CHECKED" | "NOT_CONFIGURED" | "REGULAR" | "IRREGULAR" | "PENDING" | "NOT_AVAILABLE" | "PARTIAL" | "EXPIRED" | "ERROR";
export type OwnerFiscalData = {
  status: OwnerFiscalStatus;
  registration_status: string | null;
  tax_regular: boolean | null;
  tax_pending: boolean | null;
  declarations: OwnerFiscalDeclaration[];
  certificates: OwnerFiscalCertificate[];
  active_debt: OwnerFiscalActiveDebt;
  pending_items: OwnerFiscalPendingItem[];
  provider: string | null;
  protocol: string | null;
  checked_at: string | null;
  expires_at: string | null;
  provenance: OwnerIntelligenceSource;
  confidence: OwnerIntelligenceConfidence;
};

export type OwnerIntelligenceProviderResult = {
  status: OwnerIntelligenceStatus | OwnerProviderQueryStatus;
  provider: string;
  consultedAt: string;
  sections: OwnerIntelligenceCapability[];
  values: Record<string, unknown>;
  warnings: string[];
  protocol?: string | null;
};

export type OwnerProviderSubjectType = "PERSON" | "COMPANY";
export type OwnerProviderPriority = "PRIMARY" | "OFFICIAL" | "SECONDARY" | "ENRICHMENT" | "FALLBACK";
export type OwnerProviderQueryStatus =
  | "SUCCESS"
  | "PARTIAL"
  | "NOT_FOUND"
  | "NOT_CONFIGURED"
  | "UNSUPPORTED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "AUTH_ERROR"
  | "PROVIDER_ERROR"
  | "SKIPPED_FRESH"
  | "SKIPPED_COST";
export type OwnerProviderHealth = "AVAILABLE" | "NOT_CONFIGURED" | "DEGRADED" | "UNAVAILABLE";
export type OwnerProviderQueryMode = "QUICK" | "FULL" | "REFRESH" | "DOMAIN_ONLY";
export type OwnerProviderCostProfile = {
  pricingModel: "free" | "pay_per_use" | "contract" | "unknown";
  estimatedCost: number | null;
  currency: string | null;
  isPaid: boolean;
};
export type OwnerProviderResult = {
  provider: string;
  capability: OwnerIntelligenceCapability;
  status: OwnerProviderQueryStatus;
  protocol: string | null;
  queriedAt: string;
  freshUntil: string | null;
  estimatedCost: number | null;
  source: "official" | "commercial" | "official_dataset" | "commercial_enrichment" | "test" | "system";
  confidence: OwnerIntelligenceConfidence;
  data: Record<string, unknown>;
  errors: string[];
  warnings: string[];
};
export type OwnerProviderAdapter = OwnerIntelligenceProvider & {
  id: string;
  type: "OFFICIAL" | "OFFICIAL_DATASET" | "COMMERCIAL" | "COMMERCIAL_ENRICHMENT" | "TEST" | "SYSTEM";
  priorities: readonly OwnerProviderPriority[];
  envNames: readonly string[];
  costProfile: OwnerProviderCostProfile;
  isConfigured: () => boolean;
  supports: (subjectType: OwnerProviderSubjectType, capability: OwnerIntelligenceCapability) => boolean;
  normalize: (rawResult: Record<string, unknown>, capability: OwnerIntelligenceCapability) => Record<string, unknown>;
  healthCheck: () => Promise<OwnerProviderHealth>;
};

export type OwnerIntelligenceProvider = {
  name: string;
  capabilities: readonly OwnerIntelligenceCapability[];
  query(input: { document: string | null; capabilities: OwnerIntelligenceCapability[] }): Promise<OwnerIntelligenceProviderResult>;
};

export class OwnerEnrichmentProviderRegistry {
  private readonly providers = new Map<string, OwnerProviderAdapter | OwnerIntelligenceProvider>();

  register(provider: OwnerProviderAdapter | OwnerIntelligenceProvider) {
    this.providers.set(provider.name, provider);
    return this;
  }

  get(name: string) {
    return this.providers.get(name) ?? null;
  }

  list() {
    return [...this.providers.values()].map((provider) => ({
      name: provider.name,
      capabilities: [...provider.capabilities],
      ...(isOwnerProviderAdapter(provider) ? {
        id: provider.id,
        type: provider.type,
        priorities: [...provider.priorities],
        configured: provider.isConfigured(),
        costProfile: provider.costProfile,
        envNames: [...provider.envNames],
      } : {}),
    }));
  }

  resolve(capability: OwnerIntelligenceCapability) {
    return this.select(capability)[0] ?? null;
  }

  select(capability: OwnerIntelligenceCapability, subjectType: OwnerProviderSubjectType = "PERSON") {
    const candidates = [...this.providers.values()]
      .filter((provider): provider is OwnerProviderAdapter => isOwnerProviderAdapter(provider) && provider.capabilities.includes(capability) && provider.supports(subjectType, capability) && provider.isConfigured())
      .sort((a, b) => providerPriorityScore(a) - providerPriorityScore(b));
    if (candidates.length) return candidates;
    const safeFallback = this.providers.get(notConfiguredOwnerProvider.name);
    return safeFallback ? [safeFallback] : [];
  }

  selectChain(capability: OwnerIntelligenceCapability, subjectType: OwnerProviderSubjectType = "PERSON") {
    return [...this.providers.values()]
      .filter((provider): provider is OwnerProviderAdapter => isOwnerProviderAdapter(provider) && provider.capabilities.includes(capability) && provider.supports(subjectType, capability))
      .sort((a, b) => providerPriorityScore(a) - providerPriorityScore(b));
  }
}

function isOwnerProviderAdapter(provider: OwnerProviderAdapter | OwnerIntelligenceProvider): provider is OwnerProviderAdapter {
  return typeof (provider as OwnerProviderAdapter).isConfigured === "function" && typeof (provider as OwnerProviderAdapter).supports === "function";
}

function providerPriorityScore(provider: OwnerProviderAdapter) {
  const order: OwnerProviderPriority[] = ["PRIMARY", "OFFICIAL", "SECONDARY", "ENRICHMENT", "FALLBACK"];
  const index = provider.priorities.findIndex((priority) => order.includes(priority));
  return index < 0 ? order.length : index;
}

const now = () => new Date().toISOString();

/** Safe default used when no external provider is configured for staging. */
export const notConfiguredOwnerProvider: OwnerIntelligenceProvider = {
  name: "NOT_CONFIGURED",
  capabilities: OWNER_INTELLIGENCE_CAPABILITIES,
  async query({ capabilities }) {
    return {
      status: "not_configured",
      provider: "NOT_CONFIGURED",
      consultedAt: now(),
      sections: capabilities,
      values: {},
      warnings: ["Nenhum provedor externo autorizado está configurado neste ambiente."],
    };
  },
};

const notConfiguredProviderAdapter: OwnerProviderAdapter = {
  ...notConfiguredOwnerProvider,
  id: "not_configured",
  type: "SYSTEM",
  priorities: ["FALLBACK"],
  envNames: [],
  costProfile: { pricingModel: "free", estimatedCost: 0, currency: "BRL", isPaid: false },
  isConfigured: () => false,
  supports: () => true,
  normalize: (rawResult) => rawResult,
  healthCheck: async () => "NOT_CONFIGURED",
};

function createNotConfiguredProvider(input: {
  id: string;
  name: string;
  type: OwnerProviderAdapter["type"];
  capabilities: readonly OwnerIntelligenceCapability[];
  priorities: readonly OwnerProviderPriority[];
  envNames?: readonly string[];
  pricingModel?: OwnerProviderCostProfile["pricingModel"];
}): OwnerProviderAdapter {
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    capabilities: input.capabilities,
    priorities: input.priorities,
    envNames: input.envNames ?? [],
    costProfile: { pricingModel: input.pricingModel ?? "unknown", estimatedCost: null, currency: "BRL", isPaid: input.pricingModel !== "free" },
    isConfigured: () => Boolean(input.envNames?.length) && input.envNames.every((name) => Boolean(process.env[name])),
    supports: (subjectType, capability) => input.capabilities.includes(capability) && ((subjectType === "COMPANY") || capability !== "COMPANY" || input.capabilities.includes("COMPANY")),
    query: async ({ capabilities }) => ({
      status: "not_configured",
      provider: input.name,
      consultedAt: now(),
      sections: capabilities.filter((capability) => input.capabilities.includes(capability)),
      values: {},
      warnings: [`${input.name} não está configurado neste ambiente.`],
    }),
    normalize: (rawResult) => rawResult,
    healthCheck: async () => "NOT_CONFIGURED",
  };
}

export const ownerProviderAdapters: readonly OwnerProviderAdapter[] = [
  createBigDataCorpProvider(),
  createNotConfiguredProvider({ id: "receita_open_data", name: "RECEITA_OPEN_DATA", type: "OFFICIAL_DATASET", capabilities: ["COMPANY", "FISCAL", "CORPORATE_RELATIONS"], priorities: ["OFFICIAL", "SECONDARY"], pricingModel: "free" }),
  createNotConfiguredProvider({ id: "serpro_cnpj", name: "SERPRO_CNPJ", type: "OFFICIAL", capabilities: ["COMPANY", "FISCAL", "CORPORATE_RELATIONS"], priorities: ["OFFICIAL"], pricingModel: "contract" }),
  createNotConfiguredProvider({ id: "datajud_cnj", name: "DATAJUD_CNJ", type: "OFFICIAL", capabilities: ["LEGAL"], priorities: ["OFFICIAL"], pricingModel: "free" }),
  createNotConfiguredProvider({ id: "escavador", name: "ESCAVADOR", type: "COMMERCIAL_ENRICHMENT", capabilities: ["IDENTITY", "COMPANY", "LEGAL"], priorities: ["ENRICHMENT"], pricingModel: "pay_per_use" }),
  createNotConfiguredProvider({ id: "serasa_experian", name: "SERASA_EXPERIAN", type: "COMMERCIAL", capabilities: ["IDENTITY", "COMPANY", "CREDIT", "LEGAL", "CORPORATE_RELATIONS"], priorities: ["PRIMARY"], pricingModel: "contract" }),
  createNotConfiguredProvider({ id: "equifax_boa_vista", name: "EQUIFAX_BOA_VISTA", type: "COMMERCIAL", capabilities: ["IDENTITY", "COMPANY", "CREDIT"], priorities: ["SECONDARY"], pricingModel: "contract" }),
];

export const ownerIntelligenceRegistry = ownerProviderAdapters.reduce(
  (registry, provider) => registry.register(provider),
  new OwnerEnrichmentProviderRegistry().register(notConfiguredProviderAdapter),
);

export function emptyProvenancedValue<T>(source: OwnerIntelligenceSource = "manual"): ProvenancedValue<T> {
  return {
    value: null,
    source,
    provider: null,
    consultedAt: null,
    verifiedAt: null,
    status: "pending",
    confidence: "unknown",
  };
}

export function normalizeOwnerIdentity(input: Record<string, unknown>): OwnerIdentityDTO {
  return {
    cpf: value(input.cpf),
    registrationStatus: value(input.registration_status ?? input.registrationStatus),
    fullName: value(input.full_name ?? input.fullName ?? input.name),
    socialName: value(input.social_name ?? input.socialName),
    birthDate: value(input.birth_date ?? input.birthDate),
    parentage: arrayValue(input.parentage ?? input.filiation),
    rg: value(input.rg),
    issuingAuthority: value(input.issuing_authority ?? input.issuingAuthority),
    issuingState: value(input.issuing_state ?? input.issuingState),
    issueDate: value(input.issue_date ?? input.issueDate),
    birthplace: value(input.birthplace ?? input.birth_city),
    nationality: value(input.nationality),
    occupation: value(input.occupation ?? input.profession),
  };
}

export function normalizeOwnerAddress(input: Record<string, unknown>): OwnerAddressDTO {
  return {
    postalCode: value(input.postal_code ?? input.cep),
    street: value(input.street ?? input.address),
    number: value(input.number),
    complement: value(input.complement),
    neighborhood: value(input.neighborhood ?? input.district),
    city: value(input.city),
    state: value(input.state ?? input.uf),
    country: value(input.country ?? "Brasil"),
    residencySince: value(input.residency_since ?? input.residencySince),
    current: booleanValue(input.current ?? true),
  };
}

export function normalizeOwnerCivil(input: Record<string, unknown>): OwnerCivilDTO {
  return {
    maritalStatus: value(input.marital_status ?? input.maritalStatus),
    propertyRegime: value(input.property_regime ?? input.propertyRegime),
    spouseName: value(input.spouse_name ?? input.spouseName),
    spouseCpf: value(input.spouse_cpf ?? input.spouseCpf),
    evidenceDocumentId: value(input.evidence_document_id ?? input.evidenceDocumentId),
  };
}

function normalizeCreditStatus(value: unknown): OwnerCreditStatus {
  const status = String(value ?? "").trim().toUpperCase();
  return ["NOT_CHECKED", "NOT_CONFIGURED", "CURRENT", "EXPIRED", "PARTIAL", "CLEAR", "HAS_RESTRICTIONS", "ERROR"].includes(status) ? status as OwnerCreditStatus : "NOT_CHECKED";
}
function normalizeLegalStatus(value: unknown): OwnerLegalStatus {
  const status = String(value ?? "").trim().toUpperCase();
  return ["NOT_CHECKED", "NOT_CONFIGURED", "NO_RECORDS_FOUND", "RECORDS_FOUND", "NOT_AVAILABLE", "EXPIRED", "PARTIAL", "ERROR"].includes(status) ? status as OwnerLegalStatus : "NOT_CHECKED";
}
function normalizeFiscalStatus(value: unknown): OwnerFiscalStatus {
  const status = String(value ?? "").trim().toUpperCase();
  return ["NOT_CHECKED", "NOT_CONFIGURED", "REGULAR", "IRREGULAR", "PENDING", "NOT_AVAILABLE", "PARTIAL", "EXPIRED", "ERROR"].includes(status) ? status as OwnerFiscalStatus : "NOT_CHECKED";
}
function nullableCreditString(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function nullableCreditNumber(value: unknown) { const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null; return n !== null && Number.isFinite(n) ? n : null; }
function nullableCreditBoolean(value: unknown) { return typeof value === "boolean" ? value : null; }
function creditRows(value: unknown) { return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : []; }

export function normalizeOwnerCredit(input: Record<string, unknown>): OwnerCreditData {
  const restrictions = creditRows(input.restrictions).map((row) => ({
    id: nullableCreditString(row.id ?? row.provider_reference), type: nullableCreditString(row.type), description: nullableCreditString(row.description), creditor: nullableCreditString(row.creditor), amount: nullableCreditNumber(row.amount), occurrence_date: nullableCreditString(row.occurrence_date ?? row.occurrenceDate), status: nullableCreditString(row.status), source: nullableCreditString(row.source ?? row.provider), checked_at: nullableCreditString(row.checked_at ?? row.checkedAt), protocol: nullableCreditString(row.protocol),
  }));
  const debts = creditRows(input.debts).map((row) => ({
    id: nullableCreditString(row.id ?? row.provider_reference), creditor: nullableCreditString(row.creditor), amount: nullableCreditNumber(row.amount), due_date: nullableCreditString(row.due_date ?? row.dueDate), origin: nullableCreditString(row.origin), status: nullableCreditString(row.status), source: nullableCreditString(row.source ?? row.provider), protocol: nullableCreditString(row.protocol),
  }));
  const protests = creditRows(input.protests).map((row) => ({
    id: nullableCreditString(row.id ?? row.provider_reference), registry_office: nullableCreditString(row.registry_office ?? row.registryOffice), city: nullableCreditString(row.city), state: nullableCreditString(row.state ?? row.uf), amount: nullableCreditNumber(row.amount), occurrence_date: nullableCreditString(row.occurrence_date ?? row.occurrenceDate), status: nullableCreditString(row.status), source: nullableCreditString(row.source ?? row.provider), protocol: nullableCreditString(row.protocol),
  }));
  const negativeListings = creditRows(input.negative_listings ?? input.negativeListings).map((row) => ({
    id: nullableCreditString(row.id ?? row.provider_reference), source: nullableCreditString(row.source ?? row.provider), creditor: nullableCreditString(row.creditor), amount: nullableCreditNumber(row.amount), occurrence_date: nullableCreditString(row.occurrence_date ?? row.occurrenceDate), status: nullableCreditString(row.status), checked_at: nullableCreditString(row.checked_at ?? row.checkedAt), protocol: nullableCreditString(row.protocol),
  }));
  const provenance = nullableCreditString(input.provenance);
  const confidence = nullableCreditString(input.confidence);
  return {
    status: normalizeCreditStatus(input.status), score: nullableCreditNumber(input.score), score_range: nullableCreditString(input.score_range ?? input.scoreRange), score_scale: nullableCreditString(input.score_scale ?? input.scoreScale),
    has_restrictions: nullableCreditBoolean(input.has_restrictions ?? input.hasRestrictions), has_negative_listings: nullableCreditBoolean(input.has_negative_listings ?? input.hasNegativeListings),
    restriction_count: nullableCreditNumber(input.restriction_count ?? input.restrictionCount), debt_count: nullableCreditNumber(input.debt_count ?? input.debtCount), total_debt_amount: nullableCreditNumber(input.total_debt_amount ?? input.totalDebtAmount), protest_count: nullableCreditNumber(input.protest_count ?? input.protestCount), negative_listing_count: nullableCreditNumber(input.negative_listing_count ?? input.negativeListingCount),
    restrictions, debts, protests, negative_listings: negativeListings, provider: nullableCreditString(input.provider), protocol: nullableCreditString(input.protocol), checked_at: nullableCreditString(input.checked_at ?? input.checkedAt), expires_at: nullableCreditString(input.expires_at ?? input.expiresAt),
    provenance: provenance === "provider" || provenance === "manual" || provenance === "declared" || provenance === "document" || provenance === "system" ? provenance : "system",
    confidence: confidence === "high" || confidence === "medium" || confidence === "low" || confidence === "unknown" ? confidence : "unknown",
  };
}

export function normalizeOwnerLegal(input: Record<string, unknown>): OwnerLegalData {
  const status = normalizeLegalStatus(input.status);
  const processes = creditRows(input.processes).map((row) => ({
    process_number: nullableCreditString(row.process_number ?? row.processNumber ?? row.case_number),
    court: nullableCreditString(row.court),
    tribunal: nullableCreditString(row.tribunal),
    jurisdiction: nullableCreditString(row.jurisdiction),
    state: nullableCreditString(row.state ?? row.uf),
    city: nullableCreditString(row.city),
    court_unit: nullableCreditString(row.court_unit ?? row.courtUnit),
    procedural_class: nullableCreditString(row.procedural_class ?? row.proceduralClass ?? row.case_class),
    subject: nullableCreditString(row.subject),
    person_role: nullableCreditString(row.person_role ?? row.personRole ?? row.role),
    opposing_parties: Array.isArray(row.opposing_parties ?? row.opposingParties) ? ((row.opposing_parties ?? row.opposingParties) as unknown[]).filter((party): party is string => typeof party === "string" && party.trim().length > 0).map((party) => party.trim()) : [],
    filing_date: nullableCreditString(row.filing_date ?? row.filingDate),
    last_movement_date: nullableCreditString(row.last_movement_date ?? row.lastMovementDate),
    status: nullableCreditString(row.status),
    case_value: nullableCreditNumber(row.case_value ?? row.caseValue ?? row.value),
    secrecy_level: nullableCreditString(row.secrecy_level ?? row.secrecyLevel),
    sealed: nullableCreditBoolean(row.sealed ?? row.is_sealed),
    source: nullableCreditString(row.source),
    provider: nullableCreditString(row.provider),
    protocol: nullableCreditString(row.protocol),
    checked_at: nullableCreditString(row.checked_at ?? row.checkedAt),
  }));
  const certificates = creditRows(input.certificates).map((row) => {
    const provenance = nullableCreditString(row.provenance);
    const confidence = nullableCreditString(row.confidence);
    return {
      type: nullableCreditString(row.type),
      jurisdiction: nullableCreditString(row.jurisdiction),
      issuing_authority: nullableCreditString(row.issuing_authority ?? row.issuingAuthority),
      result_status: nullableCreditString(row.result_status ?? row.resultStatus ?? row.status),
      issued_at: nullableCreditString(row.issued_at ?? row.issuedAt),
      expires_at: nullableCreditString(row.expires_at ?? row.expiresAt),
      protocol: nullableCreditString(row.protocol),
      document_record_id: nullableCreditString(row.document_record_id ?? row.documentRecordId),
      provider: nullableCreditString(row.provider),
      provenance: provenance === "provider" || provenance === "manual" || provenance === "declared" || provenance === "document" || provenance === "system" ? provenance : "system",
      confidence: confidence === "high" || confidence === "medium" || confidence === "low" || confidence === "unknown" ? confidence : "unknown",
    } satisfies OwnerLegalCertificate;
  });
  const processCount = nullableCreditNumber(input.process_count ?? input.processCount);
  const activeProcessCount = nullableCreditNumber(input.active_process_count ?? input.activeProcessCount);
  const provenance = nullableCreditString(input.provenance);
  const confidence = nullableCreditString(input.confidence);
  return {
    status,
    has_records: nullableCreditBoolean(input.has_records ?? input.hasRecords) ?? (status === "NO_RECORDS_FOUND" ? false : status === "RECORDS_FOUND" || processes.length > 0 ? true : null),
    process_count: processCount ?? (status === "NO_RECORDS_FOUND" ? 0 : processes.length > 0 ? processes.length : null),
    active_process_count: activeProcessCount,
    processes,
    certificates,
    provider: nullableCreditString(input.provider),
    protocol: nullableCreditString(input.protocol),
    checked_at: nullableCreditString(input.checked_at ?? input.checkedAt),
    expires_at: nullableCreditString(input.expires_at ?? input.expiresAt),
    provenance: provenance === "provider" || provenance === "manual" || provenance === "declared" || provenance === "document" || provenance === "system" ? provenance : "system",
    confidence: confidence === "high" || confidence === "medium" || confidence === "low" || confidence === "unknown" ? confidence : "unknown",
  };
}

export function normalizeOwnerFiscal(input: Record<string, unknown>): OwnerFiscalData {
  const declarations = creditRows(input.declarations).map((row) => ({
    year: nullableCreditString(row.year ?? row.exercise ?? row.tax_year),
    status: nullableCreditString(row.status),
    received_at: nullableCreditString(row.received_at ?? row.receivedAt),
    source: nullableCreditString(row.source),
    provider: nullableCreditString(row.provider),
    protocol: nullableCreditString(row.protocol),
  }));
  const certificates = creditRows(input.certificates).map((row) => {
    const provenance = nullableCreditString(row.provenance);
    const confidence = nullableCreditString(row.confidence);
    return {
      type: nullableCreditString(row.type),
      issuing_authority: nullableCreditString(row.issuing_authority ?? row.issuingAuthority),
      jurisdiction: nullableCreditString(row.jurisdiction),
      result_status: nullableCreditString(row.result_status ?? row.resultStatus ?? row.status),
      issued_at: nullableCreditString(row.issued_at ?? row.issuedAt),
      expires_at: nullableCreditString(row.expires_at ?? row.expiresAt),
      protocol: nullableCreditString(row.protocol),
      document_record_id: nullableCreditString(row.document_record_id ?? row.documentRecordId),
      provider: nullableCreditString(row.provider),
      provenance: provenance === "provider" || provenance === "manual" || provenance === "declared" || provenance === "document" || provenance === "system" ? provenance : "system",
      confidence: confidence === "high" || confidence === "medium" || confidence === "low" || confidence === "unknown" ? confidence : "unknown",
    } satisfies OwnerFiscalCertificate;
  });
  const pendingItems = creditRows(input.pending_items ?? input.pendingItems).map((row) => ({
    type: nullableCreditString(row.type),
    authority: nullableCreditString(row.authority),
    reference: nullableCreditString(row.reference),
    status: nullableCreditString(row.status),
    amount: nullableCreditNumber(row.amount),
    checked_at: nullableCreditString(row.checked_at ?? row.checkedAt),
    source: nullableCreditString(row.source),
    provider: nullableCreditString(row.provider),
    protocol: nullableCreditString(row.protocol),
  }));
  const activeDebtInput = input.active_debt && typeof input.active_debt === "object" && !Array.isArray(input.active_debt) ? input.active_debt as Record<string, unknown> : {};
  const provenance = nullableCreditString(input.provenance);
  const confidence = nullableCreditString(input.confidence);
  return {
    status: normalizeFiscalStatus(input.status),
    registration_status: nullableCreditString(input.registration_status ?? input.registrationStatus),
    tax_regular: nullableCreditBoolean(input.tax_regular ?? input.taxRegular),
    tax_pending: nullableCreditBoolean(input.tax_pending ?? input.taxPending),
    declarations,
    certificates,
    active_debt: {
      has_active_debt: nullableCreditBoolean(activeDebtInput.has_active_debt ?? activeDebtInput.hasActiveDebt ?? input.has_active_debt ?? input.hasActiveDebt),
      active_debt_count: nullableCreditNumber(activeDebtInput.active_debt_count ?? activeDebtInput.activeDebtCount ?? input.active_debt_count ?? input.activeDebtCount),
      amount: nullableCreditNumber(activeDebtInput.amount),
      authority: nullableCreditString(activeDebtInput.authority),
      reference: nullableCreditString(activeDebtInput.reference),
      status: nullableCreditString(activeDebtInput.status),
      checked_at: nullableCreditString(activeDebtInput.checked_at ?? activeDebtInput.checkedAt),
    },
    pending_items: pendingItems,
    provider: nullableCreditString(input.provider),
    protocol: nullableCreditString(input.protocol),
    checked_at: nullableCreditString(input.checked_at ?? input.checkedAt),
    expires_at: nullableCreditString(input.expires_at ?? input.expiresAt),
    provenance: provenance === "provider" || provenance === "manual" || provenance === "declared" || provenance === "document" || provenance === "system" ? provenance : "system",
    confidence: confidence === "high" || confidence === "medium" || confidence === "low" || confidence === "unknown" ? confidence : "unknown",
  };
}

export type Owner360Status = {
  identity: "complete" | "pending";
  address: "verified" | "declared" | "pending";
  documents: { verified: number; total: number };
  income: "verified" | "declared" | "pending";
  credit: "current" | "expired" | "not_consulted" | "not_configured" | "partial" | "clear" | "has_restrictions";
  legal: "current" | "expired" | "pending" | "not_configured" | "partial" | "records_found" | "no_records_found";
  fiscal: "complete" | "pending" | "not_configured" | "regular" | "irregular" | "partial" | "expired";
  patrimonial: "informed" | "not_informed";
  consent: "valid" | "absent" | "expired";
};

export function buildOwner360Status(input: {
  profile: Record<string, unknown>;
  documentRecords?: Array<Record<string, unknown>>;
  checks?: Array<Record<string, unknown>>;
}): Owner360Status {
  const profile = input.profile;
  const identity = objectValue(profile.identity);
  const address = objectValue(profile.address);
  const financial = objectValue(profile.financial);
  const consent = objectValue(profile.treatment_consent ?? profile.treatmentConsent);
  const checks = input.checks ?? [];
  const latest = (type: string) => checks.find((check) => check.check_type === type || check.checkType === type);
  const checkStatus = (type: string, current: Owner360Status["credit"]): Owner360Status["credit"] => {
    const check = latest(type);
    if (!check) return current;
    const expiresAt = String(check.expires_at ?? check.expiresAt ?? "");
    if (expiresAt && Date.parse(expiresAt) <= Date.now()) return "expired";
    return "current";
  };
  const creditCheck = checks.find((check) => {
    const type = check.check_type ?? check.checkType;
    if (type === "credit") return true;
    if (type !== "intelligence") return false;
    const summary = objectValue(check.summary);
    return Array.isArray(summary.sections) && summary.sections.includes("CREDIT");
  });
  const creditStatus = (() => {
    if (!creditCheck) return "not_consulted" as const;
    const status = String(creditCheck.status ?? "").toUpperCase();
    if (status === "NOT_CONFIGURED") return "not_configured" as const;
    if (status === "EXPIRED") return "expired" as const;
    if (status === "PARTIAL") return "partial" as const;
    const values = objectValue(objectValue(creditCheck.summary).values);
    if (status === "CLEAR" || values.has_restrictions === false) return "clear" as const;
    if (status === "HAS_RESTRICTIONS" || values.has_restrictions === true) return "has_restrictions" as const;
    return "current" as const;
  })();
  const identityComplete = [identity.cpf, identity.full_name ?? identity.fullName, identity.birth_date ?? identity.birthDate].every(Boolean);
  const addressDeclared = Object.values(address).some(Boolean);
  const income = financial.income_verified || financial.verified_income ? "verified" : Object.values(financial).some(Boolean) ? "declared" : "pending";
  const legalCheck = checks.find((check) => {
    const type = check.check_type ?? check.checkType;
    if (type === "legal") return true;
    if (type !== "intelligence") return false;
    const sections = objectValue(check.summary).sections;
    return Array.isArray(sections) && sections.includes("LEGAL");
  });
  const legalStatus = (() => {
    if (!legalCheck) return "pending" as const;
    const status = String(legalCheck.status ?? "").toUpperCase();
    if (status === "NOT_CONFIGURED") return "not_configured" as const;
    if (status === "EXPIRED") return "expired" as const;
    if (status === "PARTIAL") return "partial" as const;
    if (status === "RECORDS_FOUND") return "records_found" as const;
    if (status === "NO_RECORDS_FOUND") return "no_records_found" as const;
    return "current" as const;
  })();
  return {
    identity: identityComplete ? "complete" : "pending",
    address: address.current_status === "verified" || address.status === "verified" ? "verified" : addressDeclared ? "declared" : "pending",
    documents: { verified: (input.documentRecords ?? []).filter((document) => document.verified === true).length, total: (input.documentRecords ?? []).length },
    income,
    credit: creditStatus,
    legal: legalStatus,
    fiscal: (() => {
      const fiscal = objectValue(profile.fiscal);
      const fiscalStatus = String(fiscal.status ?? "").toUpperCase();
      if (fiscalStatus === "NOT_CONFIGURED") return "not_configured" as const;
      if (fiscalStatus === "EXPIRED") return "expired" as const;
      if (fiscalStatus === "IRREGULAR" || fiscalStatus === "PENDING") return "irregular" as const;
      if (fiscalStatus === "PARTIAL") return "partial" as const;
      if (fiscalStatus === "REGULAR") return "regular" as const;
      return Object.values(fiscal).some(Boolean) ? "complete" as const : "pending" as const;
    })(),
    patrimonial: Object.values(objectValue(profile.financial)).some((entry) => Boolean(entry)) ? "informed" : "not_informed",
    consent: consent.authorized_at && consent.purpose ? "valid" : "absent",
  };
}

export type OwnerContractData = {
  name: string | null;
  cpf: string | null;
  rg: string | null;
  issuingAuthority: string | null;
  nationality: string | null;
  birthplace: string | null;
  profession: string | null;
  employment: {
    type: string | null;
    employer: string | null;
    role: string | null;
    startedAt: string | null;
  };
  income: Record<string, unknown>;
  patrimony: Record<string, unknown>;
  maritalStatus: string | null;
  propertyRegime: string | null;
  spouseName: string | null;
  address: Record<string, unknown>;
  conflicts: Array<Record<string, unknown>>;
  requiresReview: boolean;
};

export type OwnerInspectionData = { name: string | null; cpf: string | null; contact: Record<string, unknown>; property: Record<string, unknown>; relationship: string | null };
export type InsuranceApplicantData = { identity: Record<string, unknown>; address: Record<string, unknown>; professional: Record<string, unknown>; income: Record<string, unknown>; relationship: string | null; credit: OwnerCreditData; documents: Array<Record<string, unknown>>; conflicts: Array<Record<string, unknown>>; requiresReview: boolean };
export type FinancingApplicantData = InsuranceApplicantData & { civil: Record<string, unknown>; patrimony: Record<string, unknown> };

export function buildOwnerContractData(input: { owner: Record<string, unknown>; profile: Record<string, unknown>; conflicts?: Array<Record<string, unknown>> }): OwnerContractData {
  const identity = objectValue(input.profile.identity);
  const civil = normalizeOwnerCivil(objectValue(input.profile.identity));
  const address = objectValue(input.profile.address);
  const professional = objectValue(input.profile.professional);
  const financial = objectValue(input.profile.financial);
  return {
    name: stringValue(input.owner.name) ?? stringValue(identity.fullName ?? identity.full_name),
    cpf: stringValue(input.owner.document) ?? stringValue(identity.cpf),
    rg: stringValue(identity.rg),
    issuingAuthority: stringValue(identity.issuingAuthority ?? identity.issuing_authority),
    nationality: stringValue(identity.nationality),
    birthplace: stringValue(identity.birthplace),
    profession: stringValue(identity.occupation ?? identity.profession ?? professional.profession ?? professional.occupation),
    employment: {
      type: stringValue(professional.employment_type),
      employer: stringValue(professional.current_employer ?? professional.employer),
      role: stringValue(professional.role ?? professional.position),
      startedAt: stringValue(professional.started_at ?? professional.start_date),
    },
    income: {
      declaredMonthly: financial.income_declared_monthly ?? null,
      provenMonthly: financial.income_proven_monthly ?? financial.income_verified_monthly ?? null,
      familyMonthly: financial.family_income_monthly ?? null,
      commitmentMonthly: financial.declared_commitment_monthly ?? null,
      sources: Array.isArray(financial.income_sources) ? financial.income_sources : [],
    },
    patrimony: {
      assets: Array.isArray(financial.assets) ? financial.assets : [],
      declaredTotal: financial.declared_assets_total ?? null,
      verifiedTotal: financial.verified_assets_total ?? null,
    },
    maritalStatus: civil.maritalStatus.value,
    propertyRegime: civil.propertyRegime.value,
    spouseName: civil.spouseName.value,
    address,
    conflicts: input.conflicts ?? [],
    requiresReview: (input.conflicts ?? []).length > 0,
  };
}

export function buildInsuranceApplicantData(input: { owner: Record<string, unknown>; profile: Record<string, unknown>; relationship?: string | null; conflicts?: Array<Record<string, unknown>> }): InsuranceApplicantData {
  const contract = buildOwnerContractData(input);
  return {
    identity: objectValue(input.profile.identity),
    address: contract.address,
    professional: objectValue(input.profile.professional),
    income: contract.income,
    relationship: input.relationship ?? null,
    credit: normalizeOwnerCredit(objectValue(input.profile.credit)),
    documents: Array.isArray(input.profile.documents) ? input.profile.documents.filter((document): document is Record<string, unknown> => Boolean(document) && typeof document === "object" && !Array.isArray(document)) : [],
    conflicts: contract.conflicts,
    requiresReview: contract.requiresReview,
  };
}

export function buildFinancingApplicantData(input: { owner: Record<string, unknown>; profile: Record<string, unknown>; relationship?: string | null; conflicts?: Array<Record<string, unknown>> }): FinancingApplicantData {
  const applicant = buildInsuranceApplicantData(input);
  const identity = objectValue(input.profile.identity);
  return {
    ...applicant,
    civil: objectValue(input.profile.civil ?? identity),
    patrimony: objectValue(input.profile.financial).assets ? { assets: objectValue(input.profile.financial).assets, declaredTotal: objectValue(input.profile.financial).declared_assets_total ?? null, verifiedTotal: objectValue(input.profile.financial).verified_assets_total ?? null } : {},
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function value(value: unknown): ProvenancedValue<string> { return { ...emptyProvenancedValue<string>(), value: stringValue(value) }; }
function arrayValue(value: unknown): ProvenancedValue<string[]> { return { ...emptyProvenancedValue<string[]>(), value: Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : null }; }
function booleanValue(value: unknown): ProvenancedValue<boolean> { return { ...emptyProvenancedValue<boolean>(), value: typeof value === "boolean" ? value : null }; }
