import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { runFinancialNotificationAutomation } from "../services/financial-notification-automation.js";
import { runNotificationDispatchAutomation } from "../services/notification-dispatch-automation.js";

export const automationRouter = Router();

const automationRunSchema = z.object({
  limit_per_company: z.number().int().min(1).max(250).default(80),
});

const dispatchRunSchema = z.object({
  limit_per_run: z.number().int().min(1).max(500).default(120),
});

automationRouter.post("/financial-notifications/run", async (req, res, next) => {
  try {
    validateAutomationSecret(req.headers.authorization, req.headers["x-imobiflow-automation-secret"]);
    const input = automationRunSchema.parse(req.body ?? {});
    const summary = await runFinancialNotificationAutomation(input.limit_per_company);

    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

automationRouter.post("/notification-dispatch/run", async (req, res, next) => {
  try {
    validateAutomationSecret(req.headers.authorization, req.headers["x-imobiflow-automation-secret"]);
    const input = dispatchRunSchema.parse(req.body ?? {});
    const summary = await runNotificationDispatchAutomation(input.limit_per_run);

    res.json({ summary });
  } catch (error) {
    next(error);
  }
});

function validateAutomationSecret(authorization?: string, headerSecret?: string | string[]) {
  if (!env.NOTIFICATION_AUTOMATION_SECRET) {
    throw Object.assign(new Error("Segredo de automacao nao configurado."), { statusCode: 503 });
  }

  const bearerSecret = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
  const explicitSecret = Array.isArray(headerSecret) ? headerSecret[0] : headerSecret;
  const receivedSecret = explicitSecret || bearerSecret;

  if (receivedSecret !== env.NOTIFICATION_AUTOMATION_SECRET) {
    throw Object.assign(new Error("Automacao nao autorizada."), { statusCode: 401 });
  }
}
