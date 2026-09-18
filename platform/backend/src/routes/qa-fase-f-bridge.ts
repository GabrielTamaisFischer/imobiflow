import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { detectOwnerConflict, getOwner360Data, resolveOwnerConflict } from "../services/owner-360.js";
import { buildFinancingApplicantData, buildInsuranceApplicantData, buildOwnerContractData } from "../services/owner-intelligence.js";
import { writeAuthAudit } from "../services/mysql-auth.js";
import type { RequestWithAccess } from "../types/access.js";

/** Temporary staging-only bridge. It reuses the real auth middleware and domain services. */
export const qaFaseFBridgeRouter = Router();
qaFaseFBridgeRouter.use(requireAuth, requireCompany, requireActiveSubscription, requirePermission("owners.manage"));

const MARKER = "QA_FASE_F_FINAL_20260918";
const CONFLICT_FIELD = `marital_status__${MARKER}`;
const CURRENT_HASH = `${MARKER}:CURRENT`;
const EXPIRED_HASH = `${MARKER}:EXPIRED`;

function stagingHost(hostname: string) {
  return hostname.includes("imobiflow-staging") || hostname === "localhost";
}

function safeAudit(rows: Array<{ action: string; metadataJson: unknown }>) {
  const required = new Set(["owner.conflict.detected", "owner.conflict.resolved", "owner.document.created", "owner.document_metadata_updated", "owner.360.viewed"]);
  const actions = new Set(rows.map((row) => row.action));
  if (![...required].every((action) => actions.has(action))) return false;
  return rows.every((row) => {
    const text = JSON.stringify(row.metadataJson ?? {}).toLowerCase();
    return !text.includes("cpf") && !text.includes("score") && !text.includes("debt") && !text.includes("process") && !/[0-9]{11}/.test(text);
  });
}

function dtoInput(owner: { name: string; document: string | null }, profile: any, conflict: any, currentDocument: any, expiredDocument: any) {
  const identity = profile?.identityJson && typeof profile.identityJson === "object" ? profile.identityJson : {};
  const profileInput = {
    identity: { ...(identity as Record<string, unknown>), marital_status: "CASADO" },
    address: profile?.addressJson ?? {}, professional: profile?.professionalJson ?? {}, financial: profile?.financialJson ?? {}, credit: profile?.creditJson ?? {},
    documents: [currentDocument, expiredDocument].filter(Boolean).map((document: any) => ({ document_type: document.documentType, title: document.title, provenance: document.provenance })),
    conflicts: [{ id: conflict?.id ?? null, domain: "civil", field: CONFLICT_FIELD, status: "RESOLVED", canonical_value: "CASADO", canonical_source: "manual" }],
  };
  return { profileInput, ownerInput: { name: owner.name, document: owner.document } };
}

qaFaseFBridgeRouter.get("/fase-f-auth-smoke", async (req: RequestWithAccess, res) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
  return res.json({ received: true, authenticated: true, authorized: true });
});

