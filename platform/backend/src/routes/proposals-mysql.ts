import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { buildLeadScopeFilter, buildPropertyScopeFilter } from "../services/authorization.js";
import { resolveIdempotencyKey, withIdempotency } from "../services/idempotency.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import type { RequestWithAccess } from "../types/access.js";

export const mysqlProposalsRouter = Router();
mysqlProposalsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

export const proposalStatuses = ["draft", "submitted", "under_review", "accepted", "rejected", "withdrawn", "expired"] as const;
export type ProposalStatus = (typeof proposalStatuses)[number];

const uuid = z.string().uuid();
const decimalText = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const normalized = String(value).trim().replace(",", ".");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(normalized) || Number(normalized) <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valor da proposta inválido." });
    return z.NEVER;
  }
  return normalized;
});
const createSchema = z.object({
  id: uuid.optional(),
  property_id: uuid,
  lead_id: uuid,
  amount: decimalText,
  currency: z.string().trim().length(3).default("BRL"),
  terms_public: z.string().trim().max(4000).optional().nullable(),
  internal_notes: z.string().trim().max(12000).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
}).strict();
const patchSchema = z.object({
  expected_version: z.number().int().positive(),
  amount: decimalText.optional(),
  currency: z.string().trim().length(3).optional(),
  terms_public: z.string().trim().max(4000).optional().nullable(),
  internal_notes: z.string().trim().max(12000).optional().nullable(),
  expires_at: z.string().datetime().optional().nullable(),
}).strict().refine((input) => Object.keys(input).some((key) => key !== "expected_version"), { message: "Informe ao menos um campo para atualizar." });
const transitionSchema = z.object({ expected_version: z.number().int().positive() }).strict();

function invalid(message: string, code = "PROPOSAL_INVALID") {
  return Object.assign(new Error(message), { statusCode: 400, code });
}
function notFound() {
  return Object.assign(new Error("Proposta não encontrada."), { statusCode: 404, code: "PROPOSAL_NOT_FOUND" });
}
function conflict(message = "A proposta foi alterada por outra sessão. Atualize os dados antes de salvar.", code = "PROPOSAL_VERSION_CONFLICT") {
  return Object.assign(new Error(message), { statusCode: 409, code });
}
function serialize(row: any) {
  return {
    id: row.id,
    company_id: row.companyId,
    property_id: row.propertyId,
    lead_id: row.leadId,
    created_by: row.createdBy,
    amount: String(row.amount),
    currency: row.currency,
    status: row.status,
    terms_public: row.termsPublic ?? null,
    internal_notes: row.internalNotes ?? null,
    expires_at: row.expiresAt?.toISOString() ?? null,
    version: row.version,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    property: row.property ? { id: row.property.id, code: row.property.code, title: row.property.title, city: row.property.city, state: row.property.state } : null,
    lead: row.lead ? { id: row.lead.id, name: row.lead.name, status: row.lead.status } : null,
  };
}

export function nextProposalStatus(current: string, requested: ProposalStatus): ProposalStatus {
  if (current === requested) return requested;
  const allowed: Record<string, ProposalStatus[]> = {
    draft: ["submitted", "withdrawn"],
    submitted: ["under_review", "accepted", "rejected", "withdrawn"],
    under_review: ["accepted", "rejected", "withdrawn"],
    accepted: [], rejected: [], withdrawn: [], expired: [],
  };
  if (!allowed[current]?.includes(requested)) throw invalid("Transição de proposta inválida.", "INVALID_PROPOSAL_TRANSITION");
  return requested;
}

function proposalWhere(access: NonNullable<RequestWithAccess["access"]>, permission: string) {
  return {
    companyId: access.company.id,
    lead: { is: buildLeadScopeFilter(access, permission, "NEGOTIATE") },
    property: { is: buildPropertyScopeFilter(access, permission, "NEGOTIATE") },
  } satisfies Prisma.ProposalWhereInput;
}

async function findProposal(req: RequestWithAccess, id: string, permission: string) {
  const access = req.access!;
  const row = await getPrisma().proposal.findFirst({
    where: { id, ...proposalWhere(access, permission) },
    include: { property: { select: { id: true, code: true, title: true, city: true, state: true } }, lead: { select: { id: true, name: true, status: true } } },
  });
  if (!row) throw notFound();
  return row;
}

async function writeEvent(tx: Prisma.TransactionClient, companyId: string, proposalId: string, actorId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await tx.proposalEvent.create({ data: { id: randomUUID(), companyId, proposalId, actorId, eventType, metadataJson: metadata as Prisma.InputJsonValue } });
}

mysqlProposalsRouter.get("/", requirePermission("proposals.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !proposalStatuses.includes(status as ProposalStatus)) throw invalid("Status inválido.", "INVALID_PROPOSAL_STATUS");
    const rows = await getPrisma().proposal.findMany({ where: { ...proposalWhere(access, "proposals.view"), ...(status ? { status } : {}) }, include: { property: { select: { id: true, code: true, title: true, city: true, state: true } }, lead: { select: { id: true, name: true, status: true } } }, orderBy: { updatedAt: "desc" }, take: 100 });
    res.json({ proposals: rows.map(serialize) });
  } catch (error) { next(error); }
});

