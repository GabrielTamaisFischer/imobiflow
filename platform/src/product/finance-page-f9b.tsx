import {
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  Plus,
  ReceiptText,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { listContracts, type Contract } from "@/product/contracts";
import { canManage, canView, getSafeApiErrorMessage } from "@/product/app-access";
import type { AccessResponse } from "@/product/auth";
import {
  listAllProperties,
  listOwners,
  type PropertyOwner,
  type PropertySummary,
} from "@/product/real-estate";
import {
  cancelCanonicalFinancialEntry,
  categoryLabel,
  createCanonicalFinancialEntry,
  financialDashboard,
  formatFinancialAmount,
  listCanonicalFinancialEntries,
  payCanonicalFinancialEntry,
  statusLabel,
  type CanonicalFinancialEntry,
  type FinancialCategory,
  type FinancialFilters,
  type FinancialInput,
  type FinancialStatus,
  typeLabel,
} from "@/product/finance-canonical";

export function CanonicalFinancePage({ session }: { session: AccessResponse | null }) {
  const user = session?.access.appUser;
  const canSee = canView(user, "finance.view");
  const canEdit = canManage(user, "finance.manage");
  const [entries, setEntries] = useState<CanonicalFinancialEntry[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [owners, setOwners] = useState<PropertyOwner[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [filters, setFilters] = useState<FinancialFilters>({ status: "all" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [finance, auxiliary] = await Promise.all([
        listCanonicalFinancialEntries(filters),
        canEdit
          ? Promise.all([listAllProperties({ status: "all" }), listOwners(), listContracts()])
          : Promise.resolve([
              { properties: [] as PropertySummary[] },
              { owners: [] as PropertyOwner[] },
              { contracts: [] as Contract[] },
            ]),
      ]);
      const [propertyPage, ownersResponse, contractsResponse] = auxiliary;
      setEntries(finance.entries);
      setProperties(propertyPage.properties ?? []);
      setOwners(ownersResponse.owners ?? []);
      setContracts(contractsResponse.contracts ?? []);
    } catch (value) {
      setError(getSafeApiErrorMessage(value, "Não foi possível carregar o financeiro canônico."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session && canSee) void refresh();
  }, [session, canSee, canEdit, JSON.stringify(filters)]);
  const dashboard = useMemo(() => financialDashboard(entries), [entries]);
  if (!canSee)
    return (
      <EmptyState
        icon={WalletCards}
        title="Financeiro indisponível"
        description="Sua conta não possui finance.view."
      />
    );
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Financeiro operacional</p>
          <h1 className="mt-1 text-2xl font-bold">Receitas, despesas e repasses</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dados reais da API Prisma/MySQL da empresa autenticada.
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setShowForm((value) => !value)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Novo lançamento
          </button>
        ) : null}
      </header>
      <DashboardCards dashboard={dashboard} />
      <FinanceFilters filters={filters} onChange={setFilters} />
      {showForm && canEdit ? (
        <FinancialEntryForm
          properties={properties}
          owners={owners}
          contracts={contracts}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            void refresh();
          }}
        />
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando financeiro...
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title="Nenhum lançamento financeiro"
          description="Crie um lançamento real para acompanhar recebíveis, despesas e repasses."
          actionLabel={canEdit ? "Novo lançamento" : undefined}
          onAction={canEdit ? () => setShowForm(true) : undefined}
        />
      ) : (
        <FinancialList entries={entries} canEdit={canEdit} onRefresh={refresh} />
      )}
    </div>
  );
}

function DashboardCards({ dashboard }: { dashboard: ReturnType<typeof financialDashboard> }) {
  const cards = [
    ["A receber", dashboard.receivable, WalletCards],
    ["A pagar", dashboard.payable, ReceiptText],
    ["Recebido", dashboard.received, CheckCircle2],
    ["Pago", dashboard.paid, CreditCard],
    ["Vencido", dashboard.overdue, Clock3],
  ] as const;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map(([label, value, Icon]) => (
        <article key={label} className="rounded-lg border border-border bg-card p-4">
          <Icon className="h-4 w-4 text-primary" />
          <p className="mt-3 text-xs text-muted-foreground">{label}</p>
          <strong className="mt-1 block text-lg">{formatFinancialAmount(value)}</strong>
        </article>
      ))}
    </section>
  );
}

