import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { buildLeadScopeFilter, buildPropertyScopeFilter } from "../services/authorization.js";
import { resolveIdempotencyKey, withIdempotency } from "../services/idempotency.js";
import { cancelAppointmentReminders, upsertAppointmentReminder } from "../services/notification-dispatcher.js";
import type { RequestWithAccess } from "../types/access.js";

export const mysqlAppointmentsRouter = Router();
mysqlAppointmentsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

export const appointmentStatuses = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"] as const;
export const appointmentTypes = ["visit", "return", "meeting", "inspection", "signature", "follow_up", "event", "task"] as const;
// Tipos que exigem vinculo obrigatorio com um imovel cadastrado (ex.: Visita a imovel).
const typesRequiringProperty = new Set<(typeof appointmentTypes)[number]>(["visit"]);

const appointmentInputShape = z.object({
  id: z.string().uuid(),
  // Lead e imovel sao opcionais: Evento e Tarefa nao exigem vinculo comercial.
  lead_id: z.string().uuid().optional().nullable(),
  property_id: z.string().uuid().optional().nullable(),
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
const appointmentInput = appointmentInputShape.superRefine((value, ctx) => {
  if (typesRequiringProperty.has(value.appointment_type) && !value.property_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["property_id"], message: "Visita a imovel exige um imovel vinculado." });
  }
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
  metadata: z.record(z.unknown()).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "expected_version"), {
  message: "Informe ao menos um campo para atualizar.",
});

const lifecycleInput = z.object({ expected_version: z.number().int().positive() });

const include = {
  lead: { select: { id: true, name: true, email: true, phone: true, assignedTo: true } },
  property: { select: { id: true, code: true, title: true, street: true, number: true, neighborhood: true, city: true, state: true, responsibleUserId: true } },
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
    scheduled: ["confirmed", "in_progress", "completed", "cancelled", "no_show"],
    confirmed: ["in_progress", "completed", "cancelled", "no_show"],
    in_progress: ["completed", "cancelled"],
    cancelled: [],
    completed: [],
    no_show: [],
  };
  return allowed[current]?.includes(requested) ?? false;
}

function ensureDateRange(startsAt: Date, endsAt: Date) {
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    throw invalid("A data final deve ser posterior à data inicial.", "INVALID_APPOINTMENT_TIME");
  }
}

async function assertProperty(req: RequestWithAccess, propertyId?: string | null) {
  if (!propertyId) return;
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
  // Qualquer usuario ativo da empresa com permissao de agenda pode ser responsavel
  // (nao apenas corretores) - owner, admin, gerente, assistente etc.
  const responsible = await db().appUser.findFirst({
    where: {
      id: assignedTo,
      companyId: req.access!.company.id,
      status: "active",
      roleRecord: {
        permissions: { some: { permission: { key: "appointments.view" } } },
      },
    },
    select: { id: true },
  });
  if (!responsible) throw invalid("Responsável inválido para esta empresa.", "INVALID_APPOINTMENT_ASSIGNEE");
}

async function findAccessible(req: RequestWithAccess, id: string) {
  const row = await db().appointment.findFirst({
    where: {
      id,
      companyId: req.access!.company.id,
      OR: [
        { propertyId: null },
        { property: { is: buildPropertyScopeFilter(req.access!, "appointments.view", "VISIT") } },
      ],
      AND: [{ OR: [{ leadId: null }, { lead: { is: buildLeadScopeFilter(req.access!, "crm.view", "VIEW") } }] }],
    },
    include,
  });
  if (!row) throw notFound();
  return row;
}

async function writeEvent(tx: any, companyId: string, appointmentId: string, actorId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await tx.appointmentEvent.create({ data: { id: randomUUID(), companyId, appointmentId, actorId, eventType, metadataJson: metadata } });
}

