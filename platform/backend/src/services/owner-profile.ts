import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { writeAuthAudit } from "./mysql-auth.js";
import { notConfiguredOwnerProvider, ownerIntelligenceRegistry, type OwnerIntelligenceCapability } from "./owner-intelligence.js";
import {
  calculateInformativeFinancialCapacity,
  normalizeOwnerEmployment,
  normalizeOwnerFinancial,
  sanitizeEmploymentForPermissions,
} from "./owner-financial.js";
import {
  isSyntheticQaOwner,
  startedAtCheckpoint,
  type OwnerProfileRuntimeDiagnostic,
} from "./runtime-diagnostics.js";

export const OWNER_PROFILE_GROUPS = [
  "identity",
  "contact",
  "address",
  "professional",
  "financial",
  "credit",
  "legal",
  "fiscal",
] as const;
export type OwnerProfileGroup = (typeof OWNER_PROFILE_GROUPS)[number];
export type OwnerProfilePermissions = Set<string> | readonly string[];

type JsonRecord = Record<string, unknown>;

export function ownerProfileDefaults() {
  return {
    identity: {},
    contact: {},
    address: {},
    professional: {},
    financial: {},
    credit: {},
    legal: {},
    fiscal: {},
    provenance: {},
    confidence: {},
    treatment_consent: {},
  } satisfies Record<string, JsonRecord>;
}

export function mergeProfileGroup(current: unknown, patch: unknown): JsonRecord {
  const currentRecord = current && typeof current === "object" && !Array.isArray(current) ? current as JsonRecord : {};
  const patchRecord = patch && typeof patch === "object" && !Array.isArray(patch) ? patch as JsonRecord : {};
  return { ...currentRecord, ...patchRecord };
}

