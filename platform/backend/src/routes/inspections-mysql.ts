import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { assertInspectionAccess, assertPropertyAccess, buildInspectionScopeFilter } from "../services/authorization.js";
import { IdempotencyConflictError, resolveIdempotencyKey, withIdempotency } from "../services/idempotency.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
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

export { inspectionTypes, inspectionStatuses, itemConditions, nextStatus, ensureMutable, IdempotencyConflictError };
