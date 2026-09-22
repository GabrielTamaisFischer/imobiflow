import { Router } from "express";
import { getPrisma } from "../lib/website-builder-prisma.js";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { buildPropertyScopeFilter } from "../services/authorization.js";
import { getOwnerDownstreamData } from "../services/owner-downstream.js";
import { writeAuthAudit } from "../services/mysql-auth.js";
import type { RequestWithAccess } from "../types/access.js";

/**
 * Temporary, staging-only Fase G verifier.
 *
 * It accepts no resource/company identifiers from the browser. Synthetic QA
 * records are selected server-side from the authenticated tenant, and every
 * downstream read uses the same company/resource scope as the production
 * route. The response is intentionally limited to booleans, statuses and
 * aggregate counts; no owner data or credentials are returned.
 */
export const qaFaseGBridgeRouter = Router();
qaFaseGBridgeRouter.use(requireAuth, requireCompany, requireActiveSubscription);

function stagingHost(hostname: string) {
  return hostname.includes("imobiflow-staging") || hostname === "localhost";
}

function syntheticOwnerWhere(companyId?: string) {
  return {
    ...(companyId ? { companyId } : {}),
    status: "active",
    OR: [
      { email: { endsWith: "@imobiflow.test" } },
      { name: { startsWith: "QA_" } },
    ],
  };
}

function safePiiFree(metadata: unknown) {
  const text = JSON.stringify(metadata ?? {}).toLowerCase();
  return !text.includes("cpf") && !text.includes("cnpj") && !text.includes("score") &&
    !text.includes("debt") && !text.includes("process") && !/[0-9]{11}/.test(text);
}

function readinessSummary(value: any) {
  return {
    ready: Boolean(value?.ready),
    missing_count: Array.isArray(value?.missing_fields) ? value.missing_fields.length : 0,
    conflicting_count: Array.isArray(value?.conflicting_fields) ? value.conflicting_fields.length : 0,
    expired_count: Array.isArray(value?.expired_documents) ? value.expired_documents.length : 0,
    pending_count: Array.isArray(value?.pending_documents) ? value.pending_documents.length : 0,
    requires_review: Boolean(value?.requires_review),
  };
}

async function findSyntheticOwner(db: any, companyId: string, foreign = false) {
  return db.propertyOwner.findFirst({
    where: foreign
      ? { ...syntheticOwnerWhere(), companyId: { not: companyId } }
      : syntheticOwnerWhere(companyId),
    select: { id: true, companyId: true },
    orderBy: { createdAt: "asc" },
  });
}

async function runDownstream(req: RequestWithAccess, owner: { id: string; companyId: string }) {
  const isBroker = String(req.access!.appUser.role).toUpperCase() === "BROKER";
  return getOwnerDownstreamData({
    companyId: req.access!.company.id,
    ownerId: owner.id,
    actorUserId: req.access!.appUser.id,
    permissions: req.access!.appUser.permissions,
    resourceFilter: isBroker ? buildPropertyScopeFilter(req.access!, "properties.view", "VIEW") : undefined,
  });
}

qaFaseGBridgeRouter.get(
  "/fase-g-auth-smoke",
  requirePermission("owners.view"),
  async (req: RequestWithAccess, res) => {
    if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
    res.json({ received: true, authenticated: true, authorized: true });
  },
);
qaFaseGBridgeRouter.get(
  "/fase-g/run",
  requirePermission("owners.manage"),
  async (req: RequestWithAccess, res, next) => {
    if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
    const db = getPrisma() as any;
    const companyId = req.access!.company.id;
    const actorUserId = req.access!.appUser.id;
    try {
      const owner = await findSyntheticOwner(db, companyId);
      const foreign = await findSyntheticOwner(db, companyId, true);
      if (!owner) {
        return res.json({
          transport_ok: true,
          owner_found: false,
          cross_tenant_tested: Boolean(foreign),
          data_returned: false,
          five_xx_count: 0,
        });
      }

      const downstream = await runDownstream(req, owner);
      const audits = await db.authAuditLog.findMany({
        where: {
          companyId,
          actorUserId,
          entityType: "property_owner",
          entityId: owner.id,
          action: { startsWith: "owner.automation." },
        },
        select: { action: true, metadataJson: true },
      });

      let crossTenantBlocked = !foreign;
      if (foreign) {
        try {
          await runDownstream(req, foreign);
        } catch (error) {
          crossTenantBlocked = (error as { statusCode?: number }).statusCode === 404;
        }
      }

      const dtoFlags = {
        contract: Boolean(downstream.contract?.party?.source === "owner360"),
        inspection: Boolean(downstream.inspection?.party?.source === "owner360"),
        insurance: Boolean(downstream.insurance?.applicant),
        financing: Boolean(downstream.financing?.applicant),
        proposal: Boolean(downstream.proposal?.party?.source === "owner360"),
      };
      return res.json({
        transport_ok: true,
        owner_found: true,
        owner_company_scoped: owner.companyId === companyId,
        dto_flags: dtoFlags,
        readiness: {
          contract: readinessSummary(downstream.contract.readiness),
          inspection: readinessSummary(downstream.inspection.readiness),
          insurance: readinessSummary(downstream.insurance.readiness),
          financing: readinessSummary(downstream.financing.readiness),
          proposal: readinessSummary(downstream.proposal.readiness),
        },
        canonical_provenance: Object.values(downstream.contract.party.provenance ?? {}).every((value) => ["owner", "owner_profile", "missing", "conflict"].includes(String(value))),
        audit: {
          automation_events: audits.length,
          pii_free: audits.every((row: any) => safePiiFree(row.metadataJson)),
          contract_prefill_seen: audits.some((row: any) => row.action === "owner.automation.contract.prefill"),
        },
        cross_tenant_tested: Boolean(foreign),
        cross_tenant_blocked: crossTenantBlocked,
        data_returned: false,
        five_xx_count: 0,
        actor_role: req.access!.appUser.role,
      });
    } catch (error) {
      return next(error);
    }
  },
);

qaFaseGBridgeRouter.get(
  "/fase-g/broker",
  requirePermission("owners.view"),
  async (req: RequestWithAccess, res, next) => {
    if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
    const db = getPrisma() as any;
    const companyId = req.access!.company.id;
    try {
      const owner = await findSyntheticOwner(db, companyId);
      if (!owner) return res.json({ transport_ok: true, owner_found: false, five_xx_count: 0 });
      const downstream = await runDownstream(req, owner);
      const permissions = req.access!.appUser.permissions;
      return res.json({
        transport_ok: true,
        owner_found: true,
        owner_company_scoped: owner.companyId === companyId,
        credit_masked: downstream.insurance.applicant.credit === null && downstream.financing.applicant.credit === null,
        financial_values_masked: downstream.insurance.applicant.income_available === false && downstream.financing.applicant.patrimony_available === false,
        checks_blocked: !permissions.includes("owners.sensitive.view"),
        intelligence_blocked: !permissions.includes("owners.enrichment.run"),
        data_returned: false,
        five_xx_count: 0,
      });
    } catch (error) {
      return next(error);
    }
  },
);
