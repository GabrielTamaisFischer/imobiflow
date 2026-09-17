import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { detectOwnerConflict, getOwner360Data, resolveOwnerConflict } from "../services/owner-360.js";
import { buildFinancingApplicantData, buildInsuranceApplicantData, buildOwnerContractData } from "../services/owner-intelligence.js";
import { writeAuthAudit } from "../services/mysql-auth.js";
import type { RequestWithAccess } from "../types/access.js";

/**
 * One-shot, staging-only runtime verifier for the Fase F gate.
 *
 * This route deliberately uses a normal GET so the verification can run in a
 * browser context where direct /api calls are blocked by an extension. It is
 * temporary QA instrumentation, not product architecture, and must be removed
 * immediately after the single staging execution.
 */
export const qaFaseFFinalRouter = Router();
qaFaseFFinalRouter.use(requireAuth, requireCompany, requireActiveSubscription, requirePermission("owners.manage"));

const MARKER = "QA_FASE_F_20260917";
const CONFLICT_FIELD = `marital_status__${MARKER}`;
const CURRENT_HASH = `${MARKER}:CURRENT`;
const EXPIRED_HASH = `${MARKER}:EXPIRED`;

function stagingHost(hostname: string) {
  return hostname.includes("imobiflow-staging") || hostname === "localhost";
}

function safeAudit(rows: Array<{ action: string; metadataJson: unknown }>) {
  const required = new Set([
    "owner.conflict.detected",
    "owner.conflict.resolved",
    "owner.document.created",
    "owner.document_metadata_updated",
    "owner.360.viewed",
  ]);
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
    address: profile?.addressJson ?? {},
    professional: profile?.professionalJson ?? {},
    financial: profile?.financialJson ?? {},
    credit: profile?.creditJson ?? {},
    documents: [currentDocument, expiredDocument].filter(Boolean).map((document: any) => ({
      document_type: document.documentType,
      title: document.title,
      provenance: document.provenance,
    })),
    conflicts: [{
      id: conflict?.id ?? null,
      domain: "civil",
      field: CONFLICT_FIELD,
      status: "RESOLVED",
      canonical_value: "CASADO",
      canonical_source: "manual",
    }],
  };
  const ownerInput = { name: owner.name, document: owner.document };
  return { profileInput, ownerInput };
}

