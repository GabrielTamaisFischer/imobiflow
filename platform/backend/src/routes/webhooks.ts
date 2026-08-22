import crypto from "node:crypto";
import { Router, type Request } from "express";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { processNotificationProviderWebhook } from "../services/notification-provider-webhooks.js";
import {
  normalizePaymentWebhookPayload,
  resolvePaymentWebhookSecret,
} from "../services/payment-webhook-normalizer.js";
import type { SubscriptionStatus } from "../types/access.js";

type Gateway = "kiwify" | "cakto";
type WebhookPayload = Record<string, unknown>;
type WebhookRequest = Request & { rawBody?: string };
type FinancialChargeStatus =
  | "pending"
  | "waiting_payment"
  | "processing"
  | "waiting_compensation"
  | "paid"
  | "overdue"
  | "cancelled"
  | "refunded"
  | "failed"
  | "disputed"
  | "transfer_pending"
  | "transferred";

export const webhooksRouter = Router();

const kiwifyPlanFallback = [
  { slug: "start-monthly", amount_cents: 7900, aliases: ["start", "imobiflow start"] },
  { slug: "pro-monthly", amount_cents: 19700, aliases: ["pro", "imobiflow pro"] },
  {
    slug: "enterprise-monthly",
    amount_cents: 49700,
    aliases: ["enterprise", "enterprise ai", "imobiflow enterprise"],
  },
] as const;

function getWebhookSecret(gateway: Gateway) {
  return gateway === "kiwify" ? env.KIWIFY_WEBHOOK_SECRET : env.CAKTO_WEBHOOK_SECRET;
}

function toHeaderValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function validateWebhook(gateway: Gateway, req: Request) {
  const expected = getWebhookSecret(gateway);
  if (!expected) return false;

  const authorization = toHeaderValue(req.headers.authorization)?.replace(/^Bearer\s+/i, "");
  const received =
    toHeaderValue(req.headers["x-imobiflow-webhook-secret"]) ??
    toHeaderValue(req.headers["x-kiwify-webhook-secret"]) ??
    toHeaderValue(req.headers["x-cakto-webhook-secret"]) ??
    toHeaderValue(req.headers["x-webhook-secret"]) ??
    toHeaderValue(req.query.secret) ??
    toHeaderValue(req.query.token) ??
    authorization;

  return received ? timingSafeEqual(received, expected) : false;
}

function validatePaymentWebhook(req: Request) {
  const provider = typeof req.params.provider === "string" ? req.params.provider.toLowerCase() : "";
  const expected = getPaymentWebhookSecret(provider);
  if (!expected) return false;

  const authorization = toHeaderValue(req.headers.authorization)?.replace(/^Bearer\s+/i, "");
  const received =
    toHeaderValue(req.headers["x-imobiflow-payment-webhook-secret"]) ??
    toHeaderValue(req.headers["x-imobiflow-webhook-secret"]) ??
    toHeaderValue(req.headers["x-webhook-secret"]) ??
    toHeaderValue(req.headers["asaas-access-token"]) ??
    toHeaderValue(req.headers["asaas_access_token"]) ??
    toHeaderValue(req.query.secret) ??
    toHeaderValue(req.query.token) ??
    authorization;

  return received ? timingSafeEqual(received, expected) : false;
}

function getPaymentWebhookSecret(provider: string) {
  return resolvePaymentWebhookSecret(provider, {
    fallback: env.PAYMENT_GATEWAY_WEBHOOK_SECRET,
    asaas: env.ASAAS_WEBHOOK_SECRET,
    iugu: env.IUGU_WEBHOOK_SECRET,
    pjbank: env.PJBANK_WEBHOOK_SECRET,
  });
}

function validateNotificationProviderWebhook(req: Request) {
  const expected = env.NOTIFICATION_PROVIDER_WEBHOOK_SECRET;
  if (!expected) return false;

  const authorization = toHeaderValue(req.headers.authorization)?.replace(/^Bearer\s+/i, "");
  const received =
    toHeaderValue(req.headers["x-imobiflow-notification-webhook-secret"]) ??
    toHeaderValue(req.headers["x-imobiflow-webhook-secret"]) ??
    toHeaderValue(req.headers["x-webhook-secret"]) ??
    toHeaderValue(req.query.secret) ??
    toHeaderValue(req.query.token) ??
    authorization;

  return received ? timingSafeEqual(received, expected) : false;
}

