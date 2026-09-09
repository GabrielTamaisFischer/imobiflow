import { randomUUID } from "node:crypto";
import { withIdempotency } from "./idempotency.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import type { RequestWithAccess } from "../types/access.js";

export const financialTypes = ["receivable", "payable"] as const;
export const financialCategories = ["rent", "owner_payout", "commission", "expense", "revenue", "other"] as const;
export const financialStatuses = ["pending", "paid", "overdue", "cancelled"] as const;
export type FinancialType = (typeof financialTypes)[number];
export type FinancialCategory = (typeof financialCategories)[number];
export type FinancialStatus = (typeof financialStatuses)[number];

export type FinancialEntryInput = {
  id?: string;
  type: FinancialType;
  category: FinancialCategory;
  amount: string | number;
  currency?: string;
  description: string;
  due_date?: string | null;
  competence_date?: string | null;
  property_id?: string | null;
  contract_id?: string | null;
  owner_id?: string | null;
  tenant_party_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type FinancialPatchInput = Partial<Omit<FinancialEntryInput, "id" | "type">> & {
  expected_version: number;
};

export function parseMoney(value: unknown) {
  const text = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
    throw invalidFinance("Valor monetário inválido.", "INVALID_FINANCIAL_AMOUNT");
  }
  return Number(text).toFixed(2);
}

export function parseDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw invalidFinance(`Data inválida em ${field}.`, "INVALID_FINANCIAL_DATE");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw invalidFinance(`Data inválida em ${field}.`, "INVALID_FINANCIAL_DATE");
  return date;
}

export function deriveFinancialStatus(status: string, dueDate: Date | null, now = new Date()): FinancialStatus {
  if (status !== "pending") return (financialStatuses as readonly string[]).includes(status) ? status as FinancialStatus : "pending";
  if (!dueDate) return "pending";
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return dueDate.getTime() < today.getTime() ? "overdue" : "pending";
}

export function canMutateFinancialStatus(status: string) {
  return status === "pending" || status === "overdue";
}

export function invalidFinance(message: string, code = "FINANCE_INVALID", statusCode = 422) {
  return Object.assign(new Error(message), { statusCode, code });
}

function notFound() {
  return invalidFinance("Lançamento financeiro não encontrado.", "FINANCIAL_ENTRY_NOT_FOUND", 404);
}

function conflict(message = "O lançamento financeiro foi alterado por outra operação.") {
  return invalidFinance(message, "FINANCIAL_VERSION_CONFLICT", 409);
}

function db() {
  return getPrisma() as any;
}

export function serializeFinancialEntry(row: any) {
  const dueDate = row.dueDate ? new Date(row.dueDate) : null;
  return {
    id: row.id,
    company_id: row.companyId,
    type: row.type,
    category: row.category,
    amount: String(row.amount),
    currency: row.currency,
    description: row.description,
    due_date: dueDate ? dueDate.toISOString().slice(0, 10) : null,
    competence_date: row.competenceDate ? new Date(row.competenceDate).toISOString().slice(0, 10) : null,
    paid_at: row.paidAt ? new Date(row.paidAt).toISOString() : null,
    status: deriveFinancialStatus(row.status, dueDate),
    stored_status: row.status,
    property_id: row.propertyId,
    contract_id: row.contractId,
    owner_id: row.ownerId,
    tenant_party_id: row.tenantPartyId,
    version: row.version,
    metadata: row.metadataJson ?? {},
    property: row.property ? { id: row.property.id, code: row.property.code, title: row.property.title } : null,
    contract: row.contract ? { id: row.contract.id, title: row.contract.title, status: row.contract.status } : null,
    owner: row.owner ? { id: row.owner.id, name: row.owner.name } : null,
    tenant: row.tenantParty ? { id: row.tenantParty.id, name: row.tenantParty.name } : null,
    payment: row.payment ? {
      id: row.payment.id,
      amount: String(row.payment.amount),
      paid_at: new Date(row.payment.paidAt).toISOString(),
      payment_method: row.payment.paymentMethod,
      notes: row.payment.notes,
    } : null,
    created_at: new Date(row.createdAt).toISOString(),
    updated_at: new Date(row.updatedAt).toISOString(),
  };
}

const include = {
  property: { select: { id: true, code: true, title: true } },
  contract: { select: { id: true, title: true, status: true } },
  owner: { select: { id: true, name: true } },
  tenantParty: { select: { id: true, name: true, partyType: true } },
  payment: { select: { id: true, amount: true, paidAt: true, paymentMethod: true, notes: true } },
};

