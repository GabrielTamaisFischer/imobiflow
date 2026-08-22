import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { sendAuthenticationEmail } from "./auth-email.js";
import {
  type BillingProvider,
  getConfiguredBillingProvider,
  type VerifiedPaymentEvent,
} from "./billing-provider.js";
import { authError, hashOpaqueToken, normalizeEmail } from "./mysql-auth.js";

type BillingDatabase = PrismaClient | Prisma.TransactionClient;
const activationLifetimeMs = 24 * 60 * 60 * 1000;

export async function listCanonicalPlans(database: BillingDatabase = getPrisma()) {
  const plans = await database.plan.findMany({
    where: { active: true, isSynthetic: false },
    orderBy: [{ priceCents: "asc" }, { slug: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      billingInterval: true,
      priceCents: true,
      currency: true,
      featuresJson: true,
    },
  });
  return plans.map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    billing_interval: plan.billingInterval,
    price_cents: plan.priceCents,
    currency: plan.currency,
    features: Array.isArray(plan.featuresJson) ? plan.featuresJson : [],
  }));
}

export async function createCanonicalCheckout(
  input: { planSlug: string; purchaserEmail: string },
  database: PrismaClient = getPrisma(),
  provider: BillingProvider | null = getConfiguredBillingProvider(),
) {
  const plan = await database.plan.findFirst({
    where: { slug: input.planSlug, active: true, isSynthetic: false },
  });
  if (!plan) throw authError("PLAN_NOT_FOUND", "Plano indisponivel.", 404);
  if (!provider) {
    throw authError(
      "CHECKOUT_NOT_CONFIGURED",
      "O checkout comercial ainda nao esta configurado. Fale com a equipe ImobiFlow.",
      503,
    );
  }

  const purchaserEmail = normalizeEmail(input.purchaserEmail);
  const checkout = await database.checkoutSession.create({
    data: {
      planId: plan.id,
      provider: provider.name,
      purchaserEmail,
      status: "PENDING",
      amountCents: plan.priceCents,
      currency: plan.currency,
    },
  });
  try {
    const providerCheckout = await provider.createCheckout({
      checkoutSessionId: checkout.id,
      purchaserEmail,
      plan,
      successUrl: `${env.FRONTEND_URL ?? env.APP_URL}/cadastro`,
      cancelUrl: `${env.FRONTEND_URL ?? env.APP_URL}/planos`,
    });
    return await database.checkoutSession.update({
      where: { id: checkout.id },
      data: {
        externalSessionId: providerCheckout.externalSessionId,
        checkoutUrl: providerCheckout.checkoutUrl,
        expiresAt: providerCheckout.expiresAt ?? null,
      },
    });
  } catch (error) {
    await database.checkoutSession.update({
      where: { id: checkout.id },
      data: { status: "FAILED" },
    });
    throw error;
  }
}

export async function acceptVerifiedPaymentEvent(
  event: VerifiedPaymentEvent,
  database: PrismaClient = getPrisma(),
) {
  const checkout = await database.checkoutSession.findFirst({
    where: {
      provider: event.provider,
      externalSessionId: event.externalSessionId,
      purchaserEmail: normalizeEmail(event.purchaserEmail),
      status: { in: ["PENDING", "PAYMENT_CONFIRMED"] },
    },
    include: { plan: true, provisioning: true },
  });
  if (!checkout) throw authError("CHECKOUT_NOT_FOUND", "Checkout nao encontrado.", 404);
  if (checkout.amountCents !== event.amountCents || checkout.currency !== event.currency) {
    throw authError("PAYMENT_MISMATCH", "Pagamento nao corresponde ao checkout.", 409);
  }
  if (checkout.provisioning) return { provisioning: checkout.provisioning, activationToken: null };

  const activationToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const provisioning = await database.$transaction(async (transaction) => {
    await transaction.paymentEvent.create({
      data: {
        checkoutSessionId: checkout.id,
        provider: event.provider,
        externalEventId: event.externalEventId,
        eventType: event.eventType,
        status: "VERIFIED",
        amountCents: event.amountCents,
        currency: event.currency,
        payloadHash: event.payloadHash,
        occurredAt: event.occurredAt,
        processedAt: now,
      },
    });
    await transaction.checkoutSession.update({
      where: { id: checkout.id },
      data: {
        status: "PAYMENT_CONFIRMED",
        confirmedAt: now,
        externalSubscriptionId: event.externalSubscriptionId ?? null,
      },
    });
    return transaction.accountProvisioning.create({
      data: {
        checkoutSessionId: checkout.id,
        planId: checkout.planId,
        purchaserEmail: checkout.purchaserEmail,
        tokenHash: hashOpaqueToken(activationToken),
        status: "READY",
        expiresAt: new Date(now.getTime() + activationLifetimeMs),
      },
    });
  });
  await sendActivationLink(checkout.purchaserEmail, activationToken);
  return { provisioning, activationToken: null };
}

