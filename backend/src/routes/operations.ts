import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  dispatchEventSelect,
  dispatchNotificationEvent,
  queueNotificationEvent,
} from "../services/notification-dispatcher.js";
import type { RequestWithAccess } from "../types/access.js";

export const operationsRouter = Router();

operationsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const notificationEventSelect =
  "id, company_id, channel, status, recipient_name, recipient_contact, subject, provider, provider_message_id, scheduled_for, queued_at, last_attempt_at, delivered_at, failed_at, attempt_count, max_attempts, failure_reason, operation_resolved_at, operation_resolved_by, operation_resolution_note, created_at, updated_at";

const deliveryAttemptSelect =
  "id, company_id, notification_event_id, channel, provider, attempt_number, status, error_message, started_at, finished_at, created_at";

const providerWebhookSelect =
  "id, company_id, notification_event_id, provider, provider_event_id, provider_message_id, event_type, normalized_status, processed_at, created_at";

const automationRunSelect =
  "id, automation_key, status, started_at, finished_at, companies_scanned, events_created, events_skipped, error_message, metadata, created_at";

const operationAuditSelect =
  "id, company_id, user_id, action_key, entity_type, entity_id, previous_status, new_status, reason, metadata, created_at";

type NotificationEventRow = {
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

type ProviderWebhookRow = {
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

const actionSchema = z.object({
  reason: z.string().max(500).optional().or(z.literal("")),
});

const requeueSchema = actionSchema.extend({
  scheduled_for: z.string().datetime().optional().or(z.literal("")),
});

const dispatchSchema = actionSchema.extend({
  provider: z.string().max(80).optional().or(z.literal("")),
});

operationsRouter.get(
  "/summary",
  requirePermission("operations.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;

      const [eventsResponse, attemptsResponse, webhooksResponse, runsResponse, auditResponse] = await Promise.all([
        supabaseAdmin
          .from("notification_events")
          .select(notificationEventSelect)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(300)
          .returns<NotificationEventRow[]>(),
        supabaseAdmin
          .from("notification_delivery_attempts")
          .select(deliveryAttemptSelect)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin
          .from("notification_provider_webhook_events")
          .select(providerWebhookSelect)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50)
          .returns<ProviderWebhookRow[]>(),
        supabaseAdmin
          .from("notification_automation_runs")
          .select(automationRunSelect)
          .order("created_at", { ascending: false })
          .limit(20),
        supabaseAdmin
          .from("operation_audit_logs")
          .select(operationAuditSelect)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      if (eventsResponse.error) throw eventsResponse.error;
      if (attemptsResponse.error) throw attemptsResponse.error;
      if (webhooksResponse.error) throw webhooksResponse.error;
      if (runsResponse.error) throw runsResponse.error;
      if (auditResponse.error) throw auditResponse.error;

      const events = eventsResponse.data ?? [];
      const webhooks = webhooksResponse.data ?? [];
      const runs = runsResponse.data ?? [];
      const activeFailedEvents = events.filter(
        (event) =>
          ["failed", "bounced", "blocked"].includes(event.status) &&
          !event.operation_resolved_at,
      );
      const failedEvents = activeFailedEvents
        .slice(0, 20);
      const retryableFailedEvents = activeFailedEvents.filter(
        (event) => event.status === "failed" && event.attempt_count < event.max_attempts,
      );
      const queuedEvents = events.filter((event) => event.status === "queued");
      const unprocessedWebhooks = webhooks.filter((event) => !event.processed_at);
      const lastDispatchRun = runs.find((run) => run.automation_key === "notification_dispatch");
      const lastFinancialRun = runs.find(
        (run) => run.automation_key === "financial_notifications",
      );

      res.json({
        summary: {
          notification_status: countBy(events, "status"),
          notification_channels: countBy(events, "channel"),
          queue: {
            queued: queuedEvents.length,
            retryable_failed: retryableFailedEvents.length,
            permanently_failed: failedEvents.length - retryableFailedEvents.length,
          },
          webhooks: {
            total: webhooks.length,
            unprocessed: unprocessedWebhooks.length,
            by_status: countBy(webhooks, "normalized_status"),
          },
          automations: {
            last_dispatch_run: lastDispatchRun ?? null,
            last_financial_run: lastFinancialRun ?? null,
            failed_runs: runs.filter((run) => run.status === "failed").length,
          },
        },
        failed_events: failedEvents,
        recent_attempts: attemptsResponse.data ?? [],
        recent_webhooks: webhooks,
        recent_audit_logs: auditResponse.data ?? [],
        automation_runs: runs,
      });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/notifications/:id/requeue",
  requirePermission("operations.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const eventId = getRouteParam(req.params.id);
      const input = requeueSchema.parse(req.body ?? {});
      const before = await loadOperationNotification(eventId, companyId);
      const event = await queueNotificationEvent({
        eventId,
        companyId,
        scheduledFor: input.scheduled_for || null,
      });

      await createOperationAuditLog({
        companyId,
        userId,
        actionKey: "notification_requeued",
        entityId: eventId,
        previousStatus: before.status,
        newStatus: event.status,
        reason: input.reason || "Notificacao reenfileirada pelo centro operacional.",
        metadata: { scheduled_for: event.scheduled_for },
      });

      res.json({ event });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/notifications/:id/dispatch",
  requirePermission("operations.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const eventId = getRouteParam(req.params.id);
      const input = dispatchSchema.parse(req.body ?? {});
      const before = await loadOperationNotification(eventId, companyId);
      const result = await dispatchNotificationEvent({
        eventId,
        companyId,
        provider: input.provider || null,
      });

      await createOperationAuditLog({
        companyId,
        userId,
        actionKey: "notification_dispatched",
        entityId: eventId,
        previousStatus: before.status,
        newStatus: result.event.status,
        reason: input.reason || "Disparo manual executado pelo centro operacional.",
        metadata: {
          provider: result.event.provider,
          dispatched: result.dispatched,
          failure_reason: result.reason,
        },
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/notifications/:id/cancel",
  requirePermission("operations.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const eventId = getRouteParam(req.params.id);
      const input = actionSchema.parse(req.body ?? {});
      const before = await loadOperationNotification(eventId, companyId);

      if (["sent", "delivered", "read"].includes(before.status)) {
        return res.status(409).json({
          error: "NOTIFICATION_ALREADY_SENT",
          message: "Notificacoes enviadas, entregues ou lidas nao podem ser canceladas.",
        });
      }

      const now = new Date().toISOString();
      const { data: event, error } = await supabaseAdmin
        .from("notification_events")
        .update({
          status: "cancelled",
          scheduled_for: null,
          operation_resolved_at: now,
          operation_resolved_by: userId,
          operation_resolution_note:
            input.reason || "Notificacao cancelada pelo centro operacional.",
          updated_at: now,
        })
        .eq("id", eventId)
        .eq("company_id", companyId)
        .select(dispatchEventSelect)
        .single();

      if (error) throw error;

      await createOperationAuditLog({
        companyId,
        userId,
        actionKey: "notification_cancelled",
        entityId: eventId,
        previousStatus: before.status,
        newStatus: "cancelled",
        reason: input.reason || "Notificacao cancelada pelo centro operacional.",
        metadata: {},
      });

      res.json({ event });
    } catch (error) {
      next(error);
    }
  },
);

operationsRouter.post(
  "/notifications/:id/resolve",
  requirePermission("operations.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const eventId = getRouteParam(req.params.id);
      const input = actionSchema.parse(req.body ?? {});
      const before = await loadOperationNotification(eventId, companyId);

      if (!["failed", "bounced", "blocked"].includes(before.status)) {
        return res.status(409).json({
          error: "NOTIFICATION_NOT_FAILED",
          message: "Somente falhas podem ser marcadas como resolvidas.",
        });
      }

      const now = new Date().toISOString();
      const { data: event, error } = await supabaseAdmin
        .from("notification_events")
        .update({
          operation_resolved_at: now,
          operation_resolved_by: userId,
          operation_resolution_note:
            input.reason || "Falha marcada como resolvida pelo centro operacional.",
          updated_at: now,
        })
        .eq("id", eventId)
        .eq("company_id", companyId)
        .select(dispatchEventSelect)
        .single();

      if (error) throw error;

      await createOperationAuditLog({
        companyId,
        userId,
        actionKey: "notification_failure_resolved",
        entityId: eventId,
        previousStatus: before.status,
        newStatus: before.status,
        reason: input.reason || "Falha marcada como resolvida pelo centro operacional.",
        metadata: { resolved_without_status_change: true },
      });

      res.json({ event });
    } catch (error) {
      next(error);
    }
  },
);

function countBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = row[key];
    const label = typeof value === "string" && value.length > 0 ? value : "unknown";
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
}

async function loadOperationNotification(eventId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_events")
    .select(notificationEventSelect)
    .eq("id", eventId)
    .eq("company_id", companyId)
    .maybeSingle<NotificationEventRow>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Notificacao nao encontrada."), { statusCode: 404 });
  }

  return data;
}

async function createOperationAuditLog(input: {
  companyId: string;
  userId: string;
  actionKey:
    | "notification_requeued"
    | "notification_dispatched"
    | "notification_cancelled"
    | "notification_failure_resolved";
  entityId: string;
  previousStatus: string;
  newStatus: string;
  reason: string;
  metadata: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.from("operation_audit_logs").insert({
    company_id: input.companyId,
    user_id: input.userId,
    action_key: input.actionKey,
    entity_type: "notification_event",
    entity_id: input.entityId,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    reason: input.reason,
    metadata: input.metadata,
  });

  if (error) throw error;
}

function getRouteParam(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    throw Object.assign(new Error("Parametro de rota invalido."), { statusCode: 400 });
  }

  return value;
}