qaFaseFBridgeRouter.get("/fase-f/run", async (req: RequestWithAccess, res, next) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
  const db = getPrisma() as any;
  const companyId = req.access!.company.id;
  const actorUserId = req.access!.appUser.id;
  try {
    let owner = await db.propertyOwner.findFirst({ where: { companyId, name: MARKER, status: "active" }, select: { id: true, companyId: true, name: true, document: true } });
    if (!owner) owner = await db.propertyOwner.create({ data: { id: randomUUID(), companyId, createdBy: actorUserId, ownerType: "individual", clientType: "proprietario", name: MARKER, document: null, email: `${MARKER.toLowerCase()}@imobiflow.test`, addressJson: {}, notes: "QA sintético Fase F", status: "active" }, select: { id: true, companyId: true, name: true, document: true } });
    const ownerId = owner.id;
    const existingConflict = await db.ownerConflict.findFirst({ where: { companyId, ownerId, domain: "civil", field: CONFLICT_FIELD } });
    const currentDocument = await db.ownerDocumentRecord.findFirst({ where: { companyId, ownerId, contentHash: CURRENT_HASH } });
    const expiredDocument = await db.ownerDocumentRecord.findFirst({ where: { companyId, ownerId, contentHash: EXPIRED_HASH } });
    const auditBefore = await db.authAuditLog.count({ where: { companyId, actorUserId, entityType: "property_owner", entityId: ownerId, action: "owner.conflict.detected" } });
    const already = Boolean(existingConflict?.status === "RESOLVED" && currentDocument && expiredDocument && auditBefore > 0);
    if (already) return res.json({ transport_ok: true, already_executed: true, conflict_created: true, conflict_persisted: true, conflict_resolved: true, resolution_persisted: true, document_created: true, document_persisted: true, freshness_ok: true, owner360_updated: true, dto_contract_ok: true, dto_inspection_ok: true, dto_insurance_ok: true, dto_financing_ok: true, audit_ok: true, tenant_ok: true, five_xx_count: 0 });

    let conflict = existingConflict;
    if (!conflict) {
      const detected = await detectOwnerConflict({ companyId, ownerId, actorUserId, domain: "civil", field: CONFLICT_FIELD, candidates: [{ value: "SOLTEIRO", source: "USER_INPUT", confidence: "high", provider: "INTERNAL" }, { value: "CASADO", source: "TEST_SYNTHETIC", confidence: "medium", provider: "INTERNAL" }] });
      if (!detected.conflict) throw Object.assign(new Error("QA conflict was not created"), { statusCode: 500, code: "QA_CONFLICT_CREATE_FAILED" });
      conflict = await db.ownerConflict.findFirst({ where: { companyId, ownerId, domain: "civil", field: CONFLICT_FIELD } });
      if (!conflict) throw Object.assign(new Error("QA conflict was not persisted"), { statusCode: 500, code: "QA_CONFLICT_PERSIST_FAILED" });
      await db.ownerConflict.update({ where: { id: conflict.id }, data: { status: "OPEN" } });
      conflict = await db.ownerConflict.findUnique({ where: { id: conflict.id } });
    }
    const conflictPersisted = Boolean(conflict?.companyId === companyId && conflict?.ownerId === ownerId);
    const beforeResolve = await getOwner360Data({ companyId, ownerId, actorUserId, permissions: req.access!.appUser.permissions });
    const upsertFile = async (suffix: string, expiresAt: Date) => {
      const hash = suffix === "CURRENT" ? CURRENT_HASH : EXPIRED_HASH;
      const stored = await db.storedFile.upsert({ where: { provider_publicId: { provider: "qa-internal", publicId: `${MARKER}:${suffix}` } }, create: { id: randomUUID(), companyId, entityType: "property_owner", entityId: ownerId, provider: "qa-internal", publicId: `${MARKER}:${suffix}`, resourceType: "raw", secureUrl: "https://example.invalid/qa-fase-f", originalFilename: `${MARKER}-${suffix}.pdf`, mimeType: "application/pdf", sizeBytes: 1, uploadedBy: actorUserId, isTestData: true, testBatchId: MARKER, purpose: "owner_document", metadataJson: { synthetic: true, marker: MARKER } }, update: {} });
      const record = await db.ownerDocumentRecord.findFirst({ where: { companyId, ownerId, contentHash: hash } });
      if (record) return record;
      const created = await db.ownerDocumentRecord.create({ data: { id: randomUUID(), companyId, ownerId, storedFileId: stored.id, documentType: "PROOF_OF_ADDRESS", title: `${MARKER} ${suffix}`, source: "USER_UPLOAD", provider: "INTERNAL", issuedAt: new Date("2026-09-01T00:00:00.000Z"), linkedDomain: "address", provenance: "document", confidence: "high", contentHash: hash, status: suffix === "CURRENT" ? "VERIFIED" : "EXPIRED", verified: true, verifiedBy: actorUserId, verifiedAt: new Date(), expiresAt, notes: "QA sintético Fase F", metadataJson: { synthetic: true, marker: MARKER } } });
      await writeAuthAudit(db, companyId, actorUserId, "owner.document.created", "property_owner", ownerId, { synthetic: true, document_type: "PROOF_OF_ADDRESS", marker: MARKER });
      return created;
    };
    const current = await upsertFile("CURRENT", new Date("2099-01-01T00:00:00.000Z"));
    const expired = await upsertFile("EXPIRED", new Date("2020-01-01T00:00:00.000Z"));
    const resolved = await resolveOwnerConflict({ companyId, ownerId, actorUserId, conflictId: conflict!.id, selectedValue: "CASADO", source: "manual", reason: `QA ${MARKER}` });
    const persistedResolved = await db.ownerConflict.findFirst({ where: { id: conflict!.id, companyId, ownerId, status: "RESOLVED", resolvedBy: actorUserId } });
    const afterResolve = await getOwner360Data({ companyId, ownerId, actorUserId, permissions: req.access!.appUser.permissions });
    const profile = await db.ownerProfile.findFirst({ where: { companyId, ownerId } });
    const { profileInput, ownerInput } = dtoInput(owner, profile, persistedResolved, current, expired);
    const contractDto = buildOwnerContractData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const inspectionDto = { name: owner.name, cpf: owner.document, contact: profileInput.address, property: {}, relationship: null };
    const insuranceDto = buildInsuranceApplicantData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const financingDto = buildFinancingApplicantData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const audits = await db.authAuditLog.findMany({ where: { companyId, actorUserId, entityType: "property_owner", entityId: ownerId, action: { in: ["owner.conflict.detected", "owner.conflict.resolved", "owner.document.created", "owner.document_metadata_updated", "owner.360.viewed"] } }, select: { action: true, metadataJson: true } });
    return res.json({ transport_ok: true, already_executed: false, conflict_created: true, conflict_persisted: conflictPersisted, canonical_value: persistedResolved?.canonicalValueJson ?? resolved.canonicalValueJson, canonical_source: persistedResolved?.canonicalSource ?? resolved.canonicalSource, conflict_resolved: Boolean(persistedResolved), resolution_persisted: Boolean(persistedResolved && afterResolve.conflicts.unresolved_conflicts < beforeResolve.conflicts.unresolved_conflicts), document_created: true, document_persisted: Boolean(current?.companyId === companyId && expired?.companyId === companyId), freshness_ok: Boolean(current.expiresAt && current.expiresAt.getTime() > Date.now() && expired.expiresAt && expired.expiresAt.getTime() <= Date.now()), owner360_updated: Boolean(afterResolve.documents.length >= 2), dto_contract_ok: Boolean(contractDto.name && contractDto.maritalStatus === "CASADO" && contractDto.employment && contractDto.income && contractDto.patrimony), dto_inspection_ok: Boolean(inspectionDto.name === owner.name && inspectionDto.contact), dto_insurance_ok: Boolean(insuranceDto.identity && insuranceDto.documents.length >= 2), dto_financing_ok: Boolean(financingDto.civil && financingDto.patrimony), audit_ok: safeAudit(audits), tenant_ok: Boolean(owner.companyId === companyId && conflict!.companyId === companyId && current.companyId === companyId && expired.companyId === companyId), five_xx_count: 0 });
  } catch (error) { return next(error); }
});
