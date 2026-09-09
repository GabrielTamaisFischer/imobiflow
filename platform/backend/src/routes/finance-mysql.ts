import { Router } from "express";
import { z } from "zod";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import {
  cancelFinancialEntry,
  createFinancialEntry,
  financialCategories,
  financialCompanyId,
  financialTypes,
  findFinancialEntry,
  listFinancialEntries,
  payFinancialEntry,
  serializeFinancialEntry,
  updateFinancialEntry,
  type FinancialEntryInput,
} from "../services/mysql-finance.js";
import { resolveIdempotencyKey } from "../services/idempotency.js";
import type { RequestWithAccess } from "../types/access.js";

export const mysqlFinanceRouter = Router();
mysqlFinanceRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const createSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(financialTypes),
  category: z.enum(financialCategories),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().length(3).default("BRL"),
  description: z.string().trim().min(2).max(240),
  due_date: z.string().nullable().optional(),
  competence_date: z.string().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  contract_id: z.string().uuid().nullable().optional(),
  owner_id: z.string().uuid().nullable().optional(),
  tenant_party_id: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const patchSchema = createSchema.partial().omit({ type: true, id: true }).extend({ expected_version: z.number().int().positive() });
const paySchema = z.object({ amount: z.union([z.string(), z.number()]).optional(), paid_at: z.string().datetime().optional(), payment_method: z.string().trim().max(40).optional(), notes: z.string().max(2000).optional() });
const cancelSchema = z.object({ reason: z.string().trim().max(500).optional() });

function userId(req: RequestWithAccess) {
  const value = req.access?.appUser.id;
  if (!value) throw Object.assign(new Error("Usuário autenticado ausente."), { statusCode: 401, code: "AUTH_REQUIRED" });
  return value;
}

function filters(req: RequestWithAccess) {
  const get = (key: string) => typeof req.query[key] === "string" ? req.query[key] as string : undefined;
  return { type: get("type"), category: get("category"), status: get("status"), due_from: get("due_from"), due_to: get("due_to"), property_id: get("property_id"), contract_id: get("contract_id"), owner_id: get("owner_id"), tenant_party_id: get("tenant_party_id") };
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

mysqlFinanceRouter.get("/", requirePermission("finance.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const entries = await listFinancialEntries(financialCompanyId(req), filters(req));
    res.json({ entries, overdue_count: entries.filter((entry: any) => entry.status === "overdue").length });
  } catch (error) { next(error); }
});

mysqlFinanceRouter.get("/:id", requirePermission("finance.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const row = await findFinancialEntry(financialCompanyId(req), routeParam(req.params.id));
    res.json({ entry: serializeFinancialEntry(row) });
  } catch (error) { next(error); }
});

mysqlFinanceRouter.post("/", requirePermission("finance.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = createSchema.parse(req.body) as FinancialEntryInput;
    const key = resolveIdempotencyKey(req, input.id ?? `${userId(req)}:${input.type}:${input.category}:${input.description}:${input.amount}:${input.due_date ?? ""}`);
    const result = await createFinancialEntry(financialCompanyId(req), userId(req), input, key);
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

mysqlFinanceRouter.patch("/:id", requirePermission("finance.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const result = await updateFinancialEntry(financialCompanyId(req), userId(req), routeParam(req.params.id), patchSchema.parse(req.body));
    res.json(result);
  } catch (error) { next(error); }
});

mysqlFinanceRouter.post("/:id/pay", requirePermission("finance.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = paySchema.parse(req.body);
    const id = routeParam(req.params.id);
    const key = resolveIdempotencyKey(req, `entry:${id}:pay`);
    const result = await payFinancialEntry(financialCompanyId(req), userId(req), id, input, key);
    res.status(result.replayed || result.already_paid ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

mysqlFinanceRouter.post("/:id/cancel", requirePermission("finance.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    res.json(await cancelFinancialEntry(financialCompanyId(req), userId(req), routeParam(req.params.id), cancelSchema.parse(req.body).reason));
  } catch (error) { next(error); }
});
