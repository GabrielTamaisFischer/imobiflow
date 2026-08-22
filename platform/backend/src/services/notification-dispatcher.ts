import { env } from "../config/env.js";
import { supabaseAdmin } from "../lib/supabase.js";

export const dispatchEventSelect =
  "id, company_id, template_id, channel, direction, recipient_type, recipient_id, recipient_name, recipient_contact, subject, body, status, provider, provider_message_id, related_entity_type, related_entity_id, metadata, created_by, sent_at, scheduled_for, queued_at, last_attempt_at, delivered_at, failed_at, attempt_count, max_attempts, failure_reason, provider_response, created_at, updated_at";

type NotificationChannel = "email" | "whatsapp" | "sms" | "system";
type NotificationStatus =
  | "draft"
  | "prepared"
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "bounced"
  | "blocked"
  | "cancelled";

export type DispatchNotificationEvent = {
  id: string;
  company_id: string;
  template_id: string | null;
  channel: NotificationChannel;
  direction: "outbound" | "inbound";
  recipient_type: string;
  recipient_id: string | null;
  recipient_name: string | null;
  recipient_contact: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  provider: string;
  provider_message_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  sent_at: string | null;
  scheduled_for: string | null;
  queued_at: string | null;
  last_attempt_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  attempt_count: number;
  max_attempts: number;
  failure_reason: string | null;
  provider_response: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type QueueInput = {
  eventId: string;
  companyId: string;
  scheduledFor?: string | null;
};

type DispatchInput = {
  eventId: string;
  companyId: string;
  provider?: string | null;
};

type ManualDeliveryInput = {
  eventId: string;
  companyId: string;
  provider?: string | null;
  providerMessageId?: string | null;
  status?: "sent" | "delivered" | "read";
  responsePayload?: Record<string, unknown>;
};

export async function queueNotificationEvent(input: QueueInput) {
  const event = await loadDispatchEvent(input.eventId, input.companyId);

  if (["sent", "delivered", "read", "cancelled"].includes(event.status)) {
    throw Object.assign(new Error("Esta notificacao nao pode voltar para a fila."), {
      statusCode: 409,
    });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .update({
      status: "queued",
      queued_at: event.queued_at ?? now,
      scheduled_for: input.scheduledFor ?? event.scheduled_for ?? now,
      failure_reason: null,
      failed_at: null,
      updated_at: now,
    })
    .eq("id", input.eventId)
    .eq("company_id", input.companyId)
    .select(dispatchEventSelect)
    .single<DispatchNotificationEvent>();

  if (error) throw error;
  return data;
}

export async function dispatchNotificationEvent(input: DispatchInput) {
  const event = await loadDispatchEvent(input.eventId, input.companyId);

  if (!["prepared", "queued", "failed"].includes(event.status)) {
    throw Object.assign(new Error("Esta notificacao nao esta pronta para envio."), {
      statusCode: 409,
    });
  }

  if (event.attempt_count >= event.max_attempts) {
    throw Object.assign(new Error("Limite de tentativas de envio atingido."), {
      statusCode: 409,
    });
  }

  const provider = resolveProvider(event.channel, input.provider ?? event.provider);
  const attemptNumber = event.attempt_count + 1;
  const startedAt = new Date().toISOString();
  const requestPayload = buildProviderPayload(event);

  if (!provider.url) {
    const attempt = await insertDeliveryAttempt({
      event,
      providerName: provider.name,
      attemptNumber,
      status: "skipped",
      requestPayload,
      responsePayload: {},
      errorMessage: "PROVIDER_NOT_CONFIGURED",
      startedAt,
    });
    const updatedEvent = await updateDispatchFailure(event, attemptNumber, "PROVIDER_NOT_CONFIGURED", {
      provider: provider.name,
      reason: "Missing provider URL/token in environment",
    });

    return { event: updatedEvent, attempt, dispatched: false, reason: "PROVIDER_NOT_CONFIGURED" };
  }

  try {
    const response = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(provider.token ? { Authorization: `Bearer ${provider.token}` } : {}),
      },
      body: JSON.stringify(requestPayload),
    });

    const responsePayload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const attempt = await insertDeliveryAttempt({
        event,
        providerName: provider.name,
        attemptNumber,
        status: "failed",
        requestPayload,
        responsePayload,
        errorMessage: `PROVIDER_HTTP_${response.status}`,
        startedAt,
      });
      const updatedEvent = await updateDispatchFailure(
        event,
        attemptNumber,
        `PROVIDER_HTTP_${response.status}`,
        responsePayload,
      );

      return { event: updatedEvent, attempt, dispatched: false, reason: `PROVIDER_HTTP_${response.status}` };
    }

    const providerMessageId = extractProviderMessageId(responsePayload);
    const attempt = await insertDeliveryAttempt({
      event,
      providerName: provider.name,
      attemptNumber,
      status: "sent",
      requestPayload,
      responsePayload,
      errorMessage: null,
      startedAt,
    });
    const updatedEvent = await updateDispatchSuccess(event, attemptNumber, provider.name, providerMessageId, responsePayload);

    return { event: updatedEvent, attempt, dispatched: true, reason: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROVIDER_REQUEST_FAILED";
    const attempt = await insertDeliveryAttempt({
      event,
      providerName: provider.name,
      attemptNumber,
      status: "failed",
      requestPayload,
      responsePayload: {},
      errorMessage: message,
      startedAt,
    });
    const updatedEvent = await updateDispatchFailure(event, attemptNumber, message, {});

    return { event: updatedEvent, attempt, dispatched: false, reason: message };
  }
}

