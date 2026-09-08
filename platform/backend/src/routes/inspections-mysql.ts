import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { assertInspectionAccess, assertPropertyAccess, buildInspectionScopeFilter } from "../services/authorization.js";
import { IdempotencyConflictError, resolveIdempotencyKey, withIdempotency } from "../services/idempotency.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { getStorageProvider, getStorageProviderForName, buildStorageFolder } from "../services/storage/index.js";
import { deliveryAccessForPurpose } from "../services/storage/purposes.js";
import { validateUploadFile } from "../services/storage/file-policy.js";
import { createStoredFileRecord } from "../services/storage/stored-files.js";
import { buildInspectionSnapshot, buildPdfBuffer, compareInspections, snapshotHash } from "../services/inspection-f5f.js";
import type { StorageResourceType } from "../services/storage/types.js";
import type { RequestWithAccess } from "../types/access.js";

export const mysqlInspectionsRouter = Router();
mysqlInspectionsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const inspectionTypes = ["entry", "exit"] as const;
const inspectionStatuses = ["draft", "in_progress", "completed", "archived"] as const;
const itemConditions = ["not_inspected", "excellent", "good", "fair", "poor", "damaged", "not_applicable"] as const;

const createInspectionSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  assigned_user_id: z.string().uuid().optional(),
  type: z.enum(inspectionTypes),
  notes: z.string().trim().max(12000).optional().nullable(),
});
const patchInspectionSchema = z.object({
  expected_version: z.number().int().positive(),
  assigned_user_id: z.string().uuid().optional(),
  notes: z.string().trim().max(12000).optional().nullable(),
  status: z.enum(inspectionStatuses).optional(),
}).refine((input) => input.assigned_user_id !== undefined || input.notes !== undefined || input.status !== undefined, {
  message: "Informe ao menos um campo para atualizar.",
});
const roomSchema = z.object({
  id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  name: z.string().trim().min(1).max(140),
  position: z.number().int().min(0).max(9999).default(0),
  notes: z.string().trim().max(12000).optional().nullable(),
});
const roomPatchSchema = roomSchema.omit({ id: true }).partial({ name: true, position: true, notes: true }).extend({ expected_version: z.number().int().positive() })
  .refine((input) => input.name !== undefined || input.position !== undefined || input.notes !== undefined, { message: "Informe ao menos um campo para atualizar." });
const itemSchema = z.object({
  id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  condition: z.enum(itemConditions).default("not_inspected"),
  position: z.number().int().min(0).max(9999).default(0),
  notes: z.string().trim().max(12000).optional().nullable(),
});
const itemPatchSchema = itemSchema.omit({ id: true }).partial({ name: true, condition: true, position: true, notes: true }).extend({ expected_version: z.number().int().positive() })
  .refine((input) => input.name !== undefined || input.condition !== undefined || input.position !== undefined || input.notes !== undefined, { message: "Informe ao menos um campo para atualizar." });
const versionSchema = z.object({ expected_version: z.number().int().positive() });
const evidenceCreateSchema = z.object({
  id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional().nullable(),
  item_id: z.string().uuid().optional().nullable(),
  file_name: z.string().min(1).max(240),
  mime_type: z.string().min(3).max(120),
  size_bytes: z.number().int().positive().max(10 * 1024 * 1024),
  content_base64: z.string().min(1),
  caption: z.string().trim().max(240).optional().nullable(),
  position: z.number().int().min(0).max(9999).default(0),
});
const evidencePatchSchema = z.object({
  expected_version: z.number().int().positive(),
  caption: z.string().trim().max(240).optional().nullable(),
  position: z.number().int().min(0).max(9999).optional(),
}).refine((input) => input.caption !== undefined || input.position !== undefined, { message: "Informe caption ou position." });
const evidenceOrderSchema = z.object({ expected_version: z.number().int().positive(), evidence: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0).max(9999) })).min(1).max(200) });

const inspectionInclude = {
  property: { select: { id: true, code: true, title: true, responsibleUserId: true } },
  assignedUser: { select: { id: true, name: true } },
  rooms: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }], include: { items: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }] } } },
} satisfies Prisma.InspectionInclude;

