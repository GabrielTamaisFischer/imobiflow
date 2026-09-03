import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission, requireRole } from "../middleware/auth.js";
import { ensureDefaultCrmPipeline } from "../services/crm-bootstrap.js";
import { normalizeLeadEmail, normalizeLeadPhone } from "../services/lead-intake.js";
import { saoPauloDayBounds } from "../services/crm-time.js";
import {
  assertLeadAccess,
  buildLeadScopeFilter,
  canManageLeadSharing,
  resolveScope,
  resourcePermissions,
} from "../services/authorization.js";
import { writeAuthAudit } from "../services/mysql-auth.js";
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
// Fase 2.2C — payloads de compartilhamento explícito de Lead (mesmo padrão
// da Fase 2.2B/PropertyAccess). `user_id` nunca vem acompanhado de
// company_id/role no body: a empresa e a elegibilidade do destinatário são
// sempre resolvidas no backend via resolveLeadShareTarget.
function uniquePermissions(list: string[]) {
  return new Set(list).size === list.length;
}
const leadAccessGrantSchema = z.object({
  user_id: z.string().uuid(),
  permissions: z
    .array(z.enum(resourcePermissions))
    .min(1)
    .refine(uniquePermissions, { message: "Permissões duplicadas não são permitidas." }),
});
const leadAccessReplaceSchema = z.object({
  user_id: z.string().uuid(),
  permissions: z
    .array(z.enum(resourcePermissions))
    .refine(uniquePermissions, { message: "Permissões duplicadas não são permitidas." }),
});
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
function leadSharingDenied() {
  return Object.assign(new Error("Você não tem autorização para gerenciar o compartilhamento deste lead."), {
    statusCode: 403,
    code: "LEAD_SHARING_DENIED",
  });
}
function leadAccessNotFound() {
  return Object.assign(new Error("Compartilhamento não encontrado."), {
    statusCode: 404,
    code: "LEAD_ACCESS_NOT_FOUND",
  });
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
async function assignedForRequest(req: RequestWithAccess, userId: string | undefined) {
  const assignedTo = await assignedFor(req.access!.company.id, userId);
  if (
    assignedTo &&
    resolveScope(req.access!, "crm.manage") !== "company" &&
    assignedTo !== req.access!.appUser.id
  ) {
    throw invalid("Corretor não pode atribuir lead a outro usuário.", "ASSIGNEE_SCOPE_DENIED");
  }
  return assignedTo;
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

// ---------------------------------------------------------------------------
// Fase 2.2C — Compartilhamento explícito de Lead (LeadAccess)
//
// Mesma arquitetura já homologada em staging na Fase 2.2B (PropertyAccess):
// um Lead continua tendo um responsável principal (assignedTo), e o
// compartilhamento via LeadAccess NUNCA troca esse responsável — apenas
// concede acesso adicional a outro usuário da mesma empresa. A tabela
// lead_access já existe desde a Fase 2.1 (mesma migration que criou
// property_access), com a mesma forma (companyId/leadId/userId/permission/
// grantedBy/createdAt, @@unique([leadId,userId,permission])) — nenhuma
// migration nova é necessária.
//
// Diferente de mysql-real-estate.ts, o módulo de CRM/Leads nunca teve uma
// camada de serviço separada: toda a lógica de Lead já vive inline neste
// arquivo de rotas, usando getPrisma() diretamente. Estas funções seguem
// esse mesmo padrão local (em vez de criar um novo services/mysql-crm.ts),
// para não introduzir uma arquitetura nova numa área do código que nunca a
// usou — decisão registrada no relatório final desta tarefa. São exportadas
// (só isso, permanecem definidas aqui) para permitir testes de nível de
// serviço equivalentes aos de mysql-real-estate.ts, sem duplicar setup via
// HTTP em cada teste.
// ---------------------------------------------------------------------------

const leadAccessInclude = {
  user: { select: { id: true, name: true } },
  grantedByUser: { select: { id: true, name: true } },
} satisfies Prisma.LeadAccessInclude;

function serializeLeadAccess(row: {
  id: string;
  leadId: string;
  userId: string;
  user: { name: string } | null;
  permission: string;
  grantedBy: string;
  grantedByUser: { name: string } | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    lead_id: row.leadId,
    user_id: row.userId,
    user_name: row.user?.name ?? null,
    permission: row.permission,
    granted_by: row.grantedBy,
    granted_by_name: row.grantedByUser?.name ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

export async function listLeadAccess(companyId: string, leadId: string, database = getPrisma()) {
  const rows = await database.leadAccess.findMany({
    where: { companyId, leadId },
    include: leadAccessInclude,
    orderBy: [{ createdAt: "asc" as const }],
  });
  return rows.map(serializeLeadAccess);
}

// Item C2 do escopo 2.2C: alvo do compartilhamento precisa ser um AppUser
// ativo da MESMA empresa (companyId sempre de req.access!.company.id, nunca
// do body), com papel que já enxergue Lead (crm.view ou crm.manage) — evita
// conceder acesso "inútil" a um perfil sem nenhuma capacidade de CRM (ex.:
// Financeiro). Auto-compartilhamento é bloqueado.
export async function resolveLeadShareTarget(companyId: string, targetUserId: string, actorUserId: string) {
  if (targetUserId === actorUserId) {
    throw invalid("Não é possível compartilhar um lead com você mesmo.", "INVALID_SHARE_TARGET");
  }
  const user = await getPrisma().appUser.findFirst({
    where: {
      id: targetUserId,
      companyId,
      status: "active",
      roleRecord: { permissions: { some: { permission: { key: { in: ["crm.view", "crm.manage"] } } } } },
    },
    select: { id: true, name: true },
  });
  if (!user) {
    throw invalid("Usuário inválido para compartilhamento nesta empresa.", "INVALID_SHARE_TARGET");
  }
  return user;
}

// GRANT — aditivo e idempotente por permissão, igual à Fase 2.2B: concede
// cada permissão pedida sem remover nenhuma permissão existente do usuário
// que não tenha sido mencionada. Reconceder uma permissão já existente é
// um no-op seguro (upsert sobre a chave composta leadId_userId_permission).
export async function grantLeadAccess(
  companyId: string,
  leadId: string,
  targetUserId: string,
  permissions: string[],
  grantedBy: string,
) {
  const client = getPrisma();
  await client.$transaction(
    permissions.map((permission) =>
      client.leadAccess.upsert({
        where: { leadId_userId_permission: { leadId, userId: targetUserId, permission } },
        create: { companyId, leadId, userId: targetUserId, permission, grantedBy },
        update: {},
      }),
    ),
  );
  return listLeadAccess(companyId, leadId, client);
}

// ATUALIZAÇÃO (replace) — resultado final = exatamente o conjunto de
// permissões pedido para aquele (lead, user). Remove (na mesma transação)
// qualquer permissão fora do conjunto pedido e garante (upsert) as do
// conjunto pedido. permissions:[] revoga todas as permissões daquele
// usuário sobre aquele lead.
export async function replaceLeadAccess(
  companyId: string,
  leadId: string,
  targetUserId: string,
  permissions: string[],
  grantedBy: string,
) {
  const client = getPrisma();
  await client.$transaction([
    client.leadAccess.deleteMany({
      where: {
        companyId,
        leadId,
        userId: targetUserId,
        ...(permissions.length ? { permission: { notIn: permissions } } : {}),
      },
    }),
    ...permissions.map((permission) =>
      client.leadAccess.upsert({
        where: { leadId_userId_permission: { leadId, userId: targetUserId, permission } },
        create: { companyId, leadId, userId: targetUserId, permission, grantedBy },
        update: {},
      }),
    ),
  ]);
  return listLeadAccess(companyId, leadId, client);
}

// REVOGAÇÃO — remove exatamente um LeadAccess por id, escopado por
// company+lead (nunca confia em accessId isolado: IDOR de outra
// empresa/lead sempre retorna null → rota mapeia para 404 tenant-safe).
export async function revokeLeadAccess(companyId: string, leadId: string, accessId: string) {
  return getPrisma().$transaction(async (tx) => {
    const existing = await tx.leadAccess.findFirst({
      where: { id: accessId, companyId, leadId },
      select: { id: true, userId: true, permission: true },
    });
    if (!existing) return null;
    await tx.leadAccess.deleteMany({ where: { id: accessId, companyId, leadId } });
    return existing;
  });
}

async function auditLeadAccessAction(
  req: RequestWithAccess,
  action: "lead.access_granted" | "lead.access_updated" | "lead.access_revoked",
  leadId: string,
  targetUserId: string | null,
  permissions: string[],
  accessId?: string,
) {
  await writeAuthAudit(
    getPrisma(),
    req.access!.company.id,
    req.access!.appUser.id,
    action,
    "lead_access",
    accessId ?? leadId,
    {
      leadId,
      targetUserId,
      permissions,
      timestamp: new Date().toISOString(),
    },
  );
}

crmRouter.get("/pipeline", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try { res.json(await ensureDefaultCrmPipeline(req.access!.company.id, req.access!.appUser.id)); } catch (error) { next(error); }
});

crmRouter.get("/users", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const users = await getPrisma().appUser.findMany({
      where: {
        companyId: req.access!.company.id,
        status: "active",
        roleRecord: { permissions: { some: { permission: { key: { in: ["crm.view", "crm.manage"] } } } } },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, status: true },
    });
    res.json({ users });
  } catch (error) { next(error); }
});

crmRouter.get("/routing", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const config = await getPrisma().crmRoutingConfig.findUnique({ where: { companyId } });
    const members = await getPrisma().crmRoutingMember.findMany({ where: { companyId, active: true }, orderBy: { position: "asc" }, select: { userId: true, position: true, user: { select: { id: true, name: true, status: true } } } });
    res.json({ mode: config?.mode ?? "manual", user_ids: members.map((member) => member.userId), users: members.map((member) => member.user) });
  } catch (error) { next(error); }
});

