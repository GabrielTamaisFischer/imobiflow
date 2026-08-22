import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  Plus,
  ReceiptText,
  Send,
  ServerCog,
  UserRound,
  WalletCards,
  Webhook,
} from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { listContracts, type Contract } from "@/product/contracts";
import {
  createFinancialEntry,
  createFinancialPayment,
  createFinancialCollectionTask,
  createMissingOwnerTransfer,
  cancelFinancialOperationAction,
  confirmFinancialChargePayment,
  confirmOwnerTransferPayment,
  executeFinancialWebhookReprocess,
  generateRentalCharge,
  getFinancialOperationsSummary,
  getFinancialSummary,
  issueFinancialChargePayment,
  listFinancialCharges,
  listFinancialEntries,
  listOwnerTransfers,
  prepareChargeNotification,
  prepareOwnerTransferNotification,
  requestFinancialWebhookReprocess,
  resolveFinancialOperationAction,
  resolveFinancialWebhook,
  reviewFinancialGatewayIssue,
  syncFinancialChargeGatewayCustomer,
  type FinancialCharge,
  type FinancialEntry,
  type FinancialEntryInput,
  type FinancialOperationsResponse,
  type FinancialSummary,
  type OwnerTransfer,
  type RentalChargeInput,
} from "@/product/finance";
import { getModuleByKey } from "@/product/app-modules";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/financeiro")({
  component: FinancePage,
});

const statusLabels = {
  draft: "Rascunho",
  open: "Aberto",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  archived: "Arquivado",
};

const chargeStatusLabels = {
  pending: "Pendente",
  waiting_payment: "Aguardando pagamento",
  processing: "Processando",
  waiting_compensation: "Aguardando compensação",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  refunded: "Estornado",
  failed: "Falhou",
  disputed: "Em disputa",
  transfer_pending: "Repasse pendente",
  transferred: "Repasse realizado",
};

const ownerTransferStatusLabels = {
  pending: "Pendente",
  approved: "Aprovado",
  paid: "Pago",
  cancelled: "Cancelado",
};

