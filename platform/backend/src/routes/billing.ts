import { Router } from "express";
import { z } from "zod";
import {
  createCanonicalCheckout,
  createSyntheticProvisioning,
  listCanonicalPlans,
} from "../services/billing-provisioning.js";

export const billingRouter = Router();

const checkoutSchema = z.object({
  plan_slug: z.string().trim().min(1).max(80),
  email: z.string().email().max(180),
  // Explicitly rejected so the client cannot supply commercial truth.
  plan_id: z.never().optional(),
  company_id: z.never().optional(),
  amount_cents: z.never().optional(),
  payment_status: z.never().optional(),
});
const syntheticProvisioningSchema = z.object({
  email: z.string().email().max(180),
  plan_slug: z.literal("staging-synthetic").optional(),
  company_id: z.never().optional(),
  payment_status: z.never().optional(),
});

billingRouter.get("/plans", async (_req, res, next) => {
  try {
    res.json({ plans: await listCanonicalPlans() });
  } catch (error) {
    next(error);
  }
});

billingRouter.post("/checkout", async (req, res, next) => {
  try {
    const input = checkoutSchema.parse(req.body);
    const checkout = await createCanonicalCheckout({
      planSlug: input.plan_slug,
      purchaserEmail: input.email,
    });
    res.status(201).json({
      checkout_session_id: checkout.id,
      checkout_url: checkout.checkoutUrl,
      status: checkout.status,
    });
  } catch (error) {
    next(error);
  }
});

billingRouter.post("/internal/synthetic-provisioning", async (req, res, next) => {
  try {
    const input = syntheticProvisioningSchema.parse(req.body);
    const created = await createSyntheticProvisioning(
      { purchaserEmail: input.email, planSlug: input.plan_slug },
      req.header("x-imobiflow-admin-secret"),
    );
    res.status(201).json({
      synthetic: true,
      checkout_session_id: created.checkout.id,
      provisioning_id: created.provisioning.id,
      activation_url: created.activationUrl,
      expires_at: created.provisioning.expiresAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
