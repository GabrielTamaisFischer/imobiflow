import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { buildLeadScopeFilter, buildPropertyScopeFilter } from "../services/authorization.js";
import { resolveIdempotencyKey, withIdempotency } from "../services/idempotency.js";
import type { RequestWithAccess } from "../types/access.js";

export const mysqlAppointmentsRouter = Router();
mysqlAppointmentsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

export const appointmentStatuses = ["scheduled", "cancelled", "completed"] as const;
export const appointmentTypes = ["visit", "return", "meeting", "inspection", "signature", "follow_up"] as const;

const appointmentInput = z.object({
  id: z.string().uuid(),
  lead_id: z.string().uuid(),
  property_id: z.string().uuid(),
  assigned_to: z.string().uuid(),
  appointment_type: z.enum(appointmentTypes).default("visit"),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(1000).optional().nullable(),
  location_text: z.string().trim().max(300).optional().nullable(),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date().optional().nullable(),
  reminder_at: z.coerce.date().optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

const patchInput = z.object({
  expected_version: z.number().int().positive(),
  assigned_to: z.string().uuid().optional(),
  title: z.string().trim().min(2).max(180).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  location_text: z.string().trim().max(300).optional().nullable(),
  starts_at: z.coerce.date().optional(),
  ends_at: z.coerce.date().optional().nullable(),
  reminder_at: z.coerce.date().optional().nullable(),
}).refine((value) => Object.keys(value).some((key) => key !== "expected_version"), {
  message: "Informe ao menos um campo para atualizar.",
});

const lifecycleInput = z.object({ expected_version: z.number().int().positive() });

const include = {
  lead: { select: { id: true, name: true, email: true, phone: true, assignedTo: true } },
  property: { select: { id: true, code: true, title: true, city: true, state: true, responsibleUserId: true } },
  assignee: { select: { id: true, name: true, email: true, role: true } },
  creator: { select: { id: true, name: true, email: true } },
  events: { orderBy: { createdAt: "asc" as const } },
};

const db = () => getPrisma() as any;

function invalid(message: string, code = "APPOINTMENT_INVALID") {
  return Object.assign(new Error(message), { statusCode: 422, code });
}

function notFound() {
  return Object.assign(new Error("Agendamento não encontrado."), { statusCode: 404, code: "APPOINTMENT_NOT_FOUND" });
}

function conflict(message = "O agendamento foi alterado por outra operação.", code = "APPOINTMENT_VERSION_CONFLICT") {
  return Object.assign(new Error(message), { statusCode: 409, code });
}

function serialize(row: any) {
  return {
    id: row.id,
    company_id: row.companyId,
    lead_id: row.leadId,
    property_id: row.propertyId,
    assigned_to: row.assignedTo,
    created_by: row.createdBy,
    appointment_type: row.appointmentType,
    title: row.title,
    description: row.description,
    location_text: row.locationText,
    starts_at: row.startsAt.toISOString(),
    ends_at: row.endsAt.toISOString(),
    reminder_at: row.reminderAt?.toISOString() ?? null,
    status: row.status,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    lead: row.lead,
    property: row.property,
    assignee: row.assignee,
    creator: row.creator,
    events: row.events?.map((event: any) => ({
      id: event.id,
      event_type: event.eventType,
      metadata: event.metadataJson,
      actor_id: event.actorId,
      created_at: event.createdAt.toISOString(),
    })) ?? [],
  };
}

export function canTransitionAppointment(current: string, requested: string) {
  if (current === requested) return true;
  const allowed: Record<string, string[]> = {
    scheduled: ["completed", "cancelled"],
    cancelled: [],
    completed: [],
  };
  return allowed[current]?.includes(requested) ?? false;
}

function ensureDateRange(startsAt: Date, endsAt: Date) {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    throw invalid("A data final deve ser posterior à data inicial.", "INVALID_APPOINTMENT_TIME");
  }
}

async function assertProperty(req: RequestWithAccess, propertyId: string) {
  const property = await db().property.findFirst({
    where: { id: propertyId, companyId: req.access!.company.id, AND: [buildPropertyScopeFilter(req.access!, "appointments.view", "VISIT")] },
    select: { id: true },
  });
  if (!property) throw invalid("Imóvel inválido ou fora do escopo de acesso.", "INVALID_PROPERTY");
}

async function assertLead(req: RequestWithAccess, leadId: string) {
  const lead = await db().lead.findFirst({
    where: { id: leadId, AND: [buildLeadScopeFilter(req.access!, "crm.view", "VIEW")] },
    select: { id: true },
  });
  if (!lead) throw invalid("Lead inválido ou fora do escopo de acesso.", "INVALID_LEAD");
}

async function assertBroker(req: RequestWithAccess, assignedTo: string) {
  const broker = await db().appUser.findFirst({
    where: {
      id: assignedTo,
      companyId: req.access!.company.id,
      status: "active",
      roleRecord: {
        systemKey: "broker",
        permissions: { some: { permission: { key: "appointments.view" } } },
      },
    },
    select: { id: true },
  });
  if (!broker) throw invalid("Responsável inválido para esta empresa.", "INVALID_APPOINTMENT_ASSIGNEE");
}

async function findAccessible(req: RequestWithAccess, id: string) {
  const row = await db().appointment.findFirst({
    where: {
      id,
      companyId: req.access!.company.id,
      property: { is: buildPropertyScopeFilter(req.access!, "appointments.view", "VISIT") },
      lead: { is: buildLeadScopeFilter(req.access!, "crm.view", "VIEW") },
    },
    include,
  });
  if (!row) throw notFound();
  return row;
}

async function writeEvent(tx: any, companyId: string, appointmentId: string, actorId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await tx.appointmentEvent.create({ data: { id: randomUUID(), companyId, appointmentId, actorId, eventType, metadataJson: metadata } });
}

mysqlAppointmentsRouter.get("/", requirePermission("appointments.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const status = typeof req.query.status === "string" && req.query.status !== "all" ? req.query.status : undefined;
    if (status && !appointmentStatuses.includes(status as any)) throw invalid("Status inválido.", "INVALID_APPOINTMENT_STATUS");
    const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;
    if ((from && !Number.isFinite(from.getTime())) || (to && !Number.isFinite(to.getTime()))) throw invalid("Período inválido.", "INVALID_APPOINTMENT_PERIOD");
    const propertyId = typeof req.query.property_id === "string" ? req.query.property_id : undefined;
    const leadId = typeof req.query.lead_id === "string" ? req.query.lead_id : undefined;
    const assignedTo = typeof req.query.assigned_to === "string" ? req.query.assigned_to : undefined;
    const rows = await db().appointment.findMany({
      where: {
        companyId: access.company.id,
        ...(status ? { status } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(leadId ? { leadId } : {}),
        ...(assignedTo ? { assignedTo } : {}),
        ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        property: { is: buildPropertyScopeFilter(access, "appointments.view", "VISIT") },
        lead: { is: buildLeadScopeFilter(access, "crm.view", "VIEW") },
      },
      include,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: 300,
    });
    res.json({ appointments: rows.map(serialize) });
  } catch (error) { next(error); }
});

mysqlAppointmentsRouter.get("/:id", requirePermission("appointments.view"), async (req: RequestWithAccess, res, next) => {
  try { res.json({ appointment: serialize(await findAccessible(req, String(req.params.id))) }); } catch (error) { next(error); }
});

mysqlAppointmentsRouter.post("/", requirePermission("appointments.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const input = appointmentInput.parse(req.body);
    const endsAt = input.ends_at ?? new Date(input.starts_at.getTime() + 60 * 60 * 1000);
    ensureDateRange(input.starts_at, endsAt);
    await assertProperty(req, input.property_id);
    await assertLead(req, input.lead_id);
    await assertBroker(req, input.assigned_to);
    const key = resolveIdempotencyKey(req, `appointment.create:${input.id}`);
    const { result, replayed } = await withIdempotency(access.company.id, "appointment.create", key, async () => {
      const row = await db().$transaction(async (tx: any) => {
        const appointment = await tx.appointment.create({ data: {
          id: input.id, companyId: access.company.id, leadId: input.lead_id, propertyId: input.property_id,
          assignedTo: input.assigned_to, createdBy: access.appUser.id, appointmentType: input.appointment_type,
          title: input.title, description: input.description ?? null, locationText: input.location_text ?? null,
          startsAt: input.starts_at, endsAt, reminderAt: input.reminder_at ?? null, metadata: input.metadata ?? {}, status: "scheduled",
        } });
        await writeEvent(tx, access.company.id, appointment.id, access.appUser.id, "appointment.created", { property_id: appointment.propertyId, lead_id: appointment.leadId, assigned_to: appointment.assignedTo });
        return tx.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include });
      });
      return { appointment: serialize(row) };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) { next(error); }
});