crmRouter.patch("/routing", requirePermission("crm.manage"), requireRole("owner", "admin", "manager"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id, input = routingSchema.parse(req.body), prisma = getPrisma();
    const users = input.user_ids.length ? await prisma.appUser.findMany({
      where: { id: { in: input.user_ids }, companyId, status: "active" },
      select: { id: true, roleRecord: { select: { companyId: true, permissions: { select: { permission: { select: { key: true } } } } } } },
    }) : [];
    if (users.length !== input.user_ids.length) throw invalid("Usuários elegíveis inválidos para esta empresa.", "INVALID_ROUTING_MEMBER");
    if (users.some((user) => user.roleRecord.companyId !== companyId || !user.roleRecord.permissions.some(({ permission }) => permission.key === "crm.view" || permission.key === "crm.manage"))) throw invalid("Usuário sem acesso ao CRM não pode receber leads.", "CRM_PERMISSION_REQUIRED");
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
    const where: Prisma.LeadWhereInput = {
      companyId,
      status,
      AND: [buildLeadScopeFilter(req.access!, "crm.view")],
    };
    if (typeof req.query.stage_id === "string") where.stageId = await stageFor(companyId, req.query.stage_id);
    if (typeof req.query.assigned_to === "string") where.assignedTo = await assignedFor(companyId, req.query.assigned_to);
    if (typeof req.query.source === "string" && req.query.source.trim()) where.source = req.query.source.trim();
    if (typeof req.query.interest_type === "string") where.interestType = req.query.interest_type;
    if (search) where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : [where.AND!]),
      { OR: [{ name: { contains: search } }, { email: { contains: search } }, { phone: { contains: search } }] },
    ];
    const prisma = getPrisma();
    const [total, rows] = await prisma.$transaction([
      prisma.lead.count({ where }),
      prisma.lead.findMany({ where, select: leadSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ leads: rows.map(serialize), pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize), has_next: page * pageSize < total, has_previous: page > 1 } });
  } catch (error) { next(error); }
});

