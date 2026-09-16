import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { runOwnerIntelligenceQuery } from "../services/owner-profile.js";
import type { RequestWithAccess } from "../types/access.js";

/** Temporary, staging-only verification route. Remove after the Fase E gate. */
export const qaFaseEFiscalRouter = Router();

const bodySchema = z.object({}).strict();
const OWNER_B_ID = "b6c3d080-4b6b-4e0b-80d3-15a62d446110";
const OWNER_A_ID = "6024a63a-b326-46b2-b108-fba0ca551ffd";
const IDEMPOTENCY_KEY = "fase-e-final-idempotency-20260916";

function stagingOnly(_req: Request, res: Response, next: NextFunction) {
  const allowed = process.env.VERCEL_ENV === "preview"
    || process.env.VERCEL_GIT_COMMIT_REF === "staging/fase1-cadastro-aberto"
    || (env.APP_URL ?? "").includes("imobiflow-staging");
  return allowed ? next() : res.status(404).json({ error: "QA_ROUTE_DISABLED" });
}

qaFaseEFiscalRouter.use(requireAuth, requireCompany, requireActiveSubscription, stagingOnly, requirePermission("owners.view"));

function errorCode(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).error;
  return typeof value === "string" ? value : null;
}

function checkSummary(payload: unknown) {
  if (!payload || typeof payload !== "object") return { id: null, status: null };
  const check = (payload as Record<string, unknown>).check;
  if (!check || typeof check !== "object") return { id: null, status: null };
  const row = check as Record<string, unknown>;
  return {
    id: typeof row.id === "string" ? row.id : null,
    status: typeof row.status === "string" ? row.status : null,
  };
}