async function assertLinks(companyId: string, input: Partial<FinancialEntryInput>) {
  const prisma = db();
  if (input.property_id) {
    const property = await prisma.property.findFirst({ where: { id: input.property_id, companyId }, select: { id: true } });
    if (!property) throw invalidFinance("Imóvel inválido ou fora da empresa.", "INVALID_PROPERTY");
  }
  if (input.contract_id) {
    const contract = await prisma.contract.findFirst({ where: { id: input.contract_id, companyId }, select: { id: true, propertyId: true } });
    if (!contract) throw invalidFinance("Contrato inválido ou fora da empresa.", "INVALID_CONTRACT");
    if (input.property_id && contract.propertyId !== input.property_id) throw invalidFinance("Contrato e imóvel não pertencem ao mesmo vínculo.", "CONTRACT_PROPERTY_MISMATCH");
  }
  if (input.owner_id) {
    const owner = await prisma.propertyOwner.findFirst({ where: { id: input.owner_id, companyId }, select: { id: true } });
    if (!owner) throw invalidFinance("Proprietário inválido ou fora da empresa.", "INVALID_OWNER");
  }
  if (input.tenant_party_id) {
    const party = await prisma.contractParty.findFirst({ where: { id: input.tenant_party_id, companyId, partyType: "tenant" }, select: { id: true, contractId: true } });
    if (!party) throw invalidFinance("Inquilino inválido ou fora da empresa.", "INVALID_TENANT");
    if (input.contract_id && party.contractId !== input.contract_id) throw invalidFinance("Inquilino não pertence ao contrato informado.", "TENANT_CONTRACT_MISMATCH");
  }
}

export async function findFinancialEntry(companyId: string, id: string) {
  const row = await db().financialEntry.findFirst({ where: { id, companyId }, include });
  if (!row) throw notFound();
  return row;
}

export async function listFinancialEntries(companyId: string, filters: Record<string, string | undefined>) {
  const where: any = { companyId };
  if (filters.type && financialTypes.includes(filters.type as FinancialType)) where.type = filters.type;
  if (filters.category && financialCategories.includes(filters.category as FinancialCategory)) where.category = filters.category;
  if (filters.property_id) where.propertyId = filters.property_id;
  if (filters.contract_id) where.contractId = filters.contract_id;
  if (filters.owner_id) where.ownerId = filters.owner_id;
  if (filters.tenant_party_id) where.tenantPartyId = filters.tenant_party_id;
  if (filters.due_from || filters.due_to) where.dueDate = { ...(filters.due_from ? { gte: parseDate(filters.due_from, "due_from") } : {}), ...(filters.due_to ? { lte: parseDate(filters.due_to, "due_to") } : {}) };
  const rows = await db().financialEntry.findMany({ where, include, orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 250 });
  const entries = rows.map(serializeFinancialEntry);
  return filters.status && filters.status !== "all" ? entries.filter((entry: any) => entry.status === filters.status) : entries;
}

export async function createFinancialEntry(companyId: string, userId: string, input: FinancialEntryInput, idempotencyKey: string) {
  const result = await withIdempotency(companyId, "finance.entries.create", idempotencyKey, async () => {
    await assertLinks(companyId, input);
    const row = await db().financialEntry.create({
      data: {
        id: input.id ?? randomUUID(), companyId, type: input.type, category: input.category,
        amount: parseMoney(input.amount), currency: input.currency ?? "BRL", description: input.description.trim(),
        dueDate: parseDate(input.due_date, "due_date"), competenceDate: parseDate(input.competence_date, "competence_date"),
        propertyId: input.property_id || null, contractId: input.contract_id || null, ownerId: input.owner_id || null,
        tenantPartyId: input.tenant_party_id || null, createdBy: userId, metadataJson: input.metadata ?? {}, status: "pending",
      }, include,
    });
    await db().financialEntryEvent.create({ data: { companyId, entryId: row.id, actorId: userId, eventType: "financial.created", metadataJson: { type: row.type, category: row.category, amount: String(row.amount) } } });
    return { entry: serializeFinancialEntry(row) };
  });
  return { ...result.result, replayed: result.replayed };
}

