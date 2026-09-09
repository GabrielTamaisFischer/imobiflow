import { apiRequest } from "./api";
import { getStoredToken } from "./auth";

export type FinancialType = "receivable" | "payable";
export type FinancialCategory = "rent" | "owner_payout" | "commission" | "expense" | "revenue" | "other";
export type FinancialStatus = "pending" | "paid" | "overdue" | "cancelled";

export type CanonicalFinancialEntry = {
  id: string;
  company_id: string;
  type: FinancialType;
  category: FinancialCategory;
  amount: string;
  currency: string;
  description: string;
  due_date: string | null;
  competence_date: string | null;
  paid_at: string | null;
  status: FinancialStatus;
  stored_status: FinancialStatus;
  property_id: string | null;
  contract_id: string | null;
  owner_id: string | null;
  tenant_party_id: string | null;
  version: number;
  metadata: Record<string, unknown>;
  property: { id: string; code: string | null; title: string } | null;
  contract: { id: string; title: string; status: string } | null;
  owner: { id: string; name: string } | null;
  tenant: { id: string; name: string } | null;
  payment: { id: string; amount: string; paid_at: string; payment_method: string | null; notes: string | null } | null;
  created_at: string;
  updated_at: string;
};

export type FinancialFilters = {
  type?: FinancialType;
  category?: FinancialCategory;
  status?: FinancialStatus | "all";
  due_from?: string;
  due_to?: string;
  property_id?: string;
  contract_id?: string;
  owner_id?: string;
  tenant_party_id?: string;
};

export type FinancialInput = {
  id?: string;
  type: FinancialType;
  category: FinancialCategory;
  amount: string;
  currency?: string;
  description: string;
  due_date?: string | null;
  competence_date?: string | null;
  property_id?: string | null;
  contract_id?: string | null;
  owner_id?: string | null;
  tenant_party_id?: string | null;
  metadata?: Record<string, unknown>;
};

export type FinancialPatch = Partial<Omit<FinancialInput, "id" | "type">> & { expected_version: number };

const token = () => getStoredToken() ?? undefined;
const idempotencyKey = (scope: string) => {
  const key = `${scope}:${crypto.randomUUID()}`;
  return key;
};

export async function listCanonicalFinancialEntries(filters: FinancialFilters = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
  const query = search.toString() ? `?${search.toString()}` : "";
  return apiRequest<{ entries: CanonicalFinancialEntry[]; overdue_count: number }>(`/real-estate/finance${query}`, { token: token() });
}

export async function getCanonicalFinancialEntry(id: string) {
  return apiRequest<{ entry: CanonicalFinancialEntry }>(`/real-estate/finance/${encodeURIComponent(id)}`, { token: token() });
}

export async function createCanonicalFinancialEntry(input: FinancialInput) {
  return apiRequest<{ entry: CanonicalFinancialEntry; replayed?: boolean }>("/real-estate/finance", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey("finance-create") },
    body: JSON.stringify(input),
    token: token(),
  });
}

export async function updateCanonicalFinancialEntry(id: string, input: FinancialPatch) {
  return apiRequest<{ entry: CanonicalFinancialEntry }>(`/real-estate/finance/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    token: token(),
  });
}

export async function payCanonicalFinancialEntry(id: string, input: { amount?: string; paid_at?: string; payment_method?: string; notes?: string } = {}) {
  return apiRequest<{ entry: CanonicalFinancialEntry; payment: unknown; replayed?: boolean; already_paid?: boolean }>(`/real-estate/finance/${encodeURIComponent(id)}/pay`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey(`finance-pay:${id}`) },
    body: JSON.stringify(input),
    token: token(),
  });
}

export async function cancelCanonicalFinancialEntry(id: string, reason?: string) {
  return apiRequest<{ entry: CanonicalFinancialEntry }>(`/real-estate/finance/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
    token: token(),
  });
}

export function categoryLabel(category: FinancialCategory) {
  return { rent: "Aluguel", owner_payout: "Repasse", commission: "Comissão", expense: "Despesa", revenue: "Receita", other: "Outro" }[category];
}

export function statusLabel(status: FinancialStatus) {
  return { pending: "Pendente", paid: "Pago", overdue: "Vencido", cancelled: "Cancelado" }[status];
}

export function typeLabel(type: FinancialType) {
  return type === "receivable" ? "A receber" : "A pagar";
}

export function formatFinancialAmount(amount: string | number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(amount));
}

export function financialDashboard(entries: CanonicalFinancialEntry[]) {
  const sum = (predicate: (entry: CanonicalFinancialEntry) => boolean) => entries.filter(predicate).reduce((total, entry) => total + Number(entry.amount), 0);
  return {
    receivable: sum((entry) => entry.type === "receivable" && entry.status !== "paid" && entry.status !== "cancelled"),
    payable: sum((entry) => entry.type === "payable" && entry.status !== "paid" && entry.status !== "cancelled"),
    received: sum((entry) => entry.type === "receivable" && entry.status === "paid"),
    paid: sum((entry) => entry.type === "payable" && entry.status === "paid"),
    overdue: sum((entry) => entry.status === "overdue"),
    upcoming: entries.filter((entry) => entry.status === "pending" && entry.due_date).length,
  };
}