function invalid(message: string, code = "INSPECTION_INVALID") {
  return Object.assign(new Error(message), { statusCode: 400, code });
}
function conflict() {
  return Object.assign(new Error("A vistoria foi alterada por outra sessão. Atualize os dados antes de salvar."), { statusCode: 409, code: "INSPECTION_VERSION_CONFLICT" });
}
function notFound() {
  return Object.assign(new Error("Vistoria não encontrada."), { statusCode: 404, code: "INSPECTION_NOT_FOUND" });
}
function serializeInspection(inspection: any) {
  return {
    id: inspection.id,
    property_id: inspection.propertyId,
    assigned_user_id: inspection.assignedUserId,
    created_by: inspection.createdBy,
    type: inspection.type,
    status: inspection.status,
    notes: inspection.notes,
    version: inspection.version,
    completed_at: inspection.completedAt?.toISOString() ?? null,
    archived_at: inspection.archivedAt?.toISOString() ?? null,
    created_at: inspection.createdAt.toISOString(),
    updated_at: inspection.updatedAt.toISOString(),
    property: inspection.property ? { id: inspection.property.id, code: inspection.property.code, title: inspection.property.title } : undefined,
    assigned_user: inspection.assignedUser ? { id: inspection.assignedUser.id, name: inspection.assignedUser.name } : undefined,
    rooms: inspection.rooms?.map((room: any) => ({
      id: room.id, name: room.name, position: room.position, notes: room.notes,
      items: room.items?.map((item: any) => ({ id: item.id, name: item.name, condition: item.condition, position: item.position, notes: item.notes })) ?? [],
    })) ?? [],
  };
}

function decodeBase64File(value: string) {
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  try {
    const body = Buffer.from(payload, "base64");
    if (!body.length) throw new Error("empty");
    return body;
  } catch {
    throw invalid("Conteúdo do arquivo inválido.", "INVALID_UPLOAD");
  }
}

function serializeEvidence(row: any, signedUrl: string | null = null) {
  return {
    id: row.id,
    inspection_id: row.inspectionId,
    room_id: row.roomId,
    item_id: row.itemId,
    file_name: row.storedFile?.originalFilename ?? null,
    mime_type: row.storedFile?.mimeType ?? null,
    file_size: row.storedFile?.sizeBytes ?? null,
    width: row.storedFile?.width ?? null,
    height: row.storedFile?.height ?? null,
    caption: row.caption,
    position: row.position,
    created_at: row.createdAt.toISOString(),
    signed_url: signedUrl,
  };
}

async function evidenceSignedUrl(file: any, purpose = "inspection_evidence") {
  if (!file || deliveryAccessForPurpose(file.purpose ?? purpose) !== "authenticated") return null;
  const provider = getStorageProviderForName(file.provider as any);
  if (!provider.getAuthenticatedDownloadUrl) return null;
  return provider.getAuthenticatedDownloadUrl({ publicId: file.publicId, resourceType: file.resourceType as StorageResourceType, format: file.format });
}

