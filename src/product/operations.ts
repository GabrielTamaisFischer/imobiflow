import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

export type OperationStatusCount = Record<string, number>;

export type OperationNotificationEvent = {
  id: string;
  company_id: string;
  channel: string;
  status: string;
  recipient_name: string | null;
  recipient_contact: string;
  subject: string | null;
  provider: string;
  provider_message_id: string | null;
  scheduled_for: string | null;
  queued_at: string | null;
  last_attempt_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  attempt_count: number;
  max_attempts: number;
  failure_reason: string | null;
  operation_resolved_at: string | null;
  operation_resolved_by: string | null;
  operation_resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

export type OperationDeliveryAttempt = {
  id: string;
  company_id: string;
  notification_event_id: string;
  channel: string;
  provider: string;
  attempt_number: number;
  status: string;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

export type OperationProviderWebhook = {
  id: string;
  company_id: string | null;
  notification_event_id: string | null;
  provider: string;
  provider_event_id: string | null;
  provider_message_id: string | null;
  event_type: string | null;
  normalized_status: string | null;
  processed_at: string | null;
  created_at: string;
};

export type OperationAutomationRun = {
  id: string;
  automation_key: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  companies_scanned: number;
  events_created: number;
  events_skipped: number;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type OperationAuditLog = {
  id: string;
  company_id: string;
  user_id: string | null;
  action_key: string;
  entity_type: string;
  entity_id: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type OperationsSummary = {
  notification_status: OperationStatusCount;
  notification_channels: OperationStatusCount;
  queue: {
    queued: number;
    retryable_failed: number;
    permanently_failed: number;
  };
  webhooks: {
    total: number;
    unprocessed: number;
    by_status: OperationStatusCount;
  };
  automations: {
    last_dispatch_run: OperationAutomationRun | null;
    last_financial_run: OperationAutomationRun | null;
    failed_runs: number;
  };
};

export type OperationsResponse = {
  summary: OperationsSummary;
  failed_events: OperationNotificationEvent[];
  recent_attempts: OperationDeliveryAttempt[];
  recent_webhooks: OperationProviderWebhook[];
  recent_audit_logs: OperationAuditLog[];
  automation_runs: OperationAutomationRun[];
};

export function isPreviewOperations() {
  return isPreviewToken(getStoredToken());
}

export async function getOperationsSummary() {
  if (isPreviewOperations()) return createPreviewOperationsResponse();

  return apiRequest<OperationsResponse>("/operations/summary", {
    token: getStoredToken() ?? undefined,
  });
}

export async function requeueOperationNotification(
  eventId: string,
  input: { reason?: string; scheduled_for?: string | null } = {},
) {
  if (isPreviewOperations()) return { event: null as OperationNotificationEvent | null };

  return apiRequest<{ event: OperationNotificationEvent }>(
    `/operations/notifications/${eventId}/requeue`,
    {
      method: "POST",
      token: getStoredToken() ?? undefined,
      body: JSON.stringify(input),
    },
  );
}

export async function dispatchOperationNotification(
  eventId: string,
  input: { reason?: string; provider?: string | null } = {},
) {
  if (isPreviewOperations()) {
    return {
      event: null as OperationNotificationEvent | null,
      attempt: null,
      dispatched: false,
      reason: "preview",
    };
  }

  return apiRequest<{
    event: OperationNotificationEvent;
    attempt: unknown;
    dispatched: boolean;
    reason: string | null;
  }>(`/operations/notifications/${eventId}/dispatch`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function cancelOperationNotification(eventId: string, reason?: string) {
  if (isPreviewOperations()) return { event: null as OperationNotificationEvent | null };

  return apiRequest<{ event: OperationNotificationEvent }>(
    `/operations/notifications/${eventId}/cancel`,
    {
      method: "POST",
      token: getStoredToken() ?? undefined,
      body: JSON.stringify({ reason }),
    },
  );
}

export async function resolveOperationNotification(eventId: string, reason?: string) {
  if (isPreviewOperations()) return { event: null as OperationNotificationEvent | null };

  return apiRequest<{ event: OperationNotificationEvent }>(
    `/operations/notifications/${eventId}/resolve`,
    {
      method: "POST",
      token: getStoredToken() ?? undefined,
      body: JSON.stringify({ reason }),
    },
  );
}

function createPreviewOperationsResponse(): OperationsResponse {
  return {
    summary: {
      notification_status: {},
      notification_channels: {},
      queue: {
        queued: 0,
        retryable_failed: 0,
        permanently_failed: 0,
      },
      webhooks: {
        total: 0,
        unprocessed: 0,
        by_status: {},
      },
      automations: {
        last_dispatch_run: null,
        last_financial_run: null,
        failed_runs: 0,
      },
    },
    failed_events: [],
    recent_attempts: [],
    recent_webhooks: [],
    recent_audit_logs: [],
    automation_runs: [],
  };
}