export async function createSyntheticProvisioning(
  input: { purchaserEmail: string; planSlug?: string },
  suppliedSecret: string | undefined,
  database: PrismaClient = getPrisma(),
) {
  assertSyntheticProvisioningAllowed(suppliedSecret);
  const purchaserEmail = normalizeEmail(input.purchaserEmail);
  if (!purchaserEmail.endsWith(".test")) {
    throw authError("SYNTHETIC_EMAIL_REQUIRED", "Use um e-mail sintetico terminado em .test.", 400);
  }
  const planSlug = input.planSlug ?? "staging-synthetic";
  if (planSlug !== "staging-synthetic") {
    throw authError("SYNTHETIC_PLAN_REQUIRED", "Somente o plano sintetico e permitido.", 400);
  }
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const externalSessionId = `synthetic-session-${randomUUID()}`;
  const externalEventId = `synthetic-event-${randomUUID()}`;
  const created = await database.$transaction(async (transaction) => {
    const plan = await transaction.plan.upsert({
      where: { slug: "staging-synthetic" },
      update: { active: true, isSynthetic: true },
      create: {
        slug: "staging-synthetic",
        name: "Plano sintetico de staging",
        description: "Exclusivo para validacao automatizada fora de producao.",
        billingInterval: "monthly",
        priceCents: 0,
        currency: "BRL",
        active: true,
        isSynthetic: true,
        featuresJson: ["synthetic-test-only"],
      },
    });
    const checkout = await transaction.checkoutSession.create({
      data: {
        planId: plan.id,
        provider: "synthetic-staging",
        externalSessionId,
        purchaserEmail,
        status: "PAYMENT_CONFIRMED",
        amountCents: 0,
        currency: "BRL",
        confirmedAt: now,
        expiresAt: new Date(now.getTime() + activationLifetimeMs),
        isSynthetic: true,
        metadataJson: { synthetic: true, environment: env.NODE_ENV },
      },
    });
    await transaction.paymentEvent.create({
      data: {
        checkoutSessionId: checkout.id,
        provider: "synthetic-staging",
        externalEventId,
        eventType: "SYNTHETIC_PAYMENT_CONFIRMED",
        status: "VERIFIED",
        amountCents: 0,
        currency: "BRL",
        payloadHash: createHash("sha256").update(externalEventId).digest("hex"),
        occurredAt: now,
        processedAt: now,
        isSynthetic: true,
        metadataJson: { synthetic: true },
      },
    });
    const provisioning = await transaction.accountProvisioning.create({
      data: {
        checkoutSessionId: checkout.id,
        planId: plan.id,
        purchaserEmail,
        tokenHash: hashOpaqueToken(token),
        status: "READY",
        expiresAt: new Date(now.getTime() + activationLifetimeMs),
        isSynthetic: true,
        metadataJson: { synthetic: true, environment: env.NODE_ENV },
      },
    });
    return { checkout, plan, provisioning };
  });
  return {
    ...created,
    activationToken: token,
    activationUrl: `${env.FRONTEND_URL ?? env.APP_URL}/ativar-conta?token=${encodeURIComponent(token)}`,
  };
}

export function assertSyntheticProvisioningAllowed(suppliedSecret?: string) {
  if (env.NODE_ENV === "production") {
    throw authError("NOT_FOUND", "Recurso nao encontrado.", 404);
  }
  if (env.ALLOW_SYNTHETIC_BILLING_PROVISIONING !== "true") {
    throw authError(
      "SYNTHETIC_PROVISIONING_DISABLED",
      "Provisionamento sintetico desabilitado.",
      403,
    );
  }
  const expected = env.SYNTHETIC_BILLING_ADMIN_SECRET?.trim();
  if (
    !expected ||
    expected.length < 32 ||
    !suppliedSecret ||
    !safeEqual(expected, suppliedSecret)
  ) {
    throw authError("SYNTHETIC_PROVISIONING_FORBIDDEN", "Credencial administrativa invalida.", 403);
  }
}

async function sendActivationLink(email: string, token: string) {
  const url = `${env.FRONTEND_URL ?? env.APP_URL}/ativar-conta?token=${encodeURIComponent(token)}`;
  await sendAuthenticationEmail({
    to: email,
    subject: "Ative sua conta ImobiFlow",
    body: `O pagamento foi confirmado. Ative sua conta pelo link de uso unico: ${url}`,
    action: "account_activation",
  });
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
