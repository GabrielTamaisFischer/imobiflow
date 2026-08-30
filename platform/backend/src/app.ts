import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requireActiveSubscription, requireAuth, requireCompany } from "./middleware/auth.js";
import { automationRouter } from "./routes/automation.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { billingRouter } from "./routes/billing.js";
import { contractsRouter } from "./routes/contracts.js";
import { crmRouter } from "./routes/crm.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { financeRouter } from "./routes/finance.js";
import { importsRouter } from "./routes/imports.js";
import { inspectionsRouter } from "./routes/inspections.js";
import { integrationsRouter } from "./routes/integrations.js";
import { notificationsRouter } from "./routes/notifications.js";
import { operationsRouter } from "./routes/operations.js";
import { portalIntegrationsRouter } from "./routes/portal-integrations.js";
import { publicInspectionsRouter } from "./routes/public-inspections.js";
import { publicPortalsRouter } from "./routes/public-portals.js";
import { publicSitesRouter } from "./routes/public-sites.js";
import { realEstateRouter } from "./routes/real-estate.js";
import { rentalsRouter } from "./routes/rentals.js";
import { sitesRouter } from "./routes/sites.js";
import { testLabRouter } from "./routes/test-lab.js";
import { usageCostsRouter } from "./routes/usage-costs.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { websiteBuilderRouter } from "./routes/website-builder.js";
import { buildAppBootstrap } from "./services/app-bootstrap.js";
import { getStorageProviderName } from "./services/storage/index.js";
import { localUploadsRoot } from "./services/storage/local-storage-provider.js";
import type { RequestWithAccess } from "./types/access.js";

function corsOrigins() {
  return (env.CORS_ORIGIN || env.FRONTEND_URL || env.APP_URL)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins(),
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: "15mb",
      verify: (req, _res, buffer) => {
        Object.assign(req, { rawBody: buffer.toString("utf8") });
      },
    }),
  );

  // Servico estatico dos arquivos enviados via LocalStorageProvider — SOMENTE
  // quando o provider "local" esta ativo e fora de producao (ver
  // services/storage/local-storage-provider.ts). Nao versiona nada: a pasta
  // e gitignored (platform/.gitignore -> backend/uploads/).
  if (env.NODE_ENV !== "production" && getStorageProviderName() === "local") {
    app.use(
      "/uploads",
      (_req, res, next) => {
        // helmet() aplica Cross-Origin-Resource-Policy: same-origin por
        // padrao, o que bloquearia o frontend (porta/origem diferente) de
        // carregar essas imagens. Relaxamos apenas nesta rota, apenas em
        // dev, apenas para o provider local.
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        next();
      },
      express.static(localUploadsRoot()),
    );
  }

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "imobiflow-api" });
  });

  app.use("/auth", authRouter);
  app.use("/ai", aiRouter);
  app.use("/appointments", appointmentsRouter);
  app.use("/automation", automationRouter);
  app.use("/billing", billingRouter);
  app.use("/contracts", contractsRouter);
  app.use("/crm", crmRouter);
  app.use("/dashboard", dashboardRouter);
  app.use("/finance", financeRouter);
  app.use("/imports", importsRouter);
  app.use("/inspections", inspectionsRouter);
  app.use("/integrations", integrationsRouter);
  app.use("/notifications", notificationsRouter);
  app.use("/operations", operationsRouter);
  app.use("/portal-integrations", portalIntegrationsRouter);
  app.use("/public/inspections", publicInspectionsRouter);
  app.use("/public/portals", publicPortalsRouter);
  app.use("/public/sites", publicSitesRouter);
  app.use("/real-estate", realEstateRouter);
  app.use("/rentals", rentalsRouter);
  app.use("/site", sitesRouter);
  app.use("/test-lab", testLabRouter);
  app.use("/usage-costs", usageCostsRouter);
  app.use("/webhooks", webhooksRouter);
  app.use("/website-builder", websiteBuilderRouter);

  app.get("/me/authorization", requireAuth, requireCompany, (req: RequestWithAccess, res) => {
    res.json({ access: req.access });
  });

  app.get(
    "/app/bootstrap",
    requireAuth,
    requireCompany,
    requireActiveSubscription,
    (req: RequestWithAccess, res) => {
      res.json(buildAppBootstrap(req.access!));
    },
  );

  app.use(errorHandler);

  return app;
}