export function maskOwnerDocument(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `***.***.${digits.slice(6, 9)}-${digits.slice(-2)}`;
  if (digits.length === 14) return `**.***.***/****-${digits.slice(-2)}`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function sanitizeOwnerForPermissions(owner: Record<string, unknown>, permissions: OwnerProfilePermissions) {
  if (hasPermission(permissions, "owners.sensitive.view")) return owner;
  return { ...owner, document: maskOwnerDocument(typeof owner.document === "string" ? owner.document : null) };
}

function hasPermission(permissions: OwnerProfilePermissions, permission: string) {
  return permissions instanceof Set ? permissions.has(permission) : permissions.includes(permission);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function ensureBoundedJson(value: unknown, label: string): JsonRecord {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw Object.assign(new Error(`${label} deve ser um objeto.`), { statusCode: 400, code: "INVALID_OWNER_PROFILE_GROUP" });
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 40_000) {
    throw Object.assign(new Error(`${label} excede o limite permitido.`), { statusCode: 413, code: "OWNER_PROFILE_GROUP_TOO_LARGE" });
  }
  return value as JsonRecord;
}

function ownerNotFound() {
  return Object.assign(new Error("Proprietário não encontrado."), { statusCode: 404, code: "OWNER_NOT_FOUND" });
}

async function ensureOwner(companyId: string, ownerId: string) {
  const owner = await getPrisma().propertyOwner.findFirst({ where: { id: ownerId, companyId } });
  if (!owner) throw ownerNotFound();
  return owner;
}

async function auditProfileViews(companyId: string, actorUserId: string, ownerId: string, permissions: OwnerProfilePermissions) {
  const granted = (permission: string) => hasPermission(permissions, permission);
  const sensitiveActions: Array<[string, string]> = [
    ["owners.financial.view", "owner.financial.viewed"],
    ["owners.credit.view", "owner.credit.viewed"],
    ["owners.legal.view", "owner.legal.viewed"],
    ["owners.fiscal.view", "owner.fiscal.viewed"],
    ["owners.documents.view", "owner.documents.viewed"],
  ];
  const visibleSensitive = sensitiveActions.filter(([permission]) => granted(permission)).map(([, action]) => action);
  await writeAuthAudit(getPrisma(), companyId, actorUserId, "owner.profile.viewed", "property_owner", ownerId, {
    sensitive_sections: visibleSensitive,
  });
  if (visibleSensitive.length && granted("owners.sensitive.view")) {
    await writeAuthAudit(getPrisma(), companyId, actorUserId, "owner.sensitive_data.viewed", "property_owner", ownerId, {
      actions: visibleSensitive,
    });
  }
  await Promise.all(visibleSensitive.map((action) => writeAuthAudit(getPrisma(), companyId, actorUserId, action, "property_owner", ownerId, {})));
}

function serializeProfile(profile: any, permissions: OwnerProfilePermissions) {
  const canSensitive = hasPermission(permissions, "owners.sensitive.view");
  const canViewFinancial = hasPermission(permissions, "owners.financial.view");
  const result: Record<string, unknown> = {
    id: profile.id,
    company_id: profile.companyId,
    owner_id: profile.ownerId,
    identity: profile.identityJson ?? {},
    contact: profile.contactJson ?? {},
    address: profile.addressJson ?? {},
    professional: sanitizeEmploymentForPermissions(profile.professionalJson ?? {}, canViewFinancial || canSensitive),
    provenance: canSensitive ? profile.provenanceJson ?? {} : {},
    confidence: canSensitive ? profile.confidenceJson ?? {} : {},
    treatment_consent: canSensitive ? profile.treatmentConsentJson ?? {} : {},
    updated_at: profile.updatedAt.toISOString(),
  };
  result.financial = canViewFinancial ? profile.financialJson ?? {} : null;
  result.credit = hasPermission(permissions, "owners.credit.view") ? profile.creditJson ?? {} : null;
  result.legal = hasPermission(permissions, "owners.legal.view") ? profile.legalJson ?? {} : null;
  result.fiscal = hasPermission(permissions, "owners.fiscal.view") ? profile.fiscalJson ?? {} : null;
  return result;
}

export async function getOwnerProfile(options: {
  companyId: string;
  ownerId: string;
  actorUserId: string;
  permissions: OwnerProfilePermissions;
}) {
  await ensureOwner(options.companyId, options.ownerId);
  const defaults = ownerProfileDefaults();
  const profile = await getPrisma().ownerProfile.upsert({
    where: { ownerId: options.ownerId },
    create: {
      companyId: options.companyId,
      ownerId: options.ownerId,
      identityJson: defaults.identity,
      contactJson: defaults.contact,
      addressJson: defaults.address,
      professionalJson: defaults.professional,
      financialJson: defaults.financial,
      creditJson: defaults.credit,
      legalJson: defaults.legal,
      fiscalJson: defaults.fiscal,
      provenanceJson: defaults.provenance,
      confidenceJson: defaults.confidence,
      treatmentConsentJson: defaults.treatment_consent,
    },
    update: {},
  });
  await auditProfileViews(options.companyId, options.actorUserId, options.ownerId, options.permissions);
  return serializeProfile(profile, options.permissions);
}

export async function updateOwnerProfile(options: {
  companyId: string;
  ownerId: string;
  actorUserId: string;
  patch: Record<string, unknown>;
  permissions: OwnerProfilePermissions;
  diagnostic?: OwnerProfileRuntimeDiagnostic;
}) {
  const owner = await ensureOwner(options.companyId, options.ownerId);
  const diagnostic = options.diagnostic;
  if (diagnostic && (!diagnostic.enabled || !isSyntheticQaOwner(owner as Record<string, unknown>))) diagnostic.enabled = false;
  const current = await getPrisma().ownerProfile.findFirst({ where: { ownerId: options.ownerId, companyId: options.companyId } });
  const defaults = ownerProfileDefaults();
  const input = options.patch;
  const group = (key: string) => ensureBoundedJson(input[key], key);
  const currentProfessional = current?.professionalJson && typeof current.professionalJson === "object" && !Array.isArray(current.professionalJson) ? current.professionalJson as JsonRecord : defaults.professional;
  const professionalInput = input.professional === undefined ? null : group("professional");
  if (diagnostic?.enabled && professionalInput) diagnostic.received_started_at = startedAtCheckpoint(professionalInput.started_at);
  const professionalPatch = professionalInput ? normalizeOwnerEmployment(mergeProfileGroup(currentProfessional, professionalInput)) : null;
  if (diagnostic?.enabled && professionalPatch) diagnostic.normalized_started_at = startedAtCheckpoint(professionalPatch.started_at);
  const currentFinancial = current?.financialJson && typeof current.financialJson === "object" && !Array.isArray(current.financialJson) ? current.financialJson as JsonRecord : defaults.financial;
  const financialInput = input.financial === undefined ? null : group("financial");
  const financialPatch = financialInput ? normalizeOwnerFinancial(mergeProfileGroup(currentFinancial, financialInput)) : null;
  const mergedFinancial = financialPatch
    ? financialPatch
    : null;
  if (mergedFinancial) {
    const propertyIds = mergedFinancial.assets.map((asset) => asset.property_id).filter((id): id is string => Boolean(id));
    if (propertyIds.length) {
      const linkedProperties = await getPrisma().property.findMany({
        where: { companyId: options.companyId, id: { in: propertyIds } },
        select: { id: true },
      });
      if (linkedProperties.length !== new Set(propertyIds).size) {
        throw Object.assign(new Error("Imóvel patrimonial não pertence à empresa atual."), { statusCode: 400, code: "OWNER_ASSET_PROPERTY_TENANT_MISMATCH" });
      }
    }
    const documentIds = [
      ...mergedFinancial.income_sources.map((source) => source.document_id),
      ...mergedFinancial.assets.map((asset) => asset.document_id),
    ].filter((id): id is string => Boolean(id));
    if (documentIds.length) {
      const linkedDocuments = await getPrisma().ownerDocumentRecord.findMany({
        where: {
          companyId: options.companyId,
          ownerId: options.ownerId,
          OR: [{ id: { in: documentIds } }, { storedFileId: { in: documentIds } }],
        },
        select: { id: true, storedFileId: true },
      });
      const validDocumentIds = new Set(linkedDocuments.flatMap((document) => [document.id, document.storedFileId]));
      if (documentIds.some((id) => !validDocumentIds.has(id))) {
        throw Object.assign(new Error("Documento de renda/patrimônio não pertence ao proprietário atual."), { statusCode: 400, code: "OWNER_FINANCIAL_DOCUMENT_MISMATCH" });
      }
    }
  }
  const financialCapacity = mergedFinancial
    ? calculateInformativeFinancialCapacity(mergedFinancial)
    : null;
  const financialData = mergedFinancial
    ? { ...mergedFinancial, financial_capacity: financialCapacity }
    : mergeProfileGroup(currentFinancial, group("financial"));
  const data = {
    identityJson: mergeProfileGroup(current?.identityJson ?? defaults.identity, group("identity")),
    contactJson: mergeProfileGroup(current?.contactJson ?? defaults.contact, group("contact")),
    addressJson: mergeProfileGroup(current?.addressJson ?? defaults.address, group("address")),
    professionalJson: professionalPatch ? { ...currentProfessional, ...professionalPatch } : currentProfessional,
    financialJson: financialData,
    creditJson: mergeProfileGroup(current?.creditJson ?? defaults.credit, group("credit")),
    legalJson: mergeProfileGroup(current?.legalJson ?? defaults.legal, group("legal")),
    fiscalJson: mergeProfileGroup(current?.fiscalJson ?? defaults.fiscal, group("fiscal")),
    provenanceJson: mergeProfileGroup(current?.provenanceJson ?? defaults.provenance, input.provenance),
    confidenceJson: mergeProfileGroup(current?.confidenceJson ?? defaults.confidence, input.confidence),
    treatmentConsentJson: mergeProfileGroup(current?.treatmentConsentJson ?? defaults.treatment_consent, input.treatment_consent),
  };
  const profile = current
    ? await getPrisma().ownerProfile.update({ where: { id: current.id }, data })
    : await getPrisma().ownerProfile.create({ data: { companyId: options.companyId, ownerId: options.ownerId, ...data } });
  if (diagnostic?.enabled) {
    diagnostic.prisma_returned_started_at = startedAtCheckpoint(
      profile && typeof profile.professionalJson === "object" && profile.professionalJson !== null
        ? (profile.professionalJson as Record<string, unknown>).started_at
        : null,
    );
    const reread = await getPrisma().ownerProfile.findFirst({ where: { ownerId: options.ownerId, companyId: options.companyId } });
    diagnostic.reread_started_at = startedAtCheckpoint(
      reread && typeof reread.professionalJson === "object" && reread.professionalJson !== null
        ? (reread.professionalJson as Record<string, unknown>).started_at
        : null,
    );
  }
  await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.profile.updated", "property_owner", options.ownerId, {
    sections: Object.keys(input).filter((key) => OWNER_PROFILE_GROUPS.includes(key as OwnerProfileGroup)),
  });
  if (professionalPatch) {
    await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.employment.updated", "property_owner", options.ownerId, {
      sections: ["profession", "employment", "history"],
    });
  }
  if (financialPatch) {
    const financialKeys = Object.keys(financialInput ?? {});
    if (financialKeys.some((key) => key.includes("income") || key === "sources" || key === "income_sources")) {
      await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.income.updated", "property_owner", options.ownerId, {
        source_count: mergedFinancial?.income_sources.length ?? 0,
      });
    }
    if (financialKeys.some((key) => key === "assets" || key === "patrimony" || key.includes("assets_total"))) {
      await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.asset.updated", "property_owner", options.ownerId, {
        asset_count: mergedFinancial?.assets.length ?? 0,
      });
    }
    if (financialCapacity) {
      await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.financial_analysis.generated", "property_owner", options.ownerId, {
        status: financialCapacity.status,
      });
    }
  }
  const serialized = serializeProfile(profile, options.permissions);
  if (diagnostic?.enabled) diagnostic.serialized_started_at = startedAtCheckpoint((serialized.professional as Record<string, unknown>).started_at);
  return serialized;
}

