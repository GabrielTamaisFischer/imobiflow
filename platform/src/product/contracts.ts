import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import { listAllProperties, type Property, type PropertySummary } from "./real-estate";

const previewContractsKey = "imobiflow.preview.contracts";
const previewContractPartiesKey = "imobiflow.preview.contract_parties";

export type Contract = {
  id: string;
  company_id: string;
  property_id: string | null;
  lead_id: string | null;
  template_id: string | null;
  contract_number: string | null;
  title: string;
  contract_type: "rental" | "sale";
  status:
    | "draft"
    | "generated"
    | "waiting_signature"
    | "awaiting_signature"
    | "partially_signed"
    | "signed"
    | "active"
    | "cancelled"
    | "terminated"
    | "archived";
  starts_at: string | null;
  ends_at: string | null;
  total_amount_cents: number | null;
  monthly_amount_cents: number | null;
  deposit_cents: number | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  current_version: number;
  properties?: {
    id: string;
    code: string | null;
    title: string;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  } | null;
  contract_parties?: Array<{
    id: string;
    party_type: ContractParty["party_type"];
    name: string;
    email: string | null;
    phone: string | null;
    portal_token: string | null;
    portal_enabled: boolean;
    signature_required: boolean;
  }>;
};

export type ContractParty = {
  id: string;
  company_id: string;
  contract_id: string;
  party_type: "owner" | "tenant" | "buyer" | "seller" | "broker" | "witness" | "company" | "other";
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  signature_required: boolean;
  signature_status: "pending" | "signed" | "not_required" | "cancelled";
  signed_at: string | null;
  portal_token: string | null;
  portal_enabled: boolean;
  portal_last_access_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractInput = {
  property_id: string;
  contract_number?: string;
  title: string;
  contract_type: Contract["contract_type"];
  status?: Contract["status"];
  starts_at?: string;
  ends_at?: string;
  total_amount_cents?: number;
  monthly_amount_cents?: number;
  deposit_cents?: number;
  notes?: string;
  parties?: Array<{
    party_type: ContractParty["party_type"];
    name: string;
    document?: string;
    email?: string;
    phone?: string;
    signature_required?: boolean;
  }>;
};

export function isPreviewContracts() {
  return false;
}

export async function listContracts() {
  const response = await apiRequest<{ contracts: Contract[] }>("/real-estate/contracts?status=all", {
    token: getStoredToken() ?? undefined,
  });
  return { contracts: response.contracts.map(normalizeContract) };
}

export async function createContract(input: ContractInput) {
  const response = await apiRequest<{ contract: Contract }>("/real-estate/contracts", {
    method: "POST",
    body: JSON.stringify({ ...input, id: crypto.randomUUID(), parties: input.parties ?? [] }),
    token: getStoredToken() ?? undefined,
  });
  return { contract: normalizeContract(response.contract) };
}

export async function getContract(id: string) {
  const response = await apiRequest<{ contract: Contract }>(`/real-estate/contracts/${id}`, { token: getStoredToken() ?? undefined });
  return { contract: normalizeContract(response.contract) };
}

export async function updateContract(id: string, input: Record<string, unknown>) {
  const response = await apiRequest<{ contract: Contract }>(`/real-estate/contracts/${id}`, {
    method: "PATCH", body: JSON.stringify(input), token: getStoredToken() ?? undefined,
  });
  return { contract: normalizeContract(response.contract) };
}

export async function listContractVersions(id: string) {
  return apiRequest<{ versions: any[] }>(`/real-estate/contracts/${id}/versions`, { token: getStoredToken() ?? undefined });
}

export async function listContractEvents(id: string) {
  return apiRequest<{ events: any[] }>(`/real-estate/contracts/${id}/events`, { token: getStoredToken() ?? undefined });
}

export async function generateContractVersion(id: string, idempotencyKey = crypto.randomUUID()) {
  return apiRequest<{ version: any; replayed?: boolean }>(`/real-estate/contracts/${id}/versions`, {
    method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: "{}", token: getStoredToken() ?? undefined,
  });
}

export async function listContractSignatures(id: string) {
  return apiRequest<{ signatures: any[] }>(`/real-estate/contracts/${id}/signatures`, { token: getStoredToken() ?? undefined });
}

export async function listContractAttachments(id: string) {
  return apiRequest<{ attachments: any[] }>(`/real-estate/contracts/${id}/attachments`, { token: getStoredToken() ?? undefined });
}

export async function createContractSignature(id: string, input: { version_id: string; party_id?: string; signer_name: string; signer_role: string; signature_base64: string }) {
  return apiRequest<{ signature_id: string; replayed?: boolean }>(`/real-estate/contracts/${id}/signatures`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ ...input, accepted_terms: true }), token: getStoredToken() ?? undefined });
}

export async function uploadContractAttachment(id: string, file: File) {
  const content_base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Não foi possível ler o anexo.")); reader.readAsDataURL(file); });
  return apiRequest<{ attachment: any }>(`/real-estate/contracts/${id}/attachments`, { method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ filename: file.name, mime_type: file.type, content_base64 }), token: getStoredToken() ?? undefined });
}

