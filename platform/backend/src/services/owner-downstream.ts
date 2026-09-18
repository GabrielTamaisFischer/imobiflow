import { buildOwnerContractData } from "./owner-intelligence.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { writeAuthAudit } from "./mysql-auth.js";
import type { OwnerProfilePermissions } from "./owner-profile.js";

type JsonRecord = Record<string, unknown>;
type PermissionSet = OwnerProfilePermissions;

export type DownstreamReadiness = {
  ready: boolean;
  missing_fields: string[];
  conflicting_fields: string[];
  expired_documents: string[];
  pending_documents: string[];
  requires_review: boolean;
};

export type ContractPartyData = {
  owner_id: string;
  owner_type: "individual" | "company";
  full_name: string | null;
  document: string | null;
  rg: string | null;
  nationality: string | null;
  birth_date: string | null;
  birthplace: string | null;
  marital_status: string | null;
  profession: string | null;
  current_address: JsonRecord;
  email: string | null;
  phone: string | null;
  spouse_name: string | null;
  source: "owner360";
  provenance: Record<string, "owner" | "owner_profile" | "missing" | "conflict">;
  readiness: DownstreamReadiness;
};

export type InspectionPartyData = Pick<ContractPartyData, "owner_id" | "full_name" | "document" | "email" | "phone" | "current_address" | "source" | "provenance" | "readiness"> & { role: string };
export type InsuranceApplicantData = {
  identity: Pick<ContractPartyData, "full_name" | "document" | "birth_date" | "nationality">;
  address: JsonRecord;
  professional: { profession: string | null };
  income_available: boolean;
  credit: null | { status: string; available: boolean };
  documents: { status: string; type: string }[];
  readiness: DownstreamReadiness;
};
export type FinancingApplicantData = InsuranceApplicantData & {
  civil: { marital_status: string | null; spouse_name: string | null };
  patrimony_available: boolean;
};
export type ProposalPartyData = ContractPartyData;

export type OwnerDownstreamData = {
  owner_id: string;
  contract: { party: ContractPartyData; readiness: DownstreamReadiness };
  inspection: { party: InspectionPartyData; readiness: DownstreamReadiness };
  insurance: { applicant: InsuranceApplicantData; readiness: DownstreamReadiness };
  financing: { applicant: FinancingApplicantData; readiness: DownstreamReadiness };
  proposal: { party: ProposalPartyData; readiness: DownstreamReadiness };
};

function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function has(permissions: PermissionSet, key: string) { return permissions instanceof Set ? permissions.has(key) : permissions.includes(key); }
function firstText(...values: unknown[]) { for (const value of values) { const found = text(value); if (found) return found; } return null; }
function documentState(document: any) {
  if (document.expiresAt && new Date(document.expiresAt).getTime() <= Date.now()) return "EXPIRED";
  return document.verified ? "VALID" : "PENDING";
}

export function buildDownstreamReadiness(input: {
  required: Record<string, unknown>;
  unresolvedConflicts: string[];
  documents: Array<{ type: string; status: string }>;
}): DownstreamReadiness {
  const missing_fields = Object.entries(input.required).filter(([, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) return Object.values(value as JsonRecord).every((entry) => !text(entry));
    return !text(value);
  }).map(([key]) => key);
  const expired_documents = input.documents.filter((document) => document.status === "EXPIRED").map((document) => document.type);
  const pending_documents = input.documents.filter((document) => document.status === "PENDING").map((document) => document.type);
  const conflicting_fields = [...new Set(input.unresolvedConflicts)];
  return {
    ready: missing_fields.length === 0 && conflicting_fields.length === 0 && expired_documents.length === 0,
    missing_fields,
    conflicting_fields,
    expired_documents,
    pending_documents,
    requires_review: conflicting_fields.length > 0 || expired_documents.length > 0,
  };
}

