import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { getOwnerProfile } from "../services/owner-profile.js";
import type { RequestWithAccess } from "../types/access.js";

export const qaFaseDBrokerRouter = Router();

function stagingOnly(_req: Request, res: Response, next: NextFunction) {
  const allowed = process.env.VERCEL_ENV === "preview"
    || process.env.VERCEL_GIT_COMMIT_REF === "staging/fase1-cadastro-aberto"
    || (env.APP_URL ?? "").includes("imobiflow-staging");
  return allowed ? next() : res.status(404).json({ error: "QA_ROUTE_DISABLED" });
}

qaFaseDBrokerRouter.use(requireAuth, requireCompany, requireActiveSubscription, stagingOnly, requirePermission("owners.view"));

const inputSchema = z.object({ owner_id: z.string().uuid(), foreign_owner_id: z.string().uuid() });

function safeError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).error;
  return typeof value === "string" ? value : null;
}

async function canonicalFetch(req: Request, path: string, init: RequestInit = {}) {
  const host = req.headers.host;
  if (!host) throw new Error("QA host ausente.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", String(req.headers.authorization ?? ""));
  headers.set("Content-Type", "application/json");
  const response = await fetch(`https://${host}/api${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  return { status: response.status, error: safeError(payload) };
}

async function ownerCheckCount(companyId: string, ownerId: string) {
  return getPrisma().ownerCheck.count({ where: { companyId, ownerId } });
}

async function auditCount(companyId: string, ownerId: string) {
  return getPrisma().authAuditLog.count({ where: { companyId, entityType: "property_owner", entityId: ownerId, action: { in: ["owner.intelligence.requested", "owner.intelligence.completed", "owner.legal.query.requested", "owner.legal.query.completed"] } } });
}

qaFaseDBrokerRouter.post("/broker-final", async (req: RequestWithAccess, res, next) => {
  try {
    const { owner_id: ownerId, foreign_owner_id: foreignOwnerId } = inputSchema.parse(req.body);
    const companyId = req.access!.company.id;
    const beforeChecks = await ownerCheckCount(companyId, ownerId);
    const beforeAudits = await auditCount(companyId, ownerId);
    const profile = await getOwnerProfile({ companyId, ownerId, actorUserId: req.access!.appUser.id, permissions: req.access!.appUser.permissions });
    const localProfile = await canonicalFetch(req, `/real-estate/owners/${ownerId}/profile`);
    const localChecks = await canonicalFetch(req, `/real-estate/owners/${ownerId}/checks`);
    const localIntelligence = await canonicalFetch(req, `/real-estate/owners/${ownerId}/intelligence/query`, { method: "POST", headers: { "Idempotency-Key": "fase-d-broker-blocked-20260916" }, body: JSON.stringify({ capabilities: ["LEGAL"] }) });
    const crossProfile = await canonicalFetch(req, `/real-estate/owners/${foreignOwnerId}/profile`);
    const crossChecks = await canonicalFetch(req, `/real-estate/owners/${foreignOwnerId}/checks`);
    const crossIntelligence = await canonicalFetch(req, `/real-estate/owners/${foreignOwnerId}/intelligence/query`, { method: "POST", headers: { "Idempotency-Key": "fase-d-cross-tenant-blocked-20260916" }, body: JSON.stringify({ capabilities: ["LEGAL"] }) });
    const afterChecks = await ownerCheckCount(companyId, ownerId);
    const afterAudits = await auditCount(companyId, ownerId);
    return res.json({
      session: { role: req.access!.appUser.role, company_id: companyId, permissions: req.access!.appUser.permissions.filter((p) => ["owners.view", "owners.legal.view", "owners.sensitive.view", "owners.enrichment.run"].includes(p)) },
      local: { profile_status: localProfile.status, profile_legal_is_null: profile.legal === null, checks: localChecks, intelligence: localIntelligence },
      cross_tenant: { profile: crossProfile, checks: crossChecks, intelligence: crossIntelligence },
      side_effects: { owner_check_count_before: beforeChecks, owner_check_count_after: afterChecks, audit_count_before: beforeAudits, audit_count_after: afterAudits },
    });
  } catch (error) {
    return next(error);
  }
});
