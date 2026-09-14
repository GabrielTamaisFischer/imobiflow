/** Canonical, bounded data contracts for Owner Intelligence Phase B.
 *
 * The persisted OwnerProfile JSON columns remain the source of truth. These
 * helpers keep the JSON typed and bounded without introducing a parallel
 * financial table or silently treating declared data as verified data.
 */

export const EMPLOYMENT_TYPES = [
  "CLT", "PJ", "autonomo", "empresario", "servidor", "aposentado",
  "pensionista", "estudante", "desempregado", "outro",
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const INCOME_SOURCE_TYPES = [
  "salario", "pro_labore", "distribuicao_lucros", "aluguel", "aposentadoria",
  "pensao", "comissao", "prestacao_servico", "aplicacoes", "outras",
] as const;
export type IncomeSourceType = (typeof INCOME_SOURCE_TYPES)[number];

export const INCOME_VERIFICATION_STATUSES = ["DECLARADA", "DOCUMENTADA", "VERIFICADA", "DESATUALIZADA"] as const;
export type IncomeVerificationStatus = (typeof INCOME_VERIFICATION_STATUSES)[number];
export const ASSET_TYPES = ["imovel", "veiculo", "participacao_societaria", "investimento", "outro"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const PROVENANCE_SOURCES = ["USER_INPUT", "OWNER_DECLARED", "DOCUMENT", "OFFICIAL_API", "FINANCIAL_PROVIDER", "SYSTEM_DERIVED"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export type OwnerEmploymentRecord = {
  employer: string | null;
  employer_cnpj: string | null;
  role: string | null;
  started_at: string | null;
  ended_at: string | null;
  income_monthly: number | null;
  document_id: string | null;
  provenance: ProvenanceSource;
};

export type OwnerEmploymentData = {
  profession: string | null;
  occupation: string | null;
  employment_status: "current" | "former" | "unemployed" | "retired" | "student" | null;
  employment_type: EmploymentType | null;
  current_employer: string | null;
  employer_cnpj: string | null;
  role: string | null;
  started_at: string | null;
  tenure_months: number | null;
  history: OwnerEmploymentRecord[];
  status: "complete" | "partial" | "pending";
  provenance: ProvenanceSource;
};

export type OwnerIncomeSource = {
  id: string;
  type: IncomeSourceType;
  amount: number;
  recurrence: "monthly" | "annual" | "variable" | "one_off";
  provenance: ProvenanceSource;
  verification_status: IncomeVerificationStatus;
  document_id: string | null;
  valid_until: string | null;
  notes: string | null;
};

export type OwnerAsset = {
  id: string;
  type: AssetType;
  label: string;
  property_id: string | null;
  declared_value: number | null;
  verified_value: number | null;
  verification_status: IncomeVerificationStatus;
  provenance: ProvenanceSource;
  document_id: string | null;
  notes: string | null;
};

export type OwnerFinancialCapacity = {
  status: "DATA_SUFFICIENT" | "DATA_INSUFFICIENT" | "MANUAL_REVIEW";
  total_income_monthly: number;
  verified_income_monthly: number;
  estimated_available_monthly: number | null;
  declared_commitment_monthly: number | null;
  estimated_commitment_ratio: number | null;
  indicative_rent_range: { min: number; max: number } | null;
  indicative_financing_range: { min: number; max: number } | null;
  calculated_at: string;
  provenance: "SYSTEM_DERIVED";
};

export type OwnerFinancialData = {
  income_declared_monthly: number | null;
  income_proven_monthly: number | null;
  family_income_monthly: number | null;
  variable_income_monthly: number | null;
  other_income_monthly: number | null;
  declared_commitment_monthly: number | null;
  income_sources: OwnerIncomeSource[];
  assets: OwnerAsset[];
  declared_assets_total: number | null;
  verified_assets_total: number | null;
  status: "DECLARED" | "COMPROVADA" | "DESATUALIZADA" | "PENDENTE";
  financial_capacity: OwnerFinancialCapacity | null;
  provenance: ProvenanceSource;
};

type JsonRecord = Record<string, unknown>;
const invalid = (message: string) => Object.assign(new Error(message), { statusCode: 400, code: "INVALID_OWNER_FINANCIAL_DATA" });
const boundedString = (value: unknown, label: string, max = 240): string | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw invalid(`${label} inválido.`);
  return value.trim();
};
const nonNegativeNumber = (value: unknown, label: string): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw invalid(`${label} deve ser um número não negativo.`);
  return Math.round(parsed * 100) / 100;
};
const oneOf = <T extends string>(value: unknown, values: readonly T[], label: string): T => {
  if (typeof value !== "string" || !values.includes(value as T)) throw invalid(`${label} inválido.`);
  return value as T;
};
const provenance = (value: unknown): ProvenanceSource => oneOf(value ?? "OWNER_DECLARED", PROVENANCE_SOURCES, "provenance");

export function normalizeOwnerEmployment(input: JsonRecord): OwnerEmploymentData {
  const historyInput = input.history ?? input.employment_history ?? [];
  if (!Array.isArray(historyInput) || historyInput.length > 20) throw invalid("Histórico profissional inválido.");
  const history = historyInput.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid("Registro de emprego inválido.");
    const row = entry as JsonRecord;
    return {
      employer: boundedString(row.employer ?? row.company, "empregador"),
      employer_cnpj: boundedString(row.employer_cnpj ?? row.company_cnpj, "CNPJ do empregador", 32),
      role: boundedString(row.role ?? row.position, "cargo"),
      started_at: boundedString(row.started_at ?? row.start_date, "data de início", 40),
      ended_at: boundedString(row.ended_at ?? row.end_date, "data de fim", 40),
      income_monthly: nonNegativeNumber(row.income_monthly, "renda do vínculo"),
      document_id: boundedString(row.document_id, "documento", 80),
      provenance: provenance(row.provenance),
    } satisfies OwnerEmploymentRecord;
  });
  const profession = boundedString(input.profession, "profissão");
  const occupation = boundedString(input.occupation, "ocupação");
  const employmentStatus = input.employment_status === undefined || input.employment_status === null ? null : oneOf(input.employment_status, ["current", "former", "unemployed", "retired", "student"] as const, "situação profissional");
  const employmentType = input.employment_type === undefined || input.employment_type === null ? null : oneOf(input.employment_type, EMPLOYMENT_TYPES, "tipo de vínculo");
  const tenure = nonNegativeNumber(input.tenure_months, "tempo de vínculo");
  return {
    ...input,
    profession,
    occupation,
    employment_status: employmentStatus,
    employment_type: employmentType,
    current_employer: boundedString(input.current_employer ?? input.employer, "empresa atual"),
    employer_cnpj: boundedString(input.employer_cnpj, "CNPJ da empresa", 32),
    role: boundedString(input.role ?? input.position, "cargo"),
    started_at: boundedString(input.started_at ?? input.start_date, "data de admissão", 40),
    tenure_months: tenure,
    history,
    status: profession || occupation || employmentType ? "complete" : history.length ? "partial" : "pending",
    provenance: provenance(input.provenance),
  };
}