export async function getOwnerDownstreamData(options: {
  companyId: string;
  ownerId: string;
  actorUserId: string;
  permissions: PermissionSet;
  resourceFilter?: JsonRecord;
}): Promise<OwnerDownstreamData> {
  const db = getPrisma() as any;
  const owner = await db.propertyOwner.findFirst({ where: { id: options.ownerId, companyId: options.companyId, ...(options.resourceFilter ? { properties: { some: options.resourceFilter } } : {}) }, select: { id: true, ownerType: true, name: true, document: true, email: true, phone: true, addressJson: true } });
  if (!owner) throw Object.assign(new Error("Proprietário não encontrado."), { statusCode: 404, code: "OWNER_NOT_FOUND" });
  const profile = await db.ownerProfile.findFirst({ where: { companyId: options.companyId, ownerId: options.ownerId } });
  const [conflicts, documents] = await Promise.all([
    db.ownerConflict.findMany({ where: { companyId: options.companyId, ownerId: options.ownerId, status: { not: "RESOLVED" } }, select: { domain: true, field: true, status: true } }),
    db.ownerDocumentRecord.findMany({ where: { companyId: options.companyId, ownerId: options.ownerId }, select: { documentType: true, status: true, verified: true, expiresAt: true } }),
  ]);
  const rawProfile = profile ?? { identityJson: {}, contactJson: {}, addressJson: {}, professionalJson: {}, financialJson: {} };
  const identity = record(rawProfile.identityJson);
  const contact = record(rawProfile.contactJson);
  const address = Object.keys(record(rawProfile.addressJson)).length ? record(rawProfile.addressJson) : record(owner.addressJson);
  const professional = record(rawProfile.professionalJson);
  const financial = record(rawProfile.financialJson);
  const fieldConflicts = conflicts.map((item: any) => `${item.domain}.${item.field}`);
  const contractConflicts = conflicts
    .filter((item: any) => ["identity", "civil", "address", "professional"].includes(String(item.domain)))
    .map((item: any) => `${item.domain}.${item.field}`);
  const isConflict = (field: string) => contractConflicts.some((item: string) => item.endsWith(`.${field}`) || item === field);
  const contractBase = buildOwnerContractData({
    owner,
    profile: {
      identity,
      address,
      professional,
      financial,
    },
    conflicts: conflicts.map((item: any) => ({ domain: item.domain, field: item.field, status: item.status })),
  });
  const provenance: ContractPartyData["provenance"] = {};
  const choose = (key: string, value: unknown, source: "owner" | "owner_profile") => { provenance[key] = isConflict(key) ? "conflict" : value ? source : "missing"; return isConflict(key) ? null : text(value); };
  const full_name = choose("name", owner.name ?? identity.full_name ?? identity.fullName, "owner");
  const document = choose("document", owner.document ?? identity.cpf, "owner");
  const nationality = choose("nationality", identity.nationality, "owner_profile");
  const marital_status = choose("marital_status", contractBase.maritalStatus, "owner_profile");
  const profession = choose("profession", contractBase.profession, "owner_profile");
  const current_address = isConflict("address") ? {} : address;
  provenance.address = isConflict("address") ? "conflict" : Object.keys(current_address).length ? "owner_profile" : "missing";
  provenance.email = contact.email || owner.email ? "owner_profile" : "missing";
  provenance.phone = contact.phone || owner.phone ? "owner_profile" : "missing";
  const docs = documents.map((document: any) => ({ type: String(document.documentType), status: documentState(document) }));
  const readiness = buildDownstreamReadiness({ required: { name: full_name, document, nationality, marital_status, profession, address: current_address }, unresolvedConflicts: contractConflicts, documents: docs });
  const party: ContractPartyData = {
    owner_id: owner.id, owner_type: owner.ownerType === "company" ? "company" : "individual", full_name, document,
    rg: isConflict("rg") ? null : text(identity.rg), nationality, birth_date: text(identity.birth_date ?? identity.birthDate), birthplace: text(identity.birthplace), marital_status, profession,
    current_address, email: text(contact.email ?? owner.email), phone: text(contact.phone ?? owner.phone), spouse_name: isConflict("spouse_name") ? null : text(contractBase.spouseName), source: "owner360", provenance, readiness,
  };
  const canCredit = has(options.permissions, "owners.credit.view");
  const canFinancial = has(options.permissions, "owners.financial.view");
  const incomeAvailable = canFinancial && Object.values(financial).some((value) => value !== null && value !== undefined && value !== "");
  const documentsDto = docs.map((item) => ({ type: item.type, status: item.status }));
  const insuranceReadiness = buildDownstreamReadiness({ required: { identity: full_name, address: current_address, financial: incomeAvailable ? "available" : null }, unresolvedConflicts: fieldConflicts, documents: docs });
  const insurance: InsuranceApplicantData = { identity: { full_name, document, birth_date: party.birth_date, nationality }, address: current_address, professional: { profession }, income_available: incomeAvailable, credit: canCredit ? { status: "available", available: true } : null, documents: documentsDto, readiness: insuranceReadiness };
  const financingReadiness = buildDownstreamReadiness({ required: { identity: full_name, address: current_address, income: incomeAvailable ? "available" : null, credit: canCredit ? "available" : null }, unresolvedConflicts: fieldConflicts, documents: docs });
  const financing: FinancingApplicantData = { ...insurance, civil: { marital_status, spouse_name: party.spouse_name }, patrimony_available: canFinancial && Array.isArray(financial.assets) && financial.assets.length > 0, readiness: financingReadiness };
  const inspection: InspectionPartyData = { owner_id: owner.id, full_name, document, email: party.email, phone: party.phone, current_address, role: owner.ownerType === "company" ? "owner_company" : "owner", source: "owner360", provenance, readiness: buildDownstreamReadiness({ required: { name: full_name, contact: party.email ?? party.phone, address: current_address }, unresolvedConflicts: contractConflicts, documents: docs }) };
  await writeAuthAudit(db, options.companyId, options.actorUserId, "owner.automation.contract.prefill", "property_owner", owner.id, { source: "owner360", missing_count: readiness.missing_fields.length, conflict_count: readiness.conflicting_fields.length });
  return { owner_id: owner.id, contract: { party, readiness }, proposal: { party, readiness }, inspection: { party: inspection, readiness: inspection.readiness }, insurance: { applicant: insurance, readiness: insurance.readiness }, financing: { applicant: financing, readiness: financing.readiness } };
}
