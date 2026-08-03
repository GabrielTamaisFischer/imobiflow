import crypto from "node:crypto";
import { supabaseAdmin } from "../lib/supabase.js";

type NotificationWebhookPayload = Record<string, unknown>;
type NormalizedNotificationStatus = "sent" | "delivered" | "read" | "failed" | "bounced" | "blocked";

type NotificationEventForWebhook = {
  id: string;
  company_id: string;
  channel: "email" | "whatsapp" | "sms" | "system";
  provider: string;
  provider_message_id: string | null;
  attempt_count: number;
  provider_response: Record<string, unknown>;
};

export async function processNotificationProviderWebhook(input: {
  provider: string;
  payload: NotificationWebhookPayload;
  rawBody?: string;
}) {
  const provider = input.provider.toLowerCase();
  const rawBody = input.rawBody || JSON.stringify(input.payload);
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const providerEventId = findString(input.payload, ["event_id", "webhook_id", "id"]);
  const providerMessageId = findString(input.payload, [
    "provider_message_id",
    "message_id",
    "messageId",
    "wamid",
    "external_id",
    "notification_id",
  ]);
  const internalEventId = findString(input.payload, [
    "notification_event_id",
    "notificationEventId",
    "metadata.notification_event_id",
  ]);
  const eventType = findString(input.payload, ["event", "event_type", "type", "status", "delivery_status"]);
  const normalizedStatus = normalizeNotificationStatus(eventType, input.payload);

  const existingWebhook = await findExistingWebhook(provider, payloadHash);
  if (existingWebhook) {
    return {
      duplicated: true,
      webhook_event: existingWebhook,
      notification_event: null,
      normalized_status: normalizedStatus,
    };
  }

  const notificationEvent = await findNotificationEvent({
    provider,
    providerMessageId,
    internalEventId,
  });
  const webhookEvent = await insertProviderWebhookEvent({
    provider,
    providerEventId,
    providerMessageId,
    normalizedStatus,
    payloadHash,
    payload: input.payload,
    notificationEvent,
  });

  if (!notificationEvent || !normalizedStatus) {
    return {
      duplicated: false,
      webhook_event: webhookEvent,
      notification_event: notificationEvent,
      normalized_status: normalizedStatus,
    };
  }

  const updatedEvent = await updateNotificationEventFromProvider(
    notificationEvent,
    normalizedStatus,
    provider,
    providerMessageId,
    input.payload,
  );

  await insertDeliveryAttemptFromWebhook({
    event: updatedEvent,
    provider,
    status: normalizedStatus,
    payload: input.payload,
  });

  await markWebhookProcessed(webhookEvent.id, updatedEvent.company_id, updatedEvent.id);

  return {
    duplicated: false,
    webhook_event: webhookEvent,
    notification_event: updatedEvent,
    normalized_status: normalizedStatus,
  };
}

async function findExistingWebhook(provider: string, payloadHash: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_provider_webhook_events")
    .select("id, provider, payload_hash, processed_at")
    .eq("provider", provider)
    .eq("payload_hash", payloadHash)
    .maybeSingle<{ id: string; provider: string; payload_hash: string; processed_at: string | null }>();

  if (error) throw error;
  return data;
}

async function insertProviderWebhookEvent(input: {
  provider: string;
  providerEventId: string | null;
  providerMessageId: string | null;
  normalizedStatus: NormalizedNotificationStatus | null;
  payloadHash: string;
  payload: NotificationWebhookPayload;
  notificationEvent: NotificationEventForWebhook | null;
}) {
  const { data, error } = await supabaseAdmin
    .from("notification_provider_webhook_events")
    .insert({
      company_id: input.notificationEvent?.company_id ?? null,
      notification_event_id: input.notificationEvent?.id ?? null,
      provider: input.provider,
      provider_event_id: input.providerEventId,
      provider_message_id: input.providerMessageId,
      event_type: input.normalizedStatus,
      normalized_status: input.normalizedStatus,
      payload_hash: input.payloadHash,
      payload: input.payload,
    })
    .select("id, company_id, notification_event_id, provider, normalized_status, processed_at")
    .single<{ id: string; company_id: string | null; notification_event_id: string | null; provider: string; normalized_status: string | null; processed_at: string | null }>();

  if (error) throw error;
  return data;
}

