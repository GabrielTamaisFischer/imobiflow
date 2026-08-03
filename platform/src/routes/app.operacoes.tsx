import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  Play,
  Loader2,
  RefreshCw,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  XCircle,
  Webhook,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import {
  cancelOperationNotification,
  dispatchOperationNotification,
  getOperationsSummary,
  requeueOperationNotification,
  resolveOperationNotification,
  type OperationAuditLog,
  type OperationAutomationRun,
  type OperationDeliveryAttempt,
  type OperationNotificationEvent,
  type OperationProviderWebhook,
  type OperationsResponse,
} from "@/product/operations";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/operacoes")({
  component: OperationsPage,
});

const statusLabels: Record<string, string> = {
  queued: "Na fila",
  sent: "Enviada",
  delivered: "Entregue",
  read: "Lida",
  failed: "Falhou",
  bounced: "Devolvida",
  blocked: "Bloqueada",
  prepared: "Preparada",
  completed: "Concluida",
  running: "Executando",
  skipped: "Ignorada",
};

const automationLabels: Record<string, string> = {
  financial_notifications: "Regua financeira",
  notification_dispatch: "Disparo de notificacoes",
};

function OperationsPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("operations");
  const [operations, setOperations] = useState<OperationsResponse | null>(null);
  const [isOperationsLoading, setIsOperationsLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshOperations() {
    setIsOperationsLoading(true);
    setError(null);

    try {
      setOperations(await getOperationsSummary());
    } catch (operationsError) {
      setError(
        operationsError instanceof Error
          ? operationsError.message
          : "Nao foi possivel carregar a saude operacional.",
      );
    } finally {
      setIsOperationsLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshOperations();
    }
  }, [isLoading, session]);

  const hasOperationalData = useMemo(() => {
    if (!operations) return false;

    return (
      operations.automation_runs.length > 0 ||
      operations.recent_attempts.length > 0 ||
      operations.recent_webhooks.length > 0 ||
      Object.values(operations.summary.notification_status).some((count) => count > 0)
    );
  }, [operations]);

  async function runNotificationAction(
    actionKey: "requeue" | "dispatch" | "resolve" | "cancel",
    event: OperationNotificationEvent,
  ) {
    const actionId = `${actionKey}:${event.id}`;
    setRunningAction(actionId);
    setError(null);

    try {
      if (actionKey === "requeue") {
        await requeueOperationNotification(event.id, {
          reason: "Reenfileirado manualmente pelo centro operacional.",
        });
      }

      if (actionKey === "dispatch") {
        await dispatchOperationNotification(event.id, {
          reason: "Reprocessado manualmente pelo centro operacional.",
        });
      }

      if (actionKey === "resolve") {
        await resolveOperationNotification(
          event.id,
          "Falha revisada e marcada como resolvida no centro operacional.",
        );
      }

      if (actionKey === "cancel") {
        await cancelOperationNotification(
          event.id,
          "Notificacao cancelada manualmente pelo centro operacional.",
        );
      }

      await refreshOperations();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Nao foi possivel executar a acao.");
    } finally {
      setRunningAction(null);
    }
  }

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
          Modo visualizacao ativo: o centro operacional inicia vazio e sera preenchido por
          automacoes, webhooks e disparos reais.
        </div>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Monitoramento operacional</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe fila de mensagens, retorno dos provedores, automacoes e falhas que exigem
            reprocessamento.
          </p>
        </div>
        <Button
          type="button"
          onClick={refreshOperations}
          disabled={isOperationsLoading}
          className="w-full md:w-auto"
        >
          {isOperationsLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Atualizar
        </Button>
      </section>

      {isOperationsLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando saude operacional...
        </section>
      ) : !operations || !hasOperationalData ? (
        <EmptyState
          icon={Activity}
          title="Nenhum evento operacional ainda"
          description="O painel comeca vazio. Quando notificacoes, webhooks, filas e automacoes reais forem executados, a saude operacional aparecera aqui."
        />
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={BellRing}
              label="Na fila"
              value={operations.summary.queue.queued}
              detail={`${operations.summary.queue.retryable_failed} falhas com retry`}
            />
            <MetricCard
              icon={Webhook}
              label="Webhooks recebidos"
              value={operations.summary.webhooks.total}
              detail={`${operations.summary.webhooks.unprocessed} nao processados`}
            />
            <MetricCard
              icon={ServerCog}
              label="Automacoes com falha"
              value={operations.summary.automations.failed_runs}
              detail="ultimas 20 execucoes"
              tone={operations.summary.automations.failed_runs > 0 ? "negative" : "positive"}
            />
            <MetricCard
              icon={AlertTriangle}
              label="Falhas permanentes"
              value={operations.summary.queue.permanently_failed}
              detail="notificacoes recentes"
              tone={operations.summary.queue.permanently_failed > 0 ? "negative" : "positive"}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <StatusPanel
              title="Status das notificacoes"
              items={operations.summary.notification_status}
            />
            <StatusPanel title="Status dos webhooks" items={operations.summary.webhooks.by_status} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <AutomationPanel
              title="Automacoes recentes"
              runs={operations.automation_runs}
              lastDispatchRun={operations.summary.automations.last_dispatch_run}
              lastFinancialRun={operations.summary.automations.last_financial_run}
            />
            <FailedEventsPanel
              events={operations.failed_events}
              runningAction={runningAction}
              onAction={runNotificationAction}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <DeliveryAttemptsPanel attempts={operations.recent_attempts} />
            <ProviderWebhooksPanel webhooks={operations.recent_webhooks} />
          </section>

          <OperationAuditPanel logs={operations.recent_audit_logs} />
        </div>
      )}
    </ModulePage>
  );
}