async function loadEvidence(companyId: string, inspectionId: string) {
  const rows = await getPrisma().inspectionEvidence.findMany({
    where: { companyId, inspectionId },
    include: { storedFile: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all(rows.map(async (row) => serializeEvidence(row, await evidenceSignedUrl(row.storedFile))));
}

async function privateArtifactUrl(file: any, purpose: string) {
  if (!file || deliveryAccessForPurpose(file.purpose ?? purpose) !== "authenticated") return null;
  const provider = getStorageProviderForName(file.provider as any);
  return provider.getAuthenticatedDownloadUrl?.({ publicId: file.publicId, resourceType: file.resourceType as StorageResourceType, format: file.format }) ?? null;
}

function artifactDto(file: any, metadata: any, signedUrl: string | null) {
  return { id: file.id, entity_id: file.entityId, purpose: file.purpose, file_name: file.originalFilename, mime_type: file.mimeType, size_bytes: file.sizeBytes, created_at: file.createdAt.toISOString(), metadata, signed_url: signedUrl };
}

async function artifactFiles(companyId: string, entityType: string, inspectionId: string, purpose: string) {
  const rows = await getPrisma().storedFile.findMany({ where: { companyId, entityType, purpose }, orderBy: { createdAt: "desc" } });
  return rows.filter((row: any) => (row.metadataJson as any)?.inspection_id === inspectionId);
}

async function resolveAssignee(companyId: string, requestedUserId: string | undefined, fallbackUserId: string) {
  const userId = requestedUserId ?? fallbackUserId;
  const user = await getPrisma().appUser.findFirst({
    where: { id: userId, companyId, status: "active", roleRecord: { permissions: { some: { permission: { key: { in: ["inspections.view", "inspections.manage"] } } } } } },
    select: { id: true },
  });
  if (!user) throw invalid("Responsável inválido para esta empresa.", "INVALID_INSPECTION_ASSIGNEE");
  return user.id;
}

async function findInspection(req: RequestWithAccess, inspectionId: string, permissionKey: string) {
  await assertInspectionAccess(req.access!, inspectionId, permissionKey, "INSPECT");
  const inspection = await getPrisma().inspection.findFirst({
    where: { id: inspectionId, AND: [buildInspectionScopeFilter(req.access!, permissionKey, "INSPECT")] },
    include: inspectionInclude,
  });
  if (!inspection) throw notFound();
  return inspection;
}

function ensureMutable(inspection: { status: string }, requestedStatus?: string, hasOtherChanges = false) {
  const isArchivingCompleted = inspection.status === "completed" && requestedStatus === "archived" && !hasOtherChanges;
  if (inspection.status === "archived" || (inspection.status === "completed" && !isArchivingCompleted)) {
    throw Object.assign(new Error("Vistoria concluída ou arquivada não pode ser alterada."), { statusCode: 409, code: "INSPECTION_NOT_MUTABLE" });
  }
}

async function bumpVersion(tx: Prisma.TransactionClient, inspectionId: string, companyId: string, expectedVersion: number, data: Prisma.InspectionUpdateManyMutationInput = {}) {
  const result = await tx.inspection.updateMany({ where: { id: inspectionId, companyId, version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
  if (result.count !== 1) throw conflict();
}

async function event(tx: Prisma.TransactionClient, companyId: string, inspectionId: string, actorId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await tx.inspectionEvent.create({ data: { companyId, inspectionId, actorId, eventType, metadataJson: metadata as Prisma.InputJsonValue } });
}

function nextStatus(current: string, requested: string) {
  if (current === requested) return requested;
  const allowed: Record<string, string[]> = { draft: ["in_progress", "archived"], in_progress: ["completed", "archived"], completed: ["archived"], archived: [] };
  if (!allowed[current]?.includes(requested)) throw invalid("Transição de status inválida.", "INVALID_INSPECTION_TRANSITION");
  return requested;
}

mysqlInspectionsRouter.get("/", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const page = Number(req.query.page ?? 1), pageSize = Number(req.query.page_size ?? 25);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw invalid("Paginação inválida.", "INVALID_PAGINATION");
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !inspectionStatuses.includes(status as any)) throw invalid("Status inválido.", "INVALID_INSPECTION_STATUS");
    const where: Prisma.InspectionWhereInput = { AND: [buildInspectionScopeFilter(req.access!, "inspections.view", "INSPECT")], ...(status ? { status } : {}) };
    const prisma = getPrisma();
    const [total, rows] = await prisma.$transaction([
      prisma.inspection.count({ where }),
      prisma.inspection.findMany({ where, include: inspectionInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ inspections: rows.map(serializeInspection), pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize), has_next: page * pageSize < total, has_previous: page > 1 } });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = createInspectionSchema.parse(req.body), access = req.access!, companyId = access.company.id;
    await assertPropertyAccess(access, input.property_id, "inspections.manage", "INSPECT");
    const assignedUserId = await resolveAssignee(companyId, input.assigned_user_id, access.appUser.id);
    const key = resolveIdempotencyKey(req, `inspection.create:${input.id}`);
    const { result, replayed } = await withIdempotency(companyId, "inspection.create", key, async () => {
      const created = await getPrisma().$transaction(async (tx) => {
        const inspection = await tx.inspection.create({ data: { id: input.id, companyId, propertyId: input.property_id, assignedUserId, createdBy: access.appUser.id, type: input.type, notes: input.notes ?? null }, include: inspectionInclude });
        await event(tx, companyId, inspection.id, access.appUser.id, "inspection.created", { property_id: inspection.propertyId, type: inspection.type, assigned_user_id: inspection.assignedUserId });
        return serializeInspection(inspection);
      });
      return { inspection: created };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.get("/:id", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try { res.json({ inspection: serializeInspection(await findInspection(req, String(req.params.id), "inspections.view")) }); } catch (error) { next(error); }
});

// F5E: evidências são armazenadas no pipeline canônico StoredFile/Cloudinary.
// O DTO só expõe uma URL autenticada curta gerada a partir do registro seguro;
// nunca expõe secureUrl/publicId persistidos.
mysqlInspectionsRouter.get("/:id/evidence", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const inspection = await findInspection(req, String(req.params.id), "inspections.view");
    res.json({ evidence: await loadEvidence(req.access!.company.id, inspection.id) });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/:id/evidence", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!;
    const inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const input = evidenceCreateSchema.parse(req.body);
    const body = decodeBase64File(input.content_base64);
    const policy = validateUploadFile({ purpose: "inspection_evidence", fileName: input.file_name, mimeType: input.mime_type, declaredSizeBytes: input.size_bytes, body });
    const roomId = input.room_id ?? null;
    const itemId = input.item_id ?? null;
    if (roomId) {
      const room = await getPrisma().inspectionRoom.findFirst({ where: { id: roomId, inspectionId: inspection.id, companyId: access.company.id }, select: { id: true } });
      if (!room) throw notFound();
    }
    if (itemId) {
      const item = await getPrisma().inspectionItem.findFirst({ where: { id: itemId, companyId: access.company.id, room: { inspectionId: inspection.id } }, select: { id: true, roomId: true } });
      if (!item || (roomId && item.roomId !== roomId)) throw notFound();
    }
    const evidenceId = input.id ?? randomUUID();
    const key = resolveIdempotencyKey(req, `inspection.evidence.create:${evidenceId}`);
    const { result, replayed } = await withIdempotency(access.company.id, "inspection.evidence.create", key, async () => {
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({
        companyId: access.company.id,
        entityType: "inspection_evidence",
        entityId: evidenceId,
        purpose: "inspection_evidence",
        fileName: input.file_name,
        mimeType: policy.normalizedMimeType,
        sizeBytes: policy.measuredSizeBytes,
        body,
        folder: buildStorageFolder({ companyId: access.company.id, purpose: "inspection_evidence", inspectionId: inspection.id }),
        deliveryAccess: deliveryAccessForPurpose("inspection_evidence"),
      });
      await getPrisma().$transaction(async (tx) => {
        await bumpVersion(tx, inspection.id, access.company.id, inspection.version);
        const file = await tx.storedFile.create({ data: {
          companyId: access.company.id, entityType: "inspection_evidence", entityId: evidenceId,
          provider: uploaded!.provider, publicId: uploaded!.publicId, resourceType: uploaded!.resourceType,
          secureUrl: uploaded!.secureUrl, originalFilename: input.file_name, mimeType: policy.normalizedMimeType,
          sizeBytes: policy.measuredSizeBytes, format: uploaded!.format ?? null, uploadedBy: access.appUser.id,
          purpose: "inspection_evidence", metadataJson: { inspection_id: inspection.id, room_id: roomId, item_id: itemId },
        } });
        const evidence = await tx.inspectionEvidence.create({ data: { id: evidenceId, companyId: access.company.id, inspectionId: inspection.id, roomId, itemId, storedFileId: file.id, caption: input.caption ?? null, position: input.position } , include: { storedFile: true } });
        await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.evidence_added", { evidence_id: evidence.id, room_id: roomId, item_id: itemId, position: input.position });
        return evidence.id;
      });
      return { evidence_id: evidenceId };
    });
    const row = await getPrisma().inspectionEvidence.findUniqueOrThrow({ where: { id: result.evidence_id }, include: { storedFile: true } });
    res.status(replayed ? 200 : 201).json({ evidence: serializeEvidence(row, await evidenceSignedUrl(row.storedFile)), replayed });
  } catch (error) {
    // Best-effort compensação: só remove o asset criado por esta requisição,
    // mantendo a resposta sanitizada caso o banco rejeite a associação.
    if (uploaded) {
      try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as StorageResourceType, deliveryAccess: "authenticated" }); } catch { /* não mascarar a causa original */ }
    }
    next(error);
  }
});

mysqlInspectionsRouter.patch("/:id/evidence/order", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const input = evidenceOrderSchema.parse(req.body);
    const ids = input.evidence.map((entry) => entry.id);
    const rows = await getPrisma().inspectionEvidence.findMany({ where: { id: { in: ids }, inspectionId: inspection.id, companyId: access.company.id }, select: { id: true } });
    if (rows.length !== ids.length) throw notFound();
    await getPrisma().$transaction(async (tx) => {
      await bumpVersion(tx, inspection.id, access.company.id, input.expected_version);
      for (const entry of input.evidence) await tx.inspectionEvidence.update({ where: { id: entry.id }, data: { position: entry.position } });
      await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.evidence_reordered", { count: ids.length });
    });
    res.json({ evidence: await loadEvidence(access.company.id, inspection.id) });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.patch("/:id/evidence/:evidenceId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const input = evidencePatchSchema.parse(req.body);
    const existing = await getPrisma().inspectionEvidence.findFirst({ where: { id: String(req.params.evidenceId), inspectionId: inspection.id, companyId: access.company.id }, include: { storedFile: true } });
    if (!existing) throw notFound();
    await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, access.company.id, input.expected_version); await tx.inspectionEvidence.update({ where: { id: existing.id }, data: { ...(input.caption !== undefined ? { caption: input.caption } : {}), ...(input.position !== undefined ? { position: input.position } : {}) } }); await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.evidence_updated", { evidence_id: existing.id }); });
    const row = await getPrisma().inspectionEvidence.findUniqueOrThrow({ where: { id: existing.id }, include: { storedFile: true } });
    res.json({ evidence: serializeEvidence(row, await evidenceSignedUrl(row.storedFile)) });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.delete("/:id/evidence/:evidenceId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const existing = await getPrisma().inspectionEvidence.findFirst({ where: { id: String(req.params.evidenceId), inspectionId: inspection.id, companyId: access.company.id }, include: { storedFile: true } });
    if (!existing) throw notFound();
    const { expected_version } = versionSchema.parse(req.body);
    if (inspection.version !== expected_version) throw conflict();
    const provider = getStorageProviderForName(existing.storedFile.provider as any);
    await provider.deleteFile({ publicId: existing.storedFile.publicId, resourceType: existing.storedFile.resourceType as StorageResourceType, deliveryAccess: deliveryAccessForPurpose("inspection_evidence") });
    await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, access.company.id, expected_version); await tx.inspectionEvidence.delete({ where: { id: existing.id } }); await tx.storedFile.delete({ where: { id: existing.storedFileId } }); await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.evidence_removed", { evidence_id: existing.id }); });
    res.json({ ok: true, evidence_id: existing.id });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.patch("/:id", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = patchInspectionSchema.parse(req.body), access = req.access!, companyId = access.company.id;
    const existing = await findInspection(req, String(req.params.id), "inspections.manage");
    const status = input.status === undefined ? undefined : nextStatus(existing.status, input.status);
    const hasOtherChanges = input.assigned_user_id !== undefined || input.notes !== undefined;
    ensureMutable(existing, status, hasOtherChanges);
    const assignedUserId = input.assigned_user_id === undefined ? undefined : await resolveAssignee(companyId, input.assigned_user_id, access.appUser.id);
    const updated = await getPrisma().$transaction(async (tx) => {
      await bumpVersion(tx, existing.id, companyId, input.expected_version, { ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(assignedUserId ? { assignedUserId } : {}), ...(status ? { status, ...(status === "completed" ? { completedAt: new Date() } : {}), ...(status === "archived" ? { archivedAt: new Date() } : {}) } : {}) });
      const row = await tx.inspection.findUniqueOrThrow({ where: { id: existing.id }, include: inspectionInclude });
      await event(tx, companyId, row.id, access.appUser.id, status === "in_progress" ? "inspection.started" : status === "completed" ? "inspection.completed" : status === "archived" ? "inspection.archived" : "inspection.updated", { version: row.version });
      return serializeInspection(row);
    });
    res.json({ inspection: updated });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/:id/rooms", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = roomSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const key = resolveIdempotencyKey(req, `inspection.room.create:${input.id}`);
    const { result, replayed } = await withIdempotency(companyId, "inspection.room.create", key, async () => {
      const room = await getPrisma().$transaction(async (tx) => {
        await bumpVersion(tx, inspection.id, companyId, input.expected_version);
        const created = await tx.inspectionRoom.create({ data: { id: input.id, companyId, inspectionId: inspection.id, name: input.name, position: input.position, notes: input.notes ?? null } });
        await event(tx, companyId, inspection.id, access.appUser.id, "inspection.room_added", { room_id: created.id });
        return created;
      });
      return { room: { id: room.id, name: room.name, position: room.position, notes: room.notes } };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.patch("/:id/rooms/:roomId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = roomPatchSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const room = await getPrisma().inspectionRoom.findFirst({ where: { id: String(req.params.roomId), inspectionId: inspection.id, companyId } });
    if (!room) throw notFound();
    const updated = await getPrisma().$transaction(async (tx) => {
      await bumpVersion(tx, inspection.id, companyId, input.expected_version);
      const row = await tx.inspectionRoom.update({ where: { id: room.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.position !== undefined ? { position: input.position } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) } });
      await event(tx, companyId, inspection.id, access.appUser.id, "inspection.room_updated", { room_id: row.id });
      return row;
    });
    res.json({ room: { id: updated.id, name: updated.name, position: updated.position, notes: updated.notes } });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.delete("/:id/rooms/:roomId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = versionSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const room = await getPrisma().inspectionRoom.findFirst({ where: { id: String(req.params.roomId), inspectionId: inspection.id, companyId }, select: { id: true } });
    if (!room) throw notFound();
    await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, companyId, input.expected_version); await tx.inspectionRoom.delete({ where: { id: room.id } }); await event(tx, companyId, inspection.id, access.appUser.id, "inspection.room_removed", { room_id: room.id }); });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/:id/rooms/:roomId/items", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = itemSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const room = await getPrisma().inspectionRoom.findFirst({ where: { id: String(req.params.roomId), inspectionId: inspection.id, companyId }, select: { id: true } });
    if (!room) throw notFound();
    const key = resolveIdempotencyKey(req, `inspection.item.create:${input.id}`);
    const { result, replayed } = await withIdempotency(companyId, "inspection.item.create", key, async () => {
      const item = await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, companyId, input.expected_version); const created = await tx.inspectionItem.create({ data: { id: input.id, companyId, roomId: room.id, name: input.name, condition: input.condition, position: input.position, notes: input.notes ?? null } }); await event(tx, companyId, inspection.id, access.appUser.id, "inspection.item_added", { item_id: created.id, room_id: room.id }); return created; });
      return { item: { id: item.id, name: item.name, condition: item.condition, position: item.position, notes: item.notes } };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.patch("/:id/rooms/:roomId/items/:itemId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = itemPatchSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const item = await getPrisma().inspectionItem.findFirst({ where: { id: String(req.params.itemId), roomId: String(req.params.roomId), companyId, room: { inspectionId: inspection.id } } });
    if (!item) throw notFound();
    const updated = await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, companyId, input.expected_version); const row = await tx.inspectionItem.update({ where: { id: item.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.condition !== undefined ? { condition: input.condition } : {}), ...(input.position !== undefined ? { position: input.position } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) } }); await event(tx, companyId, inspection.id, access.appUser.id, "inspection.item_updated", { item_id: row.id }); return row; });
    res.json({ item: { id: updated.id, name: updated.name, condition: updated.condition, position: updated.position, notes: updated.notes } });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.delete("/:id/rooms/:roomId/items/:itemId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = versionSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    await ensureMutable(inspection);
    const item = await getPrisma().inspectionItem.findFirst({ where: { id: String(req.params.itemId), roomId: String(req.params.roomId), companyId, room: { inspectionId: inspection.id } }, select: { id: true } });
    if (!item) throw notFound();
    await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, companyId, input.expected_version); await tx.inspectionItem.delete({ where: { id: item.id } }); await event(tx, companyId, inspection.id, access.appUser.id, "inspection.item_removed", { item_id: item.id }); });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// F5F: relatórios, assinaturas eletrônicas simples e comparação são artefatos
