import { Router } from "express";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { createBigDataCorpProvider } from "../services/bigdatacorp-provider.js";
import { OwnerEnrichmentProviderRegistry } from "../services/owner-intelligence.js";
import { createOwnerProviderOrchestrator } from "../services/owner-provider-orchestrator.js";
import type { RequestWithAccess } from "../types/access.js";

/** Temporary staging-only H3A verifier. Remove after the runtime gate. */
export const qaFaseH3ABridgeRouter = Router();
qaFaseH3ABridgeRouter.use(requireAuth, requireCompany, requireActiveSubscription, requirePermission("owners.enrichment.run"));

function stagingHost(hostname: string) {
  return hostname.includes("imobiflow-staging") || hostname === "localhost";
}

function safeText(value: unknown) {
  return JSON.stringify(value ?? {}).toLowerCase();
}

function qaOwner(companyId: string) {
  return getPrisma().propertyOwner.findFirst({
    where: { companyId, status: "active", OR: [{ email: { endsWith: "@imobiflow.test" } }, { name: { startsWith: "QA_" } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

qaFaseH3ABridgeRouter.get("/auth-smoke", async (req: RequestWithAccess, res) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
  res.json({ authenticated: true, company_resolved: Boolean(req.access?.company), authorized: true });
});
qaFaseH3ABridgeRouter.get("/prepare", async (req: RequestWithAccess, res, next) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
  try {
    const owner = await qaOwner(req.access!.company.id);
    if (!owner) return res.status(404).json({ error: "QA_OWNER_NOT_FOUND" });
    res.json({ owner_id: owner.id });
  } catch (error) { next(error); }
});

qaFaseH3ABridgeRouter.get("/invalid-cpf", async (req: RequestWithAccess, res, next) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
  try {
    await createOwnerProviderOrchestrator().query({
      companyId: req.access!.company.id,
      actorUserId: req.access!.appUser.id,
      document: "00000000000",
      capabilities: ["IDENTITY"],
      idempotencyKey: "h3a-invalid-cpf-20260923",
    });
    res.json({ backend_ok: false, status: "UNEXPECTED_SUCCESS" });
  } catch (error) {
    const failure = error as { statusCode?: number; code?: string };
    const status = Number(failure.statusCode ?? 500);
    if (status >= 500) return res.status(500).json({ backend_ok: false, five_xx: true });
    res.json({ backend_ok: status === 400 || status === 422, status, code: failure.code ?? "CONTROLLED_ERROR" });
  }
});

qaFaseH3ABridgeRouter.get("/configured-false", async (req: RequestWithAccess, res, next) => {
  if (!stagingHost(req.hostname)) return res.status(404).json({ error: "NOT_FOUND" });
  try {
    let externalRequestCount = 0;
    const provider = createBigDataCorpProvider({
      env: {},
      fetchImpl: async () => {
        externalRequestCount += 1;
        return new Response(null, { status: 500 });
      },
    });
    const registry = new OwnerEnrichmentProviderRegistry().register(provider);
    const result = await createOwnerProviderOrchestrator({ registry }).query({
      companyId: req.access!.company.id,
      actorUserId: req.access!.appUser.id,
      document: "52998224725",
      capabilities: ["IDENTITY"],
      idempotencyKey: "h3a-configured-false-20260923",
    });
    const raw = safeText(result.normalized);
    res.json({
      configured_false_ok: result.status === "NOT_CONFIGURED",
      not_configured_ok: result.status === "NOT_CONFIGURED",
      external_request_count: externalRequestCount,
      fake_data_count: Object.keys(result.normalized).length === 0 ? 0 : 1,
      five_xx_count: 0,
      secrets_exposed: /(token|secret|password|cpf|cnpj)/i.test(raw),
    });
  } catch (error) { next(error); }
});