export async function updateFinancialEntry(companyId: string, userId: string, id: string, input: FinancialPatchInput) {
  const current = await findFinancialEntry(companyId, id);
  if (!canMutateFinancialStatus(current.status)) throw invalidFinance("Lançamentos pagos ou cancelados são protegidos.", "FINANCIAL_ENTRY_IMMUTABLE", 409);
  await assertLinks(companyId, input);
  const data: any = {};
  if (input.category !== undefined) data.category = input.category;
  if (input.amount !== undefined) data.amount = parseMoney(input.amount);
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.due_date !== undefined) data.dueDate = parseDate(input.due_date, "due_date");
  if (input.competence_date !== undefined) data.competenceDate = parseDate(input.competence_date, "competence_date");
  for (const [key, field] of [["property_id", "propertyId"], ["contract_id", "contractId"], ["owner_id", "ownerId"], ["tenant_party_id", "tenantPartyId"]] as const) if (input[key] !== undefined) data[field] = input[key] || null;
  if (input.metadata !== undefined) data.metadataJson = input.metadata;
  data.version = { increment: 1 };
  const updated = await db().financialEntry.updateMany({ where: { id, companyId, version: input.expected_version, status: { in: ["pending"] } }, data });
  if (updated.count !== 1) throw conflict();
  const row = await findFinancialEntry(companyId, id);
  await db().financialEntryEvent.create({ data: { companyId, entryId: id, actorId: userId, eventType: "financial.updated", metadataJson: { version: row.version } } });
  return { entry: serializeFinancialEntry(row) };
}

export async function payFinancialEntry(companyId: string, userId: string, id: string, input: { amount?: string | number; paid_at?: string; payment_method?: string; notes?: string }, idempotencyKey: string) {
  const result = await withIdempotency(companyId, "finance.entries.pay", idempotencyKey, async () => {
    const current = await findFinancialEntry(companyId, id);
    if (!canMutateFinancialStatus(current.status)) {
      if (current.status === "paid") return { entry: serializeFinancialEntry(current), payment: current.payment, already_paid: true };
      throw invalidFinance("Lançamento cancelado não pode ser pago.", "FINANCIAL_ENTRY_IMMUTABLE", 409);
    }
    const paidAt = input.paid_at ? new Date(input.paid_at) : new Date();
    if (!Number.isFinite(paidAt.getTime())) throw invalidFinance("paid_at inválido.", "INVALID_FINANCIAL_DATE");
    const amount = input.amount ? parseMoney(input.amount) : String(current.amount);
    const updated = await db().financialEntry.updateMany({ where: { id, companyId, version: current.version, status: { in: ["pending", "overdue"] } }, data: { status: "paid", paidAt, version: { increment: 1 } } });
    if (updated.count !== 1) throw conflict("O pagamento concorreu com outra operação.");
    const payment = await db().financialPayment.create({ data: { companyId, entryId: id, amount, paidAt, paymentMethod: input.payment_method || null, notes: input.notes || null, createdBy: userId } });
    const row = await findFinancialEntry(companyId, id);
    await db().financialEntryEvent.create({ data: { companyId, entryId: id, actorId: userId, eventType: "financial.paid", metadataJson: { amount, paid_at: paidAt.toISOString() } } });
    return { entry: serializeFinancialEntry(row), payment: { id: payment.id, amount: String(payment.amount), paid_at: paidAt.toISOString() } };
  });
  return { ...result.result, replayed: result.replayed };
}

export async function cancelFinancialEntry(companyId: string, userId: string, id: string, reason?: string) {
  const current = await findFinancialEntry(companyId, id);
  if (!canMutateFinancialStatus(current.status)) throw invalidFinance("Lançamento pago ou já cancelado não pode ser removido.", "FINANCIAL_ENTRY_IMMUTABLE", 409);
  const updated = await db().financialEntry.updateMany({ where: { id, companyId, version: current.version, status: { in: ["pending"] } }, data: { status: "cancelled", version: { increment: 1 }, metadataJson: { ...(current.metadataJson ?? {}), cancel_reason: reason ?? null } } });
  if (updated.count !== 1) throw conflict();
  const row = await findFinancialEntry(companyId, id);
  await db().financialEntryEvent.create({ data: { companyId, entryId: id, actorId: userId, eventType: "financial.cancelled", metadataJson: { reason: reason ?? null } } });
  return { entry: serializeFinancialEntry(row) };
}

export async function listFinancialEntriesForPortal(input: { companyId: string; ownerId?: string; tenantPartyId?: string; contractIds?: string[] }, prisma = db()): Promise<Array<ReturnType<typeof serializeFinancialEntry>>> {
  const where: any = { companyId: input.companyId };
  if (input.ownerId) where.ownerId = input.ownerId;
  if (input.tenantPartyId) where.tenantPartyId = input.tenantPartyId;
  if (input.contractIds) where.contractId = { in: input.contractIds };
  const rows = await prisma.financialEntry.findMany({ where, include, orderBy: { dueDate: "asc" }, take: 250 });
  return rows.map(serializeFinancialEntry);
}

export function financialCompanyId(req: RequestWithAccess) {
  const companyId = req.access?.company.id;
  if (!companyId || req.access?.appUser.company_id !== companyId) throw invalidFinance("Empresa inválida.", "COMPANY_REQUIRED", 403);
  return companyId;
}
