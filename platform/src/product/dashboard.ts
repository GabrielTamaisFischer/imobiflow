import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

export type DashboardPeriod = "today" | "yesterday" | "7d" | "14d" | "30d" | "90d" | "all";

export type DashboardSummary = {
  filters: {
    period: DashboardPeriod;
    range: {
      from?: string;
      to?: string;
      label: string;
    };
  };
  metrics: {
    properties_total: number;
    leads_total: number;
    active_contracts_total: number;
    inspections_total: number;
    receivables_open_cents: number;
    receivables_paid_cents: number;
    overdue_charges_total: number;
  };
  alerts: Array<{
    key: string;
    severity: "ok" | "warning" | "critical";
    title: string;
    count: number;
    description: string;
  }>;
};

export async function loadDashboardSummary(period: DashboardPeriod) {
  if (isPreviewToken(getStoredToken())) return getEmptyDashboardSummary(period);

  return apiRequest<DashboardSummary>(`/dashboard/summary?period=${period}`, {
    token: getStoredToken() ?? undefined,
  });
}

function getEmptyDashboardSummary(period: DashboardPeriod): DashboardSummary {
  return {
    filters: {
      period,
      range: {
        label: "Modo preview",
      },
    },
    metrics: {
      properties_total: 0,
      leads_total: 0,
      active_contracts_total: 0,
      inspections_total: 0,
      receivables_open_cents: 0,
      receivables_paid_cents: 0,
      overdue_charges_total: 0,
    },
    alerts: [],
  };
}