async function findNotificationEvent(input: {
  provider: string;
  providerMessageId: string | null;
  internalEventId: string | null;
}) {
  if (input.internalEventId && isUuid(input.internalEventId)) {
    const { data, error } = await supabaseAdmin
      .from("notification_events")
      .select("id, company_id, channel, provider, provider_message_id, attempt_count, provider_response")
      .eq("id", input.internalEventId)
      .maybeSingle<NotificationEventForWebhook>();

    if (error) throw error;
    if (data) return data;
  }

  if (!input.providerMessageId) return null;

  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .select("id, company_id, channel, provider, provider_message_id, attempt_count, provider_response")
    .eq("provider_message_id", input.providerMessageId)
    .or(`provider.eq.${input.provider},provider.is.null`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<NotificationEventForWebhook>();

  if (error) throw error;
  return data;
}

async function updateNotificationEventFromProvider(
  event: NotificationEventForWebhook,
  status: NormalizedNotificationStatus,
  provider: string,
  providerMessageId: string | null,
  payload: NotificationWebhookPayload,
) {
  const now = new Date().toISOString();
  const isFailure = ["failed", "bounced", "blocked"].includes(status);
  const update = {
    status,
    provider,
    provider_message_id: providerMessageId || event.provider_message_id,
    sent_at: status === "sent" ? now : undefined,
    delivered_at: ["delivered", "read"].includes(status) ? now : undefined,
    failed_at: isFailure ? now : null,
    failure_reason: isFailure ? findString(payload, ["reason", "error", "error_message", "failure_reason"]) ?? status : null,
    provider_response: {
      ...(event.provider_response ?? {}),
      last_webhook: payload,
    },
    updated_at: now,
  };

  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .update(update)
    .eq("id", event.id)
    .select("id, company_id, channel, provider, provider_message_id, attempt_count, provider_response")
    .single<NotificationEventForWebhook>();

  if (error) throw error;
  return data;
}

async function insertDeliveryAttemptFromWebhook(input: {
  event: NotificationEventForWebhook;
  provider: string;
  status: NormalizedNotificationStatus;
  payload: NotificationWebhookPayload;
}) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from("notification_delivery_attempts").insert({
    company_id: input.event.company_id,
    notification_event_id: input.event.id,
    channel: input.event.channel,
    provider: input.provider,
    attempt_number: Math.max(input.event.attempt_count, 1),
    status: input.status,
    request_payload: {},
    response_payload: input.payload,
    error_message: ["failed", "bounced", "blocked"].includes(input.status)
      ? findString(input.payload, ["reason", "error", "error_message", "failure_reason"]) ?? input.status
      : null,
    started_at: now,
    finished_at: now,
  });

  if (error) throw error;
}

async function markWebhookProcessed(webhookId: string, companyId: string, notificationEventId: string) {
  const { error } = await supabaseAdmin
    .from("notification_provider_webhook_events")
    .update({
      company_id: companyId,
      notification_event_id: notificationEventId,
      processed_at: new Date().toISOString(),
    })
    .eq("id", webhookId);

  if (error) throw error;
}

function normalizeNotificationStatus(value: string | null, payload: NotificationWebhookPayload) {
  const statusValue = `${value ?? ""} ${findString(payload, ["status", "delivery_status", "state"]) ?? ""}`.toLowerCase();

  if (statusValue.includes("read") || statusValue.includes("opened")) return "read";
  if (statusValue.includes("deliver")) return "delivered";
  if (statusValue.includes("bounce")) return "bounced";
  if (statusValue.includes("block") || statusValue.includes("spam")) return "blocked";
  if (statusValue.includes("fail") || statusValue.includes("error") || statusValue.includes("reject")) return "failed";
  if (statusValue.includes("sent") || statusValue.includes("send")) return "sent";

  return null;
}

function findString(payload: NotificationWebhookPayload, keys: string[]) {
  for (const key of keys) {
    const directValue = readPath(payload, key);
    if (typeof directValue === "string" && directValue.trim()) return directValue.trim();
    if (typeof directValue === "number" && Number.isFinite(directValue)) return String(directValue);
  }

  return findNestedString(payload, keys);
}

function readPath(payload: NotificationWebhookPayload, path: string) {
  const parts = path.split(".");
  let current: unknown = payload;

  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

function findNestedString(input: unknown, keys: string[], depth = 0): string | null {
  if (!input || depth > 8) return null;
  if (typeof input !== "object") return null;

  const normalizedKeys = new Set(keys.map(normalizeKey));

  if (Array.isArray(input)) {
    for (const item of input) {
      const value = findNestedString(item, keys, depth + 1);
      if (value) return value;
    }
    return null;
  }

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!normalizedKeys.has(normalizeKey(key))) continue;
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  for (const value of Object.values(input as Record<string, unknown>)) {
    const nested = findNestedString(value, keys, depth + 1);
    if (nested) return nested;
  }

  return null;
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isUuid(value: string | null) {
  return Boolean(
    value?.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  );
}
