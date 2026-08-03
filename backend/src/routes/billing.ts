import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, requireCompany } from "../middleware/auth.js";
import { listActivePlans } from "../services/plans.js";
import type { RequestWithAccess } from "../types/access.js";

export const billingRouter = Router();

const defaultKiwifyCheckoutUrls = {
  start: "https://pay.kiwify.com.br/YmVd46n",
  pro: "https://pay.kiwify.com.br/zlmmvgv",
  enterprise: "https://pay.kiwify.com.br/rbeAEEn",
} as const;

const checkoutSchema = z.object({
  gateway: z.enum(["kiwify", "cakto"]),
  plan: z.enum(["start", "pro", "enterprise"]),
});

const checkoutUrls: Record<string, string | undefined> = {
  "kiwify:start": env.KIWIFY_CHECKOUT_START_URL ?? defaultKiwifyCheckoutUrls.start,
  "kiwify:pro": env.KIWIFY_CHECKOUT_PRO_URL ?? defaultKiwifyCheckoutUrls.pro,
  "kiwify:enterprise": env.KIWIFY_CHECKOUT_ENTERPRISE_URL ?? defaultKiwifyCheckoutUrls.enterprise,
  "cakto:start": env.CAKTO_CHECKOUT_START_URL,
  "cakto:pro": env.CAKTO_CHECKOUT_PRO_URL,
  "cakto:enterprise": env.CAKTO_CHECKOUT_ENTERPRISE_URL,
};

billingRouter.get("/plans", async (_req, res, next) => {
  try {
    res.json({ plans: await listActivePlans() });
  } catch (error) {
    next(error);
  }
});

billingRouter.post("/checkout", requireAuth, requireCompany, (req: RequestWithAccess, res) => {
  const input = checkoutSchema.parse(req.body);
  const paymentUrl = checkoutUrls[`${input.gateway}:${input.plan}`];

  if (!paymentUrl) {
    return res.status(503).json({
      error: "CHECKOUT_NOT_CONFIGURED",
      message: "Checkout ainda não configurado para este plano.",
    });
  }

  res.json({
    gateway: input.gateway,
    plan: input.plan,
    paymentUrl,
    company_id: req.access?.company.id,
  });
});
