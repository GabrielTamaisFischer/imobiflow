import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { getOwnerProfile, runOwnerIntelligenceQuery } from "../services/owner-profile.js";
import type { RequestWithAccess } from "../types/access.js";

export const qaFaseDRouter = Router();

function stagingOnly(_req: Request, res: Response, next: NextFunction) {
  const staging = process.env.VERCEL_ENV === "preview"
    || process.env.VERCEL_GIT_COMMIT_REF === "staging/fase1-cadastro-aberto"
    || (env.APP_URL ?? "").includes("imobiflow-staging");
  return staging ? next() : res.status(404).json({ error: "QA_ROUTE_DISABLED" });
}

qaFaseDRouter.use(requireAuth, requireCompany, requireActiveSubscription, stagingOnly, requirePermission("owners.view"));

const inputSchema = z.object({
  owner_id: z.string().uuid(),
  foreign_owner_id: z.string().uuid().optional(),
});

const legalKey = "fase-d-final-legal-idempotency-20260915";

function safeError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : null;
}

async function canonicalFetch(req: Request, path: string, init: RequestInit = {}) {
  const host = req.headers.host;
  if (!host) throw new Error("QA host ausente.");
  const base = `https://${host}/api`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", String(req.headers.authorization ?? ""));
  headers.set("Content-Type", "application/json");
  const response = await fetch(`${base}${path}`, { ...init, headers });
  const payload = await response.json().catch(() => null);
  return { status: response.status, error: safeError(payload), payload };
}

async function ownerCheckSnapshot(companyId: string, ownerId: string) {
  const prisma = getPrisma();
  const rows = await prisma.ownerCheck.findMany({
    where: { companyId, ownerId, checkType: "intelligence", idempotencyKey: legalKey },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const audits = await prisma.authAuditLog.findMany({
    where: {
      companyId,
      entityType: "property_owner",
      entityId: ownerId,
      action: { in: ["owner.intelligence.requested", "owner.intelligence.completed", "owner.legal.query.requested", "owner.legal.query.completed"] },
    },
    select: { action: true, metadataJson: true },
    orderBy: { createdAt: "asc" },
  });
  const sensitiveKeys = ["cpf", "cnpj", "rg", "score", "debt", "debts", "protest", "creditor", "payload", "document"];
  const auditHasSensitiveKey = audits.some((audit) => sensitiveKeys.some((key) => JSON.stringify(audit.metadataJson ?? {}).toLowerCase().includes(`\"${key}`)));
  return {
    count: rows.length,
    ids: rows.map((row) => row.id),
    audit_actions: audits.map((audit) => audit.action),
    audit_has_sensitive_keys: auditHasSensitiveKey,
  };
}

qaFaseDRouter.post("/legal-runtime", async (req: RequestWithAccess, res, next) => {
  try {
    const input = inputSchema.parse(req.body);
    const companyId = req.access!.company.id;
    const ownerId = input.owner_id;
    const foreignOwnerId = input.foreign_owner_id ?? ownerId;
    const profile = await getOwnerProfile({ companyId, ownerId, actorUserId: req.access!.appUser.id, permissions: req.access!.appUser.permissions });
    const profileResponse = await canonicalFetch(req, `/real-estate/owners/${ownerId}/profile`);
    const checksResponse = await canonicalFetch(req, `/real-estate/owners/${ownerId}/checks`);
    const intelligenceResponse = await canonicalFetch(req, `/real-estate/owners/${ownerId}/intelligence/query`, {
      method: "POST",
      headers: { "Idempotency-Key": "fase-d-broker-blocked" },
      body: JSON.stringify({ capabilities: ["LEGAL"] }),
    });
    const foreignProfile = await canonicalFetch(req, `/real-estate/owners/${foreignOwnerId}/profile`);
    const foreignIntelligence = await canonicalFetch(req, `/real-estate/owners/${foreignOwnerId}/intelligence/query`, {
      method: "POST",
      headers: { "Idempotency-Key": "fase-d-cross-tenant-blocked" },
      body: JSON.stringify({ capabilities: ["LEGAL"] }),
    });
    const canRun = req.access!.appUser.permissions.includes("owners.enrichment.run") && req.access!.appUser.permissions.includes("owners.legal.view");
    let idempotency: Record<string, unknown> = { executed: false, reason: "SESSION_NOT_AUTHORIZED_FOR_LEGAL_QUERY" };
    if (canRun) {
      const before = await ownerCheckSnapshot(companyId, ownerId);
      const first = await canonicalFetch(req, `/real-estate/owners/${ownerId}/intelligence/query`, {
        method: "POST",
        headers: { "Idempotency-Key": legalKey },
        body: JSON.stringify({ capabilities: ["LEGAL"] }),
      });
      const afterFirst = await ownerCheckSnapshot(companyId, ownerId);
      const second = await canonicalFetch(req, `/real-estate/owners/${ownerId}/intelligence/query`, {
        method: "POST",
        headers: { "Idempotency-Key": legalKey },
        body: JSON.stringify({ capabilities: ["LEGAL"] }),
      });
      const afterSecond = await ownerCheckSnapshot(companyId, ownerId);
      idempotency = {
        executed: true,
        key: legalKey,
        before,
        first: { status: first.status, error: first.error, check_id: (first.payload as any)?.check?.id ?? null },
        after_first: afterFirst,
        second: { status: second.status, error: second.error, check_id: (second.payload as any)?.check?.id ?? null },
        after_second: afterSecond,
        same_check: ((first.payload as any)?.check?.id ?? null) === ((second.payload as any)?.check?.id ?? null),
        no_duplicate: afterSecond.count === afterFirst.count,
      };
    }
    return res.json({
      session: { role: req.access!.appUser.role, company_id: companyId, permissions: req.access!.appUser.permissions.filter((permission) => ["owners.view", "owners.legal.view", "owners.enrichment.run", "owners.sensitive.view"].includes(permission)) },
      local: {
        profile_status: profileResponse.status,
        profile_legal_is_null: profile.legal === null,
        profile_error: profileResponse.error,
        checks_status: checksResponse.status,
        checks_error: checksResponse.error,
        intelligence_status: intelligenceResponse.status,
        intelligence_error: intelligenceResponse.error,
      },
      cross_tenant: {
        profile_status: foreignProfile.status,
        profile_error: foreignProfile.error,
        intelligence_status: foreignIntelligence.status,
        intelligence_error: foreignIntelligence.error,
      },
      idempotency,
    });
  } catch (error) {
    return next(error);
  }
});
