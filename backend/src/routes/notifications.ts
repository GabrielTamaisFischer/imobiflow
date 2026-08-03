import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { RequestWithAccess } from "../types/access.js";
import {
  dispatchNotificationEvent,
  queueNotificationEvent,
  registerManualNotificationDelivery,
} from "../services/notification-dispatcher.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const eventSelect =
  "id, company_id, template_id, channel, direction, recipient_type, recipient_id, recipient_name, recipient_contact, subject, body, status, provider, provider_message_id, related_entity_type, related_entity_id, metadata, created_by, sent_at, scheduled_for, queued_at, last_attempt_at, delivered_at, failed_at, attempt_count, max_attempts, failure_reason, provider_response, created_at, updated_at";

const templateSelect =
  "id, company_id, template_key, channel, name, subject, body, variables_json, status, created_at, updated_at";

const notificationEventSchema = z.object({
  template_key: z.string().max(80).optional(),
  channel: z.enum(["email", "whatsapp", "sms", "system"]),
  recipient_type: z.enum(["owner", "tenant", "lead", "user", "company", "other"]),
  recipient_id: z.string().uuid().optional().or(z.literal("")),
  recipient_name: z.string().max(160).optional().or(z.literal("")),
  recipient_contact: z.string().min(2).max(240),
  subject: z.string().max(240).optional().or(z.literal("")),
  body: z.string().min(2).max(4000),
  provider: z.string().max(80).default("manual"),
  status: z
    .enum(["draft", "prepared", "queued", "sent", "delivered", "read", "failed", "bounced", "blocked", "cancelled"])
    .default("prepared"),
  related_entity_type: z.string().max(80).optional().or(z.literal("")),
  related_entity_id: z.string().uuid().optional().or(z.literal("")),
  metadata: z.record(z.unknown()).default({}),
});

const queueSchema = z.object({
  scheduled_for: z.string().datetime().optional().or(z.literal("")),
});

const dispatchSchema = z.object({
  provider: z.string().max(80).optional().or(z.literal("")),
});

const manualDeliverySchema = z.object({
  provider: z.string().max(80).default("manual"),
  provider_message_id: z.string().max(160).optional().or(z.literal("")),
  status: z.enum(["sent", "delivered", "read"]).default("sent"),
  response_payload: z.record(z.unknown()).default({}),
});

notificationsRouter.get(
  "/templates",
  requirePermission("notifications.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;

      const { data, error } = await supabaseAdmin
        .from("notification_templates")
        .select(templateSelect)
        .or(`company_id.is.null,company_id.eq.${companyId}`)
        .neq("status", "archived")
        .order("company_id", { ascending: true, nullsFirst: true })
        .order("template_key", { ascending: true })
        .order("channel", { ascending: true });

      if (error) throw error;

      res.json({ templates: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

notificationsRouter.get(
  "/events",
  requirePermission("notifications.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 100);

      const { data, error } = await supabaseAdmin
        .from("notification_events")
        .select(eventSelect)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      res.json({ events: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

notificationsRouter.post(
  "/events",
  requirePermission("notifications.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = notificationEventSchema.parse(req.body);
      const template = input.template_key
        ? await findTemplate(input.template_key, input.channel, companyId)
        : null;

      const { data: event, error } = await supabaseAdmin
        .from("notification_events")
        .insert({
          company_id: companyId,
          template_id: template?.id ?? null,
          channel: input.channel,
          recipient_type: input.recipient_type,
          recipient_id: input.recipient_id || null,
          recipient_name: input.recipient_name || null,
          recipient_contact: input.recipient_contact,
          subject: input.subject || template?.subject || null,
          body: input.body,
          status: input.status,
          provider: input.provider,
          related_entity_type: input.related_entity_type || null,
          related_entity_id: input.related_entity_id || null,
          metadata: input.metadata,
          created_by: userId,
          sent_at: ["sent", "delivered"].includes(input.status) ? new Date().toISOString() : null,
        })
        .select(eventSelect)
        .single();

      if (error) throw error;

      res.status(201).json({ event });
    } catch (error) {
      next(error);
    }
  },
);

notificationsRouter.post(
  "/events/:id/queue",
  requirePermission("notifications.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const input = queueSchema.parse(req.body);
      const eventId = getRouteParam(req.params.id);
      const event = await queueNotificationEvent({
        eventId,
        companyId,
        scheduledFor: input.scheduled_for || null,
      });

      res.json({ event });
    } catch (error) {
      next(error);
    }
  },
);

notificationsRouter.post(
  "/events/:id/dispatch",
  requirePermission("notifications.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const input = dispatchSchema.parse(req.body);
      const eventId = getRouteParam(req.params.id);
      const result = await dispatchNotificationEvent({
        eventId,
        companyId,
        provider: input.provider || null,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

notificationsRouter.post(
  "/events/:id/manual-delivery",
  requirePermission("notifications.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const input = manualDeliverySchema.parse(req.body);
      const eventId = getRouteParam(req.params.id);
      const result = await registerManualNotificationDelivery({
        eventId,
        companyId,
        provider: input.provider,
        providerMessageId: input.provider_message_id || null,
        status: input.status,
        responsePayload: input.response_payload,
      });

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

async function findTemplate(templateKey: string, channel: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("notification_templates")
    .select("id, subject")
    .eq("template_key", templateKey)
    .eq("channel", channel)
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .order("company_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle<{ id: string; subject: string | null }>();

  if (error) throw error;
  return data;
}

function getRouteParam(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    throw Object.assign(new Error("Parametro de rota invalido."), { statusCode: 400 });
  }

  return value;
}
