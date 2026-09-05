import { createFileRoute } from "@tanstack/react-router";
import { Building2, Home, Loader2, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getOwnerPortal,
  type OwnerPortalResponse,
  type PortalCharge,
  type PortalProperty,
  type PortalTransfer,
} from "@/product/public-portals";

export const Route = createFileRoute("/portal/proprietario/$token")({
  component: OwnerPortalPage,
});

// Fase 4C — rótulos do resumo de leads/negociações por imóvel. Todo texto
// vem de dados reais e determinísticos do backend (leads_summary); nada
// aqui inventa estado a partir de ausência de dado.
const leadsSummaryStatusLabels: Record<string, string> = {
  sem_interesse: "Sem interesse registrado ainda",
  em_andamento: "Em andamento",
  fechado: "Negócio fechado",
  perdido: "Sem interesse no momento",
};

const statusLabels: Record<string, string> = {
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
  approved: "Aprovado",
};

function OwnerPortalPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<OwnerPortalResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPortal();
  }, [token]);

  async function loadPortal() {
    setIsLoading(true);
    setError(null);

    try {
      setData(await getOwnerPortal(token));
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : "Não foi possível carregar o portal do proprietário.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  const totals = useMemo(() => {
    const pendingTransfers = data?.transfers.filter((transfer) => transfer.status !== "paid") ?? [];
    const paidTransfers = data?.transfers.filter((transfer) => transfer.status === "paid") ?? [];

    return {
      pending: pendingTransfers.reduce((sum, transfer) => sum + transfer.net_amount_cents, 0),
      paid: paidTransfers.reduce((sum, transfer) => sum + transfer.net_amount_cents, 0),
      properties: data?.properties.length ?? 0,
      openCharges: data?.charges.filter((charge) => charge.status !== "paid").length ?? 0,
    };
  }, [data]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <PortalBrand companyName={data?.company?.name} />

        {isLoading ? (
          <LoadingState label="Carregando portal do proprietário..." />
        ) : error && !data ? (
          <ErrorState message={error} />
        ) : data ? (
          <div className="space-y-6">
            <header className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm font-semibold text-primary">Portal do proprietário</p>
              <h1 className="mt-2 text-2xl font-bold">{data.owner.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Acompanhe imóveis, cobranças de aluguel, descontos, comissão da imobiliária e repasses
                calculados pela operação.
              </p>
            </header>

            <section className="grid gap-3 md:grid-cols-4">
              <MetricCard icon={Home} label="Imóveis vinculados" value={String(totals.properties)} />
              <MetricCard icon={WalletCards} label="Repasses pendentes" value={formatMoney(totals.pending)} />
              <MetricCard icon={ReceiptText} label="Repasses pagos" value={formatMoney(totals.paid)} />
              <MetricCard icon={Building2} label="Cobranças abertas" value={String(totals.openCharges)} />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
              <Panel title="Imóveis">
                {data.properties.length === 0 ? (
                  <EmptyText>Nenhum imóvel vinculado ao portal.</EmptyText>
                ) : (
                  <div className="space-y-3">
                    {data.properties.map((property) => (
                      <article key={property.id} className="rounded-md border border-border bg-background p-4">
                        <p className="text-sm font-semibold">{property.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[property.code, property.neighborhood, property.city, property.state]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="mt-3 text-sm font-semibold">
                          {property.rent_price_cents ? formatMoney(property.rent_price_cents) : "Valor não informado"}
                        </p>
                        <PropertyLeadsSummary property={property} />
                      </article>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title="Últimas cobranças">
                {data.charges.length === 0 ? (
                  <EmptyText>Nenhuma cobrança gerada para seus imóveis.</EmptyText>
                ) : (
                  <div className="space-y-3">
                    {data.charges.map((charge) => (
                      <OwnerCharge key={charge.id} charge={charge} />
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <Panel title="Repasses">
              {data.transfers.length === 0 ? (
                <EmptyText>Nenhum repasse calculado ainda.</EmptyText>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {data.transfers.map((transfer) => (
                    <OwnerTransfer key={transfer.id} transfer={transfer} />
                  ))}
                </div>
              )}
            </Panel>
          </div>
        ) : null}
      </section>
    </main>
  );
}

// Fase 4C — decisão pura de o que exibir no bloco "Interesses e
// negociações" de um imóvel, extraída do componente para ser testável sem
// um harness de renderização React (este repositório não usa
// @testing-library/react; o padrão de testes de UI aqui é testar as
// funções puras de decisão, como já faz classifyMediaFrame para mídia).
//
// Contrato de privacidade: esta função só lê os 7 campos já
// resumidos/anonimizados de `leads_summary` (nunca IDs de lead/site_lead,
// nunca dados pessoais do interessado) — o mesmo contrato que o backend
// garante em owner-portal-leads-summary.test.ts.
export type LeadsSummaryDisplay =
  | { kind: "empty"; message: string }
  | {
      kind: "summary";
      badges: string[];
      detailParts: string[];
    };

// exportado apenas para ser testado por unidade (ver comentário acima); não
// é um componente React, então não quebra fast refresh na prática.
// eslint-disable-next-line react-refresh/only-export-components
export function buildLeadsSummaryDisplay(
  summary: PortalProperty["leads_summary"],
): LeadsSummaryDisplay {
  const hasNothingToShow =
    !summary || (summary.status === "sem_interesse" && summary.visitas_agendadas === 0);
  if (hasNothingToShow) {
    return { kind: "empty", message: "Nenhum interesse registrado ainda para este imóvel." };
  }

  const badges: string[] = [
    `${summary.total_interessados} ${summary.total_interessados === 1 ? "interessado" : "interessados"}`,
  ];
  if (summary.visitas_agendadas > 0) {
    badges.push(
      `${summary.visitas_agendadas} ${summary.visitas_agendadas === 1 ? "visita agendada" : "visitas agendadas"}`,
    );
  }
  badges.push(leadsSummaryStatusLabels[summary.status] ?? summary.status);
  if (summary.estagio) badges.push(summary.estagio);

  const detailParts: string[] = [];
  if (summary.ultimo_interesse_em) {
    detailParts.push(`Último interesse: ${formatDateTime(summary.ultimo_interesse_em)}`);
  }
  if (summary.origem) {
    detailParts.push(`Origem: ${originLabels[summary.origem] ?? summary.origem}`);
  }
  if (summary.corretor_responsavel) {
    detailParts.push(`Corretor: ${summary.corretor_responsavel}`);
  }

  return { kind: "summary", badges, detailParts };
}

function PropertyLeadsSummary({ property }: { property: PortalProperty }) {
  const display = buildLeadsSummaryDisplay(property.leads_summary);

  if (display.kind === "empty") {
    return (
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {display.message}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-1.5 border-t border-border pt-3">
      <p className="text-xs font-semibold text-foreground">Interesses e negociações</p>
      <div className="flex flex-wrap gap-1.5">
        {display.badges.map((badge) => (
          <SummaryBadge key={badge}>{badge}</SummaryBadge>
        ))}
      </div>
      {display.detailParts.length > 0 && (
        <p className="text-xs text-muted-foreground">{display.detailParts.join(" · ")}</p>
      )}
    </div>
  );
}

function SummaryBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}

const originLabels: Record<string, string> = {
  site: "site da imobiliária",
  whatsapp: "WhatsApp",
  manual: "cadastro manual",
  import: "importação",
};

function OwnerCharge({ charge }: { charge: PortalCharge }) {
  return (
    <article className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{charge.properties?.title ?? charge.contracts?.title ?? "Cobrança"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Vencimento {formatDate(charge.due_date)}</p>
        </div>
        <StatusPill status={charge.status} />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>Cobrado: {formatMoney(charge.gross_amount_cents)}</span>
        <span>Comissão: {formatMoney(charge.commission_amount_cents ?? 0)}</span>
        <span>Líquido: {formatMoney(charge.net_owner_amount_cents ?? 0)}</span>
      </div>
    </article>
  );
}

function OwnerTransfer({ transfer }: { transfer: PortalTransfer }) {
  return (
    <article className="rounded-md border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{transfer.properties?.title ?? transfer.contracts?.title ?? "Repasse"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Previsão {transfer.due_date ? formatDate(transfer.due_date) : "não informada"}
          </p>
        </div>
        <StatusPill status={transfer.status} />
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
        <span>Bruto: {formatMoney(transfer.gross_amount_cents)}</span>
        <span>Descontos: {formatMoney(transfer.deductions_cents)}</span>
        <strong>Líquido: {formatMoney(transfer.net_amount_cents)}</strong>
      </div>
    </article>
  );
}

function PortalBrand({ companyName }: { companyName?: string }) {
  return (
    <a href="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        IF
      </span>
      {companyName ?? "ImobiFlow"}
    </a>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-6 text-sm text-destructive">{message}</div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Home; label: string; value: string }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <Icon className="h-4 w-4 text-primary" />
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </article>
  );
}

function StatusPill({ status }: { status: string }) {
  return <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{statusLabels[status] ?? status}</span>;
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">{children}</p>;
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
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(value),
  );
}
