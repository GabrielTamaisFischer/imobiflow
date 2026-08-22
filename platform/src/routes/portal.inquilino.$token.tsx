import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  QrCode,
  ReceiptText,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  getTenantPortal,
  type PortalCharge,
  type PortalProperty,
  type TenantPortalResponse,
} from "@/product/public-portals";

export const Route = createFileRoute("/portal/inquilino/$token")({
  component: TenantPortalPage,
});

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
};

function TenantPortalPage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<TenantPortalResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    void loadPortal();
  }, [token]);

  async function loadPortal() {
    setIsLoading(true);
    setError(null);

    try {
      setData(await getTenantPortal(token));
    } catch (portalError) {
      setError(
        portalError instanceof Error
          ? portalError.message
          : "Não foi possível carregar o portal do inquilino.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function copyPix(value: string, chargeId: string) {
    await navigator.clipboard.writeText(value);
    setCopied(chargeId);
    window.setTimeout(() => setCopied(null), 1800);
  }

  const property = useMemo(() => {
    const relation = data?.contract.properties;
    return Array.isArray(relation) ? relation[0] ?? null : relation ?? null;
  }, [data]);
  const openCharges = data?.charges.filter((charge) => charge.status !== "paid") ?? [];
  const paidCharges = data?.charges.filter((charge) => charge.status === "paid") ?? [];

  return (
    <main className="min-h-screen bg-background text-foreground">
      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <PortalBrand companyName={data?.company?.name} />

        {isLoading ? (
          <LoadingState label="Carregando portal do inquilino..." />
        ) : error && !data ? (
          <ErrorState message={error} />
        ) : data ? (
          <div className="space-y-6">
            <header className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm font-semibold text-primary">Portal do inquilino</p>
              <h1 className="mt-2 text-2xl font-bold">Olá, {data.tenant.name}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Consulte cobranças, status de pagamento, PIX, boleto, recibos e dados principais do
                contrato de locação.
              </p>
            </header>

            <section className="grid gap-3 md:grid-cols-3">
              <MetricCard icon={Building2} label="Contrato" value={data.contract.contract_number ?? "Sem número"} />
              <MetricCard icon={CalendarDays} label="Vigência" value={formatPeriod(data.contract.starts_at, data.contract.ends_at)} />
              <MetricCard icon={ReceiptText} label="Aluguel mensal" value={formatMoney(data.contract.monthly_amount_cents ?? 0)} />
            </section>

            <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
              <Panel title="Imóvel locado">
                {property ? <PropertySummary property={property} /> : <EmptyText>Imóvel não informado.</EmptyText>}
              </Panel>

              <Panel title="Cobranças em aberto">
                {openCharges.length === 0 ? (
                  <EmptyText>Nenhuma cobrança em aberto no momento.</EmptyText>
                ) : (
                  <div className="space-y-3">
                    {openCharges.map((charge) => (
                      <TenantCharge
                        key={charge.id}
                        charge={charge}
                        copied={copied === charge.id}
                        onCopyPix={(value) => void copyPix(value, charge.id)}
                      />
                    ))}
                  </div>
                )}
              </Panel>
            </section>

            <Panel title="Histórico de pagamentos">
              {paidCharges.length === 0 ? (
                <EmptyText>Nenhum pagamento confirmado ainda.</EmptyText>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {paidCharges.map((charge) => (
                    <TenantCharge key={charge.id} charge={charge} compact />
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

function PropertySummary({ property }: { property: PortalProperty }) {
  return (
    <article className="rounded-md border border-border bg-background p-4">
      <p className="text-base font-semibold">{property.title}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {[property.code, property.neighborhood, property.city, property.state].filter(Boolean).join(" · ")}
      </p>
    </article>
  );
}

function TenantCharge({
  charge,
  copied,
  compact,
  onCopyPix,
}: {
  charge: PortalCharge;
  copied?: boolean;
  compact?: boolean;
  onCopyPix?: (value: string) => void;
}) {
  return (
    <article className="rounded-md border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {charge.payment_method.toUpperCase()}
            </span>
            <StatusPill status={charge.status} />
          </div>
          <p className="mt-3 text-base font-semibold">{formatMoney(charge.gross_amount_cents)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Vencimento {formatDate(charge.due_date)}</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {charge.payment_url ? (
            <a
              href={charge.payment_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Fatura
            </a>
          ) : null}
          {charge.boleto_pdf_url ? (
            <a
              href={charge.boleto_pdf_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-semibold transition hover:bg-accent"
            >
              <Download className="h-3.5 w-3.5" />
              Boleto
            </a>
          ) : null}
        </div>
      </div>

      {!compact && (charge.pix_qr_code || charge.pix_copy_paste) ? (
        <div className="mt-4 rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <QrCode className="h-4 w-4 text-primary" />
            PIX
          </div>
          {charge.pix_qr_code ? (
            <img
              src={charge.pix_qr_code}
              alt="QR Code PIX"
              className="mt-3 h-40 w-40 rounded-md border border-border bg-white object-contain p-2"
            />
          ) : null}
          {charge.pix_copy_paste ? (
            <>
              <p className="mt-3 line-clamp-2 break-all text-xs text-muted-foreground">
                {charge.pix_copy_paste}
              </p>
              <button
                type="button"
                onClick={() => onCopyPix?.(charge.pix_copy_paste!)}
                className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copiado" : "Copiar PIX"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {!compact && charge.boleto_digitable_line ? (
        <div className="mt-4 rounded-md border border-border bg-card p-3">
          <p className="text-sm font-semibold">Linha digitável do boleto</p>
          <p className="mt-2 break-all text-xs text-muted-foreground">
            {charge.boleto_digitable_line}
          </p>
        </div>
      ) : null}
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

function MetricCard({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
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

function formatPeriod(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) return "Não informada";
  if (!endsAt) return `Desde ${formatDate(startsAt!)}`;
  if (!startsAt) return `Até ${formatDate(endsAt)}`;
  return `${formatDate(startsAt)} até ${formatDate(endsAt)}`;
}