async function canonicalFetch(req: Request, path: string, init: RequestInit = {}) {
  const host = req.headers.host;
  if (!host) throw new Error("QA host ausente.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", String(req.headers.authorization ?? ""));
  headers.set("Content-Type", "application/json");
  const response = await fetch(`https://${host}/api${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  return { status: response.status, error: errorCode(payload), summary: checkSummary(payload), payload };
}

async function snapshot(companyId: string, ownerId: string) {
  const prisma = getPrisma();
  const [checks, requested, completed, fiscalRequested, fiscalCompleted] = await Promise.all([
    prisma.ownerCheck.findMany({
      where: { companyId, ownerId, checkType: "intelligence", idempotencyKey: IDEMPOTENCY_KEY },
      select: { id: true }, orderBy: { createdAt: "asc" },
    }),
    prisma.authAuditLog.count({ where: { companyId, entityType: "property_owner", entityId: ownerId, action: "owner.intelligence.requested" } }),
    prisma.authAuditLog.count({ where: { companyId, entityType: "property_owner", entityId: ownerId, action: "owner.intelligence.completed" } }),
    prisma.authAuditLog.count({ where: { companyId, entityType: "property_owner", entityId: ownerId, action: "owner.fiscal.query.requested" } }),
    prisma.authAuditLog.count({ where: { companyId, entityType: "property_owner", entityId: ownerId, action: "owner.fiscal.query.completed" } }),
  ]);
  return { count: checks.length, ids: checks.map((row) => row.id), requested, completed, fiscal_requested: fiscalRequested, fiscal_completed: fiscalCompleted };
}

function sanitizedProfile(payload: unknown) {
  if (!payload || typeof payload !== "object") return { fiscal_status: null, fiscal_is_null: null };
  const profile = (payload as Record<string, unknown>).profile;
  if (!profile || typeof profile !== "object") return { fiscal_status: null, fiscal_is_null: null };
  const fiscal = (profile as Record<string, unknown>).fiscal;
  return { fiscal_status: fiscal && typeof fiscal === "object" && typeof (fiscal as Record<string, unknown>).status === "string" ? (fiscal as Record<string, unknown>).status : null, fiscal_is_null: fiscal === null };
}

async function ownerMode(req: RequestWithAccess, companyId: string) {
  const owner = await getPrisma().propertyOwner.findFirst({ where: { id: OWNER_B_ID, companyId }, select: { id: true } });
  if (!owner) return { mode: "owner", owner_available: false };
  const before = await snapshot(companyId, OWNER_B_ID);
  const first = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/intelligence/query`, { method: "POST", headers: { "Idempotency-Key": IDEMPOTENCY_KEY }, body: JSON.stringify({ capabilities: ["FISCAL"] }) });
  const afterFirst = await snapshot(companyId, OWNER_B_ID);
  const second = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/intelligence/query`, { method: "POST", headers: { "Idempotency-Key": IDEMPOTENCY_KEY }, body: JSON.stringify({ capabilities: ["FISCAL"] }) });
  const afterSecond = await snapshot(companyId, OWNER_B_ID);
  const profile = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/profile`);
  const foreignProfile = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/profile`);
  const foreignChecks = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/checks`);
  const foreignIntelligence = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/intelligence/query`, { method: "POST", headers: { "Idempotency-Key": `${IDEMPOTENCY_KEY}-cross` }, body: JSON.stringify({ capabilities: ["FISCAL"] }) });
  return {
    mode: "owner", owner_available: true,
    local: { profile_status: profile.status, profile: sanitizedProfile(profile.payload), first: { status: first.status, error: first.error, ...first.summary }, second: { status: second.status, error: second.error, ...second.summary } },
    before, after_first: afterFirst, after_second: afterSecond,
    same_check: first.summary.id !== null && first.summary.id === second.summary.id,
    duplicated: afterSecond.count > afterFirst.count,
    cross_tenant: { profile: { status: foreignProfile.status, error: foreignProfile.error }, checks: { status: foreignChecks.status, error: foreignChecks.error }, intelligence: { status: foreignIntelligence.status, error: foreignIntelligence.error } },
  };
}

async function brokerMode(req: RequestWithAccess, companyId: string) {
  const owner = await getPrisma().propertyOwner.findFirst({ where: { id: OWNER_A_ID, companyId }, select: { id: true } });
  if (!owner) return { mode: "broker", owner_available: false };
  const before = await snapshot(companyId, OWNER_A_ID);
  const profile = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/profile`);
  const checks = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/checks`);
  const intelligence = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/intelligence/query`, { method: "POST", headers: { "Idempotency-Key": `${IDEMPOTENCY_KEY}-broker` }, body: JSON.stringify({ capabilities: ["FISCAL"] }) });
  const crossProfile = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/profile`);
  const crossChecks = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/checks`);
  const crossIntelligence = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/intelligence/query`, { method: "POST", headers: { "Idempotency-Key": `${IDEMPOTENCY_KEY}-broker-cross` }, body: JSON.stringify({ capabilities: ["FISCAL"] }) });
  const after = await snapshot(companyId, OWNER_A_ID);
  return {
    mode: "broker", owner_available: true,
    local: { profile_status: profile.status, profile: sanitizedProfile(profile.payload), checks: { status: checks.status, error: checks.error }, intelligence: { status: intelligence.status, error: intelligence.error } },
    cross_tenant: { profile: { status: crossProfile.status, error: crossProfile.error }, checks: { status: crossChecks.status, error: crossChecks.error }, intelligence: { status: crossIntelligence.status, error: crossIntelligence.error } },
    side_effects: { before, after, owner_check_created: after.count > before.count },
  };
}

qaFaseEFiscalRouter.post("/final", async (req: RequestWithAccess, res, next) => {
  try {
    bodySchema.parse(req.body ?? {});
    const companyId = req.access!.company.id;
    const role = req.access!.appUser.role;
    const result = role === "broker" ? await brokerMode(req, companyId) : await ownerMode(req, companyId);
    return res.json({ role, result });
  } catch (error) { return next(error); }
});
