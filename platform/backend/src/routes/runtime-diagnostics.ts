import { Router } from "express";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { isStagingRuntimeDiagnosticsEnabled } from "../services/runtime-diagnostics.js";
import type { RequestWithAccess } from "../types/access.js";

export const runtimeDiagnosticsRouter = Router();

runtimeDiagnosticsRouter.get(
  "/runtime-revision",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("owners.manage"),
  (_req: RequestWithAccess, res) => {
    if (!isStagingRuntimeDiagnosticsEnabled()) {
      res.status(404).json({ error: "NOT_FOUND", message: "Recurso não encontrado." });
      return;
    }
    res.json({
      revision: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? null,
    });
  },
);
