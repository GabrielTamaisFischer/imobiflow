import { randomUUID } from "node:crypto";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { writeAuthAudit } from "./mysql-auth.js";
import type { OwnerProfilePermissions } from "./owner-profile.js";

type JsonRecord = Record<string, unknown>;
type Candidate = { value: unknown; source: string; confidence?: string | null; provider?: string | null; checked_at?: string | null };

const SENSITIVE_PERMISSIONS: Record<string, string> = {
  financial: "owners.financial.view",
  credit: "owners.credit.view",
  legal: "owners.legal.view",
  fiscal: "owners.fiscal.view",
};

function hasPermission(permissions: OwnerProfilePermissions, permission: string) {
  return permissions instanceof Set ? permissions.has(permission) : permissions.includes(permission);
}
function objectValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}
function json(value: unknown) { return value as any; }
function iso(value: Date | string | null | undefined) { return value ? new Date(value).toISOString() : null; }
function normalizeStatus(value: string | null | undefined, expiresAt: Date | null | undefined) {
  if (value === "REJECTED") return "REJECTED";
  if (expiresAt && expiresAt.getTime() <= Date.now()) return "EXPIRED";
  return value || "PENDING";
}
function freshness(checkedAt: Date | string | null | undefined, expiresAt?: Date | string | null) {
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return "EXPIRED";
  if (!checkedAt) return "UNKNOWN";
  const age = Date.now() - new Date(checkedAt).getTime();
  return age > 1000 * 60 * 60 * 24 * 180 ? "STALE" : "CURRENT";
}
function completeness(value: unknown) {
  const record = objectValue(value);
  const entries = Object.entries(record).filter(([, item]) => item !== null && item !== undefined && item !== "");
  if (!entries.length) return 0;
  return Math.min(100, Math.round((entries.filter(([, item]) => {
    if (item && typeof item === "object" && !Array.isArray(item) && "value" in item) return (item as JsonRecord).value !== null && (item as JsonRecord).value !== "";
    return Boolean(item);
  }).length / entries.length) * 100));
}
function domainStatus(value: unknown, conflicts: number, checkedAt: Date | null, expiresAt: Date | null, restricted = false) {
  if (restricted) return { status: "RESTRICTED", completeness: null, freshness: "UNKNOWN", conflicts: 0, last_checked_at: null };
  const percent = completeness(value);
  return {
    status: conflicts ? "HAS_CONFLICTS" : percent === 0 ? "NOT_STARTED" : percent === 100 ? "COMPLETE" : "PARTIAL",
    completeness: percent,
    freshness: freshness(checkedAt, expiresAt),
    conflicts,
    last_checked_at: iso(checkedAt),
  };
}

export type Owner360Document = {
  id: string;
  owner_id: string;
  document_type: string;
  title: string | null;
  source: string | null;
  provider: string | null;
  issued_at: string | null;
  expires_at: string | null;
  uploaded_at: string;
  document_number: string | null;
  linked_domain: string | null;
  provenance: string | null;
  confidence: string | null;
  status: string;
  verified: boolean;
  verified_at: string | null;
  content_hash: string | null;
  stored_file_id: string;
};

export type Owner360Data = {
  owner_id: string;
  profile: JsonRecord;
  documents: Owner360Document[];
  status: JsonRecord;
  conflicts: { total_conflicts: number; critical_conflicts: number; unresolved_conflicts: number; items: JsonRecord[] };
};

function maskSensitiveProfile(profile: any, permissions: OwnerProfilePermissions) {
  const result: JsonRecord = {
    identity: profile.identityJson ?? {}, contact: profile.contactJson ?? {}, address: profile.addressJson ?? {}, professional: profile.professionalJson ?? {},
    provenance: hasPermission(permissions, "owners.sensitive.view") ? profile.provenanceJson ?? {} : {},
    confidence: hasPermission(permissions, "owners.sensitive.view") ? profile.confidenceJson ?? {} : {},
    treatment_consent: hasPermission(permissions, "owners.sensitive.view") ? profile.treatmentConsentJson ?? {} : {},
  };
  for (const [domain, permission] of Object.entries(SENSITIVE_PERMISSIONS)) result[domain] = hasPermission(permissions, permission) ? profile[`${domain}Json`] ?? {} : null;
  return result;
}

function documentDto(record: any, permissions: OwnerProfilePermissions): Owner360Document {
  const canSensitive = hasPermission(permissions, "owners.sensitive.view");
  return {
    id: record.id, owner_id: record.ownerId, document_type: record.documentType, title: record.title ?? null, source: record.source ?? null, provider: record.provider ?? null,
    issued_at: iso(record.issuedAt), expires_at: iso(record.expiresAt), uploaded_at: iso(record.createdAt) as string, document_number: canSensitive ? record.documentNumber ?? null : null,
    linked_domain: record.linkedDomain ?? null, provenance: record.provenance ?? null, confidence: record.confidence ?? null, status: normalizeStatus(record.status, record.expiresAt), verified: Boolean(record.verified), verified_at: iso(record.verifiedAt),
    content_hash: canSensitive ? record.contentHash ?? null : null, stored_file_id: record.storedFileId,
  };
}