// privados no StoredFile. O snapshot fica no metadataJson para que o documento
// emitido não mude quando a Inspection corrente evoluir.
mysqlInspectionsRouter.post("/:id/report", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!;
    const inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    if (inspection.status !== "completed" && inspection.status !== "archived") throw invalid("O laudo final exige uma vistoria concluída.", "INSPECTION_REPORT_REQUIRES_COMPLETED");
    const regenerate = req.body?.regenerate === true;
    const existing = await artifactFiles(access.company.id, "inspection_report", inspection.id, "inspection_report");
    if (existing.length && !regenerate) {
      const file = existing[0];
      return res.json({ report: artifactDto(file, file.metadataJson, await privateArtifactUrl(file, "inspection_report")), replayed: true });
    }
    const evidence = await getPrisma().inspectionEvidence.findMany({ where: { companyId: access.company.id, inspectionId: inspection.id }, include: { storedFile: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    const snapshot = buildInspectionSnapshot(inspection, evidence);
    const hash = snapshotHash(snapshot);
    const reportId = randomUUID();
    const sections = [
      `Inspection: ${snapshot.inspection_id} | Tipo: ${snapshot.type} | Status: ${snapshot.status}`,
      `Empresa: ${snapshot.company_id}`,
      `Imóvel: ${snapshot.property?.code ?? ""} ${snapshot.property?.title ?? ""}`,
      `Responsável: ${snapshot.assigned_user?.name ?? "Não definido"} | Concluída em: ${snapshot.completed_at ?? "não concluída"}`,
      `Observações: ${snapshot.notes ?? "-"}`,
      ...snapshot.rooms.flatMap((room) => [`Ambiente: ${room.name} — ${room.notes ?? ""}`, ...room.items.map((item) => `Item: ${item.name} | Condição: ${item.condition} | Observações: ${item.notes ?? "-"}`)]),
      `Evidências: ${snapshot.evidence.map((item) => item.file_name ?? item.id).join(", ") || "nenhuma"}`,
      `Hash do snapshot: ${hash}`,
    ];
    const body = buildPdfBuffer("Laudo de vistoria", sections);
    const policy = validateUploadFile({ purpose: "inspection_report", fileName: `inspection-${inspection.id}-${reportId}.pdf`, mimeType: "application/pdf", declaredSizeBytes: body.byteLength, body });
    const key = resolveIdempotencyKey(req, `inspection.report:${inspection.id}:${regenerate ? reportId : "latest"}`);
    const { result, replayed } = await withIdempotency(access.company.id, "inspection.report", key, async () => {
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "inspection_report", entityId: reportId, purpose: "inspection_report", fileName: `inspection-${inspection.id}-${reportId}.pdf`, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "inspection_report", inspectionId: inspection.id }), deliveryAccess: deliveryAccessForPurpose("inspection_report") });
      await createStoredFileRecord({ companyId: access.company.id, entityType: "inspection_report", entityId: reportId, file: uploaded, uploadedBy: access.appUser.id, purpose: "inspection_report", metadata: { inspection_id: inspection.id, inspection_version: inspection.version, snapshot, snapshot_hash: hash, generated_at: new Date().toISOString() } });
      await getPrisma().$transaction(async (tx) => event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.report_generated", { report_id: reportId, inspection_version: inspection.version, snapshot_hash: hash, regenerated: regenerate }));
      return { report_id: reportId, snapshot_hash: hash };
    });
    const file = await getPrisma().storedFile.findFirstOrThrow({ where: { companyId: access.company.id, entityType: "inspection_report", entityId: result.report_id, purpose: "inspection_report" } });
    return res.status(replayed ? 200 : 201).json({ report: artifactDto(file, file.metadataJson, await privateArtifactUrl(file, "inspection_report")), replayed });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as StorageResourceType, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

mysqlInspectionsRouter.get("/:id/reports", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const inspection = await findInspection(req, String(req.params.id), "inspections.view");
    const rows = await artifactFiles(req.access!.company.id, "inspection_report", inspection.id, "inspection_report");
    res.json({ reports: await Promise.all(rows.map(async (row: any) => artifactDto(row, row.metadataJson, await privateArtifactUrl(row, "inspection_report")))) });
  } catch (error) { next(error); }
});

