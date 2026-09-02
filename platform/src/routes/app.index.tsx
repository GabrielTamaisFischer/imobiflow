import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ClipboardList, FileSignature, Users, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { MetricCard } from "@/components/app/metric-card";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import {
  loadDashboardSummary,
  type DashboardPeriod,
  type DashboardSummary,
} from "@/product/dashboard";
import { useSessionGuard } from "@/product/use-session-guard";
import { isAdministrative } from "@/product/app-access";

export const Route = createFileRoute("/app/")({
  component: AppDashboard,
});

const periodOptions: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "14d", label: "14 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "all", label: "Todo período" },
];

function AppDashboard() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("dashboard");
  const [period, setPeriod] = useState<DashboardPeriod>("30d");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const administrative = isAdministrative(session?.access.appUser);

  useEffect(() => {
    if (isLoading || !session) return;

    async function refreshDashboard() {
      setIsDashboardLoading(true);
      setError(null);

      try {
        setSummary(await loadDashboardSummary(period));
      } catch (dashboardError) {
        setError(
          dashboardError instanceof Error
            ? dashboardError.message
            : "Não foi possível carregar o dashboard.",
        );
      } finally {
        setIsDashboardLoading(false);
      }
    }

    void refreshDashboard();
  }, [isLoading, period, session]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Indicadores reais da imobiliária</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Os números abaixo vêm do banco da empresa e respeitam assinatura, permissão e company_id.
          </p>
        </div>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {periodOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {buildMetrics(summary, isDashboardLoading, administrative).map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {administrative ? (
          <EmptyState
            icon={module.icon}
            title={module.emptyTitle}
            description={module.emptyDescription}
            actionLabel={module.actionLabel}
          />
        ) : (
          <section className="rounded-lg border border-border bg-card p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold tracking-tight">Minha operação</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Acesse os imóveis e leads disponibilizados para o seu perfil.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link to="/app/imoveis" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
                Ver meus imóveis
              </Link>
              <Link to="/app/crm" className="inline-flex h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold">
                Ver meus leads
              </Link>
            </div>
          </section>
        )}
        {administrative ? <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold tracking-tight">Alertas inteligentes</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Alertas baseados em dados reais: leads sem contato, imóveis sem fotos,
            contratos vencendo e cobranças vencidas.
          </p>
          <div className="mt-6 space-y-3">
            {summary?.alerts.length ? (
              summary.alerts.map((alert) => (
                <div
                  key={alert.key}
                  className="rounded-md border border-border p-4 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{alert.title}</p>
                    <span className={alertBadgeClass(alert.severity)}>{alert.count}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{alert.description}</p>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhum alerta gerado.
              </div>
            )}
          </div>
        </section> : null}
      </div>
    </ModulePage>
  );
}

function buildMetrics(summary: DashboardSummary | null, loading: boolean, administrative: boolean) {
  const metrics = summary?.metrics;
  const pending = loading ? "..." : "0";

  const scopedMetrics = [
    {
      label: "Imóveis no meu escopo",
      value: metrics ? String(metrics.properties_total) : pending,
      caption: metrics?.properties_total ? "Imóveis disponíveis para o seu acesso" : "Nenhum imóvel disponível",
      icon: Building2,
    },
    {
      label: "Leads no meu escopo",
      value: metrics ? String(metrics.leads_total) : pending,
      caption: metrics?.leads_total ? "Leads disponíveis para o seu acesso" : "Nenhum lead disponível",
      icon: Users,
    },
  ];

  if (!administrative) return scopedMetrics;

  return [
    ...scopedMetrics,
    {
      label: "Contratos ativos",
      value: metrics ? String(metrics.active_contracts_total) : pending,
      caption: metrics?.active_contracts_total ? "Contratos ativos encontrados" : "Nenhum contrato ativo",
      icon: FileSignature,
    },
    {
      label: "Vistorias",
      value: metrics ? String(metrics.inspections_total) : pending,
      caption: metrics?.inspections_total ? "Vistorias reais no período" : "Nenhuma vistoria iniciada",
      icon: ClipboardList,
    },
    {
      label: "Recebíveis",
      value: metrics ? formatCurrency(metrics.receivables_open_cents) : "...",
      caption: metrics?.receivables_paid_cents
        ? `${formatCurrency(metrics.receivables_paid_cents)} recebidos`
        : "Sem lançamentos financeiros pagos",
      icon: WalletCards,
    },
  ];
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function alertBadgeClass(severity: DashboardSummary["alerts"][number]["severity"]) {
  const base = "rounded-full px-2.5 py-1 text-xs font-semibold";
  if (severity === "critical") return `${base} bg-destructive/10 text-destructive`;
  if (severity === "warning") return `${base} bg-amber-500/10 text-amber-700`;
  return `${base} bg-primary/10 text-primary`;
}
