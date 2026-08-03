import { supabaseAdmin } from "../lib/supabase.js";

type UsageMetricKey =
  | "storage_mb"
  | "photo_upload"
  | "pdf_generated"
  | "ai_request"
  | "whatsapp_message"
  | "charge_generated"
  | "pix_generated"
  | "boleto_generated"
  | "active_user"
  | "api_request";

type RecordUsageEventInput = {
  companyId: string;
  metricKey: UsageMetricKey;
  quantity?: number;
  source: string;
  userId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string;
};

export async function recordUsageEvent(input: RecordUsageEventInput) {
  const quantity = input.quantity ?? 1;
  if (quantity <= 0) return null;

  try {
    const { data: catalogItem, error: catalogError } = await supabaseAdmin
      .from("cost_catalog_items")
      .select("metric_key, unit, unit_cost_cents")
      .eq("metric_key", input.metricKey)
      .eq("status", "active")
      .maybeSingle<{ metric_key: string; unit: string; unit_cost_cents: number }>();

    if (catalogError) throw catalogError;
    if (!catalogItem) {
      console.warn(`Cost metric not found: ${input.metricKey}`);
      return null;
    }

    const unitCostCents = Number(catalogItem.unit_cost_cents);
    const { data, error } = await supabaseAdmin
      .from("tenant_usage_events")
      .insert({
        company_id: input.companyId,
        metric_key: input.metricKey,
        quantity,
        unit: catalogItem.unit,
        unit_cost_cents: unitCostCents,
        total_cost_cents: unitCostCents * quantity,
        source: input.source,
        related_entity_type: input.relatedEntityType ?? null,
        related_entity_id: input.relatedEntityId ?? null,
        metadata: input.metadata ?? {},
        occurred_at: input.occurredAt ?? new Date().toISOString(),
        created_by: input.userId ?? null,
      })
      .select("id, metric_key, quantity, total_cost_cents")
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Failed to record tenant usage event", {
      metricKey: input.metricKey,
      companyId: input.companyId,
      error,
    });
    return null;
  }
}
