import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { runOwnerIntelligenceQuery } from "../services/owner-profile.js";
import { OWNER_INTELLIGENCE_CAPABILITIES, type OwnerIntelligenceCapability } from "../services/owner-intelligence.js";
import type { RequestWithAccess } from "../types/access.js";

export const qaOwnerIntelligenceRouter = Router();

function stagingOnly(_req: Request, res: Response, next: NextFunction) {
  const isStaging = process.env.VERCEL_ENV === "preview"
    || process.env.VERCEL_GIT_COMMIT_REF === "staging/fase1-cadastro-aberto"
    || (env.APP_URL ?? "").includes("imobiflow-staging");
  if (!isStaging) return res.status(404).json({ error: "QA_ROUTE_DISABLED" });
  return next();
}

qaOwnerIntelligenceRouter.use(requireAuth, requireCompany, requireActiveSubscription, stagingOnly, requirePermission("owners.enrichment.run"));

const bodySchema = z.object({ ownerId: z.string().uuid() });
const key = "fase-b-final-idempotency-20260915";
const capabilities = [...OWNER_INTELLIGENCE_CAPABILITIES];

async function snapshot(prisma: ReturnType<typeof getPrisma>, companyId: string, ownerId: string) {
  const checks = await prisma.ownerCheck.findMany({
    where: { companyId, ownerId, checkType: "intelligence", idempotencyKey: key },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const [requested, completed] = await Promise.all([
    prisma.authAuditLog.count({ where: { companyId, entityId: ownerId, action: "owner.intelligence.requested" } }),
    prisma.authAuditLog.count({ where: { companyId, entityId: ownerId, action: "owner.intelligence.completed" } }),
  ]);
  return { count: checks.length, ids: checks.map((check) => check.id), requested, completed };
}

qaOwnerIntelligenceRouter.post("/owner-intelligence-idempotency", async (req: RequestWithAccess, res, next) => {
  try {
    const { ownerId } = bodySchema.parse(req.body);
    const companyId = req.access!.company.id;
    const prisma = getPrisma();
    const before = await snapshot(prisma, companyId, ownerId);
    const first = await runOwnerIntelligenceQuery({ companyId, ownerId, actorUserId: req.access!.appUser.id, idempotencyKey: key, capabilities: capabilities as OwnerIntelligenceCapability[] });
    const afterFirst = await snapshot(prisma, companyId, ownerId);
    const second = await runOwnerIntelligenceQuery({ companyId, ownerId, actorUserId: req.access!.appUser.id, idempotencyKey: key, capabilities: capabilities as OwnerIntelligenceCapability[] });
    const afterSecond = await snapshot(prisma, companyId, ownerId);
    return res.status(200).json({
      idempotency_key: key,
      count_before: before.count,
      ids_before: before.ids,
      first_check_id: first.id,
      count_after_first: afterFirst.count,
      ids_after_first: afterFirst.ids,
      second_check_id: second.id,
      count_after_second: afterSecond.count,
      ids_after_second: afterSecond.ids,
      same_check: first.id === second.id,
      duplicated: afterSecond.count > afterFirst.count,
      audit_requested_count: afterSecond.requested,
      audit_completed_count: afterSecond.completed,
    });
  } catch (error) {
    return next(error);
  }
});
