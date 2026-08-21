import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { ensureDefaultCrmPipeline } from "../services/crm-bootstrap.js";
import { normalizeLeadEmail, normalizeLeadPhone } from "../services/lead-intake.js";
import type { RequestWithAccess } from "../types/access.js";

export const crmRouter = Router();
crmRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const statuses = z.enum(["open", "won", "lost", "archived"]);
const leadSchema = z.object({
  name: z.string().trim().min(2).max(180),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(3).max(40).optional().or(z.literal("")),
  source: z.string().max(80).optional().or(z.literal("")),
  interest_type: z.enum(["sale", "rent", "both", "not_defined"]).default("not_defined"),
  stage_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().optional(),
  budget_cents: z.number().int().nonnegative().optional(),
  property_reference: z.string().max(160).optional().or(z.literal("")),
  notes: z.string().max(4000).optional().or(z.literal("")),
  next_follow_up_at: z.string().datetime().optional().or(z.literal("")),
});
const updateLeadSchema = leadSchema.partial().extend({
  status: statuses.optional(),
  lost_reason: z.string().max(500).optional().or(z.literal("")),
  last_contact_at: z.string().datetime().optional().or(z.literal("")),
});
const stageMoveSchema = z.object({ stage_id: z.string().uuid() });
const activitySchema = z.object({ type: z.enum(["note", "call", "whatsapp", "email", "contact", "other"]), body: z.string().max(4000).optional().or(z.literal("")), occurred_at: z.string().datetime().optional() });
const routingSchema = z.object({ mode: z.enum(["manual", "round_robin"]), user_ids: z.array(z.string().uuid()).max(100).default([]) });
const leadSelect = {
  id: true, companyId: true, stageId: true, assignedTo: true, name: true, email: true, phone: true,
  source: true, interestType: true, status: true, lostReason: true, budgetCents: true,
  propertyReference: true, notes: true, firstContactAt: true, lastContactAt: true, nextFollowUpAt: true, createdAt: true, updatedAt: true,
} as const;
type LeadRow = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;
const nil = (value?: string | null) => value || null;

function serialize(lead: LeadRow) {
  return {
    id: lead.id, company_id: lead.companyId, stage_id: lead.stageId, assigned_to: lead.assignedTo,
    name: lead.name, email: lead.email, phone: lead.phone, source: lead.source,
    interest_type: lead.interestType, status: lead.status, lost_reason: lead.lostReason,
    budget_cents: lead.budgetCents, property_reference: lead.propertyReference, notes: lead.notes,
    first_contact_at: lead.firstContactAt?.toISOString() ?? null, last_contact_at: lead.lastContactAt?.toISOString() ?? null, next_follow_up_at: lead.nextFollowUpAt?.toISOString() ?? null,
    created_at: lead.createdAt.toISOString(), updated_at: lead.updatedAt.toISOString(),
  };
}

function notFound() {
  return Object.assign(new Error("Lead não encontrado."), { statusCode: 404, code: "LEAD_NOT_FOUND" });
}
function invalid(message: string, code: string) {
  return Object.assign(new Error(message), { statusCode: 422, code });
}
async function stageFor(companyId: string, stageId: string | undefined) {
  if (!stageId) return null;
  const stage = await getPrisma().crmStage.findFirst({ where: { id: stageId, companyId, status: "active" } });
  if (!stage) throw invalid("Etapa do funil inválida para esta empresa.", "INVALID_STAGE");
  return stage.id;
}
async function assignedFor(companyId: string, userId: string | undefined) {
  if (!userId) return null;
  const user = await getPrisma().appUser.findFirst({ where: { id: userId, companyId, status: "active" }, select: { id: true } });
  if (!user) throw invalid("Responsável inválido para esta empresa.", "INVALID_ASSIGNEE");
  return user.id;
}
function inputData(input: z.infer<typeof updateLeadSchema>) {
  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: nil(input.email), emailNormalized: normalizeLeadEmail(input.email) } : {}),
    ...(input.phone !== undefined ? { phone: nil(input.phone), phoneNormalized: normalizeLeadPhone(input.phone) } : {}),
    ...(input.source !== undefined ? { source: input.source || "manual" } : {}),
    ...(input.interest_type !== undefined ? { interestType: input.interest_type } : {}),
    ...(input.budget_cents !== undefined ? { budgetCents: input.budget_cents } : {}),
    ...(input.property_reference !== undefined ? { propertyReference: nil(input.property_reference) } : {}),
    ...(input.notes !== undefined ? { notes: nil(input.notes) } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.lost_reason !== undefined ? { lostReason: nil(input.lost_reason) } : {}),
    ...(input.last_contact_at !== undefined ? { lastContactAt: input.last_contact_at ? new Date(input.last_contact_at) : null } : {}),
    ...(input.next_follow_up_at !== undefined ? { nextFollowUpAt: input.next_follow_up_at ? new Date(input.next_follow_up_at) : null } : {}),
  };
}
function ensureStatusRules(input: z.infer<typeof updateLeadSchema>) {
  if (input.status === "lost" && !input.lost_reason?.trim()) throw invalid("O motivo da perda é obrigatório.", "LOST_REASON_REQUIRED");
}

