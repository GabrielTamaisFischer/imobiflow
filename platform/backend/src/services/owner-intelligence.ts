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
  "INCOME",
  "CREDIT",
  "LEGAL",
  "FISCAL",
  "PROPERTY_REGISTRY",
  "DOCUMENT_VALIDATION",
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

export type OwnerIntelligenceProviderResult = {
  status: OwnerIntelligenceStatus;
  provider: string;
  consultedAt: string;
  sections: OwnerIntelligenceCapability[];
  values: Record<string, unknown>;
  warnings: string[];
};

export type OwnerIntelligenceProvider = {
  name: string;
  capabilities: readonly OwnerIntelligenceCapability[];
  query(input: { document: string | null; capabilities: OwnerIntelligenceCapability[] }): Promise<OwnerIntelligenceProviderResult>;
};

export class OwnerEnrichmentProviderRegistry {
  private readonly providers = new Map<string, OwnerIntelligenceProvider>();

  register(provider: OwnerIntelligenceProvider) {
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
    }));
  }

  resolve(capability: OwnerIntelligenceCapability) {
    return [...this.providers.values()].find((provider) => provider.capabilities.includes(capability)) ?? null;
  }
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

export const ownerIntelligenceRegistry = new OwnerEnrichmentProviderRegistry().register(notConfiguredOwnerProvider);

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

export type Owner360Status = {
  identity: "complete" | "pending";
  address: "verified" | "declared" | "pending";
  documents: { verified: number; total: number };
  income: "verified" | "declared" | "pending";
  credit: "current" | "expired" | "not_consulted" | "not_configured" | "partial" | "clear" | "has_restrictions";
  legal: "current" | "expired" | "pending";
  fiscal: "complete" | "pending";
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
  return {
    identity: identityComplete ? "complete" : "pending",
    address: address.current_status === "verified" || address.status === "verified" ? "verified" : addressDeclared ? "declared" : "pending",
    documents: { verified: (input.documentRecords ?? []).filter((document) => document.verified === true).length, total: (input.documentRecords ?? []).length },
    income,
    credit: creditStatus,
    legal: latest("legal") ? (checkStatus("legal", "current") === "expired" ? "expired" : "current") : "pending",
    fiscal: Object.values(objectValue(profile.fiscal)).some(Boolean) ? "complete" : "pending",
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
};

export type OwnerInspectionData = { name: string | null; cpf: string | null; contact: Record<string, unknown>; property: Record<string, unknown>; relationship: string | null };
export type InsuranceApplicantData = { identity: Record<string, unknown>; address: Record<string, unknown>; professional: Record<string, unknown>; income: Record<string, unknown>; relationship: string | null; credit: OwnerCreditData; documents: Array<Record<string, unknown>> };
export type FinancingApplicantData = InsuranceApplicantData & { civil: Record<string, unknown>; patrimony: Record<string, unknown> };

export function buildOwnerContractData(input: { owner: Record<string, unknown>; profile: Record<string, unknown> }): OwnerContractData {
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
  };
}

export function buildInsuranceApplicantData(input: { owner: Record<string, unknown>; profile: Record<string, unknown>; relationship?: string | null }): InsuranceApplicantData {
  const contract = buildOwnerContractData(input);
  return {
    identity: objectValue(input.profile.identity),
    address: contract.address,
    professional: objectValue(input.profile.professional),
    income: contract.income,
    relationship: input.relationship ?? null,
    credit: normalizeOwnerCredit(objectValue(input.profile.credit)),
    documents: Array.isArray(input.profile.documents) ? input.profile.documents.filter((document): document is Record<string, unknown> => Boolean(document) && typeof document === "object" && !Array.isArray(document)) : [],
  };
}

export function buildFinancingApplicantData(input: { owner: Record<string, unknown>; profile: Record<string, unknown>; relationship?: string | null }): FinancingApplicantData {
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
