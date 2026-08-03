import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import { listProperties, type Property } from "./real-estate";

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
  contract_type: "rental" | "sale" | "management" | "service" | "other";
  status:
    | "draft"
    | "generated"
    | "sent"
    | "waiting_signature"
    | "signed"
    | "active"
    | "cancelled"
    | "expired"
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
  property_id?: string;
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
  return isPreviewToken(getStoredToken());
}

export async function listContracts() {
  if (isPreviewContracts()) return { contracts: await readPreviewContractsWithProperties() };

  return apiRequest<{ contracts: Contract[] }>("/contracts?status=all", {
    token: getStoredToken() ?? undefined,
  });
}

export async function createContract(input: ContractInput) {
  if (isPreviewContracts()) {
    const contract = await createPreviewContract(input);
    const parties = readPreviewParties().filter((party) => party.contract_id === contract.id);
    return { contract, parties };
  }

  return apiRequest<{ contract: Contract; parties: ContractParty[] }>("/contracts", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
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
  const { properties } = await listProperties();

  return readPreviewContracts().map((contract) => ({
    ...contract,
    properties: buildPropertySummary(properties.find((property) => property.id === contract.property_id)),
  }));
}

async function createPreviewContract(input: ContractInput): Promise<Contract> {
  const now = new Date().toISOString();
  const { properties } = await listProperties();
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
      portal_token: party.portal_token,
      portal_enabled: party.portal_enabled,
    })),
  };

  writePreviewContracts([contractWithParties, ...readPreviewContracts()]);
  writePreviewParties([...parties, ...readPreviewParties()]);

  return contractWithParties;
}

function buildPropertySummary(property?: Property) {
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
