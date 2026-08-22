import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

export type CostSummary = {
  total_cost_cents: number;
  estimated_revenue_cents: number;
  estimated_margin_cents: number;
  events_count: number;
  by_metric: Record<string, { quantity: number; total_cost_cents: number }>;
};

export type TenantUsageEvent = {
  id: string;
  company_id: string;
  metric_key: string;
  quantity: number;
  unit: string;
  unit_cost_cents: number;
  total_cost_cents: number;
  source: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export type TenantCostSnapshot = {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  storage_mb: number;
  photos_count: number;
  pdfs_count: number;
  ai_requests_count: number;
  whatsapp_messages_count: number;
  charges_count: number;
  pix_count: number;
  boleto_count: number;
  active_users_count: number;
  api_requests_count: number;
  estimated_cost_cents: number;
  estimated_revenue_cents: number;
  estimated_margin_cents: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export function isPreviewUsageCosts() {
  return isPreviewToken(getStoredToken());
}

export async function getUsageCostSummary() {
  if (isPreviewUsageCosts()) {
    return {
      summary: {
        total_cost_cents: 0,
        estimated_revenue_cents: 0,
        estimated_margin_cents: 0,
        events_count: 0,
        by_metric: {},
      },
      snapshots: [],
    } satisfies { summary: CostSummary; snapshots: TenantCostSnapshot[] };
  }

  return apiRequest<{ summary: CostSummary; snapshots: TenantCostSnapshot[] }>("/usage-costs/summary", {
    token: getStoredToken() ?? undefined,
  });
}

export async function generateUsageCostSnapshot(month?: string) {
  if (isPreviewUsageCosts()) {
    return { snapshot: null as TenantCostSnapshot | null };
  }

  return apiRequest<{ snapshot: TenantCostSnapshot }>("/usage-costs/snapshots", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(month ? { month } : {}),
  });
}

export async function listUsageCostEvents(limit = 50) {
  if (isPreviewUsageCosts()) return { events: [] as TenantUsageEvent[] };

  return apiRequest<{ events: TenantUsageEvent[] }>(`/usage-costs/events?limit=${limit}`, {
    token: getStoredToken() ?? undefined,
  });
}
