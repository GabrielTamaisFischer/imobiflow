import { Router } from "express";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { RequestWithAccess } from "../types/access.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireCompany, requireActiveSubscription);

type DateRange = {
  from?: string;
  to?: string;
  label: string;
};

dashboardRouter.get(
  "/summary",
  requirePermission("dashboard.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const range = resolveDateRange(typeof req.query.period === "string" ? req.query.period : "30d");

      const [
        propertiesTotal,
        leadsTotal,
        contractsActive,
        inspectionsTotal,
        financeOpen,
        financePaid,
        chargesOverdue,
        leadsWithoutContact,
        propertiesWithoutMedia,
        contractsExpiring,
      ] = await Promise.all([
        countRows("properties", companyId, range),
        countRows("leads", companyId, range),
        countRows("contracts", companyId, range, { status: "active" }),
        countRows("inspections", companyId, range),
        sumFinancialEntries(companyId, range, ["open", "overdue"]),
        sumFinancialEntries(companyId, range, ["paid"]),
        countOverdueCharges(companyId),
        countLeadsWithoutContact(companyId),
        countPropertiesWithoutMedia(companyId),
        countContractsExpiring(companyId),
      ]);

      res.json({
        filters: {
          period: typeof req.query.period === "string" ? req.query.period : "30d",
          range,
        },
        metrics: {
          properties_total: propertiesTotal,
          leads_total: leadsTotal,
          active_contracts_total: contractsActive,
          inspections_total: inspectionsTotal,
          receivables_open_cents: financeOpen,
          receivables_paid_cents: financePaid,
          overdue_charges_total: chargesOverdue,
        },
        alerts: [
          {
            key: "leads_without_contact",
            severity: leadsWithoutContact > 0 ? "warning" : "ok",
            title: "Leads sem contato",
            count: leadsWithoutContact,
            description:
              leadsWithoutContact > 0
                ? "Existem leads abertos sem último contato registrado."
                : "Nenhum lead aberto sem contato registrado.",
          },
          {
            key: "properties_without_media",
            severity: propertiesWithoutMedia > 0 ? "warning" : "ok",
            title: "Imóveis sem fotos",
            count: propertiesWithoutMedia,
            description:
              propertiesWithoutMedia > 0
                ? "Existem imóveis disponíveis sem mídia cadastrada."
                : "Nenhum imóvel disponível sem mídia cadastrada.",
          },
          {
            key: "contracts_expiring",
            severity: contractsExpiring > 0 ? "warning" : "ok",
            title: "Contratos vencendo",
            count: contractsExpiring,
            description:
              contractsExpiring > 0
                ? "Existem contratos ativos vencendo nos próximos 30 dias."
                : "Nenhum contrato ativo vencendo nos próximos 30 dias.",
          },
          {
            key: "charges_overdue",
            severity: chargesOverdue > 0 ? "critical" : "ok",
            title: "Cobranças vencidas",
            count: chargesOverdue,
            description:
              chargesOverdue > 0
                ? "Existem cobranças vencidas aguardando ação financeira."
                : "Nenhuma cobrança vencida registrada.",
          },
        ],
      });
    } catch (error) {
      next(error);
    }
  },
);

function resolveDateRange(period: string): DateRange {
  const now = new Date();
  const to = now.toISOString();
  const start = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to, label: "Hoje" };
  }

  if (period === "yesterday") {
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);
    return { from: yesterdayStart.toISOString(), to: yesterdayEnd.toISOString(), label: "Ontem" };
  }

  const daysByPeriod: Record<string, number> = {
    "7d": 7,
    "14d": 14,
    "30d": 30,
    "90d": 90,
  };

  const days = daysByPeriod[period];
  if (!days) return { label: "Todo período" };

  start.setDate(start.getDate() - days);
  return { from: start.toISOString(), to, label: `Últimos ${days} dias` };
}

async function countRows(
  table: string,
  companyId: string,
  range: DateRange,
  eqFilters: Record<string, string> = {},
) {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);

  for (const [key, value] of Object.entries(eqFilters)) {
    query = query.eq(key, value);
  }

  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lte("created_at", range.to);

  const { count, error } = await query;
  if (error) throw error;

  return count ?? 0;
}

async function sumFinancialEntries(companyId: string, range: DateRange, statuses: string[]) {
  let query = supabaseAdmin
    .from("financial_entries")
    .select("amount_cents")
    .eq("company_id", companyId)
    .eq("entry_type", "income")
    .in("status", statuses);

  if (range.from) query = query.gte("created_at", range.from);
  if (range.to) query = query.lte("created_at", range.to);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).reduce((total, entry) => total + Number(entry.amount_cents ?? 0), 0);
}

async function countOverdueCharges(companyId: string) {
  const { count, error } = await supabaseAdmin
    .from("financial_charges")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .in("status", ["overdue", "failed"]);

  if (error) throw error;
  return count ?? 0;
}

async function countLeadsWithoutContact(companyId: string) {
  const { count, error } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "open")
    .is("last_contact_at", null);

  if (error) throw error;
  return count ?? 0;
}

async function countPropertiesWithoutMedia(companyId: string) {
  const { data: properties, error: propertiesError } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("company_id", companyId)
    .in("status", ["available", "draft"]);

  if (propertiesError) throw propertiesError;
  if (!properties?.length) return 0;

  const propertyIds = properties.map((property) => property.id);
  const { data: media, error: mediaError } = await supabaseAdmin
    .from("property_media")
    .select("property_id")
    .eq("company_id", companyId)
    .in("property_id", propertyIds);

  if (mediaError) throw mediaError;

  const propertyIdsWithMedia = new Set((media ?? []).map((item) => item.property_id));
  return propertyIds.filter((propertyId) => !propertyIdsWithMedia.has(propertyId)).length;
}

async function countContractsExpiring(companyId: string) {
  const today = new Date();
  const limit = new Date();
  limit.setDate(limit.getDate() + 30);

  const { count, error } = await supabaseAdmin
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("status", "active")
    .gte("ends_at", today.toISOString().slice(0, 10))
    .lte("ends_at", limit.toISOString().slice(0, 10));

  if (error) throw error;
  return count ?? 0;
}