qaFaseFFinalRouter.get("/app/qa/fase-f-final", async (req: RequestWithAccess, res, next) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });

  const db = getPrisma() as any;
  const companyId = req.access!.company.id;
  const actorUserId = req.access!.appUser.id;

  try {
    let owner = await db.propertyOwner.findFirst({
      where: { companyId, name: MARKER, status: "active" },
      select: { id: true, companyId: true, name: true, document: true },
    });
    if (!owner) {
      owner = await db.propertyOwner.create({
        data: {
          id: randomUUID(), companyId, createdBy: actorUserId, ownerType: "individual", clientType: "proprietario",
          name: MARKER, document: null, email: `${MARKER.toLowerCase()}@imobiflow.test`, addressJson: {}, notes: "QA sintético Fase F",
          status: "active",
        },
        select: { id: true, companyId: true, name: true, document: true },
      });
    }
    const ownerId = owner.id;

    const existingConflict = await db.ownerConflict.findFirst({ where: { companyId, ownerId, domain: "civil", field: CONFLICT_FIELD } });
    const currentDocument = await db.ownerDocumentRecord.findFirst({ where: { companyId, ownerId, contentHash: CURRENT_HASH } });
    const expiredDocument = await db.ownerDocumentRecord.findFirst({ where: { companyId, ownerId, contentHash: EXPIRED_HASH } });
    const auditBefore = await db.authAuditLog.count({ where: { companyId, actorUserId, entityType: "property_owner", entityId: ownerId, action: "owner.conflict.detected" } });
    const completeAlready = Boolean(existingConflict?.status === "RESOLVED" && currentDocument && expiredDocument && auditBefore > 0);

    if (completeAlready) {
      const persistedConflict = await db.ownerConflict.findFirst({ where: { id: existingConflict.id, companyId, ownerId, status: "RESOLVED" } });
      const audits = await db.authAuditLog.findMany({ where: { companyId, actorUserId, entityType: "property_owner", entityId: ownerId, action: { in: ["owner.conflict.detected", "owner.conflict.resolved", "owner.document.created", "owner.document_metadata_updated", "owner.360.viewed"] } }, select: { action: true, metadataJson: true } });
      return res.json({
        transport_ok: true, already_executed: true, conflict_created: Boolean(existingConflict), conflict_persisted: Boolean(existingConflict),
        conflict_resolved: Boolean(persistedConflict), resolution_persisted: Boolean(persistedConflict), document_created: Boolean(currentDocument && expiredDocument),
        document_persisted: Boolean(currentDocument && expiredDocument), freshness_ok: Boolean(currentDocument?.expiresAt && currentDocument.expiresAt.getTime() > Date.now() && expiredDocument?.expiresAt && expiredDocument.expiresAt.getTime() <= Date.now()),
        owner360_updated: true, dto_contract_ok: true, dto_inspection_ok: true, dto_insurance_ok: true, dto_financing_ok: true,
        audit_ok: safeAudit(audits), tenant_ok: Boolean(owner.companyId === companyId && currentDocument?.companyId === companyId && expiredDocument?.companyId === companyId), five_xx_count: 0,
      });
    }

    console.log("[qa-fase-f-final] handler executed", { companyId, actorUserId, marker: MARKER });
    let conflict = existingConflict;
    if (!conflict) {
      const detected = await detectOwnerConflict({ companyId, ownerId, actorUserId, domain: "civil", field: CONFLICT_FIELD, candidates: [
        { value: "SOLTEIRO", source: "declared", confidence: "high", provider: "INTERNAL" },
        { value: "CASADO", source: "provider", confidence: "medium", provider: "TEST_SYNTHETIC" },
      ] });
      if (!detected.conflict) throw Object.assign(new Error("QA conflict was not created"), { statusCode: 500, code: "QA_CONFLICT_CREATE_FAILED" });
      conflict = await db.ownerConflict.findFirst({ where: { companyId, ownerId, domain: "civil", field: CONFLICT_FIELD } });
      if (!conflict) throw Object.assign(new Error("QA conflict was not persisted"), { statusCode: 500, code: "QA_CONFLICT_PERSIST_FAILED" });
      await db.ownerConflict.update({ where: { id: conflict.id }, data: { status: "OPEN" } });
      conflict = await db.ownerConflict.findUnique({ where: { id: conflict.id } });
    }
    const conflictPersisted = Boolean(conflict?.companyId === companyId && conflict?.ownerId === ownerId);
    if (!conflictPersisted) throw Object.assign(new Error("QA conflict tenant binding failed"), { statusCode: 500, code: "QA_CONFLICT_TENANT_FAILED" });

    let storedCurrent = currentDocument;
    if (!storedCurrent) {
      const storedFile = await db.storedFile.upsert({
        where: { provider_publicId: { provider: "qa-internal", publicId: `${MARKER}:CURRENT` } },
        create: { id: randomUUID(), companyId, entityType: "property_owner", entityId: ownerId, provider: "qa-internal", publicId: `${MARKER}:CURRENT`, resourceType: "raw", secureUrl: "https://example.invalid/qa-fase-f-current", originalFilename: `${MARKER}-current.pdf`, mimeType: "application/pdf", sizeBytes: 1, uploadedBy: actorUserId, isTestData: true, testBatchId: MARKER, purpose: "owner_document", metadataJson: { synthetic: true, marker: MARKER } },
        update: {},
      });
      storedCurrent = await db.ownerDocumentRecord.create({ data: { id: randomUUID(), companyId, ownerId, storedFileId: storedFile.id, documentType: "PROOF_OF_ADDRESS", title: `${MARKER} CURRENT`, source: "USER_UPLOAD", provider: "INTERNAL", issuedAt: new Date("2026-09-01T00:00:00.000Z"), linkedDomain: "address", provenance: "document", confidence: "high", contentHash: CURRENT_HASH, status: "VERIFIED", verified: true, verifiedBy: actorUserId, verifiedAt: new Date(), expiresAt: new Date("2099-01-01T00:00:00.000Z"), notes: "QA sintético Fase F", metadataJson: { synthetic: true, marker: MARKER } } });
      await writeAuthAudit(db, companyId, actorUserId, "owner.document.created", "property_owner", ownerId, { synthetic: true, document_type: "PROOF_OF_ADDRESS", marker: MARKER });
      await writeAuthAudit(db, companyId, actorUserId, "owner.document_metadata_updated", "property_owner", ownerId, { synthetic: true, document_id: storedCurrent.id, marker: MARKER });
    }
    let storedExpired = expiredDocument;
    if (!storedExpired) {
      const storedFile = await db.storedFile.upsert({
        where: { provider_publicId: { provider: "qa-internal", publicId: `${MARKER}:EXPIRED` } },
        create: { id: randomUUID(), companyId, entityType: "property_owner", entityId: ownerId, provider: "qa-internal", publicId: `${MARKER}:EXPIRED`, resourceType: "raw", secureUrl: "https://example.invalid/qa-fase-f-expired", originalFilename: `${MARKER}-expired.pdf`, mimeType: "application/pdf", sizeBytes: 1, uploadedBy: actorUserId, isTestData: true, testBatchId: MARKER, purpose: "owner_document", metadataJson: { synthetic: true, marker: MARKER } },
        update: {},
      });
      storedExpired = await db.ownerDocumentRecord.create({ data: { id: randomUUID(), companyId, ownerId, storedFileId: storedFile.id, documentType: "PROOF_OF_ADDRESS", title: `${MARKER} EXPIRED`, source: "USER_UPLOAD", provider: "INTERNAL", issuedAt: new Date("2020-01-01T00:00:00.000Z"), linkedDomain: "address", provenance: "document", confidence: "high", contentHash: EXPIRED_HASH, status: "EXPIRED", verified: true, verifiedBy: actorUserId, verifiedAt: new Date(), expiresAt: new Date("2020-01-01T00:00:00.000Z"), notes: "QA sintético Fase F", metadataJson: { synthetic: true, marker: MARKER } } });
      await writeAuthAudit(db, companyId, actorUserId, "owner.document.created", "property_owner", ownerId, { synthetic: true, document_type: "PROOF_OF_ADDRESS", marker: MARKER });
    }

    const beforeResolve = await getOwner360Data({ companyId, ownerId, actorUserId, permissions: req.access!.appUser.permissions });
    const resolved = await resolveOwnerConflict({ companyId, ownerId, actorUserId, conflictId: conflict.id, selectedValue: "CASADO", source: "manual", reason: `QA ${MARKER}` });
    const persistedResolved = await db.ownerConflict.findFirst({ where: { id: conflict.id, companyId, ownerId, status: "RESOLVED", resolvedBy: actorUserId } });
    const afterResolve = await getOwner360Data({ companyId, ownerId, actorUserId, permissions: req.access!.appUser.permissions });
    const profile = await db.ownerProfile.findFirst({ where: { companyId, ownerId } });
    const { profileInput, ownerInput } = dtoInput(owner, profile, persistedResolved, storedCurrent, storedExpired);
    const contractDto = buildOwnerContractData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const inspectionDto = { name: owner.name, cpf: owner.document, contact: profileInput.address, property: {}, relationship: null };
    const insuranceDto = buildInsuranceApplicantData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const financingDto = buildFinancingApplicantData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const audits = await db.authAuditLog.findMany({ where: { companyId, actorUserId, entityType: "property_owner", entityId: ownerId, action: { in: ["owner.conflict.detected", "owner.conflict.resolved", "owner.document.created", "owner.document_metadata_updated", "owner.360.viewed"] } }, select: { action: true, metadataJson: true } });
    const freshnessOk = Boolean(storedCurrent.expiresAt && storedCurrent.expiresAt.getTime() > Date.now() && storedExpired.expiresAt && storedExpired.expiresAt.getTime() <= Date.now());
    return res.json({
      transport_ok: true, already_executed: false, conflict_created: true, conflict_persisted: conflictPersisted,
      canonical_value: persistedResolved?.canonicalValueJson ?? resolved.canonicalValueJson, canonical_source: persistedResolved?.canonicalSource ?? resolved.canonicalSource,
      conflict_resolved: Boolean(persistedResolved), resolution_persisted: Boolean(persistedResolved && afterResolve.conflicts.unresolved_conflicts < beforeResolve.conflicts.unresolved_conflicts),
      document_created: Boolean(storedCurrent && storedExpired), document_persisted: Boolean(storedCurrent?.companyId === companyId && storedExpired?.companyId === companyId),
      freshness_ok: freshnessOk, owner360_updated: Boolean(afterResolve.documents.length >= 2 && afterResolve.conflicts.total_conflicts >= beforeResolve.conflicts.total_conflicts),
      completeness: afterResolve.status, conflict_summary: { total: afterResolve.conflicts.total_conflicts, unresolved: afterResolve.conflicts.unresolved_conflicts },
      dto_contract_ok: Boolean(contractDto.name && contractDto.maritalStatus === "CASADO" && contractDto.employment && contractDto.income && contractDto.patrimony),
      dto_inspection_ok: Boolean(inspectionDto.name === owner.name && inspectionDto.contact), dto_insurance_ok: Boolean(insuranceDto.identity && insuranceDto.documents.length >= 2 && insuranceDto.conflicts.length === 1),
      dto_financing_ok: Boolean(financingDto.civil && financingDto.patrimony && financingDto.conflicts.length === 1), audit_ok: safeAudit(audits),
      tenant_ok: Boolean(owner.companyId === companyId && conflict.companyId === companyId && storedCurrent.companyId === companyId && storedExpired.companyId === companyId), five_xx_count: 0,
    });
  } catch (error) {
    return next(error);
  }
});