export function normalizeOwnerFinancial(input: JsonRecord): OwnerFinancialData {
  const sourcesInput = input.income_sources ?? input.sources ?? [];
  const assetsInput = input.assets ?? input.patrimony ?? [];
  if (!Array.isArray(sourcesInput) || sourcesInput.length > 50) throw invalid("Fontes de renda inválidas.");
  if (!Array.isArray(assetsInput) || assetsInput.length > 100) throw invalid("Itens patrimoniais inválidos.");
  const incomeSources = sourcesInput.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid(`Fonte de renda ${index + 1} inválida.`);
    const row = entry as JsonRecord;
    return {
      id: boundedString(row.id, "identificador da fonte", 80) ?? `income-${index + 1}`,
      type: oneOf(row.type, INCOME_SOURCE_TYPES, "tipo da fonte"),
      amount: nonNegativeNumber(row.amount, "valor da fonte") ?? 0,
      recurrence: oneOf(row.recurrence ?? "monthly", ["monthly", "annual", "variable", "one_off"] as const, "recorrência"),
      provenance: provenance(row.provenance),
      verification_status: oneOf(row.verification_status ?? (row.verified === true ? "VERIFICADA" : "DECLARADA"), INCOME_VERIFICATION_STATUSES, "status de verificação"),
      document_id: boundedString(row.document_id, "documento da fonte", 80),
      valid_until: boundedString(row.valid_until, "validade da fonte", 40),
      notes: boundedString(row.notes, "observação da fonte"),
    } satisfies OwnerIncomeSource;
  });
  const assets = assetsInput.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw invalid(`Patrimônio ${index + 1} inválido.`);
    const row = entry as JsonRecord;
    return {
      id: boundedString(row.id, "identificador do patrimônio", 80) ?? `asset-${index + 1}`,
      type: oneOf(row.type, ASSET_TYPES, "tipo do patrimônio"),
      label: boundedString(row.label ?? row.name, "descrição do patrimônio") ?? "Bem não descrito",
      property_id: boundedString(row.property_id, "imóvel vinculado", 80),
      declared_value: nonNegativeNumber(row.declared_value ?? row.value, "valor declarado"),
      verified_value: nonNegativeNumber(row.verified_value, "valor verificado"),
      verification_status: oneOf(row.verification_status ?? "DECLARADA", INCOME_VERIFICATION_STATUSES, "status do patrimônio"),
      provenance: provenance(row.provenance),
      document_id: boundedString(row.document_id, "documento do patrimônio", 80),
      notes: boundedString(row.notes, "observação do patrimônio"),
    } satisfies OwnerAsset;
  });
  const declaredAssetsValue = nonNegativeNumber(input.declared_assets_total, "patrimônio declarado");
  const verifiedAssetsValue = nonNegativeNumber(input.verified_assets_total, "patrimônio verificado");
  const declaredAssets = declaredAssetsValue ?? (assets.reduce((sum, asset) => sum + (asset.declared_value ?? 0), 0) || null);
  const verifiedAssets = verifiedAssetsValue ?? (assets.reduce((sum, asset) => sum + (asset.verified_value ?? 0), 0) || null);
  const declared = nonNegativeNumber(input.income_declared_monthly, "renda declarada");
  const proven = nonNegativeNumber(input.income_proven_monthly ?? input.income_verified_monthly, "renda comprovada");
  const family = nonNegativeNumber(input.family_income_monthly, "renda familiar");
  const variable = nonNegativeNumber(input.variable_income_monthly, "renda variável");
  const other = nonNegativeNumber(input.other_income_monthly, "outras rendas");
  const commitment = nonNegativeNumber(input.declared_commitment_monthly, "comprometimento declarado");
  const status = proven !== null ? "COMPROVADA" : declared !== null || family !== null || incomeSources.length ? "DECLARED" : "PENDENTE";
  return {
    ...input,
    income_declared_monthly: declared,
    income_proven_monthly: proven,
    family_income_monthly: family,
    variable_income_monthly: variable,
    other_income_monthly: other,
    declared_commitment_monthly: commitment,
    income_sources: incomeSources,
    assets,
    declared_assets_total: declaredAssets,
    verified_assets_total: verifiedAssets,
    status: (input.status === "DESATUALIZADA" ? "DESATUALIZADA" : status),
    financial_capacity: input.financial_capacity && typeof input.financial_capacity === "object" ? input.financial_capacity as OwnerFinancialCapacity : null,
    provenance: provenance(input.provenance),
  };
}