crmRouter.get("/summary", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id, { start, end } = saoPauloDayBounds(new Date());
    const scope = buildLeadScopeFilter(req.access!, "crm.view");
    const [unassigned, withoutFirstContact, followUpOverdue, followUpToday] = await Promise.all([
      getPrisma().lead.count({ where: { companyId, status: "open", assignedTo: null, AND: [scope] } }),
      getPrisma().lead.count({ where: { companyId, status: "open", firstContactAt: null, AND: [scope] } }),
      getPrisma().lead.count({ where: { companyId, status: "open", nextFollowUpAt: { lt: start }, AND: [scope] } }),
      getPrisma().lead.count({ where: { companyId, status: "open", nextFollowUpAt: { gte: start, lt: end }, AND: [scope] } }),
    ]);
    res.json({ unassigned, without_first_contact: withoutFirstContact, follow_up_overdue: followUpOverdue, follow_up_today: followUpToday });
  } catch (error) { next(error); }
});

crmRouter.get("/leads/:id", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const lead = await getPrisma().lead.findFirst({
      where: { id: req.params.id, AND: [buildLeadScopeFilter(req.access!, "crm.view")] },
      select: leadSelect,
    });
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
    const events = await getPrisma().leadEvent.findMany({ where: { companyId: req.access!.company.id, leadId: lead.id, eventType: { in: ["lead.created", "lead.received", "lead.assigned", "lead.unassigned", "lead.contacted", "lead.stage_changed", "lead.won", "lead.lost"] } }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, eventType: true, createdAt: true, user: { select: { name: true } } } });
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
      events: events.map((event) => ({ id: event.id, event_type: event.eventType, created_at: event.createdAt.toISOString(), user_name: event.user?.name ?? null })),
    });
  } catch (error) { next(error); }
});