crmRouter.get("/pipeline", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try { res.json(await ensureDefaultCrmPipeline(req.access!.company.id, req.access!.appUser.id)); } catch (error) { next(error); }
});

crmRouter.get("/routing", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const config = await getPrisma().crmRoutingConfig.findUnique({ where: { companyId } });
    const members = await getPrisma().crmRoutingMember.findMany({ where: { companyId, active: true }, orderBy: { position: "asc" }, select: { userId: true, position: true, user: { select: { id: true, name: true, status: true } } } });
    res.json({ mode: config?.mode ?? "manual", user_ids: members.map((member) => member.userId), users: members.map((member) => member.user) });
  } catch (error) { next(error); }
});

crmRouter.patch("/routing", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id, input = routingSchema.parse(req.body), prisma = getPrisma();
    const users = input.user_ids.length ? await prisma.appUser.findMany({ where: { id: { in: input.user_ids }, companyId, status: "active" }, select: { id: true } }) : [];
    if (users.length !== input.user_ids.length) throw invalid("Usuários elegíveis inválidos para esta empresa.", "INVALID_ROUTING_MEMBER");
    await prisma.$transaction(async (tx) => {
      await tx.crmRoutingConfig.upsert({ where: { companyId }, create: { companyId, mode: input.mode }, update: { mode: input.mode } });
      await tx.crmRoutingMember.deleteMany({ where: { companyId } });
      if (users.length) await tx.crmRoutingMember.createMany({ data: users.map((user, position) => ({ companyId, userId: user.id, position, active: true })) });
    });
    res.json({ mode: input.mode, user_ids: input.user_ids });
  } catch (error) { next(error); }
});

crmRouter.get("/leads", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const rawPage = String(req.query.page ?? "1");
    const rawSize = String(req.query.page_size ?? "25");
    const page = Number(rawPage), pageSize = Number(rawSize);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw invalid("Paginação inválida.", "INVALID_PAGINATION");
    const status = typeof req.query.status === "string" ? req.query.status : "open";
    if (!statuses.options.includes(status as never)) throw invalid("Status inválido.", "INVALID_STATUS");
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const where: Prisma.LeadWhereInput = { companyId, status };
    if (typeof req.query.stage_id === "string") where.stageId = await stageFor(companyId, req.query.stage_id);
    if (typeof req.query.assigned_to === "string") where.assignedTo = await assignedFor(companyId, req.query.assigned_to);
    if (typeof req.query.source === "string" && req.query.source.trim()) where.source = req.query.source.trim();
    if (typeof req.query.interest_type === "string") where.interestType = req.query.interest_type;
    if (search) where.OR = [{ name: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }];
    const prisma = getPrisma();
    const [total, rows] = await prisma.$transaction([
      prisma.lead.count({ where }),
      prisma.lead.findMany({ where, select: leadSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ leads: rows.map(serialize), pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize), has_next: page * pageSize < total, has_previous: page > 1 } });
  } catch (error) { next(error); }
});

crmRouter.get("/leads/:id", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const lead = await getPrisma().lead.findFirst({ where: { id: req.params.id, companyId: req.access!.company.id }, select: leadSelect });
    if (!lead) throw notFound();
    const interests = await getPrisma().siteLead.findMany({
      where: { companyId: req.access!.company.id, leadId: lead.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, propertyId: true, createdAt: true, metadata: true,
        property: { select: { code: true, title: true, operation: true } },
      },
      take: 25,
    });
    const activities = await getPrisma().leadActivity.findMany({ where: { companyId: req.access!.company.id, leadId: lead.id }, orderBy: { occurredAt: "desc" }, take: 25, select: { id: true, type: true, body: true, occurredAt: true, user: { select: { name: true } } } });
    res.json({
      lead: serialize(lead),
      interests: interests.map((interest) => ({
        id: interest.id,
        property_id: interest.propertyId,
        property_code: interest.property?.code ?? null,
        property_title: interest.property?.title ?? null,
        operation: interest.property?.operation ?? null,
        created_at: interest.createdAt.toISOString(),
        source: typeof interest.metadata === "object" && interest.metadata && "channel" in interest.metadata
          ? String((interest.metadata as Record<string, unknown>).channel)
          : "site",
      })),
      activities: activities.map((activity) => ({ id: activity.id, type: activity.type, body: activity.body, occurred_at: activity.occurredAt.toISOString(), user_name: activity.user?.name ?? null })),
    });
  } catch (error) { next(error); }
});

