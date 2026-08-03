import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Gauge, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import {
  generateUsageCostSnapshot,
  getUsageCostSummary,
  listUsageCostEvents,
  type CostSummary,
  type TenantCostSnapshot,
  type TenantUsageEvent,
} from "@/product/usage-costs";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/custos")({
  component: UsageCostsPage,
});

const metricLabels: Record<string, string> = {
  storage_mb: "Armazenamento",
  photo_upload: "Fotos",
  pdf_generated: "PDFs",
  ai_request: "IA",
  whatsapp_message: "WhatsApp",
  charge_generated: "Cobranças",
  pix_generated: "PIX",
  boleto_generated: "Boletos",
  active_user: "Usuários ativos",
  api_request: "API",
};

function UsageCostsPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("costs");
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [events, setEvents] = useState<TenantUsageEvent[]>([]);
  const [snapshots, setSnapshots] = useState<TenantCostSnapshot[]>([]);
  const [isCostsLoading, setIsCostsLoading] = useState(true);
  const [isGeneratingSnapshot, setIsGeneratingSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canManageCosts = Boolean(session?.access.appUser?.permissions.includes("costs.manage"));

  async function refreshCosts() {
    setIsCostsLoading(true);
    setError(null);

    try {
      const [summaryResponse, eventsResponse] = await Promise.all([
        getUsageCostSummary(),
        listUsageCostEvents(50),
      ]);
      setSummary(summaryResponse.summary);
      setSnapshots(summaryResponse.snapshots);
      setEvents(eventsResponse.events);
    } catch (costError) {
      setError(
        costError instanceof Error ? costError.message : "Não foi possível carregar custos.",
      );
    } finally {
      setIsCostsLoading(false);
    }
  }

  async function handleGenerateSnapshot() {
    setIsGeneratingSnapshot(true);
    setError(null);

    try {
      await generateUsageCostSnapshot(currentMonth());
      await refreshCosts();
    } catch (snapshotError) {
      setError(
        snapshotError instanceof Error
          ? snapshotError.message
          : "Não foi possível gerar o fechamento mensal.",
      );
    } finally {
      setIsGeneratingSnapshot(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshCosts();
    }
  }, [isLoading, session]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: custos aparecem apenas quando houver eventos reais registrados.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Fechamento de custos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Consolide o consumo real do mês em um snapshot auditável por imobiliária.
          </p>
        </div>
        <Button
          type="button"
          onClick={handleGenerateSnapshot}
          disabled={!canManageCosts || isGeneratingSnapshot || isCostsLoading}
          className="w-full md:w-auto"
        >
          {isGeneratingSnapshot ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Gerar fechamento do mês
        </Button>
      </section>

      {isCostsLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando custos operacionais...
        </section>
      ) : (!summary || summary.events_count === 0) && snapshots.length === 0 ? (
        <EmptyState
          icon={Gauge}
          title="Nenhum consumo operacional registrado"
          description="O painel começa vazio. Conforme o sistema registrar fotos, PDFs, IA, WhatsApp, cobranças e API, a margem estimada será calculada por imobiliária."
        />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-3">
            <MetricCard label="Custo estimado" value={formatMoney(summary.total_cost_cents)} />
            <MetricCard label="Receita estimada" value={formatMoney(summary.estimated_revenue_cents)} />
            <MetricCard
              label="Margem estimada"
              value={formatMoney(summary.estimated_margin_cents)}
              tone={summary.estimated_margin_cents >= 0 ? "positive" : "negative"}
            />
          </section>

          {snapshots.length > 0 ? (
            <section className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <h2 className="text-sm font-semibold">Fechamentos mensais</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Histórico consolidado para acompanhar margem e custo real da operação.
                </p>
              </div>
              <div className="divide-y divide-border">
                {snapshots.map((snapshot) => (
                  <SnapshotRow key={snapshot.id} snapshot={snapshot} />
                ))}
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold">Consumo por métrica</h2>
              <div className="mt-4 space-y-3">
                {Object.entries(summary.by_metric).map(([metricKey, item]) => (
                  <div key={metricKey} className="rounded-md border border-border bg-background p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">
                        {metricLabels[metricKey] ?? metricKey}
                      </p>
                      <p className="text-sm font-semibold">
                        {formatMoney(item.total_cost_cents)}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Quantidade: {formatQuantity(item.quantity)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
              <div className="border-b border-border p-4">
                <h2 className="text-sm font-semibold">Eventos recentes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Histórico auditável de consumo operacional desta imobiliária.
                </p>
              </div>
              <div className="divide-y divide-border">
                {events.map((event) => (
                  <UsageEventRow key={event.id} event={event} />
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </ModulePage>
  );
}

function SnapshotRow({ snapshot }: { snapshot: TenantCostSnapshot }) {
  return (
    <article className="grid gap-3 p-4 md:grid-cols-[1fr_140px_140px_140px] md:items-center">
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarCheck className="h-4 w-4 text-primary" />
          {formatDate(snapshot.period_start)} até {formatDate(snapshot.period_end)}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {snapshot.charges_count} cobranças · {snapshot.pix_count} PIX · {snapshot.boleto_count} boletos ·{" "}
          {snapshot.pdfs_count} PDFs
        </p>
      </div>
      <SnapshotMetric label="Custo" value={formatMoney(snapshot.estimated_cost_cents)} />
      <SnapshotMetric label="Receita" value={formatMoney(snapshot.estimated_revenue_cents)} />
      <SnapshotMetric
        label="Margem"
        value={formatMoney(snapshot.estimated_margin_cents)}
        tone={snapshot.estimated_margin_cents >= 0 ? "positive" : "negative"}
      />
    </article>
  );
}

function SnapshotMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500",
    negative: "text-rose-500",
  }[tone];

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500",
    negative: "text-rose-500",
  }[tone];

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </article>
  );
}

function UsageEventRow({ event }: { event: TenantUsageEvent }) {
  return (
    <article className="grid gap-3 p-4 md:grid-cols-[1fr_140px_120px] md:items-center">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold">
          {metricLabels[event.metric_key] ?? event.metric_key}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fonte: {event.source} · {formatDateTime(event.occurred_at)}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        {formatQuantity(event.quantity)} {event.unit}
      </p>
      <p className="text-sm font-semibold md:text-right">{formatMoney(event.total_cost_cents)}</p>
    </article>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
