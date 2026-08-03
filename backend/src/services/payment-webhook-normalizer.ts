type WebhookPayload = Record<string, unknown>;

export type FinancialChargeStatus =
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

export type PaymentWebhookSecrets = {
  fallback?: string;
  asaas?: string;
  iugu?: string;
  pjbank?: string;
};

export function resolvePaymentWebhookSecret(provider: string, secrets: PaymentWebhookSecrets) {
  const normalizedProvider = provider.toLowerCase();
  if (normalizedProvider === "asaas") return secrets.asaas ?? secrets.fallback;
  if (normalizedProvider === "iugu") return secrets.iugu ?? secrets.fallback;
  if (normalizedProvider === "pjbank") return secrets.pjbank ?? secrets.fallback;
  return secrets.fallback;
}

export function normalizePaymentWebhookPayload(payload: WebhookPayload, receivedAt = new Date()) {
  const paymentPayload = findRecord(payload, ["payment", "charge", "transaction", "invoice", "data"]) ?? payload;
  const eventType = findString(payload, ["event", "event_type", "type", "trigger"]) ?? "payment.event";
  const gatewayEventId =
    findDirectString(payload, ["event_id", "webhook_id", "notification_id", "id"]) ??
    findString(payload, ["event_id", "webhook_id", "notification_id"]);
  const gatewayChargeId =
    findString(paymentPayload, [
      "id",
      "gateway_charge_id",
      "charge_id",
      "payment_id",
      "transaction_id",
      "invoice_id",
    ]) ??
    findString(payload, [
      "gateway_charge_id",
      "charge_id",
      "payment_id",
      "transaction_id",
      "invoice_id",
    ]);
  const internalChargeId =
    findString(paymentPayload, [
      "imobiflow_charge_id",
      "internal_charge_id",
      "external_reference",
      "external_id",
    ]) ??
    findCustomVariableString(paymentPayload, [
      "imobiflow_charge_id",
      "internal_charge_id",
      "external_reference",
      "external_id",
    ]) ??
    findString(payload, [
      "imobiflow_charge_id",
      "internal_charge_id",
      "external_reference",
      "external_id",
    ]) ??
    findCustomVariableString(payload, [
      "imobiflow_charge_id",
      "internal_charge_id",
      "external_reference",
      "external_id",
    ]);
  const rawStatus = findString(paymentPayload, ["status", "payment_status", "charge_status"]);
  const normalizedStatus = normalizeFinancialChargeStatus(eventType, rawStatus);
  const amountCents = findAmountCents(paymentPayload) ?? findAmountCents(payload);
  const paymentMethod = normalizePaymentMethod(
    findString(paymentPayload, ["payment_method", "billing_type", "billingType", "method"]),
  );
  const paidAt =
    parseDate(paymentPayload, [
      "paid_at",
      "confirmed_at",
      "payment_date",
      "clientPaymentDate",
      "received_at",
      "paymentDate",
      "confirmedDate",
    ]) ?? receivedAt.toISOString();

  return {
    paymentPayload,
    eventType,
    gatewayEventId,
    gatewayChargeId,
    internalChargeId,
    rawStatus,
    normalizedStatus,
    amountCents,
    paymentMethod,
    paidAt,
  };
}

export function normalizeFinancialChargeStatus(
  eventName: string | null,
  rawStatus: string | null,
): FinancialChargeStatus {
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