export function calculateInformativeFinancialCapacity(financial: Pick<OwnerFinancialData, "income_declared_monthly" | "income_proven_monthly" | "family_income_monthly" | "variable_income_monthly" | "other_income_monthly"> & { declared_commitment_monthly?: number | null }): OwnerFinancialCapacity {
  const primaryIncome = financial.income_declared_monthly ?? financial.income_proven_monthly;
  const total = [primaryIncome, financial.family_income_monthly, financial.variable_income_monthly, financial.other_income_monthly].reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const verified = financial.income_proven_monthly ?? 0;
  const commitment = financial.declared_commitment_monthly ?? null;
  const available = total > 0 && commitment !== null ? Math.max(total - commitment, 0) : null;
  const ratio = total > 0 && commitment !== null ? Math.round((commitment / total) * 10000) / 10000 : null;
  const sufficient = total > 0;
  return {
    status: !sufficient ? "DATA_INSUFFICIENT" : verified > 0 ? "DATA_SUFFICIENT" : "MANUAL_REVIEW",
    total_income_monthly: Math.round(total * 100) / 100,
    verified_income_monthly: Math.round(verified * 100) / 100,
    estimated_available_monthly: available,
    declared_commitment_monthly: commitment,
    estimated_commitment_ratio: ratio,
    indicative_rent_range: sufficient ? { min: Math.round(total * 0.2 * 100) / 100, max: Math.round(total * 0.3 * 100) / 100 } : null,
    indicative_financing_range: sufficient ? { min: Math.round(total * 0.25 * 100) / 100, max: Math.round(total * 0.35 * 100) / 100 } : null,
    calculated_at: new Date().toISOString(),
    provenance: "SYSTEM_DERIVED",
  };
}

export function sanitizeEmploymentForPermissions(data: JsonRecord, canViewFinancial: boolean): JsonRecord {
  if (canViewFinancial) return data;
  const visible = { ...data };
  delete visible.employer_cnpj;
  delete visible.current_employer;
  delete visible.employment_history;
  delete visible.history;
  return visible;
}