function FinancePage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("finance");
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [charges, setCharges] = useState<FinancialCharge[]>([]);
  const [ownerTransfers, setOwnerTransfers] = useState<OwnerTransfer[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [financialOperations, setFinancialOperations] = useState<FinancialOperationsResponse | null>(null);
  const [isFinanceLoading, setIsFinanceLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshFinance() {
    setIsFinanceLoading(true);
    setError(null);

    try {
      const [
        entriesResponse,
        contractsResponse,
        summaryResponse,
        operationsResponse,
        chargesResponse,
        transfersResponse,
      ] = await Promise.all([
        listFinancialEntries(),
        listContracts(),
        getFinancialSummary(),
        getFinancialOperationsSummary(),
        listFinancialCharges(),
        listOwnerTransfers(),
      ]);
      setEntries(entriesResponse.entries);
      setCharges(chargesResponse.charges);
      setOwnerTransfers(transfersResponse.transfers);
      setContracts(contractsResponse.contracts);
      setSummary(summaryResponse.summary);
      setFinancialOperations(operationsResponse);
    } catch (financeError) {
      setError(
        financeError instanceof Error
          ? financeError.message
          : "Não foi possível carregar o financeiro.",
      );
    } finally {
      setIsFinanceLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshFinance();
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
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Controle financeiro operacional</p>
          <p className="text-sm text-muted-foreground">
            Registre recebíveis, despesas, vencimentos e pagamentos reais da imobiliária.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowChargeForm((current) => !current)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <ReceiptText className="h-4 w-4" />
          Gerar cobrança
        </button>
      </div>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: lançamentos financeiros criados aqui ficam apenas neste navegador.
        </div>
      ) : null}

      {summary ? <FinanceSummary summary={summary} /> : null}

      {financialOperations ? (
        <FinancialOperationsPanel operations={financialOperations} onRefresh={() => void refreshFinance()} />
      ) : null}

      {showChargeForm ? (
        <RentalChargeForm
          contracts={contracts}
          onCancel={() => setShowChargeForm(false)}
          onCreated={() => {
            setShowChargeForm(false);
            void refreshFinance();
          }}
        />
      ) : null}

      {showForm ? (
        <FinancialEntryForm
          contracts={contracts}
          onCancel={() => setShowForm(false)}
          onCreated={(entry) => {
            setEntries((current) => [entry, ...current]);
            setShowForm(false);
            void refreshFinance();
          }}
        />
      ) : null}

      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-semibold transition hover:bg-accent"
        >
          <Plus className="h-4 w-4" />
          Lançamento avulso
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isFinanceLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando financeiro...
        </section>
      ) : entries.length === 0 && charges.length === 0 && ownerTransfers.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title="Nenhum lançamento financeiro"
          description="Gere cobranças reais por contrato ou crie lançamentos avulsos para acompanhar o fluxo de caixa."
          actionLabel="Gerar cobrança"
          onAction={() => setShowChargeForm(true)}
        />
      ) : (
        <div className="space-y-6">
          {charges.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle
                title="Cobranças de locação"
                description="PIX, boleto, comissão e repasse calculados a partir dos contratos."
              />
              {charges.map((charge) => (
                <FinancialChargeCard
                  key={charge.id}
                  charge={charge}
                  onPaid={() => void refreshFinance()}
                />
              ))}
            </section>
          ) : null}

          {ownerTransfers.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle
                title="Repasses ao proprietÃ¡rio"
                description="Valores lÃ­quidos calculados por cobranÃ§a, com confirmaÃ§Ã£o e comprovante auditÃ¡veis."
              />
              <div className="grid gap-3 lg:grid-cols-2">
                {ownerTransfers.map((transfer) => (
                  <OwnerTransferCard
                    key={transfer.id}
                    transfer={transfer}
                    onPaid={() => void refreshFinance()}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {entries.length > 0 ? (
            <section className="space-y-3">
              <SectionTitle
                title="Lançamentos financeiros"
                description="Receitas e despesas registradas na operação."
              />
              {entries.map((entry) => (
                <FinancialEntryCard
                  key={entry.id}
                  entry={entry}
                  onPaid={(updatedEntry) => {
                    setEntries((current) =>
                      current.map((item) => (item.id === updatedEntry.id ? updatedEntry : item)),
                    );
                    void refreshFinance();
                  }}
                />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </ModulePage>
  );
}

function FinanceSummary({ summary }: { summary: FinancialSummary }) {
  return (
    <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <SummaryCard label="Recebido" value={summary.received_cents} tone="positive" />
      <SummaryCard label="A receber" value={summary.open_receivables_cents} />
      <SummaryCard label="Despesas pagas" value={summary.paid_expenses_cents} tone="negative" />
      <SummaryCard label="A pagar" value={summary.open_payables_cents} />
      <SummaryCard label="Vencido" value={summary.overdue_cents} tone="warning" />
    </section>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  const toneClass = {
    neutral: "text-foreground",
    positive: "text-emerald-500",
    negative: "text-rose-500",
    warning: "text-amber-500",
  }[tone];

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-2 text-xl font-bold ${toneClass}`}>{formatMoney(value)}</p>
    </article>
  );
}

function FinancialOperationsPanel({
  operations,
  onRefresh,
}: {
  operations: FinancialOperationsResponse;
  onRefresh: () => void;
}) {
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasAlerts =
    operations.summary.overdue_charges_count > 0 ||
    operations.summary.waiting_compensation_count > 0 ||
    operations.summary.gateway_issues_count > 0 ||
    operations.summary.pending_transfers_count > 0 ||
    operations.summary.failed_webhooks_count > 0 ||
    operations.summary.paid_without_transfer_count > 0 ||
    operations.summary.open_operation_actions_count > 0;

  async function runAction(actionKey: string, action: () => Promise<unknown>, successMessage: string) {
    setRunningAction(actionKey);
    setActionMessage(null);
    setActionError(null);

    try {
      await action();
      setActionMessage(successMessage);
      onRefresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Nao foi possivel executar a acao.");
    } finally {
      setRunningAction(null);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-2 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold">Painel financeiro operacional</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Conciliação, compensação bancária, gateway e repasses que precisam de atenção.
          </p>
        </div>
        <span
          className={`inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold ${
            hasAlerts
              ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
          }`}
        >
          {hasAlerts ? "Atenção operacional" : "Operação saudável"}
        </span>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        <OperationMetric
          icon={AlertTriangle}
          label="Cobranças vencidas"
          value={operations.summary.overdue_charges_count}
          amount={operations.summary.overdue_charges_cents}
          tone={operations.summary.overdue_charges_count > 0 ? "warning" : "positive"}
        />
        <OperationMetric
          icon={Clock3}
          label="Compensação"
          value={operations.summary.waiting_compensation_count}
          amount={operations.summary.waiting_compensation_cents}
          tone={operations.summary.waiting_compensation_count > 0 ? "warning" : "positive"}
        />
        <OperationMetric
          icon={ServerCog}
          label="Inconsistências gateway"
          value={operations.summary.gateway_issues_count}
          amount={operations.summary.gateway_issues_cents}
          tone={operations.summary.gateway_issues_count > 0 ? "negative" : "positive"}
        />
        <OperationMetric
          icon={WalletCards}
          label="Repasses pendentes"
          value={operations.summary.pending_transfers_count}
          amount={operations.summary.pending_transfers_cents}
          tone={operations.summary.pending_transfers_count > 0 ? "warning" : "positive"}
        />
      </div>

      {actionMessage || actionError ? (
        <div
          className={`border-t border-border px-4 py-3 text-sm ${
            actionError ? "text-destructive" : "text-emerald-500"
          }`}
        >
          {actionError ?? actionMessage}
        </div>
      ) : null}

      {!hasAlerts ? (
        <div className="border-t border-border p-4 text-sm text-muted-foreground">
          Nenhuma inconsistência financeira encontrada para os dados atuais.
        </div>
      ) : (
        <div className="grid gap-4 border-t border-border p-4 xl:grid-cols-[1fr_1fr]">
          <FinancialAlertList
            title="Gateway e conciliação"
            empty="Nenhuma inconsistência de gateway."
            items={[
              ...operations.gateway_issues.map((charge) => ({
                id: `gateway-${charge.id}`,
                title: charge.contracts?.title ?? "Cobrança sem título",
                description: gatewayIssueReason(charge),
                value: charge.gross_amount_cents,
                status: chargeStatusLabels[charge.status],
                actionLabel: "Marcar revisada",
                isLoading: runningAction === `review-${charge.id}`,
                onAction: () =>
                  runAction(
                    `review-${charge.id}`,
                    () =>
                      reviewFinancialGatewayIssue(
                        charge.id,
                        "Inconsistencia revisada a partir do painel financeiro operacional.",
                      ),
                    "Inconsistencia marcada como revisada.",
                  ),
              })),
              ...operations.paid_without_transfer.map((charge) => ({
                id: `transfer-missing-${charge.id}`,
                title: charge.contracts?.title ?? "Cobrança paga",
                description: "Pagamento confirmado, mas sem repasse gerado para o proprietário.",
                value: charge.net_owner_amount_cents,
                status: "Sem repasse",
                actionLabel: "Gerar repasse",
                isLoading: runningAction === `transfer-${charge.id}`,
                onAction: () =>
                  runAction(
                    `transfer-${charge.id}`,
                    () =>
                      createMissingOwnerTransfer(
                        charge.id,
                        "Repasse ausente gerado pelo painel financeiro operacional.",
                      ),
                    "Repasse gerado para a cobranca.",
                  ),
              })),
            ]}
          />
          <FinancialAlertList
            title="Cobranças e repasses"
            empty="Nenhuma pendência de cobrança ou repasse."
            items={[
              ...operations.overdue_charges.map((charge) => ({
                id: `overdue-${charge.id}`,
                title: charge.contracts?.title ?? "Cobrança vencida",
                description: `Venceu em ${formatDate(charge.due_date)}`,
                value: charge.gross_amount_cents,
                status: chargeStatusLabels[charge.status],
                actionLabel: "Criar tarefa",
                isLoading: runningAction === `collection-${charge.id}`,
                onAction: () =>
                  runAction(
                    `collection-${charge.id}`,
                    () =>
                      createFinancialCollectionTask(charge.id, {
                        reason:
                          "Tarefa de cobranca criada pelo painel financeiro operacional para regularizacao do pagamento.",
                      }),
                    "Tarefa de cobranca criada.",
                  ),
              })),
              ...operations.pending_transfers.map((transfer) => ({
                id: `transfer-${transfer.id}`,
                title:
                  transfer.property_owners?.name ??
                  transfer.properties?.title ??
                  transfer.contracts?.title ??
                  "Repasse pendente",
                description: transfer.due_date
                  ? `Previsto para ${formatDate(transfer.due_date)}`
                  : "Sem previsão definida",
                value: transfer.net_amount_cents,
                status: ownerTransferStatusLabels[transfer.status],
              })),
            ]}
          />
        </div>
      )}

      {operations.operation_actions.length > 0 ? (
        <FinancialOperationActionsPanel
          operations={operations}
          runAction={runAction}
          runningAction={runningAction}
        />
      ) : null}

      {operations.recent_webhooks.length > 0 || operations.recent_audit_logs.length > 0 ? (
        <div className="grid gap-4 border-t border-border p-4 xl:grid-cols-[1fr_1fr]">
          <FinancialWebhookPanel operations={operations} runAction={runAction} runningAction={runningAction} />
          <FinancialAuditPanel operations={operations} />
        </div>
      ) : null}
    </section>
  );
}

function OperationMetric({
  icon: Icon,
  label,
  value,
  amount,
  tone,
}: {
  icon: typeof WalletCards;
  label: string;
  value: number;
  amount: number;
  tone: "positive" | "warning" | "negative";
}) {
  const toneClass = {
    positive: "text-emerald-500",
    warning: "text-amber-500",
    negative: "text-rose-500",
  }[tone];

  return (
    <article className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon className={`h-4 w-4 ${toneClass}`} />
      </div>
      <p className={`mt-2 text-xl font-bold ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{formatMoney(amount)}</p>
    </article>
  );
}

function FinancialAlertList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{
    id: string;
    title: string;
    description: string;
    value: number;
    status: string;
    actionLabel?: string;
    isLoading?: boolean;
    onAction?: () => void;
  }>;
}) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="border-b border-border p-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border">
          {items.slice(0, 8).map((item) => (
            <article key={item.id} className="grid gap-2 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <h4 className="truncate text-sm font-semibold">{item.title}</h4>
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-semibold">{formatMoney(item.value)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.status}</p>
                {item.onAction ? (
                  <button
                    type="button"
                    onClick={item.onAction}
                    disabled={item.isLoading}
                    className="mt-2 inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {item.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {item.actionLabel}
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function FinancialWebhookPanel({
  operations,
  runAction,
  runningAction,
}: {
  operations: FinancialOperationsResponse;
  runAction: (actionKey: string, action: () => Promise<unknown>, successMessage: string) => Promise<void>;
  runningAction: string | null;
}) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Webhook className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Webhooks financeiros recentes</h3>
      </div>
      {operations.recent_webhooks.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">Nenhum webhook financeiro recebido.</p>
      ) : (
        <div className="divide-y divide-border">
          {operations.recent_webhooks.slice(0, 6).map((event) => (
            <article key={event.id} className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">{event.provider}</h4>
                <span className="text-xs text-muted-foreground">{event.event_type}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.gateway_charge_id ?? "sem cobrança externa"} · {formatDateTime(event.created_at)}
              </p>
              {event.error_message || !event.processed_at ? (
                <p className="mt-2 text-xs text-destructive">
                  {event.error_message ?? "Webhook ainda não processado."}
                </p>
              ) : null}
              {event.error_message || !event.processed_at || event.status_after === "failed" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        `webhook-resolve-${event.id}`,
                        () =>
                          resolveFinancialWebhook(
                            event.id,
                            "Webhook financeiro revisado pelo painel financeiro operacional.",
                          ),
                        "Webhook marcado como revisado.",
                      )
                    }
                    disabled={runningAction === `webhook-resolve-${event.id}`}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {runningAction === `webhook-resolve-${event.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Marcar revisado
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        `webhook-reprocess-${event.id}`,
                        () =>
                          requestFinancialWebhookReprocess(
                            event.id,
                            "Reprocessamento solicitado pelo painel financeiro operacional.",
                          ),
                        "Reprocessamento solicitado.",
                      )
                    }
                    disabled={runningAction === `webhook-reprocess-${event.id}`}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {runningAction === `webhook-reprocess-${event.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Solicitar reprocesso
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        `webhook-execute-${event.id}`,
                        () =>
                          executeFinancialWebhookReprocess(
                            event.id,
                            "Webhook financeiro reprocessado pelo painel operacional.",
                          ),
                        "Webhook financeiro reprocessado.",
                      )
                    }
                    disabled={runningAction === `webhook-execute-${event.id}`}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {runningAction === `webhook-execute-${event.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Reprocessar agora
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function FinancialOperationActionsPanel({
  operations,
  runAction,
  runningAction,
}: {
  operations: FinancialOperationsResponse;
  runAction: (actionKey: string, action: () => Promise<unknown>, successMessage: string) => Promise<void>;
  runningAction: string | null;
}) {
  const labels = {
    gateway_issue_review: "Revisão de gateway",
    webhook_review: "Revisão de webhook",
    webhook_reprocess_requested: "Reprocesso solicitado",
    missing_transfer_created: "Repasse gerado",
    collection_task: "Tarefa de cobrança",
  };

  return (
    <section className="border-t border-border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Ações financeiras operacionais</h3>
        <span className="text-xs text-muted-foreground">
          {operations.summary.open_operation_actions_count} abertas
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {operations.operation_actions.slice(0, 6).map((action) => (
          <article key={action.id} className="rounded-md border border-border bg-background p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-semibold">{action.title}</h4>
              <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                {action.status === "open" ? "Aberta" : action.status === "done" ? "Concluída" : "Cancelada"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {labels[action.action_type]} · {formatDateTime(action.created_at)}
            </p>
            {action.description ? (
              <p className="mt-2 text-xs text-muted-foreground">{action.description}</p>
            ) : null}
            {action.due_at && action.status === "open" ? (
              <p className="mt-2 text-xs text-amber-500">Prazo: {formatDateTime(action.due_at)}</p>
            ) : null}
            {action.status === "open" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {action.action_type === "webhook_reprocess_requested" && action.webhook_event_id ? (
                  <button
                    type="button"
                    onClick={() =>
                      void runAction(
                        `action-reprocess-${action.id}`,
                        () =>
                          executeFinancialWebhookReprocess(
                            action.webhook_event_id!,
                            "Webhook financeiro reprocessado a partir da ação operacional.",
                          ),
                        "Webhook financeiro reprocessado.",
                      )
                    }
                    disabled={runningAction === `action-reprocess-${action.id}`}
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {runningAction === `action-reprocess-${action.id}` ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Reprocessar
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      `action-resolve-${action.id}`,
                      () =>
                        resolveFinancialOperationAction(
                          action.id,
                          "Ação financeira concluída pelo painel operacional.",
                        ),
                      "Ação financeira concluída.",
                    )
                  }
                  disabled={runningAction === `action-resolve-${action.id}`}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runningAction === `action-resolve-${action.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Concluir
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      `action-cancel-${action.id}`,
                      () =>
                        cancelFinancialOperationAction(
                          action.id,
                          "Ação financeira cancelada pelo painel operacional.",
                        ),
                      "Ação financeira cancelada.",
                    )
                  }
                  disabled={runningAction === `action-cancel-${action.id}`}
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runningAction === `action-cancel-${action.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Cancelar
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function FinancialAuditPanel({ operations }: { operations: FinancialOperationsResponse }) {
  return (
    <section className="rounded-md border border-border bg-background">
      <div className="border-b border-border p-3">
        <h3 className="text-sm font-semibold">Auditoria financeira recente</h3>
      </div>
      {operations.recent_audit_logs.length === 0 ? (
        <p className="p-3 text-sm text-muted-foreground">Nenhum evento de auditoria financeira.</p>
      ) : (
        <div className="divide-y divide-border">
          {operations.recent_audit_logs.slice(0, 6).map((event) => (
            <article key={event.id} className="p-3">
              <h4 className="text-sm font-semibold">{event.event_type}</h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.status_before ?? "sem status"} para {event.status_after ?? "sem status"} ·{" "}
                {formatDateTime(event.created_at)}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function gatewayIssueReason(charge: FinancialCharge) {
  if (charge.status === "failed") return "Cobrança marcada como falha.";
  if (charge.status === "disputed") return "Cobrança em disputa.";
  if (charge.payment_method !== "manual" && !charge.gateway_charge_id) {
    return "Cobrança sem ID externo do gateway.";
  }
  return "Gateway retornou bloqueio ou falha na preparação.";
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function RentalChargeForm({
  contracts,
  onCancel,
  onCreated,
}: {
  contracts: Contract[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rentalContracts = contracts.filter((contract) => contract.contract_type === "rental");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const baseAmount = parseMoneyToCents(String(form.get("base_amount") ?? ""));
    const feeAmount = parseMoneyToCents(String(form.get("fee_amount") ?? ""));
    const commissionFixed = parseMoneyToCents(String(form.get("commission_fixed") ?? ""));
    const commissionRate = Number(String(form.get("commission_rate") ?? "10").replace(",", "."));

    const input: RentalChargeInput = {
      contract_id: String(form.get("contract_id") ?? ""),
      due_date: String(form.get("due_date") ?? ""),
      payment_method: String(form.get("payment_method") ?? "pix") as RentalChargeInput["payment_method"],
      base_amount_cents: baseAmount,
      fee_amount_cents: feeAmount ?? 0,
      fee_payer: String(form.get("fee_payer") ?? "company") as RentalChargeInput["fee_payer"],
      fee_acceptance_confirmed: form.get("fee_acceptance_confirmed") === "on",
      fee_acceptance_reference: String(form.get("fee_acceptance_reference") ?? ""),
      commission_type: String(form.get("commission_type") ?? "percentage") as RentalChargeInput["commission_type"],
      commission_rate: Number.isFinite(commissionRate) ? commissionRate : 10,
      commission_fixed_cents: commissionFixed,
      notes: String(form.get("notes") ?? ""),
    };

    try {
      await generateRentalCharge(input);
      formElement.reset();
      onCreated();
    } catch (chargeError) {
      setError(
        chargeError instanceof Error ? chargeError.message : "Não foi possível gerar a cobrança.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Gerar cobrança por contrato</h2>
          <p className="text-sm text-muted-foreground">
            Cria recebível, cobrança, comissão e repasse do proprietário em uma única rotina.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          Cancelar
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="space-y-1 text-sm xl:col-span-2">
          <span className="font-medium">Contrato de locação</span>
          <select
            name="contract_id"
            required
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue=""
          >
            <option value="">Selecione</option>
            {rentalContracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.contract_number ? `${contract.contract_number} - ` : ""}
                {contract.title}
              </option>
            ))}
          </select>
        </label>
        <Field label="Vencimento" name="due_date" type="date" required />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Pagamento</span>
          <select
            name="payment_method"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="pix"
          >
            <option value="pix">PIX</option>
            <option value="boleto">Boleto</option>
            <option value="hybrid">PIX + boleto</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <Field label="Aluguel" name="base_amount" inputMode="decimal" placeholder="Usa valor do contrato se vazio" />
        <Field label="Taxa operacional" name="fee_amount" inputMode="decimal" placeholder="Ex.: 3,49" />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Taxa paga por</span>
          <select
            name="fee_payer"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="company"
          >
            <option value="company">Imobiliária/proprietário</option>
            <option value="tenant">Inquilino</option>
            <option value="owner">Proprietário</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Comissão</span>
          <select
            name="commission_type"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="percentage"
          >
            <option value="percentage">Percentual</option>
            <option value="fixed">Valor fixo</option>
          </select>
        </label>
        <Field label="% comissão" name="commission_rate" inputMode="decimal" placeholder="10" />
        <Field label="Comissão fixa" name="commission_fixed" inputMode="decimal" placeholder="Opcional" />
      </div>

      <div className="mt-3 grid gap-3 rounded-md border border-border bg-background p-3 md:grid-cols-[1fr_2fr] md:items-end">
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            name="fee_acceptance_confirmed"
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-input"
          />
          <span>
            Existe aceite contratual para repassar taxa ao inquilino ou proprietário.
          </span>
        </label>
        <Field
          label="Referência do aceite"
          name="fee_acceptance_reference"
          placeholder="Ex.: contrato, cláusula, aditivo ou documento assinado"
        />
      </div>

      <label className="mt-3 block space-y-1 text-sm">
        <span className="font-medium">Observação</span>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Ex.: aluguel de maio, taxa paga pelo inquilino, regra especial de repasse."
        />
      </label>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSaving || rentalContracts.length === 0}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
          Gerar cobrança
        </button>
      </div>
    </form>
  );
}

function FinancialEntryForm({
  contracts,
  onCancel,
  onCreated,
}: {
  contracts: Contract[];
  onCancel: () => void;
  onCreated: (entry: FinancialEntry) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const selectedContract = contracts.find((contract) => contract.id === form.get("contract_id"));
    const input: FinancialEntryInput = {
      contract_id: String(form.get("contract_id") ?? ""),
      property_id: selectedContract?.property_id ?? undefined,
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      entry_type: String(form.get("entry_type") ?? "income") as FinancialEntryInput["entry_type"],
      category: String(form.get("category") ?? ""),
      status: "open",
      amount_cents: parseMoneyToCents(String(form.get("amount") ?? "")) ?? 0,
      due_date: String(form.get("due_date") ?? ""),
      competence_date: String(form.get("competence_date") ?? ""),
      payment_method: String(form.get("payment_method") ?? ""),
      notes: String(form.get("notes") ?? ""),
    };

    try {
      const response = await createFinancialEntry(input);
      onCreated(response.entry);
      formElement.reset();
    } catch (entryError) {
      setError(
        entryError instanceof Error ? entryError.message : "Não foi possível salvar o lançamento.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Novo lançamento</h2>
          <p className="text-sm text-muted-foreground">
            Use valores reais. O financeiro começa vazio e cresce com a operação.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          Cancelar
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Título" name="title" required />
        <Field label="Valor" name="amount" inputMode="decimal" required />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Tipo</span>
          <select
            name="entry_type"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="income"
          >
            <option value="income">Receita</option>
            <option value="expense">Despesa</option>
          </select>
        </label>
        <Field label="Categoria" name="category" placeholder="Aluguel, comissão, repasse..." />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Contrato</span>
          <select
            name="contract_id"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue=""
          >
            <option value="">Sem vínculo</option>
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.contract_number ? `${contract.contract_number} - ` : ""}
                {contract.title}
              </option>
            ))}
          </select>
        </label>
        <Field label="Vencimento" name="due_date" type="date" />
        <Field label="Competência" name="competence_date" type="date" />
        <Field label="Forma de pagamento" name="payment_method" />
      </div>

      <label className="mt-3 block space-y-1 text-sm">
        <span className="font-medium">Descrição</span>
        <textarea
          name="description"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Detalhe a origem do lançamento, regra de cobrança ou observação interna."
        />
      </label>

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Salvar lançamento
        </button>
      </div>
    </form>
  );
}

function FinancialEntryCard({
  entry,
  onPaid,
}: {
  entry: FinancialEntry;
  onPaid: (entry: FinancialEntry) => void;
}) {
  const [isPaying, setIsPaying] = useState(false);
  const isIncome = entry.entry_type === "income";

  async function markAsPaid() {
    setIsPaying(true);

    try {
      const response = await createFinancialPayment(entry.id, {
        amount_cents: entry.amount_cents,
        payment_method: entry.payment_method || "manual",
      });
      onPaid(response.entry);
    } finally {
      setIsPaying(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isIncome ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
              }`}
            >
              {isIncome ? "Receita" : "Despesa"}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {statusLabels[entry.status]}
            </span>
          </div>
          <h2 className="mt-3 text-base font-semibold">{entry.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {entry.contracts?.title ?? entry.category ?? "Sem vínculo"}
          </p>
          {entry.description ? (
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
              {entry.description}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-3 text-left md:text-right">
          <p className="text-xl font-bold">{formatMoney(entry.amount_cents)}</p>
          {entry.due_date ? (
            <p className="text-xs text-muted-foreground">Vence em {formatDate(entry.due_date)}</p>
          ) : null}
          {entry.status !== "paid" && entry.status !== "cancelled" ? (
            <button
              type="button"
              onClick={() => void markAsPaid()}
              disabled={isPaying}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Marcar pago
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function FinancialChargeCard({
  charge,
  onPaid,
}: {
  charge: FinancialCharge;
  onPaid: () => void;
}) {
  const [isPaying, setIsPaying] = useState(false);
  const [isIssuing, setIsIssuing] = useState(false);
  const [isSyncingCustomer, setIsSyncingCustomer] = useState(false);
  const [isPreparing, setIsPreparing] = useState<string | null>(null);
  const [issueMessage, setIssueMessage] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [customerMessage, setCustomerMessage] = useState<string | null>(null);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [preparedMessage, setPreparedMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const canConfirm = !["paid", "transfer_pending", "cancelled", "refunded", "transferred"].includes(charge.status);
  const canIssue = canConfirm && charge.payment_method !== "manual";

  async function confirmPayment() {
    setIsPaying(true);

    try {
      await confirmFinancialChargePayment(charge.id, {
        payment_method: charge.payment_method,
        notes: "Confirmação manual de exceção feita pela interface.",
      });
      onPaid();
    } finally {
      setIsPaying(false);
    }
  }

  async function prepareNotification(
    notificationType: "charge_due_reminder" | "charge_overdue_notice" | "charge_payment_confirmed",
  ) {
    setIsPreparing(notificationType);
    setPreparedMessage(null);
    setNotificationError(null);

    try {
      await prepareChargeNotification(charge, {
        notification_type: notificationType,
        channel: "whatsapp",
      });
      setPreparedMessage("Mensagem preparada no histórico de notificações.");
    } catch (error) {
      setNotificationError(
        error instanceof Error ? error.message : "Não foi possível preparar a mensagem.",
      );
    } finally {
      setIsPreparing(null);
    }
  }

  async function issuePayment() {
    setIsIssuing(true);
    setIssueMessage(null);
    setIssueError(null);

    try {
      const response = await issueFinancialChargePayment(charge.id);
      const status = response.gateway_issue?.status;
      const nextStep = response.gateway_issue?.next_step;

      if (status === "issued") {
        setIssueMessage("Cobrança emitida no gateway. A baixa depende do webhook de pagamento.");
      } else if (status === "blocked") {
        setIssueMessage(nextStep || "Emissão bloqueada por configuração pendente do gateway.");
      } else if (status === "failed") {
        setIssueMessage(nextStep || "Gateway recusou a emissão. Verifique a configuração.");
      } else {
        setIssueMessage(nextStep || "Cobrança preparada para emissão no gateway.");
      }
      onPaid();
    } catch (error) {
      setIssueError(
        error instanceof Error ? error.message : "Não foi possível preparar a emissão no gateway.",
      );
    } finally {
      setIsIssuing(false);
    }
  }

  async function syncGatewayCustomer() {
    setIsSyncingCustomer(true);
    setCustomerMessage(null);
    setCustomerError(null);

    try {
      const response = await syncFinancialChargeGatewayCustomer(charge.id);
      const status = response.gateway_customer?.status;
      const nextStep = response.gateway_customer?.next_step;

      if (status === "synced") {
        setCustomerMessage("Inquilino sincronizado no gateway.");
      } else if (status === "blocked") {
        setCustomerMessage(nextStep || "Sincronização bloqueada por configuração pendente.");
      } else if (status === "failed") {
        setCustomerMessage(nextStep || "Gateway recusou a sincronização do inquilino.");
      } else {
        setCustomerMessage(nextStep || "Sincronização de inquilino preparada.");
      }

      onPaid();
    } catch (error) {
      setCustomerError(
        error instanceof Error ? error.message : "Não foi possível sincronizar o inquilino.",
      );
    } finally {
      setIsSyncingCustomer(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {charge.payment_method.toUpperCase()}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {chargeStatusLabels[charge.status]}
            </span>
          </div>
          <h2 className="mt-3 text-base font-semibold">
            {charge.contracts?.title ?? "Cobrança de locação"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Vencimento {formatDate(charge.due_date)} · Proprietário líquido{" "}
            {formatMoney(charge.net_owner_amount_cents)}
          </p>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
            <ChargeMetric label="Aluguel" value={charge.base_rent_amount_cents} />
            <ChargeMetric label="Taxa" value={charge.fee_amount_cents} />
            <ChargeMetric label="Comissão" value={charge.commission_amount_cents} />
            <ChargeMetric label="Cobrado" value={charge.gross_amount_cents} strong />
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-3 text-left lg:text-right">
          <p className="text-xl font-bold">{formatMoney(charge.gross_amount_cents)}</p>
          <p className="text-xs text-muted-foreground">
            Taxa paga por {feePayerLabel(charge.fee_payer)}
          </p>
          {charge.fee_acceptance_required ? (
            <p
              className={`text-xs ${
                charge.fee_acceptance_confirmed ? "text-emerald-500" : "text-amber-500"
              }`}
            >
              {charge.fee_acceptance_confirmed
                ? "Aceite de taxa registrado"
                : "Aceite de taxa pendente"}
            </p>
          ) : null}
          {charge.payment_url || charge.boleto_pdf_url ? (
            <div className="flex flex-col gap-2">
              {charge.payment_url ? (
                <a
                  href={charge.payment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
                >
                  Abrir cobrança
                </a>
              ) : null}
              {charge.boleto_pdf_url ? (
                <a
                  href={charge.boleto_pdf_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
                >
                  Abrir boleto
                </a>
              ) : null}
            </div>
          ) : null}
          {canIssue ? (
            <button
              type="button"
              onClick={() => void syncGatewayCustomer()}
              disabled={isSyncingCustomer}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSyncingCustomer ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserRound className="h-3.5 w-3.5" />
              )}
              Sincronizar cliente
            </button>
          ) : null}
          {canIssue ? (
            <button
              type="button"
              onClick={() => void issuePayment()}
              disabled={isIssuing}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isIssuing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
              Preparar gateway
            </button>
          ) : null}
          {canConfirm ? (
            <button
              type="button"
              onClick={() =>
                void prepareNotification(
                  charge.status === "overdue" ? "charge_overdue_notice" : "charge_due_reminder",
                )
              }
              disabled={Boolean(isPreparing)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPreparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Preparar cobrança
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void prepareNotification("charge_payment_confirmed")}
              disabled={Boolean(isPreparing)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPreparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Preparar recibo
            </button>
          )}
          {canConfirm ? (
            <button
              type="button"
              onClick={() => void confirmPayment()}
              disabled={isPaying}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isPaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Confirmar pagamento
            </button>
          ) : null}
          {preparedMessage ? (
            <p className="max-w-[220px] text-xs text-emerald-500 lg:ml-auto">{preparedMessage}</p>
          ) : null}
          {issueMessage ? (
            <p className="max-w-[220px] text-xs text-emerald-500 lg:ml-auto">{issueMessage}</p>
          ) : null}
          {issueError ? (
            <p className="max-w-[220px] text-xs text-destructive lg:ml-auto">{issueError}</p>
          ) : null}
          {customerMessage ? (
            <p className="max-w-[220px] text-xs text-emerald-500 lg:ml-auto">{customerMessage}</p>
          ) : null}
          {customerError ? (
            <p className="max-w-[220px] text-xs text-destructive lg:ml-auto">{customerError}</p>
          ) : null}
          {notificationError ? (
            <p className="max-w-[220px] text-xs text-destructive lg:ml-auto">{notificationError}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function OwnerTransferCard({
  transfer,
  onPaid,
}: {
  transfer: OwnerTransfer;
  onPaid: () => void;
}) {
  const [isPaying, setIsPaying] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [preparedMessage, setPreparedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canPay = !["paid", "cancelled"].includes(transfer.status);

  async function confirmTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPaying(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      await confirmOwnerTransferPayment(transfer.id, {
        payment_method: String(form.get("payment_method") ?? "manual_transfer"),
        receipt_reference: String(form.get("receipt_reference") ?? ""),
        receipt_url: String(form.get("receipt_url") ?? ""),
        notes: String(form.get("notes") ?? ""),
      });
      onPaid();
    } catch (paymentError) {
      setError(
        paymentError instanceof Error ? paymentError.message : "NÃ£o foi possÃ­vel confirmar o repasse.",
      );
    } finally {
      setIsPaying(false);
    }
  }

  async function prepareOwnerNotification() {
    setIsPreparing(true);
    setPreparedMessage(null);
    setError(null);

    try {
      await prepareOwnerTransferNotification(transfer, {
        notification_type:
          transfer.status === "paid" ? "owner_transfer_paid" : "owner_transfer_pending",
        channel: "whatsapp",
      });
      setPreparedMessage("Mensagem preparada no histórico de notificações.");
    } catch (notificationError) {
      setError(
        notificationError instanceof Error
          ? notificationError.message
          : "Não foi possível preparar a notificação do proprietário.",
      );
    } finally {
      setIsPreparing(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Repasse
            </span>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {ownerTransferStatusLabels[transfer.status]}
            </span>
          </div>
          <h2 className="mt-3 text-base font-semibold">
            {transfer.property_owners?.name ?? transfer.properties?.title ?? transfer.contracts?.title ?? "ProprietÃ¡rio"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {transfer.due_date ? `Previsto para ${formatDate(transfer.due_date)}` : "Sem previsÃ£o definida"}
            {transfer.paid_at ? ` Â· Pago em ${formatDate(transfer.paid_at)}` : ""}
          </p>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-xl font-bold">{formatMoney(transfer.net_amount_cents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Bruto {formatMoney(transfer.gross_amount_cents)} Â· descontos {formatMoney(transfer.deductions_cents)}
          </p>
          {transfer.receipt_url ? (
            <a
              href={transfer.receipt_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
            >
              Ver comprovante
            </a>
          ) : null}
        </div>
      </div>

      {transfer.receipt_reference ? (
        <p className="mt-3 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
          Comprovante: {transfer.receipt_reference}
        </p>
      ) : null}

      {canPay ? (
        <div className="mt-4">
          {!showReceiptForm ? (
            <button
              type="button"
              onClick={() => setShowReceiptForm(true)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Confirmar repasse
            </button>
          ) : (
            <form onSubmit={confirmTransfer} className="rounded-md border border-border bg-background p-3">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Forma" name="payment_method" placeholder="TED, PIX, manual_transfer" />
                <Field label="Comprovante" name="receipt_reference" placeholder="ID, autenticaÃ§Ã£o ou descriÃ§Ã£o" />
                <Field label="Link do comprovante" name="receipt_url" placeholder="https://..." />
              </div>
              <label className="mt-3 block space-y-1 text-sm">
                <span className="font-medium">ObservaÃ§Ã£o</span>
                <textarea
                  name="notes"
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Detalhe interno do repasse confirmado."
                />
              </label>
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowReceiptForm(false)}
                  className="h-9 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPaying}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Salvar repasse
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void prepareOwnerNotification()}
          disabled={isPreparing}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPreparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {transfer.status === "paid" ? "Preparar comprovante" : "Avisar proprietÃ¡rio"}
        </button>
        {preparedMessage ? <p className="text-xs text-emerald-500">{preparedMessage}</p> : null}
        {error && !showReceiptForm ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </article>
  );
}

function ChargeMetric({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm ${strong ? "font-bold" : "font-semibold"}`}>{formatMoney(value)}</p>
    </div>
  );
}

function feePayerLabel(value: FinancialCharge["fee_payer"]) {
  if (value === "tenant") return "inquilino";
  if (value === "owner") return "proprietário";
  return "imobiliária";
}

function Field({
  label,
  name,
  type = "text",
  required,
  inputMode,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        inputMode={inputMode}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 100);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
