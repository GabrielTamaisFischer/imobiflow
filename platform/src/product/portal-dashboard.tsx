import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  Home,
  Loader2,
  LockKeyhole,
  PenLine,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  getPortalAggregate,
  getPortalDocument,
  portalDocumentView,
  portalErrorMessage,
  portalHistory,
  portalStatusLabel,
  signPortalContract,
  type BuyerPortalAggregate,
  type PortalAggregate,
  type PortalContract,
  type PortalKind,
  type TenantPortalAggregate,
} from "./portal-interfaces";

export function PortalDashboard({ kind, token }: { kind: PortalKind; token: string }) {
  const [aggregate, setAggregate] = useState<PortalAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAggregate(await getPortalAggregate(kind, token));
    } catch (value) {
      setError(portalErrorMessage(value));
    } finally {
      setLoading(false);
    }
  }, [kind, token]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  if (loading)
    return (
      <PortalShell kind={kind}>
        <StatePanel
          icon={<Loader2 className="h-5 w-5 animate-spin" />}
          title="Carregando seu portal"
          message="Validando o acesso e preparando seus dados."
        />
      </PortalShell>
    );
  if (error || !aggregate)
    return (
      <PortalShell kind={kind}>
        <StatePanel
          icon={<ShieldAlert className="h-5 w-5" />}
          title="Acesso indisponível"
          message={error ?? "Não foi possível carregar este portal."}
          action={
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </button>
          }
        />
      </PortalShell>
    );
  const isTenant = aggregate.portal === "tenant";
  const contracts = aggregate.contracts;
  const documents = contracts.flatMap((contract) =>
    contract.documents.map((document) => ({
      ...document,
      contractId: contract.id,
      contractTitle: contract.title,
    })),
  );
  const history = portalHistory(aggregate);
  return (
    <PortalShell kind={kind} identity={aggregate.identity.name}>
      <header className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-semibold text-primary">
          Portal do {isTenant ? "inquilino" : "comprador"}
        </p>
        <h1 className="mt-2 text-2xl font-bold">Olá, {aggregate.identity.name}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Acompanhe os dados autorizados do seu imóvel, contrato e próximos passos em um só lugar.
        </p>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={<Home className="h-4 w-4" />}
          label="Imóveis"
          value={String(aggregate.properties.length)}
        />
        <Metric
          icon={<FileText className="h-4 w-4" />}
          label="Contratos"
          value={String(contracts.length)}
        />
        <Metric
          icon={<PenLine className="h-4 w-4" />}
          label="Assinaturas pendentes"
          value={String(contracts.filter((contract) => contract.signature.pending).length)}
        />
        <Metric
          icon={<CalendarDays className="h-4 w-4" />}
          label={isTenant ? "Vistorias" : "Visitas"}
          value={String(
            isTenant
              ? (aggregate as TenantPortalAggregate).inspections.length
              : (aggregate as BuyerPortalAggregate).appointments.length,
          )}
        />
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <Panel title="Visão geral">
          <div className="space-y-3">
            <InfoRow
              label="Próxima ação"
              value={
                contracts.some((contract) => contract.signature.pending)
                  ? "Assinar documento pendente"
                  : "Nenhuma ação pendente"
              }
            />
            <InfoRow
              label="Imóvel relacionado"
              value={aggregate.properties[0]?.title ?? "Nenhum imóvel disponível"}
            />
            <InfoRow
              label="Contrato"
              value={
                contracts[0]
                  ? `${contracts[0].title} · ${portalStatusLabel(contracts[0].status)}`
                  : "Nenhum contrato disponível"
              }
            />
          </div>
        </Panel>
        {isTenant ? (
          <PaymentsPanel payments={(aggregate as TenantPortalAggregate).payments} />
        ) : (
          <CommercialPanel aggregate={aggregate as BuyerPortalAggregate} />
        )}
      </section>
      <Panel title="Imóvel autorizado">
        {aggregate.properties.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {aggregate.properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <EmptyState message="Nenhum imóvel autorizado para este portal." />
        )}
      </Panel>
      <Panel title="Contratos e documentos">
        {contracts.length ? (
          <div className="space-y-4">
            {contracts.map((contract) => (
              <ContractCard
                key={contract.id}
                kind={kind}
                token={token}
                contract={contract}
                canSign={
                  isTenant
                    ? (aggregate as TenantPortalAggregate).actions.sign_contract
                    : (aggregate as BuyerPortalAggregate).actions.sign_contract
                }
                onSigned={() => void refresh()}
              />
            ))}
          </div>
        ) : (
          <EmptyState message="Nenhum contrato disponível para este portal." />
        )}
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">Documentos disponíveis</h3>
          {documents.length ? (
            <div className="mt-3 space-y-2">
              {documents.map((document) => (
                <DocumentRow
                  key={`${document.contractId}:${document.id}`}
                  kind={kind}
                  token={token}
                  {...document}
                />
              ))}
            </div>
          ) : (
            <EmptyState message="Nenhum documento disponível no momento." />
          )}
        </div>
      </Panel>
      {isTenant ? (
        <InspectionPanel inspections={(aggregate as TenantPortalAggregate).inspections} />
      ) : (
        <BuyerPanel aggregate={aggregate as BuyerPortalAggregate} />
      )}
      <Panel title="Histórico">
        <HistoryPanel history={history} />
      </Panel>
    </PortalShell>
  );
}