function isUuid(value: string | null) {
  return Boolean(
    value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  );
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findValue(input: unknown, keys: string[], depth = 0): unknown {
  if (!input || depth > 8) return undefined;

  const normalizedKeys = new Set(keys.map(normalizeKey));

  if (Array.isArray(input)) {
    for (const item of input) {
      const value = findValue(item, keys, depth + 1);
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
  }

  if (typeof input !== "object") return undefined;

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (normalizedKeys.has(normalizeKey(key)) && value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  for (const value of Object.values(input as Record<string, unknown>)) {
    const nested = findValue(value, keys, depth + 1);
    if (nested !== undefined && nested !== null && nested !== "") return nested;
  }

  return undefined;
}

function findString(payload: WebhookPayload, keys: string[]) {
  const value = findValue(payload, keys);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function findCustomVariableString(input: unknown, keys: string[], depth = 0): string | null {
  if (!input || depth > 8) return null;

  const normalizedKeys = new Set(keys.map(normalizeKey));

  if (Array.isArray(input)) {
    for (const item of input) {
      const value = findCustomVariableString(item, keys, depth + 1);
      if (value) return value;
    }
    return null;
  }

  if (typeof input !== "object") return null;

  const record = input as Record<string, unknown>;
  const name = readRecordString(record, ["name", "key", "variable", "field"]);
  const value = readRecordString(record, ["value", "content"]);

  if (name && value && normalizedKeys.has(normalizeKey(name))) {
    return value;
  }

  for (const nested of Object.values(record)) {
    const nestedValue = findCustomVariableString(nested, keys, depth + 1);
    if (nestedValue) return nestedValue;
  }

  return null;
}

function readRecordString(record: Record<string, unknown>, keys: string[]) {
  const normalizedKeys = new Set(keys.map(normalizeKey));

  for (const [key, value] of Object.entries(record)) {
    if (!normalizedKeys.has(normalizeKey(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}

function findDirectString(payload: WebhookPayload, keys: string[]) {
  const normalizedKeys = new Set(keys.map(normalizeKey));

  for (const [key, value] of Object.entries(payload)) {
    if (!normalizedKeys.has(normalizeKey(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}

function findRecord(payload: WebhookPayload, keys: string[], depth = 0): WebhookPayload | null {
  if (depth > 6) return null;

  const normalizedKeys = new Set(keys.map(normalizeKey));

  for (const [key, value] of Object.entries(payload)) {
    if (
      normalizedKeys.has(normalizeKey(key)) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      return value as WebhookPayload;
    }
  }

  for (const value of Object.values(payload)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nested = findRecord(value as WebhookPayload, keys, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function parseMoney(value: unknown, key?: string) {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (key?.toLowerCase().includes("cent")) return Math.round(value);
    return Number.isInteger(value) && value >= 1000 ? value : Math.round(value * 100);
  }

  if (typeof value !== "string") return null;

  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) return null;
  if (key?.toLowerCase().includes("cent")) return Math.round(parsed);

  return Number.isInteger(parsed) && parsed >= 1000 ? parsed : Math.round(parsed * 100);
}

function findAmountCents(input: unknown, depth = 0): number | null {
  if (!input || depth > 8) return null;

  if (Array.isArray(input)) {
    for (const item of input) {
      const amount = findAmountCents(item, depth + 1);
      if (amount && amount > 0) return amount;
    }
    return null;
  }

  if (typeof input !== "object") return null;

  const preferredKeys = [
    "amount_cents",
    "amount_in_cents",
    "amount_paid",
    "paid_amount",
    "total_amount",
    "total",
    "amount",
    "price",
    "value",
  ].map(normalizeKey);

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!preferredKeys.includes(normalizeKey(key))) continue;
    const amount = parseMoney(value, key);
    if (amount && amount > 0) return amount;
  }

  for (const value of Object.values(input as Record<string, unknown>)) {
    const nested = findAmountCents(value, depth + 1);
    if (nested && nested > 0) return nested;
  }

  return null;
}

function parseDate(payload: WebhookPayload, keys: string[]) {
  const value = findString(payload, keys);
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeStatus(eventName?: string, rawStatus?: string): SubscriptionStatus {
  const event = `${eventName ?? ""} ${rawStatus ?? ""}`.toLowerCase();

  if (
    event.includes("compra_aprovada") ||
    event.includes("subscription_renewed") ||
    event.includes("approved") ||
    event.includes("paid") ||
    event.includes("active")
  ) {
    return "active";
  }

  if (event.includes("boleto_gerado") || event.includes("pix_gerado") || event.includes("pending")) {
    return "pending";
  }

  if (
    event.includes("subscription_late") ||
    event.includes("past_due") ||
    event.includes("late") ||
    event.includes("refused") ||
    event.includes("failed") ||
    event.includes("recusada")
  ) {
    return "past_due";
  }

  if (event.includes("expired")) return "expired";

  if (
    event.includes("subscription_canceled") ||
    event.includes("compra_reembolsada") ||
    event.includes("chargeback") ||
    event.includes("cancel") ||
    event.includes("refund")
  ) {
    return "cancelled";
  }

  return "inactive";
}

function resolvePlanSlug(payload: WebhookPayload, amountCents: number | null) {
  const planSlug = findString(payload, ["plan_slug", "metadata_plan_slug"]);
  if (planSlug) return planSlug;

  const planText = [
    findString(payload, ["product_name", "product", "product_title", "offer_name", "plan_name"]),
    findString(payload, ["checkout_url", "payment_url", "url"]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const byText = kiwifyPlanFallback.find((plan) =>
    plan.aliases.some((alias) => planText.includes(alias)),
  );
  if (byText) return byText.slug;

  return kiwifyPlanFallback.find((plan) => plan.amount_cents === amountCents)?.slug ?? null;
}

async function resolvePlanId(payload: WebhookPayload, amountCents: number | null) {
  const slug = resolvePlanSlug(payload, amountCents);
  if (!slug) return null;

  const { data } = await supabaseAdmin
    .from("plans")
    .select("id")
    .eq("slug", slug)
    .maybeSingle<{ id: string }>();

  return data?.id ?? null;
}

async function resolveCompanyId(payload: WebhookPayload) {
  const directCompanyId = findString(payload, ["company_id", "metadata_company_id", "metadataCompanyId"]);
  if (directCompanyId) return directCompanyId;

  const customerEmail = findString(payload, [
    "customer_email",
    "buyer_email",
    "email",
    "customerEmail",
  ]);
  if (!customerEmail) return null;

  const { data } = await supabaseAdmin
    .from("users")
    .select("company_id")
    .ilike("email", customerEmail)
    .maybeSingle<{ company_id: string }>();

  return data?.company_id ?? null;
}

function buildScopedPayloadHash(scope: string, payload: WebhookPayload, rawBody?: string) {
  return crypto
    .createHash("sha256")
    .update(`${scope}:${rawBody ?? JSON.stringify(payload)}`)
    .digest("hex");
}

function buildPayloadHash(gateway: Gateway, payload: WebhookPayload, rawBody?: string) {
  return buildScopedPayloadHash(gateway, payload, rawBody);
}

function isMissingWebhookColumn(error: { code?: string; message: string }) {
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message.toLowerCase().includes("column")
  );
}

async function insertGatewayEvent(params: {
  gateway: Gateway;
  payload: WebhookPayload;
  companyId: string | null;
  eventName: string | null;
  externalEventId: string | null;
  gatewayOrderId: string | null;
  gatewaySubscriptionId: string | null;
  payloadHash: string;
}) {
  const enrichedPayload = {
    company_id: params.companyId,
    gateway: params.gateway,
    event_name: params.eventName,
    external_event_id: params.externalEventId,
    gateway_order_id: params.gatewayOrderId,
    gateway_subscription_id: params.gatewaySubscriptionId,
    payload_hash: params.payloadHash,
    payload: params.payload,
    processed_at: null,
  };

  const insert = await supabaseAdmin
    .from("gateway_events")
    .insert(enrichedPayload)
    .select("id")
    .single<{ id: string }>();

  if (!insert.error) return { id: insert.data.id, duplicate: false };

  if (insert.error.code === "23505") {
    const { data } = await supabaseAdmin
      .from("gateway_events")
      .select("id")
      .eq("gateway", params.gateway)
      .eq("payload_hash", params.payloadHash)
      .maybeSingle<{ id: string }>();

    return { id: data?.id ?? null, duplicate: true };
  }

  if (!isMissingWebhookColumn(insert.error)) throw insert.error;

  const fallback = await supabaseAdmin
    .from("gateway_events")
    .insert({
      company_id: params.companyId,
      gateway: params.gateway,
      event_name: params.eventName,
      payload: params.payload,
      processed_at: null,
    })
    .select("id")
    .single<{ id: string }>();

  if (fallback.error) throw fallback.error;
  return { id: fallback.data.id, duplicate: false };
}

async function markGatewayEvent(
  eventId: string | null,
  processed: boolean,
  errorMessage?: string,
) {
  if (!eventId) return;

  const payload = {
    processed_at: processed ? new Date().toISOString() : null,
    processing_error: errorMessage ?? null,
  };

  const update = await supabaseAdmin.from("gateway_events").update(payload).eq("id", eventId);

  if (update.error && isMissingWebhookColumn(update.error)) {
    await supabaseAdmin
      .from("gateway_events")
      .update({ processed_at: processed ? new Date().toISOString() : null })
      .eq("id", eventId);
  } else if (update.error) {
    throw update.error;
  }
}

async function processWebhook(gateway: Gateway, payload: WebhookPayload, rawBody?: string) {
  const eventName = findString(payload, ["event", "event_type", "webhook_event_type", "trigger", "type"]);
  const rawStatus = findString(payload, ["status", "order_status", "subscription_status"]);
  const status = normalizeStatus(eventName ?? undefined, rawStatus ?? undefined);
  const amountCents = findAmountCents(payload);
  const companyId = await resolveCompanyId(payload);
  const planId = await resolvePlanId(payload, amountCents);
  const externalEventId = findString(payload, ["event_id", "webhook_id", "notification_id"]);
  const gatewayOrderId = findString(payload, ["order_id", "orderId", "checkout_id", "sale_id"]);
  const gatewaySubscriptionId = findString(payload, [
    "subscription_id",
    "gateway_subscription_id",
    "subscriptionId",
  ]);
  const payloadHash = buildPayloadHash(gateway, payload, rawBody);
  const event = await insertGatewayEvent({
    gateway,
    payload,
    companyId,
    eventName,
    externalEventId,
    gatewayOrderId,
    gatewaySubscriptionId,
    payloadHash,
  });

  if (event.duplicate) {
    return { processed: true, duplicate: true, event_id: event.id, status };
  }

  if (!companyId) {
    await markGatewayEvent(event.id, false, "COMPANY_NOT_FOUND");
    return { processed: false, event_id: event.id, reason: "COMPANY_NOT_FOUND" };
  }

  const subscriptionPayload = {
    company_id: companyId,
    plan_id: planId,
    status,
    gateway,
    gateway_subscription_id: gatewaySubscriptionId ?? gatewayOrderId,
    starts_at: parseDate(payload, ["starts_at", "started_at", "paid_at", "approved_at"]) ?? undefined,
    expires_at: parseDate(payload, ["expires_at", "ended_at", "next_payment", "next_charge_at"]) ?? undefined,
    updated_at: new Date().toISOString(),
  };

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from("subscriptions")
    .upsert(subscriptionPayload, { onConflict: "company_id" })
    .select("id")
    .single<{ id: string }>();

  if (subscriptionError) throw subscriptionError;

  if (amountCents && amountCents > 0) {
    const paymentPayload = {
      company_id: companyId,
      subscription_id: subscription.id,
      gateway,
      gateway_payment_id: findString(payload, [
        "payment_id",
        "transaction_id",
        "transactionId",
        "order_id",
      ]),
      gateway_event_id: event.id,
      status,
      amount_cents: amountCents,
      paid_at: status === "active" ? new Date().toISOString() : null,
      raw_payload: payload,
    };

    const payment = await supabaseAdmin.from("payments").insert(paymentPayload);

    if (payment.error?.code === "23505") {
      // Idempotent replay: payment already persisted.
    } else if (payment.error && isMissingWebhookColumn(payment.error)) {
      const fallbackPayment = await supabaseAdmin.from("payments").insert({
        company_id: companyId,
        subscription_id: subscription.id,
        gateway,
        gateway_payment_id: paymentPayload.gateway_payment_id,
        status,
        amount_cents: amountCents,
        paid_at: status === "active" ? new Date().toISOString() : null,
        raw_payload: payload,
      });

      if (fallbackPayment.error?.code !== "23505" && fallbackPayment.error) {
        throw fallbackPayment.error;
      }
    } else if (payment.error) {
      throw payment.error;
    }
  }

  await markGatewayEvent(event.id, true);

  return { processed: true, duplicate: false, event_id: event.id, status };
}

for (const gateway of ["kiwify", "cakto"] as const) {
  webhooksRouter.post(`/${gateway}`, async (req: WebhookRequest, res, next) => {
    try {
      const isValid = validateWebhook(gateway, req);

      if (!isValid) {
        return res.status(401).json({
          error: "INVALID_WEBHOOK",
          message: "Webhook recusado por validação inválida.",
        });
      }

      const result = await processWebhook(gateway, req.body as WebhookPayload, req.rawBody);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}

function normalizeFinancialChargeStatus(eventName: string | null, rawStatus: string | null): FinancialChargeStatus {
  const value = `${eventName ?? ""} ${rawStatus ?? ""}`.toLowerCase();

  if (
    value.includes("received") ||
    value.includes("pix.received") ||
    value.includes("boleto.paid") ||
    value.includes("payment_received") ||
    value.includes("paid")
  ) {
    return "paid";
  }

  if (
    value.includes("confirmed") ||
    value.includes("payment_confirmed") ||
    value.includes("compensation")
  ) {
    return "waiting_compensation";
  }

  if (value.includes("overdue") || value.includes("vencid")) return "overdue";
  if (value.includes("delete") || value.includes("cancel")) return "cancelled";
  if (value.includes("refund") || value.includes("estorn")) return "refunded";
  if (value.includes("fail") || value.includes("refused") || value.includes("recus")) return "failed";
  if (value.includes("chargeback") || value.includes("dispute")) return "disputed";
  if (value.includes("processing")) return "processing";
  if (value.includes("pending") || value.includes("created")) return "waiting_payment";

  return "processing";
}

function normalizePaymentMethod(raw: string | null) {
  const value = raw?.toLowerCase() ?? "";
  if (value.includes("pix")) return "pix";
  if (value.includes("boleto") || value.includes("bank_slip")) return "boleto";
  if (value.includes("credit")) return "credit_card";
  if (value.includes("debit")) return "debit_card";
  if (value.includes("cash")) return "cash";
  return raw || "gateway";
}

function shouldApplyFinancialStatus(current: FinancialChargeStatus, next: FinancialChargeStatus) {
  if (current === next) return true;
  if (current === "transferred") return false;
  if (current === "transfer_pending" && next === "paid") return false;
  if (
    ["paid", "transfer_pending"].includes(current) &&
    ["waiting_payment", "processing", "waiting_compensation", "overdue"].includes(next)
  ) {
    return false;
  }
  if (current === "refunded" || current === "cancelled") return false;
  return true;
}

async function markLinkedFinancialRecords(input: {
  companyId: string;
  chargeId: string;
  statusAfter: FinancialChargeStatus;
}) {
  if (!["paid", "transfer_pending"].includes(input.statusAfter)) return;

  const [commissionUpdate, transferUpdate] = await Promise.all([
    supabaseAdmin
      .from("commissions")
      .update({ status: "approved" })
      .eq("company_id", input.companyId)
      .eq("charge_id", input.chargeId)
      .eq("status", "pending"),
    supabaseAdmin
      .from("owner_transfers")
      .update({ status: "approved" })
      .eq("company_id", input.companyId)
      .eq("charge_id", input.chargeId)
      .eq("status", "pending"),
  ]);

  if (commissionUpdate.error) throw commissionUpdate.error;
  if (transferUpdate.error) throw transferUpdate.error;
}

webhooksRouter.post("/notifications/:provider", async (req: WebhookRequest, res, next) => {
  try {
    if (!validateNotificationProviderWebhook(req)) {
      return res.status(401).json({
        error: "INVALID_NOTIFICATION_WEBHOOK",
        message: "Webhook de notificacao recusado por validacao invalida.",
      });
    }

    const provider = req.params.provider;
    if (!provider || Array.isArray(provider)) {
      return res.status(400).json({
        error: "INVALID_PROVIDER",
        message: "Provedor de notificacao invalido.",
      });
    }

    const payload = (req.body ?? {}) as WebhookPayload;
    const result = await processNotificationProviderWebhook({
      provider,
      payload,
      rawBody: req.rawBody,
    });

    res.json({
      ok: true,
      duplicated: result.duplicated,
      normalized_status: result.normalized_status,
      notification_event_id: result.notification_event?.id ?? null,
    });
  } catch (error) {
    next(error);
  }
});

webhooksRouter.post("/payments/:provider", async (req: WebhookRequest, res, next) => {
  try {
    if (!validatePaymentWebhook(req)) {
      return res.status(401).json({
        error: "INVALID_PAYMENT_WEBHOOK",
        message: "Webhook financeiro recusado por validação inválida.",
      });
    }

    const provider = String(req.params.provider ?? "unknown").toLowerCase();
    const payload = req.body as WebhookPayload;
    const {
      eventType,
      gatewayEventId,
      gatewayChargeId,
      internalChargeId,
      normalizedStatus,
      amountCents,
      paymentMethod,
      paidAt,
    } = normalizePaymentWebhookPayload(payload);
    const payloadHash = buildScopedPayloadHash(`payment:${provider}`, payload, req.rawBody);

    let chargeQuery = supabaseAdmin
      .from("financial_charges")
      .select("id, company_id, contract_id, owner_id, entry_id, status, gross_amount_cents, commission_amount_cents, fee_amount_cents, net_owner_amount_cents")
      .limit(1);

    if (isUuid(internalChargeId)) {
      chargeQuery = chargeQuery.eq("id", internalChargeId);
    } else if (gatewayChargeId) {
      chargeQuery = chargeQuery.eq("gateway_charge_id", gatewayChargeId);
    } else {
      return res.status(422).json({
        error: "PAYMENT_CHARGE_NOT_IDENTIFIED",
        message: "Webhook financeiro sem identificador de cobrança.",
      });
    }

    const { data: charges, error: chargeError } = await chargeQuery;
    if (chargeError) throw chargeError;

    const charge = charges?.[0];
    if (!charge) {
      await supabaseAdmin.from("financial_webhook_events").insert({
        provider,
        event_type: eventType,
        gateway_event_id: gatewayEventId,
        gateway_charge_id: gatewayChargeId,
        status_after: normalizedStatus,
        gross_amount_cents: amountCents,
        payload_hash: payloadHash,
        payment_method: paymentMethod,
        raw_payload: payload,
        error_message: "Cobrança não encontrada.",
      });

      return res.status(202).json({
        processed: false,
        reason: "charge_not_found",
      });
    }

    const eventInsert = await supabaseAdmin.from("financial_webhook_events").insert({
      company_id: charge.company_id,
      charge_id: charge.id,
      provider,
      event_type: eventType,
      gateway_event_id: gatewayEventId,
      gateway_charge_id: gatewayChargeId,
      status_before: charge.status,
      status_after: normalizedStatus,
      gross_amount_cents: amountCents ?? charge.gross_amount_cents,
      net_amount_cents: charge.net_owner_amount_cents,
      payload_hash: payloadHash,
      payment_method: paymentMethod,
      paid_at: normalizedStatus === "paid" ? paidAt : null,
      raw_payload: payload,
      processed_at: new Date().toISOString(),
      metadata: {
        provider,
        gateway_event_id: gatewayEventId,
        gateway_charge_id: gatewayChargeId,
      },
    });

    if (eventInsert.error?.code === "23505") {
      return res.json({ processed: true, duplicate: true, charge_id: charge.id });
    }

    if (eventInsert.error) throw eventInsert.error;

    const currentStatus = charge.status as FinancialChargeStatus;
    const statusAfter: FinancialChargeStatus =
      normalizedStatus === "paid" && charge.owner_id ? "transfer_pending" : normalizedStatus;
    const shouldUpdateCharge = shouldApplyFinancialStatus(currentStatus, statusAfter);
    const effectiveStatus = shouldUpdateCharge ? statusAfter : currentStatus;
    const chargeUpdate: Record<string, unknown> = { status: effectiveStatus };
    if (["paid", "transfer_pending"].includes(effectiveStatus)) chargeUpdate.paid_at = paidAt;

    if (shouldUpdateCharge) {
      const { error: updateChargeError } = await supabaseAdmin
        .from("financial_charges")
        .update(chargeUpdate)
        .eq("id", charge.id)
        .eq("company_id", charge.company_id);

      if (updateChargeError) throw updateChargeError;
    }

    if (["paid", "transfer_pending"].includes(effectiveStatus) && charge.entry_id) {
      const payment = await supabaseAdmin.from("financial_payments").insert({
        company_id: charge.company_id,
        entry_id: charge.entry_id,
        amount_cents: amountCents ?? charge.gross_amount_cents,
        payment_method: paymentMethod,
        paid_at: paidAt,
        source: `webhook:${provider}`,
        gateway_event_id: gatewayEventId,
        gateway_charge_id: gatewayChargeId,
        notes: `Pagamento confirmado automaticamente via webhook ${provider}.`,
        metadata: {
          event_type: eventType,
          normalized_status: normalizedStatus,
        },
      });

      if (payment.error?.code !== "23505" && payment.error) throw payment.error;

      const { error: entryError } = await supabaseAdmin
        .from("financial_entries")
        .update({
          status: "paid",
          paid_at: paidAt,
          payment_method: paymentMethod,
        })
        .eq("id", charge.entry_id)
        .eq("company_id", charge.company_id);

      if (entryError) throw entryError;

      await markLinkedFinancialRecords({
        companyId: charge.company_id,
        chargeId: charge.id,
        statusAfter: effectiveStatus,
      });
    }

    const { error: auditError } = await supabaseAdmin.from("financial_audit_logs").insert({
      company_id: charge.company_id,
      charge_id: charge.id,
      entry_id: charge.entry_id,
      contract_id: charge.contract_id,
      owner_id: charge.owner_id,
      event_type: `payment_webhook.${eventType}`,
      gateway_event_id: gatewayEventId,
      gateway_charge_id: gatewayChargeId,
      gross_amount_cents: amountCents ?? charge.gross_amount_cents,
      net_amount_cents: charge.net_owner_amount_cents,
      commission_amount_cents: charge.commission_amount_cents,
      fee_amount_cents: charge.fee_amount_cents,
      status_before: charge.status,
      status_after: effectiveStatus,
      metadata: {
        provider,
        event_type: eventType,
        normalized_status: normalizedStatus,
        charge_updated: shouldUpdateCharge,
      },
    });

    if (auditError) throw auditError;

    res.json({
      processed: true,
      status: effectiveStatus,
      gateway_status: normalizedStatus,
      charge_id: charge.id,
      charge_updated: shouldUpdateCharge,
    });
  } catch (error) {
    next(error);
  }
});