crmRouter.post("/leads", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id, userId = req.access!.appUser.id, input = leadSchema.parse(req.body);
    const pipeline = await ensureDefaultCrmPipeline(companyId, userId);
    const stageId = await stageFor(companyId, input.stage_id ?? pipeline.stages[0]?.id);
    const assignedTo = await assignedFor(companyId, input.assigned_to);
    const lead = await getPrisma().$transaction(async (tx) => {
      const created = await tx.lead.create({ data: { companyId, createdBy: userId, stageId, assignedTo, name: input.name, ...inputData(input) }, select: leadSelect });
      await tx.leadEvent.create({ data: { companyId, leadId: created.id, userId, eventType: "lead.created", payloadJson: { source: created.source, stage_id: created.stageId } as Prisma.InputJsonValue } });
      return created;
    });
    res.status(201).json({ lead: serialize(lead) });
  } catch (error) { next(error); }
});

crmRouter.patch("/leads/:id", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id, userId = req.access!.appUser.id, input = updateLeadSchema.parse(req.body);
    ensureStatusRules(input);
    const existing = await getPrisma().lead.findFirst({ where: { id: req.params.id, companyId }, select: { id: true, status: true, stageId: true, assignedTo: true } });
    if (!existing) throw notFound();
    const stageId = await stageFor(companyId, input.stage_id), assignedTo = await assignedFor(companyId, input.assigned_to);
    const lead = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.lead.update({ where: { id: existing.id }, data: { ...inputData(input), ...(input.stage_id !== undefined ? { stageId } : {}), ...(input.assigned_to !== undefined ? { assignedTo } : {}) }, select: leadSelect });
      const eventType = input.status === "won" ? "lead.won" : input.status === "lost" ? "lead.lost" : input.stage_id !== undefined && input.stage_id !== existing.stageId ? "lead.stage_changed" : "lead.updated";
      const payload = eventType === "lead.lost"
        ? { reason: updated.lostReason }
        : eventType === "lead.stage_changed"
          ? { from_stage_id: existing.stageId, to_stage_id: updated.stageId }
          : {};
      await tx.leadEvent.create({ data: { companyId, leadId: updated.id, userId, eventType, payloadJson: payload as Prisma.InputJsonValue } });
      if (input.assigned_to !== undefined && input.assigned_to !== existing.assignedTo) {
        await tx.leadEvent.create({ data: { companyId, leadId: updated.id, userId, eventType: updated.assignedTo ? "lead.assigned" : "lead.unassigned", payloadJson: updated.assignedTo ? { assigned_to: updated.assignedTo, assignment_mode: "manual" } : {} } });
      }
      return updated;
    });
    res.json({ lead: serialize(lead) });
  } catch (error) { next(error); }
});

crmRouter.post("/leads/:id/activities", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id, userId = req.access!.appUser.id, input = activitySchema.parse(req.body), prisma = getPrisma();
    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, companyId }, select: { id: true, firstContactAt: true, lastContactAt: true } }).catch(() => null);
    if (!lead) throw notFound();
    const occurredAt = input.occurred_at ? new Date(input.occurred_at) : new Date();
    const isContact = ["call", "whatsapp", "email", "contact"].includes(input.type);
    const activity = await prisma.$transaction(async (tx) => {
      const created = await tx.leadActivity.create({ data: { companyId, leadId: lead.id, userId, type: input.type, body: nil(input.body), occurredAt } });
      if (isContact) {
        await tx.lead.update({ where: { id: lead.id }, data: { lastContactAt: occurredAt, ...(lead.firstContactAt ? {} : { firstContactAt: occurredAt }) } });
        if (!lead.firstContactAt) await tx.leadEvent.create({ data: { companyId, leadId: lead.id, userId, eventType: "lead.contacted", payloadJson: { type: input.type } } });
      }
      return created;
    });
    res.status(201).json({ activity: { id: activity.id, type: activity.type, body: activity.body, occurred_at: activity.occurredAt.toISOString() } });
  } catch (error) { next(error); }
});

crmRouter.patch("/leads/:id/stage", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id, userId = req.access!.appUser.id, input = stageMoveSchema.parse(req.body), stageId = await stageFor(companyId, input.stage_id);
    const existing = await getPrisma().lead.findFirst({ where: { id: req.params.id, companyId }, select: { id: true, stageId: true } });
    if (!existing) throw notFound();
    const lead = await getPrisma().$transaction(async (tx) => {
      const updated = await tx.lead.update({ where: { id: existing.id }, data: { stageId }, select: leadSelect });
      await tx.leadEvent.create({ data: { companyId, leadId: updated.id, userId, eventType: "lead.stage_changed", payloadJson: { from_stage_id: existing.stageId, to_stage_id: stageId } as Prisma.InputJsonValue } });
      return updated;
    });
    res.json({ lead: serialize(lead) });
  } catch (error) { next(error); }
});
