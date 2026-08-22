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

export const usageCostsRouter = Router();

usageCostsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const usageEventSelect =
  "id, company_id, metric_key, quantity, unit, unit_cost_cents, total_cost_cents, source, related_entity_type, related_entity_id, metadata, occurred_at, created_at";

const snapshotSelect =
  "id, company_id, period_start, period_end, storage_mb, photos_count, pdfs_count, ai_requests_count, whatsapp_messages_count, charges_count, pix_count, boleto_count, active_users_count, api_requests_count, estimated_cost_cents, estimated_revenue_cents, estimated_margin_cents, metadata, created_at, updated_at";

const usageEventSchema = z.object({
  metric_key: z.string().min(2).max(80),
  quantity: z.number().nonnegative().default(1),
  source: z.string().max(80).default("manual"),
  related_entity_type: z.string().max(80).optional().or(z.literal("")),
  related_entity_id: z.string().uuid().optional().or(z.literal("")),
  metadata: z.record(z.unknown()).default({}),
  occurred_at: z.string().datetime().optional().or(z.literal("")),
});

const snapshotSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  period_start: z.string().date().optional(),
  period_end: z.string().date().optional(),
});

type UsageEventAggregate = {
  metric_key: string;
  quantity: number;
  total_cost_cents: number;
};

function monthPeriod(month?: string) {
  const base = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date();
  const periodStart = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0));

  return {
    periodStart: periodStart.toISOString().slice(0, 10),
    periodEnd: periodEnd.toISOString().slice(0, 10),
  };
}

function readMetricQuantity(events: UsageEventAggregate[], metricKey: string) {
  return events
    .filter((event) => event.metric_key === metricKey)
    .reduce((sum, event) => sum + Number(event.quantity ?? 0), 0);
}

async function readEstimatedRevenueCents(companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plans(price_cents)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ plans: { price_cents: number } | null }>();

  if (error) throw error;
  return data?.plans?.price_cents ?? 0;
}