export async function getOwner360Data(options: { companyId: string; ownerId: string; actorUserId: string; permissions: OwnerProfilePermissions }): Promise<Owner360Data> {
  const db = getPrisma() as any;
  const owner = await db.propertyOwner.findFirst({ where: { id: options.ownerId, companyId: options.companyId }, select: { id: true, profile: true } });
  if (!owner) throw Object.assign(new Error("Proprietário não encontrado."), { statusCode: 404, code: "OWNER_NOT_FOUND" });
  const [profile, documents, checks, conflicts] = await Promise.all([
    db.ownerProfile.findFirst({ where: { companyId: options.companyId, ownerId: options.ownerId } }),
    db.ownerDocumentRecord.findMany({ where: { companyId: options.companyId, ownerId: options.ownerId }, orderBy: { createdAt: "desc" } }),
    db.ownerCheck.findMany({ where: { companyId: options.companyId, ownerId: options.ownerId }, orderBy: { checkedAt: "desc" }, take: 50 }),
    db.ownerConflict.findMany({ where: { companyId: options.companyId, ownerId: options.ownerId }, orderBy: { detectedAt: "desc" } }),
  ]);
  const raw = profile ?? { identityJson: {}, contactJson: {}, addressJson: {}, professionalJson: {}, financialJson: {}, creditJson: {}, legalJson: {}, fiscalJson: {}, provenanceJson: {}, confidenceJson: {}, treatmentConsentJson: {} };
  const latestCheck = (section: string) => checks.find((check: any) => objectValue(check.summaryJson).sections && (objectValue(check.summaryJson).sections as unknown[]).includes(section));
  const identityCheck = latestCheck("IDENTITY");
  const creditCheck = latestCheck("CREDIT");
  const legalCheck = latestCheck("LEGAL");
  const fiscalCheck = latestCheck("FISCAL");
  const byDomain = (domain: string) => conflicts.filter((item: any) => item.domain === domain && item.status !== "RESOLVED").length;
  const status = {
    identity: domainStatus(raw.identityJson, byDomain("identity"), identityCheck?.checkedAt ?? null, identityCheck?.expiresAt ?? null),
    address: domainStatus(raw.addressJson, byDomain("address"), null, null),
    civil: domainStatus(objectValue(raw.identityJson).civil ?? {}, byDomain("civil"), null, null),
    professional: domainStatus(raw.professionalJson, byDomain("professional"), null, null),
    financial: domainStatus(raw.financialJson, byDomain("financial"), null, null, !hasPermission(options.permissions, "owners.financial.view")),
    credit: domainStatus(raw.creditJson, byDomain("credit"), creditCheck?.checkedAt ?? null, creditCheck?.expiresAt ?? null, !hasPermission(options.permissions, "owners.credit.view")),
    legal: domainStatus(raw.legalJson, byDomain("legal"), legalCheck?.checkedAt ?? null, legalCheck?.expiresAt ?? null, !hasPermission(options.permissions, "owners.legal.view")),
    fiscal: domainStatus(raw.fiscalJson, byDomain("fiscal"), fiscalCheck?.checkedAt ?? null, fiscalCheck?.expiresAt ?? null, !hasPermission(options.permissions, "owners.fiscal.view")),
    documents: domainStatus(documents, conflicts.filter((item: any) => item.domain === "documents" && item.status !== "RESOLVED").length, documents[0]?.updatedAt ?? null, documents[0]?.expiresAt ?? null, !hasPermission(options.permissions, "owners.documents.view")),
  };
  const visibleConflicts = hasPermission(options.permissions, "owners.sensitive.view") ? conflicts : conflicts.filter((item: any) => !["credit", "legal", "fiscal", "financial"].includes(item.domain));
  await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.360.viewed", "property_owner", options.ownerId, { domains: Object.keys(status), conflict_count: visibleConflicts.length });
  return {
    owner_id: options.ownerId,
    profile: maskSensitiveProfile(raw, options.permissions),
    documents: hasPermission(options.permissions, "owners.documents.view") ? documents.map((record: any) => documentDto(record, options.permissions)) : [],
    status,
    conflicts: { total_conflicts: visibleConflicts.length, critical_conflicts: visibleConflicts.filter((item: any) => item.status === "OPEN" && ["identity", "documents"].includes(item.domain)).length, unresolved_conflicts: visibleConflicts.filter((item: any) => item.status !== "RESOLVED").length, items: visibleConflicts.map((item: any) => ({ id: item.id, domain: item.domain, field: item.field, values: item.valuesJson, sources: item.sourcesJson, canonical_value: item.canonicalValueJson, canonical_source: item.canonicalSource, status: item.status, detected_at: iso(item.detectedAt), resolved_at: iso(item.resolvedAt) })) },
  };
}

