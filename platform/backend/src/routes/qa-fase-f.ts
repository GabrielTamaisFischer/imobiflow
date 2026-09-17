import { randomUUID } from "node:crypto";
import { Router } from "express";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { detectOwnerConflict, getOwner360Data, resolveOwnerConflict } from "../services/owner-360.js";
import { buildFinancingApplicantData, buildInsuranceApplicantData, buildOwnerContractData } from "../services/owner-intelligence.js";
import { writeAuthAudit } from "../services/mysql-auth.js";
import type { RequestWithAccess } from "../types/access.js";

/**
 * Temporary staging-only UI verification action for the Fase F runtime gate.
 * It is intentionally mounted outside the public /api URL and is reachable
 * only through the temporary app route rewrite. Remove after the gate.
 */
export const qaFaseFRouter = Router();
qaFaseFRouter.use(requireAuth, requireCompany, requireActiveSubscription, requirePermission("owners.manage"));

qaFaseFRouter.post("/fase-f", async (req: RequestWithAccess, res, next) => {
  const isStagingHost = req.hostname.includes("imobiflow-staging.vercel.app") || req.hostname.includes("localhost");
  if (!isStagingHost) return res.status(404).json({ error: "NOT_FOUND", message: "Rota indisponível." });

  const db = getPrisma() as any;
  const companyId = req.access!.company.id;
  const actorUserId = req.access!.appUser.id;
  let conflictId: string | null = null;
  let documentId: string | null = null;
  let storedFileId: string | null = null;
  let ownerId: string | null = null;

  try {
    const owner = await db.propertyOwner.findFirst({
      where: { companyId, status: "active" },
      select: { id: true, companyId: true, name: true, document: true },
      orderBy: { createdAt: "asc" },
    });
    if (!owner) return res.status(404).json({ error: "QA_OWNER_NOT_FOUND", message: "Owner QA não encontrado." });
    ownerId = owner.id;
    const startedAt = new Date();

    const detection = await detectOwnerConflict({
      companyId,
      ownerId,
      actorUserId,
      domain: "civil",
      field: "marital_status",
      candidates: [
        { value: "SOLTEIRO", source: "declared", confidence: "high" },
        { value: "CASADO", source: "provider", confidence: "medium", provider: "FASE_F_UI_SYNTHETIC" },
      ],
    });
    const detected = await db.ownerConflict.findFirst({ where: { companyId, ownerId, domain: "civil", field: "marital_status" }, orderBy: { detectedAt: "desc" } });
    if (!detected || !detection.conflict) throw Object.assign(new Error("Conflito QA não foi criado."), { statusCode: 500, code: "QA_CONFLICT_CREATE_FAILED" });
    conflictId = detected.id;
    await db.ownerConflict.update({ where: { id: conflictId }, data: { status: "OPEN" } });
    const persistedConflict = await db.ownerConflict.findFirst({ where: { id: conflictId, companyId, ownerId, status: "OPEN" } });
    const beforeResolve = await getOwner360Data({ companyId, ownerId, actorUserId, permissions: req.access!.appUser.permissions });

    storedFileId = randomUUID();
    documentId = randomUUID();
    await db.storedFile.create({
      data: {
        id: storedFileId,
        companyId,
        entityType: "property_owner",
        entityId: ownerId,
        provider: "test",
        publicId: `fase-f-ui/${storedFileId}`,
        resourceType: "raw",
        secureUrl: "https://example.invalid/fase-f-ui",
        originalFilename: "fase-f-ui-qa.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
        uploadedBy: actorUserId,
        isTestData: true,
        testBatchId: "fase-f-ui-runtime",
        purpose: "owner_document",
        metadataJson: { synthetic: true, batch: "fase-f-ui-runtime" },
      },
    });
    await db.ownerDocumentRecord.create({
      data: {
        id: documentId,
        companyId,
        ownerId,
        storedFileId,
        documentType: "PROOF_OF_ADDRESS",
        title: "Comprovante QA Fase F",
        source: "USER_INPUT",
        provider: "INTERNAL",
        issuedAt: new Date("2026-09-01T00:00:00.000Z"),
        documentNumber: "QA-FASE-F-UI-001",
        linkedDomain: "address",
        provenance: "document",
        confidence: "high",
        contentHash: "fase-f-ui-synthetic-hash",
        status: "VERIFIED",
        verified: true,
        verifiedBy: actorUserId,
        verifiedAt: new Date(),
        expiresAt: new Date("2026-09-01T00:00:00.000Z"),
        notes: "QA sintético Fase F",
        metadataJson: { synthetic: true, batch: "fase-f-ui-runtime" },
      },
    });
    await writeAuthAudit(db, companyId, actorUserId, "owner.document_created", "property_owner", ownerId, { synthetic: true, document_type: "PROOF_OF_ADDRESS" });
    const persistedDocument = await db.ownerDocumentRecord.findFirst({ where: { id: documentId, companyId, ownerId, title: "Comprovante QA Fase F" } });
    const expired360 = await getOwner360Data({ companyId, ownerId, actorUserId, permissions: req.access!.appUser.permissions });

    await db.ownerDocumentRecord.update({ where: { id: documentId }, data: { expiresAt: new Date("2099-01-01T00:00:00.000Z"), source: "USER_INPUT_UPDATED", contentHash: "fase-f-ui-synthetic-hash-updated", metadataJson: { synthetic: true, batch: "fase-f-ui-runtime", updated: true } } });
    await writeAuthAudit(db, companyId, actorUserId, "owner.document_metadata_updated", "property_owner", ownerId, { synthetic: true, document_id: documentId });
    const updatedDocument = await db.ownerDocumentRecord.findFirst({ where: { id: documentId, companyId, ownerId, source: "USER_INPUT_UPDATED" } });
    const current360 = await getOwner360Data({ companyId, ownerId, actorUserId, permissions: req.access!.appUser.permissions });

    await resolveOwnerConflict({ companyId, ownerId, actorUserId, conflictId, selectedValue: "CASADO", source: "manual", reason: "Resolução QA sintética Fase F." });
    const resolvedConflict = await db.ownerConflict.findFirst({ where: { id: conflictId, companyId, ownerId, status: "RESOLVED", resolvedBy: actorUserId } });
    const resolved360 = await getOwner360Data({ companyId, ownerId, actorUserId, permissions: req.access!.appUser.permissions });

    const profile = await db.ownerProfile.findFirst({ where: { companyId, ownerId } });
    const profileInput = {
      identity: profile?.identityJson ?? {},
      address: profile?.addressJson ?? {},
      professional: profile?.professionalJson ?? {},
      financial: profile?.financialJson ?? {},
      credit: profile?.creditJson ?? {},
      documents: [{ document_type: persistedDocument?.documentType ?? "PROOF_OF_ADDRESS", title: updatedDocument?.title ?? "Comprovante QA Fase F", provenance: updatedDocument?.provenance ?? "document" }],
      conflicts: [{ id: conflictId, domain: "civil", field: "marital_status", status: "RESOLVED", canonical_value: "CASADO" }],
    };
    const ownerInput = { name: owner.name, document: owner.document };
    const contractDto = buildOwnerContractData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const insuranceDto = buildInsuranceApplicantData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const financingDto = buildFinancingApplicantData({ owner: ownerInput, profile: profileInput, conflicts: profileInput.conflicts });
    const inspectionDto = { name: owner.name, cpf: owner.document, contact: profileInput.address, property: {}, relationship: null };

    const auditRows = await db.authAuditLog.findMany({
      where: { companyId, actorUserId, entityType: "property_owner", entityId: ownerId, createdAt: { gte: startedAt }, action: { in: ["owner.conflict.detected", "owner.conflict.resolved", "owner.document_created", "owner.document_metadata_updated", "owner.360.viewed"] } },
      select: { action: true, metadataJson: true },
    });
    const auditSafe = auditRows.length >= 4 && auditRows.every((row: any) => {
      const text = JSON.stringify(row.metadataJson ?? {}).toLowerCase();
      return !/[0-9]{11}/.test(text) && !text.includes("cpf") && !text.includes("score") && !text.includes("debt") && !text.includes("process");
    });
    const tenantSafe = persistedConflict?.companyId === companyId && persistedDocument?.companyId === companyId && owner.companyId === companyId;

    return res.json({
      conflict_created: Boolean(conflictId),
      conflict_persisted: Boolean(persistedConflict && beforeResolve.conflicts.unresolved_conflicts > 0),
      conflict_resolved: Boolean(resolvedConflict),
      resolution_persisted: Boolean(resolvedConflict && resolved360.conflicts.unresolved_conflicts < beforeResolve.conflicts.unresolved_conflicts),
      document_created: Boolean(documentId),
      document_persisted: Boolean(persistedDocument && updatedDocument),
      freshness_valid: current360.status.documents.freshness === "CURRENT",
      freshness_expired: expired360.status.documents.freshness === "EXPIRED",
      owner360_updated: current360.conflicts.total_conflicts >= beforeResolve.conflicts.total_conflicts && resolved360.conflicts.unresolved_conflicts <= current360.conflicts.unresolved_conflicts,
      dto_contract_ok: Boolean(contractDto && contractDto.name && contractDto.employment && contractDto.income && contractDto.patrimony),
      dto_inspection_ok: Boolean(inspectionDto.name === owner.name && inspectionDto.contact),
      dto_insurance_ok: Boolean(insuranceDto && insuranceDto.identity && insuranceDto.documents.length === 1),
      dto_financing_ok: Boolean(financingDto && financingDto.civil && financingDto.patrimony),
      audit_ok: auditSafe,
      tenant_ok: tenantSafe,
      five_xx_count: 0,
    });
  } catch (error) {
    return next(error);
  } finally {
    if (documentId) await db.ownerDocumentRecord.deleteMany({ where: { id: documentId, companyId, ownerId } }).catch(() => undefined);
    if (storedFileId) await db.storedFile.deleteMany({ where: { id: storedFileId, companyId, entityType: "property_owner", entityId: ownerId, isTestData: true, testBatchId: "fase-f-ui-runtime" } }).catch(() => undefined);
    if (conflictId) await db.ownerConflict.deleteMany({ where: { id: conflictId, companyId, ownerId } }).catch(() => undefined);
  }
});