export async function registerManualNotificationDelivery(input: ManualDeliveryInput) {
  const event = await loadDispatchEvent(input.eventId, input.companyId);
  const now = new Date().toISOString();
  const status = input.status ?? "sent";
  const providerName = input.provider || "manual";
  const attemptNumber = event.attempt_count + 1;
  const responsePayload = input.responsePayload ?? {};

  const attempt = await insertDeliveryAttempt({
    event,
    providerName,
    attemptNumber,
    status,
    requestPayload: { manual: true },
    responsePayload,
    errorMessage: null,
    startedAt: now,
  });

  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .update({
      status,
      provider: providerName,
      provider_message_id: input.providerMessageId || event.provider_message_id,
      attempt_count: attemptNumber,
      last_attempt_at: now,
      sent_at: event.sent_at ?? now,
      delivered_at: ["delivered", "read"].includes(status) ? now : event.delivered_at,
      failed_at: null,
      failure_reason: null,
      provider_response: responsePayload,
      updated_at: now,
    })
    .eq("id", event.id)
    .eq("company_id", input.companyId)
    .select(dispatchEventSelect)
    .single<DispatchNotificationEvent>();

  if (error) throw error;
  return { event: data, attempt };
}

async function loadDispatchEvent(eventId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .select(dispatchEventSelect)
    .eq("id", eventId)
    .eq("company_id", companyId)
    .maybeSingle<DispatchNotificationEvent>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Notificacao nao encontrada."), { statusCode: 404 });
  }

  return data;
}

function resolveProvider(channel: NotificationChannel, preferredProvider?: string | null) {
  if (channel === "whatsapp") {
    return {
      name: preferredProvider && preferredProvider !== "manual" ? preferredProvider : "whatsapp_http",
      url: env.WHATSAPP_PROVIDER_URL,
      token: env.WHATSAPP_PROVIDER_TOKEN,
    };
  }

  if (channel === "email") {
    return {
      name: preferredProvider && preferredProvider !== "manual" ? preferredProvider : "email_http",
      url: env.EMAIL_PROVIDER_URL,
      token: env.EMAIL_PROVIDER_TOKEN,
    };
  }

  return {
    name: preferredProvider || "manual",
    url: undefined,
    token: undefined,
  };
}

function buildProviderPayload(event: DispatchNotificationEvent) {
  return {
    notification_event_id: event.id,
    company_id: event.company_id,
    channel: event.channel,
    to: event.recipient_contact,
    recipient_name: event.recipient_name,
    subject: event.subject,
    body: event.body,
    related_entity_type: event.related_entity_type,
    related_entity_id: event.related_entity_id,
    metadata: event.metadata ?? {},
  };
}

async function insertDeliveryAttempt(input: {
  event: DispatchNotificationEvent;
  providerName: string;
  attemptNumber: number;
  status: "started" | "sent" | "delivered" | "read" | "failed" | "bounced" | "blocked" | "skipped";
  requestPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  errorMessage: string | null;
  startedAt: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("notification_delivery_attempts")
    .insert({
      company_id: input.event.company_id,
      notification_event_id: input.event.id,
      channel: input.event.channel,
      provider: input.providerName,
      attempt_number: input.attemptNumber,
      status: input.status,
      request_payload: input.requestPayload,
      response_payload: input.responsePayload,
      error_message: input.errorMessage,
      started_at: input.startedAt,
      finished_at: new Date().toISOString(),
    })
    .select(
      "id, company_id, notification_event_id, channel, provider, attempt_number, status, error_message, started_at, finished_at, created_at",
    )
    .single();

  if (error) throw error;
  return data;
}

async function updateDispatchFailure(
  event: DispatchNotificationEvent,
  attemptNumber: number,
  reason: string,
  providerResponse: Record<string, unknown>,
) {
  const now = new Date().toISOString();
  const nextStatus = attemptNumber >= event.max_attempts ? "failed" : "queued";

  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .update({
      status: nextStatus,
      attempt_count: attemptNumber,
      last_attempt_at: now,
      failed_at: nextStatus === "failed" ? now : event.failed_at,
      failure_reason: reason,
      provider_response: providerResponse,
      updated_at: now,
    })
    .eq("id", event.id)
    .eq("company_id", event.company_id)
    .select(dispatchEventSelect)
    .single<DispatchNotificationEvent>();

  if (error) throw error;
  return data;
}

async function updateDispatchSuccess(
  event: DispatchNotificationEvent,
  attemptNumber: number,
  provider: string,
  providerMessageId: string | null,
  providerResponse: Record<string, unknown>,
) {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .update({
      status: "sent",
      provider,
      provider_message_id: providerMessageId,
      attempt_count: attemptNumber,
      last_attempt_at: now,
      sent_at: now,
      failed_at: null,
      failure_reason: null,
      provider_response: providerResponse,
      updated_at: now,
    })
    .eq("id", event.id)
    .eq("company_id", event.company_id)
    .select(dispatchEventSelect)
    .single<DispatchNotificationEvent>();

  if (error) throw error;
  return data;
}

function extractProviderMessageId(payload: Record<string, unknown>) {
  const value = payload.id ?? payload.message_id ?? payload.provider_message_id;
  return typeof value === "string" ? value : null;
}