function PortalShell({
  kind,
  identity,
  children,
}: {
  kind: PortalKind;
  identity?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <a href="/" className="inline-flex w-fit items-center gap-2 text-sm font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            IF
          </span>
          <span>ImobiFlow · Portal do {kind === "tenant" ? "inquilino" : "comprador"}</span>
        </a>
        {children}
        <footer className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <LockKeyhole className="h-3.5 w-3.5" />
          Acesso privado por token · {identity ?? "sessão protegida"}
        </footer>
      </div>
    </main>
  );
}
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="text-primary">{icon}</div>
      <p className="mt-3 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </article>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <strong className="text-right">{value}</strong>
    </div>
  );
}
function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
      {message}
    </p>
  );
}
function StatePanel({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[360px] flex-col items-center justify-center rounded-xl border border-border bg-card p-6 text-center shadow-sm">
      <div className="text-primary">{icon}</div>
      <h1 className="mt-3 text-lg font-semibold">{title}</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
      {portalStatusLabel(status)}
    </span>
  );
}
function PropertyCard({
  property,
}: {
  property: { title: string; code: string | null; city: string | null; state: string | null };
}) {
  return (
    <article className="rounded-lg border border-border p-4">
      <p className="font-semibold">{property.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {[property.code, property.city, property.state].filter(Boolean).join(" · ") ||
          "Endereço não informado"}
      </p>
    </article>
  );
}
function ContractCard({
  kind,
  token,
  contract,
  canSign,
  onSigned,
}: {
  kind: PortalKind;
  token: string;
  contract: PortalContract;
  canSign: boolean;
  onSigned: () => void;
}) {
  return (
    <article className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{contract.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {contract.contract_type} · versão {contract.current_version}
          </p>
        </div>
        <StatusBadge status={contract.status} />
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <InfoRow label="Início" value={formatDate(contract.starts_at)} />
        <InfoRow label="Fim" value={formatDate(contract.ends_at)} />
      </div>
      {canSign && contract.signature.pending && contract.latest_version ? (
        <SignatureCard kind={kind} token={token} contract={contract} onSigned={onSigned} />
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {contract.signature.pending
            ? "Aguardando versão do documento"
            : "Assinaturas desta parte concluídas"}
        </p>
      )}
    </article>
  );
}
function SignatureCard({
  kind,
  token,
  contract,
  onSigned,
}: {
  kind: PortalKind;
  token: string;
  contract: PortalContract;
  onSigned: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState(contract.party[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [requestKey, setRequestKey] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const version = contract.latest_version!;
  const clear = () =>
    canvasRef.current
      ?.getContext("2d")
      ?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  async function submit() {
    const canvas = canvasRef.current;
    if (!canvas || !name.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await signPortalContract(
        kind,
        token,
        contract.id,
        {
          version_id: version.id,
          signer_name: name.trim(),
          signature_base64: canvas.toDataURL("image/png"),
        },
        requestKey ?? crypto.randomUUID(),
      );
      setRequestKey(null);
      setMessage("Assinatura registrada com sucesso.");
      onSigned();
    } catch (error) {
      setRequestKey(requestKey ?? crypto.randomUUID());
      setMessage(portalErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <PenLine className="h-4 w-4 text-primary" />
        Assinar documento
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Sua assinatura eletrônica ficará vinculada à versão {version.version_number} deste contrato.
      </p>
      <label className="mt-3 block text-sm">
        Nome do signatário
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3"
        />
      </label>
      <canvas
        ref={canvasRef}
        width={640}
        height={180}
        aria-label="Área para desenhar sua assinatura"
        className="mt-3 h-32 w-full touch-none rounded-md border border-dashed border-border bg-white"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const ctx = event.currentTarget.getContext("2d");
          if (!ctx) return;
          setDrawing(true);
          ctx.strokeStyle = "#111827";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
        }}
        onPointerMove={(event) => {
          if (!drawing) return;
          const ctx = event.currentTarget.getContext("2d");
          if (!ctx) return;
          ctx.lineTo(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
          ctx.stroke();
        }}
        onPointerUp={() => setDrawing(false)}
        onPointerCancel={() => setDrawing(false)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={clear}
          className="h-10 rounded-md border border-border px-3 text-sm"
        >
          Limpar
        </button>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void submit()}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Confirmar assinatura
        </button>
      </div>
      {message ? (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </div>
  );
}
function DocumentRow({
  kind,
  token,
  contractId,
  contractTitle,
  ...document
}: {
  kind: PortalKind;
  token: string;
  contractId: string;
  contractTitle: string;
  id: string;
  filename: string;
  mime_type: string;
  created_at: string;
  size_bytes: number | null;
  purpose: string;
  download_path: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = portalDocumentView(document);
  async function open() {
    setBusy(true);
    setError(null);
    try {
      const versionId = document.download_path?.match(/version_id=([^&]+)/)?.[1];
      const result = await getPortalDocument(kind, token, contractId, versionId);
      if (!result.document.url) throw new Error("Documento sem acesso disponível.");
      window.open(result.document.url, "_blank", "noopener,noreferrer");
    } catch (value) {
      setError(portalErrorMessage(value));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="flex min-w-0 items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{view.name}</p>
          <p className="text-xs text-muted-foreground">
            {contractTitle} · {formatDate(view.date)}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        Abrir documento
      </button>
      {error ? <p className="basis-full text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
function InspectionPanel({ inspections }: { inspections: TenantPortalAggregate["inspections"] }) {
  return (
    <Panel title="Vistorias">
      {inspections.length ? (
        <div className="space-y-2">
          {inspections.map((inspection) => (
            <article key={inspection.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>
                  {inspection.type === "entry"
                    ? "Entrada"
                    : inspection.type === "exit"
                      ? "Saída"
                      : inspection.type}
                </strong>
                <StatusBadge status={inspection.status} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {inspection.rooms.length} ambientes · {inspection.evidence.length} evidências ·{" "}
                {formatDate(inspection.completed_at ?? inspection.created_at)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState message="Nenhuma vistoria disponível para este contrato." />
      )}
    </Panel>
  );
}
function BuyerPanel({ aggregate }: { aggregate: BuyerPortalAggregate }) {
  return (
    <>
      <Panel title="Contexto comercial">
        {aggregate.commercial.length ? (
          <div className="space-y-3">
            {aggregate.commercial.map((lead) => (
              <article key={lead.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{lead.name}</strong>
                  <StatusBadge status={lead.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Etapa: {lead.stage?.name ?? "Não informada"}
                  {lead.property_reference ? ` · Referência: ${lead.property_reference}` : ""}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState message="Nenhum contexto comercial disponível." />
        )}
      </Panel>
      <Panel title="Visitas e propostas">
        <div className="space-y-3">
          {aggregate.appointments.length ? (
            aggregate.appointments.map((appointment) => (
              <article key={appointment.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  <strong>{formatDateTime(appointment.starts_at)}</strong>
                  <StatusBadge status={appointment.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {appointment.property?.title ?? "Imóvel não informado"}
                  {appointment.broker_name ? ` · Corretor: ${appointment.broker_name}` : ""}
                </p>
              </article>
            ))
          ) : (
            <EmptyState message="Nenhuma visita agendada." />
          )}
          <div className="border-t border-border pt-3 text-sm text-muted-foreground">
            {aggregate.proposals.available
              ? "Propostas disponíveis no contexto autorizado."
              : "Propostas estruturadas ainda não disponíveis nesta versão."}
          </div>
        </div>
      </Panel>
    </>
  );
}
function CommercialPanel({ aggregate }: { aggregate: BuyerPortalAggregate }) {
  return (
    <Panel title="Próxima etapa">
      <InfoRow
        label="Etapa comercial"
        value={aggregate.commercial[0]?.stage?.name ?? "Não informada"}
      />
      <div className="mt-3 text-sm text-muted-foreground">
        {aggregate.appointments[0]
          ? `Próxima visita em ${formatDateTime(aggregate.appointments[0].starts_at)}`
          : "Nenhuma visita agendada"}
      </div>
    </Panel>
  );
}
function PaymentsPanel({ payments }: { payments: TenantPortalAggregate["payments"] }) {
  return (
    <Panel title="Pagamentos e vencimentos">
      {payments.available ? (
        <div className="text-sm">
          Próximos vencimentos: {payments.next_due_dates.join(", ") || "Nenhum"}
        </div>
      ) : (
        <EmptyState message="Informações financeiras serão disponibilizadas quando o módulo financeiro estiver habilitado." />
      )}
    </Panel>
  );
}
function HistoryPanel({
  history,
}: {
  history: Array<{ type: string; occurred_at: string | null; contractTitle: string }>;
}) {
  return history.length ? (
    <ol className="space-y-3">
      {history.map((event, index) => (
        <li
          key={`${event.contractTitle}:${event.type}:${event.occurred_at}:${index}`}
          className="flex gap-3 text-sm"
        >
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <span>
            <strong>{portalStatusLabel(event.type.replace("contract.", ""))}</strong>
            <span className="ml-2 text-muted-foreground">
              {event.contractTitle} · {formatDateTime(event.occurred_at)}
            </span>
          </span>
        </li>
      ))}
    </ol>
  ) : (
    <EmptyState message="Nenhum evento disponível no histórico." />
  );
}
function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(value))
    : "Não informada";
}
function formatDateTime(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Não informada";
}
