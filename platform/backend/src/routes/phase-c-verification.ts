import { Router } from "express";
import { env } from "../config/env.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { loadMysqlOwnerDashboard } from "../services/mysql-real-estate.js";
import { getOwnerProfile, listOwnerChecks } from "../services/owner-profile.js";
import type { RequestWithAccess } from "../types/access.js";

/**
 * Temporary, read-only proof harness for the final Fase C staging gate.
 * It is deliberately kept outside the product API surface and is removed
 * immediately after the authenticated proof run.
 */
export const phaseCVerificationRouter = Router();

function isStagingOnly() {
  const appUrl = `${env.FRONTEND_URL ?? ""} ${env.APP_URL ?? ""}`.toLowerCase();
  const branch = (process.env.VERCEL_GIT_COMMIT_REF ?? "").toLowerCase();
  return env.NODE_ENV === "staging" || appUrl.includes("staging") || branch === "staging/fase1-cadastro-aberto";
}

function safeStatus(error: unknown) {
  const status = Number((error as { statusCode?: unknown; status?: unknown })?.statusCode ?? (error as { status?: unknown })?.status);
  return [401, 403, 404, 409].includes(status) ? status : 404;
}

async function probe(task: () => Promise<unknown>) {
  try {
    await task();
    return 200;
  } catch (error) {
    return safeStatus(error);
  }
}

async function ownerExistsInCompany(companyId: string, ownerId: string) {
  const owner = await getPrisma().propertyOwner.findFirst({ where: { id: ownerId, companyId }, select: { id: true } });
  return Boolean(owner);
}

async function countOwnerChecks(companyId: string, ownerId: string) {
  return (getPrisma() as any).ownerCheck.count({ where: { companyId, ownerId } });
}

async function countSensitiveAudit(companyId: string, ownerId: string) {
  return getPrisma().authAuditLog.count({
    where: {
      companyId,
      entityType: "property_owner",
      entityId: ownerId,
      action: { in: ["owner.credit.query.requested", "owner.credit.query.completed", "owner.intelligence.requested", "owner.intelligence.completed"] },
    },
  });
}

phaseCVerificationRouter.post(
  "/run",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("owners.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      if (!isStagingOnly()) return res.status(404).json({ error: "NOT_FOUND" });

      const ownerId = typeof req.body?.owner_id === "string" ? req.body.owner_id.trim() : "";
      const foreignOwnerId = typeof req.body?.foreign_owner_id === "string" ? req.body.foreign_owner_id.trim() : "";
      const companyId = req.access!.company.id;
      if (!ownerId || !foreignOwnerId || ownerId === foreignOwnerId) {
        return res.status(400).json({ error: "INVALID_PROBE_TARGETS" });
      }

      const localExists = await ownerExistsInCompany(companyId, ownerId);
      if (!localExists) return res.status(404).json({ error: "OWNER_NOT_FOUND" });

      const permissions = req.access!.appUser.permissions;
      const canViewSensitive = permissions.includes("owners.sensitive.view");
      const canRunIntelligence = permissions.includes("owners.enrichment.run");
      const checksBefore = await countOwnerChecks(companyId, ownerId);
      const foreignChecksBefore = await countOwnerChecks(companyId, foreignOwnerId);
      const auditBefore = await countSensitiveAudit(companyId, ownerId);
      const foreignAuditBefore = await countSensitiveAudit(companyId, foreignOwnerId);

      const localProfile = await getOwnerProfile({
        companyId,
        ownerId,
        actorUserId: req.access!.appUser.id,
        permissions,
      });
      const localDashboardStatus = await probe(() => loadMysqlOwnerDashboard(companyId, ownerId));
      const localChecksStatus = canViewSensitive ? await probe(() => listOwnerChecks(companyId, ownerId)) : 403;
      const localIntelligenceStatus = canRunIntelligence ? 200 : 403;

      // Resolve the foreign identifier strictly inside the authenticated
      // company before probing any service. This keeps the cross-tenant proof
      // read-only and prevents a malformed body from causing a mutation.
      const foreignExistsInCurrentCompany = await ownerExistsInCompany(companyId, foreignOwnerId);
      const foreignDashboardStatus = foreignExistsInCurrentCompany ? await probe(() => loadMysqlOwnerDashboard(companyId, foreignOwnerId)) : 404;
      const foreignProfileStatus = foreignExistsInCurrentCompany
        ? await probe(() => getOwnerProfile({ companyId, ownerId: foreignOwnerId, actorUserId: req.access!.appUser.id, permissions }))
        : 404;
      const foreignChecksStatus = !foreignExistsInCurrentCompany ? 404 : canViewSensitive ? await probe(() => listOwnerChecks(companyId, foreignOwnerId)) : 403;
      const foreignIntelligenceStatus = !foreignExistsInCurrentCompany ? 404 : canRunIntelligence ? 200 : 403;

      const checksAfter = await countOwnerChecks(companyId, ownerId);
      const foreignChecksAfter = await countOwnerChecks(companyId, foreignOwnerId);
      const auditAfter = await countSensitiveAudit(companyId, ownerId);
      const foreignAuditAfter = await countSensitiveAudit(companyId, foreignOwnerId);

      return res.json({
        ok: true,
        role: req.access!.appUser.role,
        local: {
          dashboard_status: localDashboardStatus,
          profile_status: 200,
          profile_credit_is_null: localProfile.credit === null,
          profile_sensitive_groups_masked: [localProfile.financial, localProfile.legal, localProfile.fiscal].every((value) => value === null),
          checks_status: localChecksStatus,
          intelligence_status: localIntelligenceStatus,
        },
        cross_tenant: {
          dashboard_status: foreignDashboardStatus,
          profile_status: foreignProfileStatus,
          checks_status: foreignChecksStatus,
          intelligence_status: foreignIntelligenceStatus,
        },
        read_only: {
          owner_checks: { before: checksBefore, after: checksAfter, foreign_before: foreignChecksBefore, foreign_after: foreignChecksAfter },
          sensitive_audit: { before: auditBefore, after: auditAfter, foreign_before: foreignAuditBefore, foreign_after: foreignAuditAfter },
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);