crmRouter.post("/leads", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id, userId = req.access!.appUser.id, input = leadSchema.parse(req.body);
    const pipeline = await ensureDefaultCrmPipeline(companyId, userId);
    const stageId = await stageFor(companyId, input.stage_id ?? pipeline.stages[0]?.id);
    const assignedTo = input.assigned_to
      ? await assignedForRequest(req, input.assigned_to)
      : resolveScope(req.access!, "crm.manage") === "company" ? null : userId;
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
    await assertLeadAccess(req.access!, req.params.id, "crm.manage", "EDIT");
    const existing = await getPrisma().lead.findFirst({ where: { id: req.params.id, companyId }, select: { id: true, status: true, stageId: true, assignedTo: true } });
    if (!existing) throw notFound();
    const stageId = await stageFor(companyId, input.stage_id), assignedTo = await assignedForRequest(req, input.assigned_to);
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
    await assertLeadAccess(req.access!, req.params.id, "crm.manage", "EDIT");
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
    await assertLeadAccess(req.access!, req.params.id, "crm.manage", "EDIT");
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

// Fase 2.2C — Compartilhamento explícito de Lead (Diretriz Mestre 9.1/9.2,
// mesma decisão da Fase 2.2B). GET é aberto a qualquer usuário com visão do
// lead (transparência: quem pode ver o lead pode ver com quem ele está
// compartilhado). POST/PUT/DELETE exigem crm.manage E autorização de
// gerenciamento de compartilhamento (canManageLeadSharing — Owner/Admin/
// Manager da empresa, OU o Broker que seja o responsável atual do lead;
// decisão C1). Um Broker com apenas acesso "shared" (inclusive EDIT/
// NEGOTIATE) NUNCA passa em canManageLeadSharing, mesmo que a consulta
// scoped abaixo o autorize a LER/EDITAR o lead — C3 bloqueia explicitamente
// o re-compartilhamento. Não há endpoint duplicado para listar
// destinatários elegíveis: reutiliza-se GET /crm/users (já filtra por
// mesma empresa, status ativo e crm.view/crm.manage — igual à C2).
crmRouter.get("/leads/:id/access", requirePermission("crm.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const leadId = String(req.params.id);
    await assertLeadAccess(req.access!, leadId, "crm.view");
    res.json({ access: await listLeadAccess(companyId, leadId) });
  } catch (error) { next(error); }
});

crmRouter.post("/leads/:id/access", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const leadId = String(req.params.id);
    const input = leadAccessGrantSchema.parse(req.body);
    // buildLeadScopeFilter com EDIT faz o 404 tenant-safe (nunca revela se
    // o lead existe em outra empresa/fora do escopo do ator) e já traz
    // assignedTo na mesma consulta, sem round-trip extra.
    const lead = await getPrisma().lead.findFirst({
      where: { id: leadId, AND: [buildLeadScopeFilter(req.access!, "crm.manage", "EDIT")] },
      select: { id: true, assignedTo: true },
    });
    if (!lead) throw notFound();
    if (!canManageLeadSharing(req.access!, { assignedTo: lead.assignedTo })) {
      throw leadSharingDenied();
    }
    await resolveLeadShareTarget(companyId, input.user_id, req.access!.appUser.id);
    const access = await grantLeadAccess(companyId, leadId, input.user_id, input.permissions, req.access!.appUser.id);
    await auditLeadAccessAction(req, "lead.access_granted", leadId, input.user_id, input.permissions);
    res.status(201).json({ access: access.filter((row) => row.user_id === input.user_id) });
  } catch (error) { next(error); }
});

crmRouter.put("/leads/:id/access", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const leadId = String(req.params.id);
    const input = leadAccessReplaceSchema.parse(req.body);
    const lead = await getPrisma().lead.findFirst({
      where: { id: leadId, AND: [buildLeadScopeFilter(req.access!, "crm.manage", "EDIT")] },
      select: { id: true, assignedTo: true },
    });
    if (!lead) throw notFound();
    if (!canManageLeadSharing(req.access!, { assignedTo: lead.assignedTo })) {
      throw leadSharingDenied();
    }
    await resolveLeadShareTarget(companyId, input.user_id, req.access!.appUser.id);
    const access = await replaceLeadAccess(companyId, leadId, input.user_id, input.permissions, req.access!.appUser.id);
    await auditLeadAccessAction(req, "lead.access_updated", leadId, input.user_id, input.permissions);
    res.json({ access: access.filter((row) => row.user_id === input.user_id) });
  } catch (error) { next(error); }
});

crmRouter.delete("/leads/:id/access/:accessId", requirePermission("crm.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const leadId = String(req.params.id);
    const accessId = String(req.params.accessId);
    const lead = await getPrisma().lead.findFirst({
      where: { id: leadId, AND: [buildLeadScopeFilter(req.access!, "crm.manage", "EDIT")] },
      select: { id: true, assignedTo: true },
    });
    if (!lead) throw notFound();
    if (!canManageLeadSharing(req.access!, { assignedTo: lead.assignedTo })) {
      throw leadSharingDenied();
    }
    const revoked = await revokeLeadAccess(companyId, leadId, accessId);
    if (!revoked) throw leadAccessNotFound();
    await auditLeadAccessAction(req, "lead.access_revoked", leadId, revoked.userId, [revoked.permission], accessId);
    res.json({ ok: true, access_id: accessId });
  } catch (error) { next(error); }
});