mysqlProposalsRouter.get("/:id", requirePermission("proposals.view"), async (req: RequestWithAccess, res, next) => {
  try { res.json({ proposal: serialize(await findProposal(req, String(req.params.id), "proposals.view")) }); } catch (error) { next(error); }
});

mysqlProposalsRouter.post("/", requirePermission("proposals.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const access = req.access!;
    const companyId = access.company.id;
    const property = await getPrisma().property.findFirst({ where: { id: input.property_id, AND: [buildPropertyScopeFilter(access, "proposals.manage", "NEGOTIATE")] }, select: { id: true } });
    const lead = await getPrisma().lead.findFirst({ where: { id: input.lead_id, AND: [buildLeadScopeFilter(access, "proposals.manage", "NEGOTIATE")] }, select: { id: true, companyId: true } });
    if (!property || !lead || lead.companyId !== companyId) throw notFound();
    const id = input.id ?? randomUUID();
    const key = resolveIdempotencyKey(req, `proposal.create:${id}`);
    const result = await withIdempotency(companyId, "proposal.create", key, async () => {
      const row = await getPrisma().$transaction(async (tx) => {
        const created = await tx.proposal.create({ data: { id, companyId, propertyId: property.id, leadId: lead.id, createdBy: access.appUser.id, amount: input.amount, currency: input.currency.toUpperCase(), termsPublic: input.terms_public ?? null, internalNotes: input.internal_notes ?? null, expiresAt: input.expires_at ? new Date(input.expires_at) : null } });
        await writeEvent(tx, companyId, created.id, access.appUser.id, "proposal.created", { status: created.status });
        return created;
      });
      return { proposal: serialize(row) };
    });
    res.status(result.replayed ? 200 : 201).json({ ...result.result, replayed: result.replayed });
  } catch (error) { next(error); }
});

mysqlProposalsRouter.patch("/:id", requirePermission("proposals.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = patchSchema.parse(req.body);
    const current = await findProposal(req, String(req.params.id), "proposals.manage");
    if (["accepted", "rejected", "withdrawn", "expired"].includes(current.status)) throw conflict("A proposta finalizada não pode ser editada.", "PROPOSAL_IMMUTABLE");
    const data: Prisma.ProposalUpdateManyMutationInput = {};
    if (input.amount !== undefined) data.amount = input.amount;
    if (input.currency !== undefined) data.currency = input.currency.toUpperCase();
    if (input.terms_public !== undefined) data.termsPublic = input.terms_public;
    if (input.internal_notes !== undefined) data.internalNotes = input.internal_notes;
    if (input.expires_at !== undefined) data.expiresAt = input.expires_at ? new Date(input.expires_at) : null;
    const access = req.access!;
    const updated = await getPrisma().$transaction(async (tx) => {
      const result = await tx.proposal.updateMany({ where: { id: current.id, companyId: access.company.id, version: input.expected_version }, data: { ...data, version: { increment: 1 } } });
      if (result.count !== 1) throw conflict();
      const row = await tx.proposal.findUniqueOrThrow({ where: { id: current.id }, include: { property: { select: { id: true, code: true, title: true, city: true, state: true } }, lead: { select: { id: true, name: true, status: true } } } });
      await writeEvent(tx, access.company.id, current.id, access.appUser.id, "proposal.updated", { expected_version: input.expected_version });
      return row;
    });
    res.json({ proposal: serialize(updated) });
  } catch (error) { next(error); }
});

async function transition(req: RequestWithAccess, id: string, requested: ProposalStatus) {
  const input = transitionSchema.parse(req.body);
  const current = await findProposal(req, id, "proposals.manage");
  const status = nextProposalStatus(current.status, requested);
  if (status === current.status) return { row: current, replayed: true };
  const access = req.access!;
  const row = await getPrisma().$transaction(async (tx) => {
    const result = await tx.proposal.updateMany({ where: { id, companyId: access.company.id, version: input.expected_version, status: current.status }, data: { status, version: { increment: 1 } } });
    if (result.count !== 1) throw conflict();
    const updated = await tx.proposal.findUniqueOrThrow({ where: { id }, include: { property: { select: { id: true, code: true, title: true, city: true, state: true } }, lead: { select: { id: true, name: true, status: true } } } });
    await writeEvent(tx, access.company.id, id, access.appUser.id, `proposal.${status}`, { expected_version: input.expected_version });
    return updated;
  });
  return { row, replayed: false };
}

for (const [path, status] of [["submit", "submitted"], ["review", "under_review"], ["accept", "accepted"], ["reject", "rejected"], ["withdraw", "withdrawn"]] as const) {
  mysqlProposalsRouter.post(`/:id/${path}`, requirePermission("proposals.manage"), async (req: RequestWithAccess, res, next) => {
    try { const result = await transition(req, String(req.params.id), status); res.status(result.replayed ? 200 : 201).json({ proposal: serialize(result.row), replayed: result.replayed }); } catch (error) { next(error); }
  });
}
