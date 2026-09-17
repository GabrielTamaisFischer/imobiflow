import { Router, urlencoded } from "express";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import type { RequestWithAccess } from "../types/access.js";

/** Temporary staging-only transport probe. Remove after the Fase F gate. */
export const qaFaseFNativeRouter = Router();
qaFaseFNativeRouter.use(urlencoded({ extended: false }));
qaFaseFNativeRouter.use(requireAuth, requireCompany, requireActiveSubscription, requirePermission("owners.manage"));

qaFaseFNativeRouter.post("/fase-f/run", (req: RequestWithAccess, res) => {
  const isStagingHost = req.hostname.includes("imobiflow-staging.vercel.app") || req.hostname.includes("localhost");
  if (!isStagingHost) return res.status(404).json({ error: "NOT_FOUND" });

  console.info("[qa-fase-f-native] transport smoke received", {
    companyId: req.access?.company.id,
    actorUserId: req.access?.appUser.id,
  });
  return res.json({ received: true, authenticated: true, authorized: true });
});