export type OwnerEnrichmentProvider = {
  name: string;
  run: (input: { ownerId: string; document: string | null; sections: string[] }) => Promise<{ status: string; summary: JsonRecord; warnings: string[] }>;
};

export const ownerEnrichmentProvider: OwnerEnrichmentProvider = {
  name: notConfiguredOwnerProvider.name,
  async run({ sections }) {
    const result = await notConfiguredOwnerProvider.query({
      document: null,
      capabilities: sections.map((section) => section.toUpperCase()).filter((section): section is typeof notConfiguredOwnerProvider.capabilities[number] => notConfiguredOwnerProvider.capabilities.includes(section as typeof notConfiguredOwnerProvider.capabilities[number])),
    });
    return { status: "NOT_CONFIGURED", summary: result.values, warnings: result.warnings };
  },
};

// Keep the registry available to future providers without coupling consumers
// to an external provider's payload shape. The default staging registry only
// contains NOT_CONFIGURED, so no external request is made accidentally.
export { ownerIntelligenceRegistry };

export async function runOwnerEnrichment(options: {
  companyId: string;
  ownerId: string;
  actorUserId: string;
  idempotencyKey: string;
  sections: string[];
}) {
  const owner = await ensureOwner(options.companyId, options.ownerId);
  const profile = await getPrisma().ownerProfile.findFirst({ where: { companyId: options.companyId, ownerId: options.ownerId } });
  const consent = profile?.treatmentConsentJson as JsonRecord | null | undefined;
  if (!consent || !consent.authorized_at || !consent.purpose) {
    throw Object.assign(new Error("Consentimento LGPD de tratamento é obrigatório antes do enriquecimento."), { statusCode: 422, code: "OWNER_TREATMENT_CONSENT_REQUIRED" });
  }
  const key = options.idempotencyKey.trim().slice(0, 160);
  if (!key) throw Object.assign(new Error("Idempotency-Key é obrigatório."), { statusCode: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
  const fingerprint = createHash("sha256").update(`${owner.document ?? ""}:${options.sections.sort().join(",")}`).digest("hex");
  const existing = await getPrisma().ownerCheck.findFirst({ where: { companyId: options.companyId, ownerId: options.ownerId, checkType: "enrichment", provider: ownerEnrichmentProvider.name, idempotencyKey: key } });
  if (existing) return serializeCheck(existing);
  await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.enrichment.requested", "property_owner", options.ownerId, { provider: ownerEnrichmentProvider.name, sections: options.sections });
  const result = await ownerEnrichmentProvider.run({ ownerId: owner.id, document: owner.document, sections: options.sections });
  const check = await getPrisma().ownerCheck.create({
    data: {
      companyId: options.companyId,
      ownerId: options.ownerId,
      checkType: "enrichment",
      provider: ownerEnrichmentProvider.name,
      status: result.status,
      inputFingerprint: fingerprint,
      idempotencyKey: key,
      source: "manual",
      summaryJson: jsonValue(result.summary),
      warningsJson: jsonValue(result.warnings),
      requestedBy: options.actorUserId,
      checkedAt: new Date(),
    },
  });
  await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.enrichment.completed", "property_owner", options.ownerId, { status: result.status, provider: ownerEnrichmentProvider.name });
  return serializeCheck(check);
}

/**
 * Executes a capability-scoped intelligence query. The result is persisted in
 * the existing OwnerCheck model, so provider availability and idempotency are
 * visible without adding a parallel table or trusting client tenant fields.
 */
export async function runOwnerIntelligenceQuery(options: {
  companyId: string;
  ownerId: string;
  actorUserId: string;
  idempotencyKey: string;
  capabilities: OwnerIntelligenceCapability[];
}) {
  const owner = await ensureOwner(options.companyId, options.ownerId);
  const profile = await getPrisma().ownerProfile.findFirst({ where: { companyId: options.companyId, ownerId: options.ownerId } });
  const consent = profile?.treatmentConsentJson as JsonRecord | null | undefined;
  if (!consent || !consent.authorized_at || !consent.purpose) {
    throw Object.assign(new Error("Consentimento LGPD de tratamento é obrigatório antes da consulta."), { statusCode: 422, code: "OWNER_TREATMENT_CONSENT_REQUIRED" });
  }
  const key = options.idempotencyKey.trim().slice(0, 160);
  if (!key) throw Object.assign(new Error("Idempotency-Key é obrigatório."), { statusCode: 400, code: "IDEMPOTENCY_KEY_REQUIRED" });
  const capabilities = [...new Set(options.capabilities)];
  if (!capabilities.length) throw Object.assign(new Error("Informe ao menos uma capacidade de consulta."), { statusCode: 400, code: "OWNER_INTELLIGENCE_CAPABILITY_REQUIRED" });
  const provider = capabilities.map((capability) => ownerIntelligenceRegistry.resolve(capability)).find(Boolean) ?? notConfiguredOwnerProvider;
  const existing = await getPrisma().ownerCheck.findFirst({ where: { companyId: options.companyId, ownerId: options.ownerId, checkType: "intelligence", provider: provider.name, idempotencyKey: key } });
  if (existing) return serializeCheck(existing);
  await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.intelligence.requested", "property_owner", options.ownerId, { provider: provider.name, capabilities });
  const result = await provider.query({ document: owner.document, capabilities });
  const check = await getPrisma().ownerCheck.create({
    data: {
      companyId: options.companyId,
      ownerId: options.ownerId,
      checkType: "intelligence",
      provider: result.provider,
      status: result.status.toUpperCase(),
      inputFingerprint: createHash("sha256").update(`${owner.document ?? ""}:${capabilities.join(",")}`).digest("hex"),
      idempotencyKey: key,
      source: "provider",
      summaryJson: jsonValue({ sections: result.sections, values: result.values }),
      warningsJson: jsonValue(result.warnings),
      requestedBy: options.actorUserId,
      checkedAt: new Date(result.consultedAt),
    },
  });
  await writeAuthAudit(getPrisma(), options.companyId, options.actorUserId, "owner.intelligence.completed", "property_owner", options.ownerId, { provider: result.provider, status: result.status, capabilities });
  return serializeCheck(check);
}

function serializeCheck(check: any) {
  return { id: check.id, owner_id: check.ownerId, check_type: check.checkType, provider: check.provider, status: check.status, summary: check.summaryJson ?? {}, warnings: check.warningsJson ?? [], checked_at: check.checkedAt?.toISOString() ?? null, created_at: check.createdAt.toISOString() };
}

export async function listOwnerChecks(companyId: string, ownerId: string) {
  await ensureOwner(companyId, ownerId);
  const checks = await getPrisma().ownerCheck.findMany({ where: { companyId, ownerId }, orderBy: { createdAt: "desc" }, take: 50 });
  return checks.map(serializeCheck);
}