mysqlAppointmentsRouter.patch("/:id", requirePermission("appointments.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const current = await findAccessible(req, String(req.params.id));
    if (current.status !== "scheduled") throw conflict("Agendamento cancelado ou concluído não pode ser remarcado.", "APPOINTMENT_NOT_MUTABLE");
    const input = patchInput.parse(req.body);
    if (input.assigned_to) await assertBroker(req, input.assigned_to);
    const startsAt = input.starts_at ?? current.startsAt;
    const endsAt = input.ends_at === undefined ? current.endsAt : (input.ends_at ?? new Date(startsAt.getTime() + 60 * 60 * 1000));
    ensureDateRange(startsAt, endsAt);
    const data: Record<string, unknown> = {
      ...(input.assigned_to ? { assignedTo: input.assigned_to } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.location_text !== undefined ? { locationText: input.location_text } : {}),
      ...(input.starts_at ? { startsAt } : {}),
      ...(input.ends_at !== undefined || input.starts_at ? { endsAt } : {}),
      ...(input.reminder_at !== undefined ? { reminderAt: input.reminder_at } : {}),
      version: { increment: 1 },
    };
    const updated = await db().$transaction(async (tx: any) => {
      const result = await tx.appointment.updateMany({ where: { id: current.id, companyId: req.access!.company.id, version: input.expected_version, status: "scheduled" }, data });
      if (result.count !== 1) throw conflict();
      await writeEvent(tx, req.access!.company.id, current.id, req.access!.appUser.id, "appointment.rescheduled", { expected_version: input.expected_version, starts_at: startsAt.toISOString() });
      return tx.appointment.findUniqueOrThrow({ where: { id: current.id }, include });
    });
    res.json({ appointment: serialize(updated) });
  } catch (error) { next(error); }
});

