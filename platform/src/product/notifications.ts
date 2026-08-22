import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

const previewNotificationEventsKey = "imobiflow.preview.notification_events";

export type NotificationChannel = "email" | "whatsapp" | "sms" | "system";

export type NotificationEvent = {
  id: string;
  company_id: string;
  template_id: string | null;
  channel: NotificationChannel;
  direction: "outbound" | "inbound";
  recipient_type: "owner" | "tenant" | "lead" | "user" | "company" | "other";
  recipient_id: string | null;
  recipient_name: string | null;
  recipient_contact: string;
  subject: string | null;
  body: string;
  status:
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

export type NotificationEventInput = {
  template_key?: string;
  channel: NotificationChannel;
  recipient_type: NotificationEvent["recipient_type"];
  recipient_id?: string | null;
  recipient_name?: string | null;
  recipient_contact: string;
  subject?: string | null;
  body: string;
  provider?: string;
  status?: NotificationEvent["status"];
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  metadata?: Record<string, unknown>;
};

export function isPreviewNotifications() {
  return isPreviewToken(getStoredToken());
}

export async function listNotificationEvents(limit = 30) {
  if (isPreviewNotifications()) return { events: readPreviewNotificationEvents().slice(0, limit) };

  return apiRequest<{ events: NotificationEvent[] }>(`/notifications/events?limit=${limit}`, {
    token: getStoredToken() ?? undefined,
  });
}

export async function createNotificationEvent(input: NotificationEventInput) {
  if (isPreviewNotifications()) {
    const event = createPreviewNotificationEvent(input);
    return { event };
  }

  return apiRequest<{ event: NotificationEvent }>("/notifications/events", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function queueNotificationEvent(eventId: string, scheduledFor?: string | null) {
  if (isPreviewNotifications()) {
    return { event: updatePreviewNotificationEvent(eventId, queuePreviewEvent(scheduledFor)) };
  }

  return apiRequest<{ event: NotificationEvent }>(`/notifications/events/${eventId}/queue`, {
    method: "POST",
    body: JSON.stringify({ scheduled_for: scheduledFor ?? "" }),
    token: getStoredToken() ?? undefined,
  });
}

export async function dispatchNotificationEvent(eventId: string, provider?: string | null) {
  if (isPreviewNotifications()) {
    return {
      event: updatePreviewNotificationEvent(eventId, dispatchPreviewEvent(provider)),
      attempt: null,
      dispatched: true,
      reason: null,
    };
  }

  return apiRequest<{
    event: NotificationEvent;
    attempt: unknown;
    dispatched: boolean;
    reason: string | null;
  }>(`/notifications/events/${eventId}/dispatch`, {
    method: "POST",
    body: JSON.stringify({ provider: provider ?? "" }),
    token: getStoredToken() ?? undefined,
  });
}

export async function registerManualNotificationDelivery(
  eventId: string,
  input: { provider?: string; provider_message_id?: string | null; status?: "sent" | "delivered" | "read" } = {},
) {
  if (isPreviewNotifications()) {
    return {
      event: updatePreviewNotificationEvent(eventId, manualDeliveryPreviewEvent(input)),
      attempt: null,
    };
  }

  return apiRequest<{ event: NotificationEvent; attempt: unknown }>(
    `/notifications/events/${eventId}/manual-delivery`,
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

function readPreviewNotificationEvents() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(
      window.localStorage.getItem(previewNotificationEventsKey) ?? "[]",
    ) as NotificationEvent[];
  } catch {
    return [];
  }
}

function writePreviewNotificationEvents(events: NotificationEvent[]) {
  window.localStorage.setItem(previewNotificationEventsKey, JSON.stringify(events));
}

function createPreviewNotificationEvent(input: NotificationEventInput): NotificationEvent {
  const now = new Date().toISOString();
  const event: NotificationEvent = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    template_id: null,
    channel: input.channel,
    direction: "outbound",
    recipient_type: input.recipient_type,
    recipient_id: input.recipient_id || null,
    recipient_name: input.recipient_name || null,
    recipient_contact: input.recipient_contact,
    subject: input.subject || null,
    body: input.body,
    status: input.status ?? "prepared",
    provider: input.provider ?? "manual",
    provider_message_id: null,
    related_entity_type: input.related_entity_type || null,
    related_entity_id: input.related_entity_id || null,
    metadata: input.metadata ?? {},
    created_by: "preview-user",
    sent_at: null,
    scheduled_for: null,
    queued_at: null,
    last_attempt_at: null,
    delivered_at: null,
    failed_at: null,
    attempt_count: 0,
    max_attempts: 3,
    failure_reason: null,
    provider_response: {},
    created_at: now,
    updated_at: now,
  };

  writePreviewNotificationEvents([event, ...readPreviewNotificationEvents()]);
  return event;
}

function updatePreviewNotificationEvent(
  eventId: string,
  updater: (event: NotificationEvent) => NotificationEvent,
) {
  const events = readPreviewNotificationEvents();
  const nextEvents = events.map((event) => (event.id === eventId ? updater(event) : event));
  writePreviewNotificationEvents(nextEvents);
  const event = nextEvents.find((item) => item.id === eventId);

  if (!event) {
    throw new Error("Notificacao nao encontrada.");
  }

  return event;
}

function queuePreviewEvent(scheduledFor?: string | null) {
  return (event: NotificationEvent): NotificationEvent => {
    const now = new Date().toISOString();
    return {
      ...event,
      status: "queued",
      queued_at: event.queued_at ?? now,
      scheduled_for: scheduledFor ?? event.scheduled_for ?? now,
      failure_reason: null,
      failed_at: null,
      updated_at: now,
    };
  };
}

function dispatchPreviewEvent(provider?: string | null) {
  return (event: NotificationEvent): NotificationEvent => {
    const now = new Date().toISOString();
    return {
      ...event,
      status: "sent",
      provider: provider || "preview",
      provider_message_id: event.provider_message_id ?? `preview-${event.id}`,
      sent_at: now,
      last_attempt_at: now,
      attempt_count: event.attempt_count + 1,
      failure_reason: null,
      failed_at: null,
      provider_response: { preview: true },
      updated_at: now,
    };
  };
}

function manualDeliveryPreviewEvent(input: {
  provider?: string;
  provider_message_id?: string | null;
  status?: "sent" | "delivered" | "read";
}) {
  return (event: NotificationEvent): NotificationEvent => {
    const now = new Date().toISOString();
    const status = input.status ?? "sent";
    return {
      ...event,
      status,
      provider: input.provider || "manual",
      provider_message_id: input.provider_message_id || event.provider_message_id,
      sent_at: event.sent_at ?? now,
      delivered_at: ["delivered", "read"].includes(status) ? now : event.delivered_at,
      last_attempt_at: now,
      attempt_count: event.attempt_count + 1,
      failure_reason: null,
      failed_at: null,
      provider_response: { manual: true },
      updated_at: now,
    };
  };
}
