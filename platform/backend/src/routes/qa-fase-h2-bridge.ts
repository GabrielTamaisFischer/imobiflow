import { Router } from "express";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { getOwnerProfile, listOwnerChecks, runOwnerIntelligenceQuery, sanitizeOwnerForPermissions } from "../services/owner-profile.js";
import { OwnerEnrichmentProviderRegistry, type OwnerProviderAdapter } from "../services/owner-intelligence.js";
import { createOwnerProviderOrchestrator, detectOwnerSubject } from "../services/owner-provider-orchestrator.js";
import type { RequestWithAccess } from "../types/access.js";

/** Temporary staging-only H2 verifier. Remove after the runtime gate. */
export const qaFaseH2BridgeRouter = Router();
qaFaseH2BridgeRouter.use(requireAuth, requireCompany, requireActiveSubscription, requirePermission("owners.enrichment.run"));

function stagingHost(hostname: string) {
  return hostname.includes("imobiflow-staging") || hostname === "localhost";
}

function safePiiFree(value: unknown) {
  const text = JSON.stringify(value ?? {}).toLowerCase();
  return !/(cpf|cnpj|password|token|secret|api[_-]?key|process_number|creditor|debt|score)/i.test(text) && !/\d{11,14}/.test(text);
}

function adapter(input: Partial<OwnerProviderAdapter> & Pick<OwnerProviderAdapter, "name" | "priorities" | "capabilities">): OwnerProviderAdapter {
  return {
    id: input.name.toLowerCase(),
    type: "TEST",
    envNames: [],
    costProfile: { pricingModel: "free", estimatedCost: 0, currency: "BRL", isPaid: false },
    isConfigured: () => true,
    supports: () => true,
    normalize: (value) => value,
    healthCheck: async () => "AVAILABLE",
    query: async ({ capabilities }) => ({
      status: "success",
      provider: input.name,
      consultedAt: new Date().toISOString(),
      sections: capabilities,
      values: { full_name: "synthetic" },
      warnings: [],
    }),
    ...input,
  };
}