usageCostsRouter.get(
  "/catalog",
  requirePermission("costs.view"),
  async (_req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("cost_catalog_items")
        .select("id, metric_key, name, unit, unit_cost_cents, category, status")
        .eq("status", "active")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      res.json({ catalog: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

usageCostsRouter.get(
  "/events",
  requirePermission("costs.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const limit = Math.min(Number(req.query.limit ?? 100) || 100, 200);

      const { data, error } = await supabaseAdmin
        .from("tenant_usage_events")
        .select(usageEventSelect)
        .eq("company_id", companyId)
        .order("occurred_at", { ascending: false })
        .limit(limit);

      if (error) throw error;

      res.json({ events: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

usageCostsRouter.get(
  "/summary",
  requirePermission("costs.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const periodStart = typeof req.query.period_start === "string" ? req.query.period_start : null;
      const periodEnd = typeof req.query.period_end === "string" ? req.query.period_end : null;

      let query = supabaseAdmin
        .from("tenant_usage_events")
        .select("metric_key, quantity, total_cost_cents, occurred_at")
        .eq("company_id", companyId);

      if (periodStart) query = query.gte("occurred_at", `${periodStart}T00:00:00.000Z`);
      if (periodEnd) query = query.lte("occurred_at", `${periodEnd}T23:59:59.999Z`);

      const [eventsResponse, snapshotsResponse, subscriptionResponse] = await Promise.all([
        query,
        supabaseAdmin
          .from("tenant_cost_snapshots")
          .select(snapshotSelect)
          .eq("company_id", companyId)
          .order("period_start", { ascending: false })
          .limit(6),
        supabaseAdmin
          .from("subscriptions")
          .select("plans(price_cents)")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ plans: { price_cents: number } | null }>(),
      ]);

      if (eventsResponse.error) throw eventsResponse.error;
      if (snapshotsResponse.error) throw snapshotsResponse.error;
      if (subscriptionResponse.error) throw subscriptionResponse.error;

      const events = eventsResponse.data ?? [];
      const totalCostCents = events.reduce(
        (sum, event) => sum + Number(event.total_cost_cents ?? 0),
        0,
      );
      const estimatedRevenueCents = subscriptionResponse.data?.plans?.price_cents ?? 0;

      const byMetric = events.reduce<Record<string, { quantity: number; total_cost_cents: number }>>(
        (acc, event) => {
          const current = acc[event.metric_key] ?? { quantity: 0, total_cost_cents: 0 };
          current.quantity += Number(event.quantity ?? 0);
          current.total_cost_cents += Number(event.total_cost_cents ?? 0);
          acc[event.metric_key] = current;
          return acc;
        },
        {},
      );

      res.json({
        summary: {
          total_cost_cents: Math.round(totalCostCents),
          estimated_revenue_cents: estimatedRevenueCents,
          estimated_margin_cents: Math.round(estimatedRevenueCents - totalCostCents),
          events_count: events.length,
          by_metric: byMetric,
        },
        snapshots: snapshotsResponse.data ?? [],
      });
    } catch (error) {
      next(error);
    }
  },
);

usageCostsRouter.post(
  "/snapshots",
  requirePermission("costs.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = snapshotSchema.parse(req.body ?? {});
      const defaultPeriod = monthPeriod(input.month);
      const periodStart = input.period_start ?? defaultPeriod.periodStart;
      const periodEnd = input.period_end ?? defaultPeriod.periodEnd;

      if (periodEnd < periodStart) {
        return res.status(422).json({
          error: "INVALID_COST_PERIOD",
          message: "A data final do fechamento deve ser maior ou igual à data inicial.",
        });
      }

      const [eventsResponse, estimatedRevenueCents] = await Promise.all([
        supabaseAdmin
          .from("tenant_usage_events")
          .select("metric_key, quantity, total_cost_cents")
          .eq("company_id", companyId)
          .gte("occurred_at", `${periodStart}T00:00:00.000Z`)
          .lte("occurred_at", `${periodEnd}T23:59:59.999Z`),
        readEstimatedRevenueCents(companyId),
      ]);

      if (eventsResponse.error) throw eventsResponse.error;

      const events = (eventsResponse.data ?? []) as UsageEventAggregate[];
      const estimatedCostCents = events.reduce(
        (sum, event) => sum + Number(event.total_cost_cents ?? 0),
        0,
      );
      const byMetric = events.reduce<Record<string, { quantity: number; total_cost_cents: number }>>(
        (acc, event) => {
          const current = acc[event.metric_key] ?? { quantity: 0, total_cost_cents: 0 };
          current.quantity += Number(event.quantity ?? 0);
          current.total_cost_cents += Number(event.total_cost_cents ?? 0);
          acc[event.metric_key] = current;
          return acc;
        },
        {},
      );

      const { data: snapshot, error } = await supabaseAdmin
        .from("tenant_cost_snapshots")
        .upsert(
          {
            company_id: companyId,
            period_start: periodStart,
            period_end: periodEnd,
            storage_mb: readMetricQuantity(events, "storage_mb"),
            photos_count: Math.round(readMetricQuantity(events, "photo_upload")),
            pdfs_count: Math.round(readMetricQuantity(events, "pdf_generated")),
            ai_requests_count: Math.round(readMetricQuantity(events, "ai_request")),
            whatsapp_messages_count: Math.round(readMetricQuantity(events, "whatsapp_message")),
            charges_count: Math.round(readMetricQuantity(events, "charge_generated")),
            pix_count: Math.round(readMetricQuantity(events, "pix_generated")),
            boleto_count: Math.round(readMetricQuantity(events, "boleto_generated")),
            active_users_count: Math.round(readMetricQuantity(events, "active_user")),
            api_requests_count: Math.round(readMetricQuantity(events, "api_request")),
            estimated_cost_cents: estimatedCostCents,
            estimated_revenue_cents: estimatedRevenueCents,
            estimated_margin_cents: estimatedRevenueCents - estimatedCostCents,
            metadata: {
              generated_by: userId,
              generated_at: new Date().toISOString(),
              events_count: events.length,
              by_metric: byMetric,
            },
          },
          { onConflict: "company_id,period_start,period_end" },
        )
        .select(snapshotSelect)
        .single();

      if (error) throw error;

      res.status(201).json({ snapshot });
    } catch (error) {
      next(error);
    }
  },
);

usageCostsRouter.post(
  "/events",
  requirePermission("costs.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = usageEventSchema.parse(req.body);

      const { data: catalogItem, error: catalogError } = await supabaseAdmin
        .from("cost_catalog_items")
        .select("metric_key, unit, unit_cost_cents")
        .eq("metric_key", input.metric_key)
        .eq("status", "active")
        .maybeSingle<{ metric_key: string; unit: string; unit_cost_cents: number }>();

      if (catalogError) throw catalogError;
      if (!catalogItem) {
        return res.status(422).json({
          error: "COST_METRIC_NOT_FOUND",
          message: "Métrica de custo não cadastrada no catálogo.",
        });
      }

      const unitCostCents = Number(catalogItem.unit_cost_cents);
      const totalCostCents = unitCostCents * input.quantity;

      const { data: event, error } = await supabaseAdmin
        .from("tenant_usage_events")
        .insert({
          company_id: companyId,
          metric_key: input.metric_key,
          quantity: input.quantity,
          unit: catalogItem.unit,
          unit_cost_cents: unitCostCents,
          total_cost_cents: totalCostCents,
          source: input.source,
          related_entity_type: input.related_entity_type || null,
          related_entity_id: input.related_entity_id || null,
          metadata: input.metadata,
          occurred_at: input.occurred_at || new Date().toISOString(),
          created_by: userId,
        })
        .select(usageEventSelect)
        .single();

      if (error) throw error;

      res.status(201).json({ event });
    } catch (error) {
      next(error);
    }
  },
);