const signatureSchema = z.object({ report_id: z.string().uuid().optional(), signer_name: z.string().trim().min(1).max(180), signer_role: z.enum(["responsible", "owner", "tenant", "other"]), accepted_terms: z.boolean().default(true), signature_base64: z.string().min(1).max(8_000_000) });
mysqlInspectionsRouter.post("/:id/signatures", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!, inspection = await findInspection(req, String(req.params.id), "inspections.manage"), input = signatureSchema.parse(req.body);
    if (inspection.status !== "completed") throw invalid("A assinatura exige uma vistoria concluída e não arquivada.", "INSPECTION_SIGNATURE_REQUIRES_COMPLETED");
    if (!input.accepted_terms) throw invalid("É necessário confirmar a assinatura.", "SIGNATURE_TERMS_REQUIRED");
    const reports = await artifactFiles(access.company.id, "inspection_report", inspection.id, "inspection_report");
    const report = input.report_id ? reports.find((row: any) => row.entityId === input.report_id) : reports[0];
    if (!report) throw invalid("Gere o laudo antes de assinar.", "INSPECTION_REPORT_REQUIRED");
    const body = decodeBase64File(input.signature_base64);
    const mimeType = input.signature_base64.startsWith("data:image/jpeg") ? "image/jpeg" : input.signature_base64.startsWith("data:image/webp") ? "image/webp" : "image/png";
    const signatureId = randomUUID();
    const signatureExtension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const signatureFileName = `signature-${signatureId}.${signatureExtension}`;
    const policy = validateUploadFile({ purpose: "inspection_signature", fileName: signatureFileName, mimeType, declaredSizeBytes: body.byteLength, body });
    const storage = getStorageProvider();
    uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "inspection_signature", entityId: signatureId, purpose: "inspection_signature", fileName: signatureFileName, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "inspection_signature", inspectionId: inspection.id }), deliveryAccess: deliveryAccessForPurpose("inspection_signature") });
    const metadata = { inspection_id: inspection.id, report_id: report.entityId, signer_name: input.signer_name, signer_role: input.signer_role, accepted_terms: input.accepted_terms, signed_at: new Date().toISOString(), signature_hash: snapshotHash(body.toString("base64")) };
    await createStoredFileRecord({ companyId: access.company.id, entityType: "inspection_signature", entityId: signatureId, file: uploaded, uploadedBy: access.appUser.id, purpose: "inspection_signature", metadata });
    await getPrisma().$transaction(async (tx) => event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.signature_created", { signature_id: signatureId, report_id: report.entityId, signer_role: input.signer_role }));
    const file = await getPrisma().storedFile.findFirstOrThrow({ where: { companyId: access.company.id, entityType: "inspection_signature", entityId: signatureId, purpose: "inspection_signature" } });
    res.status(201).json({ signature: artifactDto(file, metadata, await privateArtifactUrl(file, "inspection_signature")), signature_type: "simple_electronic_capture" });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as StorageResourceType, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

mysqlInspectionsRouter.get("/:id/signatures", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try { const inspection = await findInspection(req, String(req.params.id), "inspections.view"); const rows = await artifactFiles(req.access!.company.id, "inspection_signature", inspection.id, "inspection_signature"); res.json({ signatures: await Promise.all(rows.map(async (row: any) => artifactDto(row, row.metadataJson, await privateArtifactUrl(row, "inspection_signature")))) }); } catch (error) { next(error); }
});

