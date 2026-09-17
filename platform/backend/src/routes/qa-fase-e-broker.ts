import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import type { RequestWithAccess } from "../types/access.js";

/** Temporary staging-only verification route. Remove immediately after the Fase E gate. */
export const qaFaseEBrokerRouter = Router();
const OWNER_A_ID = "6024a63a-b326-46b2-b108-fba0ca551ffd";
const OWNER_B_ID = "b6c3d080-4b6b-4e0b-80d3-15a62d446110";
const bodySchema = z.object({}).strict();

function stagingOnly(_req: Request, res: Response, next: NextFunction) {
  const allowed = process.env.VERCEL_ENV === "preview"
    || process.env.VERCEL_GIT_COMMIT_REF === "staging/fase1-cadastro-aberto"
    || (env.APP_URL ?? "").includes("imobiflow-staging");
  return allowed ? next() : res.status(404).json({ error: "QA_ROUTE_DISABLED" });
}

qaFaseEBrokerRouter.use(requireAuth, requireCompany, requireActiveSubscription, stagingOnly, requirePermission("owners.view"));

function errCode(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const code = (value as Record<string, unknown>).error;
  return typeof code === "string" ? code : null;
}

function sanitizedProfile(payload: unknown) {
  if (!payload || typeof payload !== "object") return { fiscal_is_null: null, sensitive_fields_present: null };
  const profile = (payload as Record<string, unknown>).profile;
  if (!profile || typeof profile !== "object") return { fiscal_is_null: null, sensitive_fields_present: null };
  const row = profile as Record<string, unknown>;
  const fiscal = row.fiscal;
  const sensitive = ["declarations", "certificates", "active_debts", "pending_items", "amounts", "protocol", "processes", "case_value"];
  return {
    fiscal_is_null: fiscal === null,
    sensitive_fields_present: sensitive.some((key) => Object.prototype.hasOwnProperty.call(row, key)),
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
  return { status: response.status, error: errCode(payload), profile: sanitizedProfile(payload) };
}

async function snapshot(companyId: string, ownerId: string) {
  const prisma = getPrisma();
  const [checks, fiscalRequested, fiscalCompleted] = await Promise.all([
    prisma.ownerCheck.count({ where: { companyId, ownerId } }),
    prisma.authAuditLog.count({ where: { companyId, entityType: "property_owner", entityId: ownerId, action: "owner.fiscal.query.requested" } }),
    prisma.authAuditLog.count({ where: { companyId, entityType: "property_owner", entityId: ownerId, action: "owner.fiscal.query.completed" } }),
  ]);
  return { owner_checks: checks, fiscal_requested: fiscalRequested, fiscal_completed: fiscalCompleted };
}

qaFaseEBrokerRouter.post("/final", async (req: RequestWithAccess, res, next) => {
  try {
    bodySchema.parse(req.body ?? {});
    const companyId = req.access!.company.id;
    const before = await snapshot(companyId, OWNER_A_ID);
    const localProfile = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/profile`);
    const localChecks = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/checks`);
    const localIntelligence = await canonicalFetch(req, `/real-estate/owners/${OWNER_A_ID}/intelligence/query`, {
      method: "POST",
      headers: { "Idempotency-Key": `fase-e-broker-final-${Date.now()}` },
      body: JSON.stringify({ capabilities: ["FISCAL"] }),
    });
    const crossProfile = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/profile`);
    const crossChecks = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/checks`);
    const crossIntelligence = await canonicalFetch(req, `/real-estate/owners/${OWNER_B_ID}/intelligence/query`, {
      method: "POST",
      headers: { "Idempotency-Key": `fase-e-broker-cross-${Date.now()}` },
      body: JSON.stringify({ capabilities: ["FISCAL"] }),
    });
    const after = await snapshot(companyId, OWNER_A_ID);
    return res.json({
      role: req.access!.appUser.role,
      local: { profile: localProfile, checks: { status: localChecks.status, error: localChecks.error }, intelligence: { status: localIntelligence.status, error: localIntelligence.error } },
      cross_tenant: { profile: { status: crossProfile.status, error: crossProfile.error }, checks: { status: crossChecks.status, error: crossChecks.error }, intelligence: { status: crossIntelligence.status, error: crossIntelligence.error } },
      side_effects: { before, after, owner_check_created: after.owner_checks > before.owner_checks, fiscal_audit_created: after.fiscal_requested > before.fiscal_requested || after.fiscal_completed > before.fiscal_completed },
    });
  } catch (error) { return next(error); }
});