export type ContractClause = { id: string; company_id: string | null; contract_type: "rental" | "sale"; category: string; title: string; content: string; active: boolean; system: boolean; position?: number };
export async function listContractClauses(contractType?: Contract["contract_type"]) { return apiRequest<{ clauses: ContractClause[] }>(`/real-estate/contract-clauses${contractType ? `?contract_type=${contractType}` : ""}`, { token: getStoredToken() ?? undefined }); }
export async function addContractClause(contractId: string, clause: Pick<ContractClause, "title" | "content"> & { source_clause_id?: string | null; position?: number }) { return apiRequest<{ clause: ContractClause }>(`/real-estate/contract-clauses/contracts/${contractId}`, { method: "POST", body: JSON.stringify(clause), token: getStoredToken() ?? undefined }); }
export async function updateContractClause(contractId: string, clauseId: string, input: Partial<Pick<ContractClause, "title" | "content" | "position">>) { return apiRequest<{ clause: ContractClause }>(`/real-estate/contract-clauses/contracts/${contractId}/${clauseId}`, { method: "PATCH", body: JSON.stringify(input), token: getStoredToken() ?? undefined }); }
export async function deleteContractClause(contractId: string, clauseId: string) { return apiRequest<{ ok: boolean }>(`/real-estate/contract-clauses/contracts/${contractId}/${clauseId}`, { method: "DELETE", token: getStoredToken() ?? undefined }); }
export async function listContractClauseInstances(contractId: string) { return apiRequest<{ clauses: ContractClause[] }>(`/real-estate/contract-clauses/contracts/${contractId}`, { token: getStoredToken() ?? undefined }); }

function normalizeContract(raw: any): Contract {
  const parties = raw.parties ?? raw.contract_parties ?? [];
  return {
    ...raw,
    current_version: raw.current_version ?? raw.currentVersion ?? 0,
    signed_version: raw.signed_version ?? raw.signedVersion ?? null,
    properties: raw.property ?? raw.properties ?? null,
    contract_parties: parties.map((party: any) => ({
      ...party,
      company_id: party.company_id ?? party.companyId,
      contract_id: party.contract_id ?? party.contractId,
      party_type: party.party_type ?? party.partyType,
      signature_status: party.signature_status ?? party.signatureStatus,
      signature_required: party.signature_required ?? party.signatureRequired ?? true,
      signed_at: party.signed_at ?? party.signedAt,
      created_at: party.created_at ?? party.createdAt,
      updated_at: party.updated_at ?? party.updatedAt,
    })),
  };
}

function readPreviewContracts() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewContractsKey) ?? "[]") as Contract[];
  } catch {
    return [];
  }
}

function writePreviewContracts(contracts: Contract[]) {
  window.localStorage.setItem(previewContractsKey, JSON.stringify(contracts));
}

function readPreviewParties() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewContractPartiesKey) ?? "[]") as ContractParty[];
  } catch {
    return [];
  }
}

function writePreviewParties(parties: ContractParty[]) {
  window.localStorage.setItem(previewContractPartiesKey, JSON.stringify(parties));
}

async function readPreviewContractsWithProperties() {
  const { properties } = await listAllProperties();

  return readPreviewContracts().map((contract) => ({
    ...contract,
    properties: buildPropertySummary(properties.find((property) => property.id === contract.property_id)),
  }));
}

async function createPreviewContract(input: ContractInput): Promise<Contract> {
  const now = new Date().toISOString();
  const { properties } = await listAllProperties();
  const property = properties.find((item) => item.id === input.property_id);
  const contract: Contract = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    property_id: input.property_id || null,
    lead_id: null,
    template_id: null,
    contract_number: input.contract_number || null,
    title: input.title,
    contract_type: input.contract_type,
    status: input.status ?? "draft",
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    total_amount_cents: input.total_amount_cents ?? null,
    monthly_amount_cents: input.monthly_amount_cents ?? null,
    deposit_cents: input.deposit_cents ?? null,
    notes: input.notes || null,
    metadata: {},
    created_at: now,
    updated_at: now,
    current_version: 0,
    properties: buildPropertySummary(property),
    contract_parties: [],
  };

  const parties = (input.parties ?? [])
    .filter((party) => party.name.trim().length > 0)
    .map((party): ContractParty => ({
      id: window.crypto.randomUUID(),
      company_id: "preview-company",
      contract_id: contract.id,
      party_type: party.party_type,
      name: party.name,
      document: party.document || null,
      email: party.email || null,
      phone: party.phone || null,
      signature_required: party.signature_required ?? true,
      signature_status: party.signature_required === false ? "not_required" : "pending",
      signed_at: null,
      portal_token: window.crypto.randomUUID(),
      portal_enabled: true,
      portal_last_access_at: null,
      created_at: now,
      updated_at: now,
    }));

  const contractWithParties = {
    ...contract,
    contract_parties: parties.map((party) => ({
      id: party.id,
      party_type: party.party_type,
      name: party.name,
      email: party.email,
      phone: party.phone,
      signature_required: party.signature_required,
      portal_token: party.portal_token,
      portal_enabled: party.portal_enabled,
    })),
  };

  writePreviewContracts([contractWithParties, ...readPreviewContracts()]);
  writePreviewParties([...parties, ...readPreviewParties()]);

  return contractWithParties;
}

function buildPropertySummary(property?: Property | PropertySummary) {
  if (!property) return null;

  return {
    id: property.id,
    code: property.code,
    title: property.title,
    neighborhood: property.neighborhood,
    city: property.city,
    state: property.state,
  };
}