async function scheduleReminderIfEnabled(req: RequestWithAccess, appointment: any) {
  if (!appointment.reminderAt || !appointment.assignee?.email) return;
  const preferences = await db().agendaUserPreference.findUnique({
    where: { companyId_userId: { companyId: req.access!.company.id, userId: appointment.assignedTo } },
    select: { notifyEnabled: true, notifyOnlyConfirmed: true },
  });
  if (preferences?.notifyEnabled === false) return;
  if (preferences?.notifyOnlyConfirmed && appointment.status !== "confirmed") return;
  await upsertAppointmentReminder({
    companyId: req.access!.company.id,
    appointmentId: appointment.id,
    actorId: req.access!.appUser.id,
    recipientId: appointment.assignedTo ?? null,
    recipientName: appointment.assignee.name,
    recipientContact: appointment.assignee.email,
    scheduledFor: appointment.reminderAt.toISOString(),
    title: appointment.title,
    startsAt: appointment.startsAt.toISOString(),
  });
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
    const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 120) : "";
    const typesParam = typeof req.query.types === "string" ? req.query.types : undefined;
    const types = typesParam
      ? typesParam.split(",").map((item) => item.trim()).filter((item): item is (typeof appointmentTypes)[number] => (appointmentTypes as readonly string[]).includes(item))
      : undefined;
    const rows = await db().appointment.findMany({
      where: {
        companyId: access.company.id,
        ...(status ? { status } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(leadId ? { leadId } : {}),
        ...(assignedTo ? { assignedTo } : {}),
        ...(types && types.length ? { appointmentType: { in: types } } : {}),
        ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
        OR: [
          { propertyId: null },
          { property: { is: buildPropertyScopeFilter(access, "appointments.view", "VISIT") } },
        ],
        AND: [
          { OR: [{ leadId: null }, { lead: { is: buildLeadScopeFilter(access, "crm.view", "VIEW") } }] },
          ...(search ? [{ OR: [
            { title: { contains: search } },
            { description: { contains: search } },
            { locationText: { contains: search } },
            { lead: { is: { name: { contains: search } } } },
            { property: { is: { OR: [{ title: { contains: search } }, { code: { contains: search } }, { city: { contains: search } }] } } },
            { assignee: { is: { name: { contains: search } } } },
          ] }] : []),
        ],
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
    if (input.property_id) await assertProperty(req, input.property_id);
    if (input.lead_id) await assertLead(req, input.lead_id);
    await assertBroker(req, input.assigned_to);
    const key = resolveIdempotencyKey(req, `appointment.create:${input.id}`);
    const { result, replayed } = await withIdempotency(access.company.id, "appointment.create", key, async () => {
      const row = await db().$transaction(async (tx: any) => {
        const appointment = await tx.appointment.create({ data: {
          id: input.id, companyId: access.company.id, leadId: input.lead_id ?? null, propertyId: input.property_id ?? null,
          assignedTo: input.assigned_to, createdBy: access.appUser.id, appointmentType: input.appointment_type,
          title: input.title, description: input.description ?? null, locationText: input.location_text ?? null,
          startsAt: input.starts_at, endsAt, reminderAt: input.reminder_at ?? null, metadata: input.metadata ?? {}, status: "scheduled",
        } });
        await writeEvent(tx, access.company.id, appointment.id, access.appUser.id, "appointment.created", { property_id: appointment.propertyId, lead_id: appointment.leadId, assigned_to: appointment.assignedTo });
        return tx.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include });
      });
      return { appointment: serialize(row) };
    });
    await scheduleReminderIfEnabled(req, {
      ...result.appointment,
      reminderAt: result.appointment.reminder_at ? new Date(result.appointment.reminder_at) : null,
      assignedTo: result.appointment.assigned_to,
      startsAt: new Date(result.appointment.starts_at),
      status: result.appointment.status,
      title: result.appointment.title,
      assignee: result.appointment.assignee,
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
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      version: { increment: 1 },
    };
    const updated = await db().$transaction(async (tx: any) => {
      const result = await tx.appointment.updateMany({ where: { id: current.id, companyId: req.access!.company.id, version: input.expected_version, status: "scheduled" }, data });
      if (result.count !== 1) throw conflict();
      await writeEvent(tx, req.access!.company.id, current.id, req.access!.appUser.id, "appointment.rescheduled", { expected_version: input.expected_version, starts_at: startsAt.toISOString() });
      return tx.appointment.findUniqueOrThrow({ where: { id: current.id }, include });
    });
    if (updated.reminderAt) await scheduleReminderIfEnabled(req, updated);
    else if (input.reminder_at === null) await cancelAppointmentReminders(req.access!.company.id, updated.id);
    res.json({ appointment: serialize(updated) });
  } catch (error) { next(error); }
});

async function transition(req: RequestWithAccess, id: string, requested: (typeof appointmentStatuses)[number], expectedVersion: number) {
  const current = await findAccessible(req, id);
  if (current.status === requested) return { row: current, replayed: true };
  if (!canTransitionAppointment(current.status, requested)) throw conflict("Transição de status inválida.", "INVALID_APPOINTMENT_TRANSITION");
  const row = await db().$transaction(async (tx: any) => {
    const result = await tx.appointment.updateMany({ where: { id, companyId: req.access!.company.id, status: current.status, version: expectedVersion }, data: { status: requested, version: { increment: 1 } } });
    if (result.count !== 1) throw conflict();
    await writeEvent(tx, req.access!.company.id, id, req.access!.appUser.id, `appointment.${requested}`, { expected_version: expectedVersion });
    return tx.appointment.findUniqueOrThrow({ where: { id }, include });
  });
  if (requested === "cancelled") await cancelAppointmentReminders(req.access!.company.id, id);
  return { row, replayed: false };
}

mysqlAppointmentsRouter.post("/:id/cancel", requirePermission("appointments.manage"), async (req: RequestWithAccess, res, next) => {
  try { const input = lifecycleInput.parse(req.body); const result = await transition(req, String(req.params.id), "cancelled", input.expected_version); res.json({ appointment: serialize(result.row), replayed: result.replayed }); } catch (error) { next(error); }
});

mysqlAppointmentsRouter.post("/:id/complete", requirePermission("appointments.manage"), async (req: RequestWithAccess, res, next) => {
  try { const input = lifecycleInput.parse(req.body); const result = await transition(req, String(req.params.id), "completed", input.expected_version); res.json({ appointment: serialize(result.row), replayed: result.replayed }); } catch (error) { next(error); }
});

const statusTransitionInput = z.object({ expected_version: z.number().int().positive(), status: z.enum(appointmentStatuses) });

// Endpoint generico de transicao (confirmar, iniciar, marcar nao compareceu, etc.) alem dos atalhos acima.
mysqlAppointmentsRouter.post("/:id/status", requirePermission("appointments.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = statusTransitionInput.parse(req.body);
    const result = await transition(req, String(req.params.id), input.status, input.expected_version);
    res.json({ appointment: serialize(result.row), replayed: result.replayed });
  } catch (error) { next(error); }
});

export { appointmentInput, patchInput, lifecycleInput };