const SOURCE_PRIORITY: Record<string, number> = { official: 100, verified: 95, document: 90, provider: 80, manual: 70, declared: 60, estimated: 10, system: 5 };
const CONFIDENCE_PRIORITY: Record<string, number> = { high: 3, medium: 2, low: 1, unknown: 0 };
function canonicalCandidate(candidates: Candidate[]) {
  return [...candidates].sort((a, b) => (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0) || (CONFIDENCE_PRIORITY[String(b.confidence ?? "unknown")] ?? 0) - (CONFIDENCE_PRIORITY[String(a.confidence ?? "unknown")] ?? 0))[0] ?? null;
}
export function selectCanonicalCandidate(candidates: Candidate[]) { return canonicalCandidate(candidates); }
function boundedCandidates(value: unknown): Candidate[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 20) throw Object.assign(new Error("São necessárias pelo menos duas fontes para detectar conflito."), { statusCode: 400, code: "INVALID_CONFLICT_SOURCES" });
  return value.map((candidate) => { const row = objectValue(candidate); if (row.value === undefined || typeof row.source !== "string" || !row.source.trim()) throw Object.assign(new Error("Fonte de conflito inválida."), { statusCode: 400, code: "INVALID_CONFLICT_SOURCE" }); return { value: row.value, source: row.source.trim().toLowerCase(), confidence: typeof row.confidence === "string" ? row.confidence.toLowerCase() : "unknown", provider: typeof row.provider === "string" ? row.provider : null, checked_at: typeof row.checked_at === "string" ? row.checked_at : null }; });
}

export async function detectOwnerConflict(options: { companyId: string; ownerId: string; actorUserId: string; domain: string; field: string; candidates: unknown }) {
  const db = getPrisma() as any;
  const owner = await db.propertyOwner.findFirst({ where: { id: options.ownerId, companyId: options.companyId }, select: { id: true } });
  if (!owner) throw Object.assign(new Error("Proprietário não encontrado."), { statusCode: 404, code: "OWNER_NOT_FOUND" });
  const candidates = boundedCandidates(options.candidates);
  const uniqueValues = new Set(candidates.map((candidate) => JSON.stringify(candidate.value)));
  if (uniqueValues.size < 2) return { conflict: false, canonical: canonicalCandidate(candidates) };
  const canonical = canonicalCandidate(candidates);
  const where = { companyId: options.companyId, ownerId: options.ownerId, domain: options.domain, field: options.field };
  const current = await db.ownerConflict.findFirst({ where: { ...where, status: { not: "RESOLVED" } } });
  const data = { valuesJson: json(candidates.map(({ value }) => value)), sourcesJson: json(candidates), canonicalValueJson: json(canonical?.value ?? null), canonicalSource: canonical?.source ?? null, status: "AUTO_RESOLVED", detectedAt: new Date(), resolutionNote: "Política determinística de proveniência/confiança." };
  const conflict = current ? await db.ownerConflict.update({ where: { id: current.id }, data }) : await db.ownerConflict.create({ data: { id: randomUUID(), ...where, ...data } });
  await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.conflict.detected", "property_owner", options.ownerId, { domain: options.domain, field: options.field, status: conflict.status, canonical_source: conflict.canonicalSource });
  return { conflict: true, item: { id: conflict.id, domain: conflict.domain, field: conflict.field, values: conflict.valuesJson, sources: conflict.sourcesJson, canonical_value: conflict.canonicalValueJson, canonical_source: conflict.canonicalSource, status: conflict.status } };
}

export async function resolveOwnerConflict(options: { companyId: string; ownerId: string; actorUserId: string; conflictId: string; selectedValue: unknown; source: string; reason?: string }) {
  const db = getPrisma() as any;
  const conflict = await db.ownerConflict.findFirst({ where: { id: options.conflictId, companyId: options.companyId, ownerId: options.ownerId } });
  if (!conflict) throw Object.assign(new Error("Conflito não encontrado."), { statusCode: 404, code: "OWNER_CONFLICT_NOT_FOUND" });
  const updated = await db.ownerConflict.update({ where: { id: conflict.id }, data: { canonicalValueJson: json(options.selectedValue), canonicalSource: options.source.slice(0, 80), status: "RESOLVED", resolvedAt: new Date(), resolvedBy: options.actorUserId, resolutionNote: options.reason?.slice(0, 1000) ?? null } });
  await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.conflict.resolved", "property_owner", options.ownerId, { conflictId: updated.id, domain: updated.domain, field: updated.field, source: updated.canonicalSource });
  return updated;
}