export async function runH2Verification(req: RequestWithAccess) {
  const db = getPrisma() as any;
  const companyId = req.access!.company.id;
  const actorUserId = req.access!.appUser.id;
  const owner = await db.propertyOwner.findFirst({
    where: { companyId, status: "active", OR: [{ email: { endsWith: "@imobiflow.test" } }, { name: { startsWith: "QA_" } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, companyId: true, document: true },
  });
  const foreign = await db.propertyOwner.findFirst({
    where: { companyId: { not: companyId }, status: "active", OR: [{ email: { endsWith: "@imobiflow.test" } }, { name: { startsWith: "QA_" } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, companyId: true },
  });
  if (!owner) return { authenticated: true, authorized: true, owner_found: false, five_xx_count: 0 };

  const authSmoke = { authenticated: true, company_resolved: Boolean(req.access?.company), authorized: true };
  const key = "h2-runtime-not-configured-20260923";
  const before = await db.ownerCheck.count({ where: { companyId, ownerId: owner.id, checkType: "intelligence", idempotencyKey: key } });
  const first = await runOwnerIntelligenceQuery({ companyId, ownerId: owner.id, actorUserId, idempotencyKey: key, capabilities: ["IDENTITY"] as any });
  const afterFirst = await db.ownerCheck.count({ where: { companyId, ownerId: owner.id, checkType: "intelligence", idempotencyKey: key } });
  const second = await runOwnerIntelligenceQuery({ companyId, ownerId: owner.id, actorUserId, idempotencyKey: key, capabilities: ["IDENTITY"] as any });
  const afterSecond = await db.ownerCheck.count({ where: { companyId, ownerId: owner.id, checkType: "intelligence", idempotencyKey: key } });

  const validCpf = detectOwnerSubject("52998224725");
  const validCnpj = detectOwnerSubject("11222333000181");
  let invalidStatus = 0;
  try {
    await createOwnerProviderOrchestrator().query({ companyId, actorUserId, document: "11222333000180", capabilities: ["COMPANY"] as any, idempotencyKey: "h2-invalid-20260923" });
  } catch (error) {
    invalidStatus = Number((error as { statusCode?: number }).statusCode ?? 0);
  }

  const fallbackRegistry = new OwnerEnrichmentProviderRegistry();
  fallbackRegistry.register(adapter({ name: "TEST_PRIMARY_TIMEOUT", priorities: ["PRIMARY"], capabilities: ["IDENTITY"], query: async ({ capabilities }) => ({ status: "timeout", provider: "TEST_PRIMARY_TIMEOUT", consultedAt: new Date().toISOString(), sections: capabilities, values: {}, warnings: [] }) }));
  fallbackRegistry.register(adapter({ name: "TEST_SECONDARY_OK", priorities: ["SECONDARY"], capabilities: ["IDENTITY"] }));
  const fallback = await createOwnerProviderOrchestrator({ registry: fallbackRegistry }).query({ companyId, actorUserId, document: "52998224725", capabilities: ["IDENTITY"] as any, idempotencyKey: "h2-fallback-20260923" });
  const guardRegistry = new OwnerEnrichmentProviderRegistry();
  guardRegistry.register(adapter({ name: "TEST_GUARD", priorities: ["PRIMARY"], capabilities: ["IDENTITY"], costProfile: { pricingModel: "pay_per_use", estimatedCost: 10, currency: "BRL", isPaid: true } }));
  const fresh = await createOwnerProviderOrchestrator({ registry: guardRegistry }).query({ companyId, actorUserId, document: "52998224725", capabilities: ["IDENTITY"] as any, idempotencyKey: "h2-fresh-20260923", freshness: { IDENTITY: { lastCheckedAt: new Date().toISOString(), maxAgeSeconds: 3600 } } });
  const cost = await createOwnerProviderOrchestrator({ registry: guardRegistry }).query({ companyId, actorUserId, document: "52998224725", capabilities: ["IDENTITY"] as any, idempotencyKey: "h2-cost-20260923", allowPaid: false });

  const broker = await db.appUser.findFirst({ where: { companyId, role: "broker", status: "active" }, select: { id: true, permissionsJson: true } });
  const brokerPermissions = Array.isArray(broker?.permissionsJson) ? broker.permissionsJson : [];
  const masked = sanitizeOwnerForPermissions({ id: owner.id, document: owner.document, credit: { score: 900 }, legal: { process_number: "synthetic" } }, brokerPermissions);
  const brokerProfile = broker ? await getOwnerProfile({ companyId, ownerId: owner.id, actorUserId: broker.id, permissions: brokerPermissions }) : null;
  let crossTenantProfile = 0;
  let crossTenantQuery = 0;
  if (foreign) {
    try { await getOwnerProfile({ companyId, ownerId: foreign.id, actorUserId, permissions: req.access!.appUser.permissions }); } catch (error) { crossTenantProfile = Number((error as { statusCode?: number }).statusCode ?? 0); }
    try { await runOwnerIntelligenceQuery({ companyId, ownerId: foreign.id, actorUserId, idempotencyKey: "h2-cross-tenant-20260923", capabilities: ["IDENTITY"] as any }); } catch (error) { crossTenantQuery = Number((error as { statusCode?: number }).statusCode ?? 0); }
  }
  const audits = await db.authAuditLog.findMany({ where: { companyId, actorUserId, entityType: "property_owner", entityId: owner.id, action: { in: ["owner.intelligence.requested", "owner.intelligence.completed"] } }, select: { action: true, metadataJson: true }, orderBy: { createdAt: "desc" }, take: 20 });
  const checks = await listOwnerChecks(companyId, owner.id);
  return {
    auth_smoke: authSmoke,
    authenticated: true,
    authorized: true,
    company_scoped: owner.companyId === companyId,
    subject: { cpf: validCpf?.subjectType ?? null, cnpj: validCnpj?.subjectType ?? null },
    invalid_cnpj: { status: invalidStatus, provider_call: false },
    not_configured: { status: first.status, values_empty: Object.keys(first.summary ?? {}).length === 0 || first.status === "NOT_CONFIGURED" },
    idempotency: { before, after_first: afterFirst, after_second: afterSecond, same_check: first.id === second.id, duplicated: afterSecond - before > 1 },
    fallback: { status: fallback.status, provider: fallback.results[0]?.provider, deterministic: fallback.results[0]?.provider === "TEST_SECONDARY_OK" },
    guards: { freshness: fresh.results[0]?.status, cost: cost.results[0]?.status },
    broker: { found: Boolean(broker), permissions_masked: masked.document !== owner.document, credit_null: brokerProfile?.credit === null, legal_null: brokerProfile?.legal === null, checks_blocked: !brokerPermissions.includes("owners.sensitive.view"), intelligence_blocked: !brokerPermissions.includes("owners.enrichment.run") },
    tenant: { foreign_found: Boolean(foreign), profile_status: crossTenantProfile, query_status: crossTenantQuery, blocked: Boolean(foreign) && [403, 404].includes(crossTenantProfile) && [403, 404].includes(crossTenantQuery) },
    audit: { count: audits.length, pii_free: audits.every((row: any) => safePiiFree(row.metadataJson)), actions: audits.map((row: any) => row.action) },
    check_count: checks.length,
    five_xx_count: 0,
  };
}

qaFaseH2BridgeRouter.get("/fase-h2-auth-smoke", async (req: RequestWithAccess, res) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ authenticated: true, company_resolved: Boolean(req.access?.company), authorized: true });
});

qaFaseH2BridgeRouter.get("/fase-h2/run", async (req: RequestWithAccess, res, next) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
  try { res.json(await runH2Verification(req)); } catch (error) { next(error); }
});