async function transition(req: RequestWithAccess, id: string, requested: "cancelled" | "completed", expectedVersion: number) {
  const current = await findAccessible(req, id);
  if (current.status === requested) return { row: current, replayed: true };
  if (!canTransitionAppointment(current.status, requested)) throw conflict("Transição de status inválida.", "INVALID_APPOINTMENT_TRANSITION");
  const row = await db().$transaction(async (tx: any) => {
    const result = await tx.appointment.updateMany({ where: { id, companyId: req.access!.company.id, status: current.status, version: expectedVersion }, data: { status: requested, version: { increment: 1 } } });
    if (result.count !== 1) throw conflict();
    await writeEvent(tx, req.access!.company.id, id, req.access!.appUser.id, `appointment.${requested}`, { expected_version: expectedVersion });
    return tx.appointment.findUniqueOrThrow({ where: { id }, include });
  });
  return { row, replayed: false };
}

mysqlAppointmentsRouter.post("/:id/cancel", requirePermission("appointments.manage"), async (req: RequestWithAccess, res, next) => {
  try { const input = lifecycleInput.parse(req.body); const result = await transition(req, String(req.params.id), "cancelled", input.expected_version); res.json({ appointment: serialize(result.row), replayed: result.replayed }); } catch (error) { next(error); }
});

mysqlAppointmentsRouter.post("/:id/complete", requirePermission("appointments.manage"), async (req: RequestWithAccess, res, next) => {
  try { const input = lifecycleInput.parse(req.body); const result = await transition(req, String(req.params.id), "completed", input.expected_version); res.json({ appointment: serialize(result.row), replayed: result.replayed }); } catch (error) { next(error); }
});

export { appointmentInput, patchInput, lifecycleInput };