function OperationAuditPanel({ logs }: { logs: OperationAuditLog[] }) {
  const actionLabels: Record<string, string> = {
    notification_requeued: "Notificacao reenfileirada",
    notification_dispatched: "Notificacao reprocessada",
    notification_cancelled: "Notificacao cancelada",
    notification_failure_resolved: "Falha resolvida",
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">Auditoria operacional</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Registro das acoes manuais executadas no centro operacional.
        </p>
      </div>
      {logs.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhuma acao manual registrada.</p>
      ) : (
        <div className="divide-y divide-border">
          {logs.map((log) => (
            <article key={log.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_180px] lg:items-center">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">
                  {actionLabels[log.action_key] ?? log.action_key}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {log.previous_status ?? "sem status"} para {log.new_status ?? "sem status"} ·{" "}
                  {log.reason ?? "sem justificativa"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground lg:text-right">
                {formatDateTime(log.created_at)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  detail: string;
  tone?: "neutral" | "positive" | "negative";
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500",
    negative: "text-rose-500",
  }[tone];

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <p className={`mt-3 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </article>
  );
}

function StatusPanel({ title, items }: { title: string; items: Record<string, number> }) {
  const entries = Object.entries(items).sort(([, a], [, b]) => b - a);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {entries.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhum status registrado.</p>
      ) : (
        <div className="divide-y divide-border">
          {entries.map(([status, count]) => (
            <div key={status} className="flex items-center justify-between gap-3 p-4">
              <StatusBadge status={status} />
              <span className="text-sm font-semibold">{count}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AutomationPanel({
  title,
  runs,
  lastDispatchRun,
  lastFinancialRun,
}: {
  title: string;
  runs: OperationAutomationRun[];
  lastDispatchRun: OperationAutomationRun | null;
  lastFinancialRun: OperationAutomationRun | null;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Ultimo disparo: {lastDispatchRun ? formatDateTime(lastDispatchRun.started_at) : "sem execucao"}.
          Regua financeira: {lastFinancialRun ? formatDateTime(lastFinancialRun.started_at) : "sem execucao"}.
        </p>
      </div>
      {runs.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhuma automacao executada.</p>
      ) : (
        <div className="divide-y divide-border">
          {runs.map((run) => (
            <article key={run.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {automationLabels[run.automation_key] ?? run.automation_key}
                </h3>
                <StatusBadge status={run.status} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {formatDateTime(run.started_at)} · {run.companies_scanned} empresas ·{" "}
                {run.events_created} eventos · {run.events_skipped} ignorados
              </p>
              {run.error_message ? (
                <p className="mt-2 text-xs text-destructive">{run.error_message}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function FailedEventsPanel({
  events,
  runningAction,
  onAction,
}: {
  events: OperationNotificationEvent[];
  runningAction: string | null;
  onAction: (
    actionKey: "requeue" | "dispatch" | "resolve" | "cancel",
    event: OperationNotificationEvent,
  ) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">Falhas que exigem atencao</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Acoes manuais registram auditoria e mantem o historico operacional.
        </p>
      </div>
      {events.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhuma falha recente.</p>
      ) : (
        <div className="divide-y divide-border">
          {events.map((event) => (
            <article key={event.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {event.recipient_name || event.recipient_contact}
                </h3>
                <StatusBadge status={event.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.channel} via {event.provider} · tentativa {event.attempt_count}/
                {event.max_attempts}
              </p>
              {event.failure_reason ? (
                <p className="mt-2 text-xs text-destructive">{event.failure_reason}</p>
              ) : null}
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <OperationActionButton
                  icon={RotateCcw}
                  label="Reenfileirar"
                  isLoading={runningAction === `requeue:${event.id}`}
                  onClick={() => onAction("requeue", event)}
                />
                <OperationActionButton
                  icon={Play}
                  label="Reprocessar"
                  isLoading={runningAction === `dispatch:${event.id}`}
                  disabled={event.attempt_count >= event.max_attempts}
                  onClick={() => onAction("dispatch", event)}
                />
                <OperationActionButton
                  icon={ShieldCheck}
                  label="Resolver"
                  isLoading={runningAction === `resolve:${event.id}`}
                  onClick={() => onAction("resolve", event)}
                />
                <OperationActionButton
                  icon={XCircle}
                  label="Cancelar"
                  isLoading={runningAction === `cancel:${event.id}`}
                  onClick={() => onAction("cancel", event)}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function OperationActionButton({
  icon: Icon,
  label,
  isLoading,
  disabled,
  onClick,
}: {
  icon: typeof Activity;
  label: string;
  isLoading: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || isLoading}
      onClick={onClick}
      className="justify-start"
    >
      {isLoading ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Icon className="mr-2 h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  );
}

function DeliveryAttemptsPanel({ attempts }: { attempts: OperationDeliveryAttempt[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">Tentativas de entrega</h2>
      </div>
      {attempts.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhuma tentativa registrada.</p>
      ) : (
        <div className="divide-y divide-border">
          {attempts.map((attempt) => (
            <article key={attempt.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {attempt.channel} · {attempt.provider}
                </p>
                <StatusBadge status={attempt.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Tentativa {attempt.attempt_number} · {formatDateTime(attempt.created_at)}
              </p>
              {attempt.error_message ? (
                <p className="mt-2 text-xs text-destructive">{attempt.error_message}</p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProviderWebhooksPanel({ webhooks }: { webhooks: OperationProviderWebhook[] }) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <h2 className="text-sm font-semibold">Webhooks dos provedores</h2>
      </div>
      {webhooks.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Nenhum webhook recebido.</p>
      ) : (
        <div className="divide-y divide-border">
          {webhooks.map((webhook) => (
            <article key={webhook.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{webhook.provider}</p>
                <StatusBadge status={webhook.normalized_status ?? "unknown"} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {webhook.provider_message_id ?? "sem id externo"} ·{" "}
                {formatDateTime(webhook.created_at)}
              </p>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                {webhook.processed_at ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Clock3 className="h-3 w-3 text-amber-500" />
                )}
                {webhook.processed_at ? "Processado" : "Aguardando processamento"}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = ["failed", "bounced", "blocked"].includes(status)
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : ["completed", "sent", "delivered", "read"].includes(status)
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
    : ["queued", "running", "prepared"].includes(status)
    ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
    : "border-border bg-background text-muted-foreground";

  return (
    <span className={`inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium ${tone}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "sem data";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