function FinanceFilters({
  filters,
  onChange,
}: {
  filters: FinancialFilters;
  onChange: (value: FinancialFilters) => void;
}) {
  const update = (key: keyof FinancialFilters, value: string) =>
    onChange({ ...filters, [key]: value || undefined });
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm">
        Natureza
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={filters.type ?? ""}
          onChange={(event) => update("type", event.target.value)}
        >
          <option value="">Todas</option>
          <option value="receivable">A receber</option>
          <option value="payable">A pagar</option>
        </select>
      </label>
      <label className="text-sm">
        Categoria
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={filters.category ?? ""}
          onChange={(event) => update("category", event.target.value)}
        >
          <option value="">Todas</option>
          {["rent", "owner_payout", "commission", "expense", "revenue", "other"].map((value) => (
            <option key={value} value={value}>
              {categoryLabel(value as FinancialCategory)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Status
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={filters.status ?? "all"}
          onChange={(event) => update("status", event.target.value)}
        >
          <option value="all">Todos</option>
          {["pending", "overdue", "paid", "cancelled"].map((value) => (
            <option key={value} value={value}>
              {statusLabel(value as FinancialStatus)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Vencimento após
        <input
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          type="date"
          value={filters.due_from ?? ""}
          onChange={(event) => update("due_from", event.target.value)}
        />
      </label>
      <label className="text-sm">
        Vencimento antes
        <input
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          type="date"
          value={filters.due_to ?? ""}
          onChange={(event) => update("due_to", event.target.value)}
        />
      </label>
    </section>
  );
}

function FinancialList({
  entries,
  canEdit,
  onRefresh,
}: {
  entries: CanonicalFinancialEntry[];
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}) {
  return (
    <section className="space-y-3">
      {entries.map((entry) => (
        <FinancialCard key={entry.id} entry={entry} canEdit={canEdit} onRefresh={onRefresh} />
      ))}
    </section>
  );
}

function FinancialCard({
  entry,
  canEdit,
  onRefresh,
}: {
  entry: CanonicalFinancialEntry;
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function action(kind: "pay" | "cancel") {
    setBusy(true);
    setMessage(null);
    try {
      if (kind === "pay") await payCanonicalFinancialEntry(entry.id);
      else await cancelCanonicalFinancialEntry(entry.id);
      await onRefresh();
    } catch (value) {
      setMessage(getSafeApiErrorMessage(value, "Não foi possível atualizar o lançamento."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{typeLabel(entry.type)}</span>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">
              {categoryLabel(entry.category)}
            </span>
            <strong>{entry.description}</strong>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {[entry.property?.title, entry.contract?.title, entry.owner?.name, entry.tenant?.name]
              .filter(Boolean)
              .join(" · ") || "Sem vínculo adicional"}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <strong className="text-lg">{formatFinancialAmount(entry.amount, entry.currency)}</strong>
          <p className="text-xs text-muted-foreground">
            {entry.due_date ? `Vencimento ${formatDate(entry.due_date)}` : "Sem vencimento"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold ${entry.status === "overdue" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {entry.status === "paid" ? (
            <CheckCircle2 className="h-3 w-3" />
          ) : entry.status === "cancelled" ? (
            <XCircle className="h-3 w-3" />
          ) : (
            <Clock3 className="h-3 w-3" />
          )}
          {statusLabel(entry.status)}
        </span>
        {canEdit && entry.status !== "paid" && entry.status !== "cancelled" ? (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void action("pay")}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold"
            >
              {busy ? "Salvando..." : "Registrar pagamento"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void action("cancel")}
              className="rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive"
            >
              Cancelar
            </button>
          </div>
        ) : null}
      </div>
      {message ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {message}
        </p>
      ) : null}
    </article>
  );
}

function FinancialEntryForm({
  properties,
  owners,
  contracts,
  onCancel,
  onCreated,
}: {
  properties: PropertySummary[];
  owners: PropertyOwner[];
  contracts: Contract[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [input, setInput] = useState<FinancialInput>({
    type: "receivable",
    category: "rent",
    amount: "",
    description: "",
    due_date: "",
    competence_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof FinancialInput, value: string) =>
    setInput((current) => ({ ...current, [key]: value }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createCanonicalFinancialEntry({
        ...input,
        amount: input.amount.trim(),
        due_date: input.due_date || null,
        competence_date: input.competence_date || null,
        property_id: input.property_id || null,
        contract_id: input.contract_id || null,
        owner_id: input.owner_id || null,
        tenant_party_id: input.tenant_party_id || null,
      });
      onCreated();
    } catch (value) {
      setError(getSafeApiErrorMessage(value, "Não foi possível criar o lançamento."));
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2"
    >
      <label className="text-sm">
        Natureza
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={input.type}
          onChange={(event) => set("type", event.target.value)}
        >
          <option value="receivable">A receber</option>
          <option value="payable">A pagar</option>
        </select>
      </label>
      <label className="text-sm">
        Categoria
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={input.category}
          onChange={(event) => set("category", event.target.value)}
        >
          {["rent", "owner_payout", "commission", "expense", "revenue", "other"].map((value) => (
            <option key={value} value={value}>
              {categoryLabel(value as FinancialCategory)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Valor (BRL)
        <input
          required
          inputMode="decimal"
          pattern="^\d{1,13}(?:\.\d{1,2})?$"
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={input.amount}
          onChange={(event) => set("amount", event.target.value)}
        />
      </label>
      <label className="text-sm">
        Descrição
        <input
          required
          minLength={2}
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={input.description}
          onChange={(event) => set("description", event.target.value)}
        />
      </label>
      <label className="text-sm">
        Vencimento
        <input
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          type="date"
          value={input.due_date ?? ""}
          onChange={(event) => set("due_date", event.target.value)}
        />
      </label>
      <label className="text-sm">
        Competência
        <input
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          type="date"
          value={input.competence_date ?? ""}
          onChange={(event) => set("competence_date", event.target.value)}
        />
      </label>
      <label className="text-sm">
        Imóvel
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={input.property_id ?? ""}
          onChange={(event) => set("property_id", event.target.value)}
        >
          <option value="">Nenhum</option>
          {properties.map((property) => (
            <option key={property.id} value={property.id}>
              {property.code ?? property.title}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Contrato
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={input.contract_id ?? ""}
          onChange={(event) => set("contract_id", event.target.value)}
        >
          <option value="">Nenhum</option>
          {contracts.map((contract) => (
            <option key={contract.id} value={contract.id}>
              {contract.title}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Proprietário
        <select
          className="mt-1 h-10 w-full rounded-md border border-border bg-background px-2"
          value={input.owner_id ?? ""}
          onChange={(event) => set("owner_id", event.target.value)}
        >
          <option value="">Nenhum</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="sm:col-span-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-3 py-2 text-sm"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          {saving ? "Salvando..." : "Salvar lançamento"}
        </button>
      </div>
    </form>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}