const comparisonSchema = z.object({ baseline_inspection_id: z.string().uuid(), regenerate: z.boolean().optional().default(false) });
mysqlInspectionsRouter.post("/:id/comparison", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!, exit = await findInspection(req, String(req.params.id), "inspections.view"), input = comparisonSchema.parse(req.body), entry = await findInspection(req, input.baseline_inspection_id, "inspections.view");
    if (entry.propertyId !== exit.propertyId || entry.companyId !== exit.companyId) throw invalid("A comparação exige o mesmo imóvel e empresa.", "COMPARISON_SCOPE_INVALID");
    if (!["completed", "archived"].includes(entry.status) || !["completed", "archived"].includes(exit.status)) throw invalid("A comparação exige vistorias concluídas.", "COMPARISON_REQUIRES_COMPLETED");
    const [entryEvidence, exitEvidence] = await Promise.all([getPrisma().inspectionEvidence.findMany({ where: { companyId: access.company.id, inspectionId: entry.id }, include: { storedFile: true } }), getPrisma().inspectionEvidence.findMany({ where: { companyId: access.company.id, inspectionId: exit.id }, include: { storedFile: true } })]);
    const comparison = compareInspections(buildInspectionSnapshot(entry, entryEvidence), buildInspectionSnapshot(exit, exitEvidence));
    const hash = snapshotHash(comparison);
    const existing = await artifactFiles(access.company.id, "inspection_comparison", exit.id, "inspection_comparison");
    if (existing.length && !input.regenerate) return res.json({ comparison, report: artifactDto(existing[0], existing[0].metadataJson, await privateArtifactUrl(existing[0], "inspection_comparison")), replayed: true });
    const comparisonId = randomUUID(), body = buildPdfBuffer("Comparação de vistorias", [`Entrada: ${entry.id}`, `Saída: ${exit.id}`, ...comparison.rooms.flatMap((room) => [ `Ambiente ${room.name}: ${room.outcome}`, ...room.items.map((item: any) => `Item ${item.name}: ${item.entry ?? "-"} -> ${item.exit ?? "-"} (${item.outcome})`) ]), `Hash: ${hash}` ]);
    const storage = getStorageProvider(), uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "inspection_comparison", entityId: comparisonId, purpose: "inspection_comparison", fileName: `comparison-${exit.id}-${comparisonId}.pdf`, mimeType: "application/pdf", sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "inspection_comparison", inspectionId: exit.id }), deliveryAccess: deliveryAccessForPurpose("inspection_comparison") });
    await createStoredFileRecord({ companyId: access.company.id, entityType: "inspection_comparison", entityId: comparisonId, file: uploaded, uploadedBy: access.appUser.id, purpose: "inspection_comparison", metadata: { inspection_id: exit.id, baseline_inspection_id: entry.id, comparison, comparison_hash: hash } });
    await getPrisma().$transaction(async (tx) => event(tx, access.company.id, exit.id, access.appUser.id, "inspection.comparison_generated", { comparison_id: comparisonId, baseline_inspection_id: entry.id, comparison_hash: hash }));
    const file = await getPrisma().storedFile.findFirstOrThrow({ where: { companyId: access.company.id, entityType: "inspection_comparison", entityId: comparisonId, purpose: "inspection_comparison" } });
    res.status(201).json({ comparison, report: artifactDto(file, file.metadataJson, await privateArtifactUrl(file, "inspection_comparison")) });
  } catch (error) { next(error); }
});

export { inspectionTypes, inspectionStatuses, itemConditions, nextStatus, ensureMutable, IdempotencyConflictError };
