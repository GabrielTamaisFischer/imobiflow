import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, ExternalLink, FileUp, Loader2, Mail, MessageCircle, Phone, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { canManage } from "@/product/app-access";
import { useSessionGuard } from "@/product/use-session-guard";
import {
  archiveOwner,
  getOwnerDashboard,
  listOwnerPropertyUpdateRequests,
  regenerateOwnerPortalToken,
  resolveOwnerPropertyUpdateRequest,
  setOwnerPortalEnabled,
  type OwnerPropertyUpdateRequest,
  type OwnerDashboard,
} from "@/product/real-estate";
// AJUSTE-FUNCIONAL-03 (2026-09-11): reaproveita o mesmo uploader/StoredFile
// já usado na listagem de proprietários (nunca cria um path paralelo) e o
// mesmo helper de URL pública já usado nos cards de /app/imoveis — nenhuma
// lógica de mídia/publicação nova é criada aqui.
import { OwnerDocumentsModal } from "@/components/real-estate/owner-documents-modal";
import { getSiteSettings } from "@/product/sites";
import { getPropertyDetailUrl } from "@/product/public-site-helpers";

export const Route = createFileRoute("/app/proprietarios/$ownerId")({ component: OwnerDashboardPage });

function OwnerDashboardPage() {
  const { ownerId } = Route.useParams();
  const { session, isLoading: isSessionLoading } = useSessionGuard();
  const module = getModuleByKey("owners");
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<OwnerDashboard | null>(null);
  const [updateRequests, setUpdateRequests] = useState<OwnerPropertyUpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // AJUSTE-FUNCIONAL-03 (2026-09-11): siteSlug reaproveita a mesma
  // getSiteSettings() já usada em /app/imoveis para montar o link público
  // (getPropertyDetailUrl) — nunca hardcoda "imobiflow" nem inventa outro
  // jeito de resolver a URL do site da empresa.
  const [siteSlug, setSiteSlug] = useState<string | null>(null);
  const [isDocumentsOpen, setIsDocumentsOpen] = useState(false);
  const canManageOwners = canManage(session?.access.appUser, "owners.manage");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [nextDashboard, nextRequests] = await Promise.all([
        getOwnerDashboard(ownerId),
        listOwnerPropertyUpdateRequests(ownerId, "PENDING"),
      ]);
      setDashboard(nextDashboard);
      setUpdateRequests(nextRequests.requests);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o proprietário."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let canceled = false;
    getSiteSettings()
      .then((response) => { if (!canceled) setSiteSlug(response.site?.slug ?? null); })
      .catch(() => { if (!canceled) setSiteSlug(null); });
    return () => { canceled = true; };
  }, []);

  useEffect(() => { if (!isSessionLoading && session) void load(); }, [isSessionLoading, session, ownerId]);

  async function togglePortal() {
    if (!dashboard) return;
    setPortalBusy(true);
    try {
      const response = await setOwnerPortalEnabled(ownerId, !dashboard.owner.portal_enabled);
      setDashboard({ ...dashboard, owner: response.owner });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o portal."); }
    finally { setPortalBusy(false); }
  }

  async function regeneratePortal() {
    setPortalBusy(true);
    try {
      const response = await regenerateOwnerPortalToken(ownerId);
      setDashboard((current) => current ? { ...current, owner: response.owner } : current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível gerar o link."); }
    finally { setPortalBusy(false); }
  }

  async function archive() {
    if (!window.confirm("Arquivar este proprietário?")) return;
    await archiveOwner(ownerId);
    await navigate({ to: "/app/proprietarios" });
  }

  async function resolveUpdateRequest(request: OwnerPropertyUpdateRequest, decision: "APPROVED" | "REJECTED") {
    if (!canManageOwners) return;
    const resolutionNote = decision === "REJECTED" ? window.prompt("Informe o motivo da rejeição:") ?? "" : "";
    if (decision === "REJECTED" && resolutionNote.trim().length < 3) return;
    try {
      await resolveOwnerPropertyUpdateRequest(request.id, decision, resolutionNote);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível resolver a solicitação."); }
  }

  async function copyPortalLink() {
    if (!dashboard?.owner.portal_token || typeof window === "undefined") return;
    await navigator.clipboard.writeText(`${window.location.origin}/portal/proprietario/${dashboard.owner.portal_token}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (isSessionLoading || loading) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando proprietário...</main>;

  return <ModulePage session={session} module={module}>
    <div className="mb-4 flex items-center justify-between gap-3"><Link to="/app/proprietarios" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Proprietários</Link><button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" />Atualizar</button></div>
    {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
    {!dashboard ? <p className="text-sm text-muted-foreground">Proprietário não encontrado.</p> : <>
      <header className="rounded-lg border border-border bg-card p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Ficha completa do proprietário</p><h1 className="mt-1 text-2xl font-semibold">{dashboard.owner.name}</h1><p className="mt-1 text-sm text-muted-foreground">{dashboard.owner.owner_type === "company" ? "Pessoa jurídica" : "Pessoa física"} · {dashboard.owner.status}</p></div><div className="flex flex-wrap gap-2">{canManageOwners ? <><button type="button" onClick={() => void togglePortal()} disabled={portalBusy} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold">{dashboard.owner.portal_enabled ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}{dashboard.owner.portal_enabled ? "Desativar portal" : "Ativar portal"}</button><button type="button" onClick={() => void regeneratePortal()} disabled={portalBusy} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" />Regenerar link</button><button type="button" onClick={() => void archive()} className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/30 px-3 text-xs font-semibold text-destructive">Arquivar</button></> : null}</div></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="Documento" value={dashboard.owner.document} /><Info label="Telefone" value={dashboard.owner.phone} /><Info label="WhatsApp" value={dashboard.owner.whatsapp} /><Info label="E-mail" value={dashboard.owner.email} /></div><div className="mt-4 flex flex-wrap gap-3 text-sm">{dashboard.owner.phone ? <a href={`tel:${dashboard.owner.phone.replace(/\D/g, "")}`} className="inline-flex items-center gap-1 text-primary"><Phone className="h-4 w-4" />Ligar</a> : null}{dashboard.owner.whatsapp ? <a href={`https://wa.me/${dashboard.owner.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><MessageCircle className="h-4 w-4" />WhatsApp</a> : null}{dashboard.owner.email ? <a href={`mailto:${dashboard.owner.email}`} className="inline-flex items-center gap-1 text-primary"><Mail className="h-4 w-4" />Enviar e-mail</a> : null}{dashboard.owner.portal_token && dashboard.owner.portal_enabled ? <button type="button" onClick={() => void copyPortalLink()} className="text-primary">{copied ? "Link copiado" : "Copiar link do portal"}</button> : null}</div></header>
      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Imóveis" value={dashboard.counts.total} /><Metric label="Ativos" value={dashboard.counts.active} /><Metric label="Publicados" value={dashboard.counts.published} /><Metric label="Arquivados" value={dashboard.counts.archived} /><Metric label="Responsáveis" value={dashboard.responsible_users.length} /></section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Panel title="Imóveis vinculados">
          <div className="space-y-3">
            {dashboard.properties.length ? dashboard.properties.map((property) => (
              <article key={property.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{property.code || "Sem código"} · {property.title}</p>
                    <p className="text-xs text-muted-foreground">{property.city || "Cidade não informada"} · {property.status}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <Link to="/app/imoveis" search={{ focusPropertyId: property.id }} className="inline-flex items-center gap-1 text-primary">Abrir imóvel <ExternalLink className="h-3 w-3" /></Link>
                    {property.published_at && siteSlug ? (
                      <a href={getPropertyDetailUrl(siteSlug, property)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary">Visitar no site <ExternalLink className="h-3 w-3" /></a>
                    ) : null}
                  </div>
                </div>
              </article>
            )) : <Empty>Nenhum imóvel vinculado.</Empty>}
          </div>
        </Panel>
        <Panel title="Solicitações do proprietário">
          <div className="space-y-3">
            {updateRequests.length ? updateRequests.map((request) => (
              <article key={request.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{request.type} · {request.property?.title ?? request.property_id}</p>
                    <p className="text-xs text-muted-foreground">{request.reason}</p>
                  </div>
                  {canManageOwners ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void resolveUpdateRequest(request, "APPROVED")} className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs font-semibold text-emerald-700">Aprovar</button>
                      <button type="button" onClick={() => void resolveUpdateRequest(request, "REJECTED")} className="rounded-md border border-destructive/30 px-2 py-1 text-xs font-semibold text-destructive">Rejeitar</button>
                    </div>
                  ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Status: {request.status}</p>
              </article>
            )) : <Empty>Nenhuma solicitação pendente.</Empty>}
          </div>
        </Panel>
        <Panel title="Financeiro">
          <FinancialBreakdown entries={dashboard.financial_entries} />
        </Panel>
        <Panel
          title="Documentos"
          action={canManageOwners ? <button type="button" onClick={() => setIsDocumentsOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-accent"><FileUp className="h-3.5 w-3.5" />Enviar documento</button> : undefined}
        >
          <div className="space-y-2">
            {dashboard.documents.length ? dashboard.documents.map((document) => <div key={document.id} className="rounded-md border border-border p-3 text-sm"><p className="font-medium">{document.name}</p><p className="text-xs text-muted-foreground">{document.category} · {document.created_at}</p></div>) : <Empty>Nenhum documento.</Empty>}
          </div>
        </Panel>
        <Panel
          title="Agenda"
          action={<Link to="/app/agenda" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-accent"><CalendarPlus className="h-3.5 w-3.5" />Novo agendamento</Link>}
        >
          <div className="space-y-2">
            {dashboard.appointments.length ? dashboard.appointments.map((appointment) => <div key={appointment.id} className="rounded-md border border-border p-3 text-sm"><p className="font-medium">{appointment.title}</p><p className="text-xs text-muted-foreground">{appointment.starts_at} · {appointment.status}</p></div>) : <Empty>Nenhum compromisso.</Empty>}
          </div>
        </Panel>
        <Panel title="Atividades"><div className="space-y-2">{dashboard.activities.length ? dashboard.activities.map((activity) => <div key={activity.id} className="rounded-md border border-border p-3 text-sm"><p className="font-medium">{activity.action}</p><p className="text-xs text-muted-foreground">{activity.entity_type} · {activity.created_at}</p></div>) : <Empty>Nenhuma atividade registrada.</Empty>}</div></Panel>
        <Panel title="Responsável operacional"><p className="text-sm text-muted-foreground">{dashboard.responsible_users.length ? dashboard.responsible_users.map((user) => user.name).join(", ") : "Nenhum corretor responsável derivado dos imóveis vinculados."}</p></Panel>
      </div>
      {isDocumentsOpen ? (
        <OwnerDocumentsModal
          owner={dashboard.owner}
          linkedProperties={dashboard.properties}
          onClose={() => { setIsDocumentsOpen(false); void load(); }}
        />
      ) : null}
    </>}
  </ModulePage>;
}

function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action ?? null}
      </div>
      {children}
    </section>
  );
}

// AJUSTE-FUNCIONAL-03 (2026-09-11): antes esta seção jogava
// financial_entries num único fluxo indistinto. Agora separa nos 3 grupos
// pedidos (repasses pendentes / repasses pagos / cobranças abertas)
// reaproveitando a mesma semântica que o backend já usa para calcular
// dashboard.counts.pending_payouts/paid_payouts/open_charges
// (type === "payable" -> repasse; type === "receivable" -> cobrança) —
// nenhum cálculo financeiro novo é inventado aqui, só reorganização visual.
function FinancialBreakdown({ entries }: { entries: OwnerDashboard["financial_entries"] }) {
  const pendingPayouts = entries.filter((entry) => entry.type === "payable" && entry.status !== "paid");
  const paidPayouts = entries.filter((entry) => entry.type === "payable" && entry.status === "paid");
  const openCharges = entries.filter((entry) => entry.type === "receivable" && entry.status !== "paid");

  if (!entries.length) return <Empty>Nenhum lançamento financeiro.</Empty>;

  return (
    <div className="space-y-4">
      <FinancialGroup label="Repasses pendentes" entries={pendingPayouts} />
      <FinancialGroup label="Repasses pagos" entries={paidPayouts} />
      <FinancialGroup label="Cobranças abertas" entries={openCharges} />
    </div>
  );
}

function FinancialGroup({ label, entries }: { label: string; entries: OwnerDashboard["financial_entries"] }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{label} ({entries.length})</p>
      {entries.length ? (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">{entry.category} · {entry.status}</p>
              <p className="text-xs text-muted-foreground">{entry.amount} · {entry.due_date || "Sem vencimento"}{entry.property ? ` · ${entry.property.title}` : ""}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum lançamento nesta categoria.</p>
      )}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) { return <p className="text-sm text-muted-foreground">{children}</p>; }
function Info({ label, value }: { label: string; value: string | null }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value || "Não informado"}</p></div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
