import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarPlus, ExternalLink, FileUp, Loader2, Mail, MessageCircle, Phone, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, canView } from "@/product/app-access";
import { useSessionGuard } from "@/product/use-session-guard";
import {
  archiveOwner,
  getOwnerDashboard,
  listOwnerPropertyUpdateRequests,
  regenerateOwnerPortalToken,
  resolveOwnerPropertyUpdateRequest,
  setOwnerPortalEnabled,
  getOwnerProfile,
  updateOwnerProfile,
  listOwnerChecks,
  queryOwnerIntelligence,
  type OwnerCheck,
  type OwnerCreditData,
  type OwnerProfile,
  type OwnerPropertyUpdateRequest,
  type OwnerDashboard,
} from "@/product/real-estate";
import {
  OWNER_INTELLIGENCE_CAPABILITY_LABELS,
  OWNER_INTELLIGENCE_UI_CAPABILITIES,
  capabilityStatus,
  hasValidTreatmentConsent,
  intelligenceErrorMessage,
} from "@/product/owner-intelligence-ui";
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
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [profileTab, setProfileTab] = useState("identity");
  const [profileBusy, setProfileBusy] = useState(false);
  const [intelligenceChecks, setIntelligenceChecks] = useState<OwnerCheck[]>([]);
  const [intelligenceBusy, setIntelligenceBusy] = useState(false);
  const [intelligenceMessage, setIntelligenceMessage] = useState<string | null>(null);
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
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
      const [nextDashboard, nextRequests, nextProfile] = await Promise.all([
        getOwnerDashboard(ownerId),
        listOwnerPropertyUpdateRequests(ownerId, "PENDING"),
        getOwnerProfile(ownerId),
      ]);
      setDashboard(nextDashboard);
      setUpdateRequests(nextRequests.requests);
      setProfile(nextProfile.profile);
      try {
        const nextChecks = await listOwnerChecks(ownerId);
        setIntelligenceChecks(nextChecks.checks);
      } catch {
        // A user without sensitive-view permission can still use the owner
        // dashboard; the query action remains protected by the backend.
        setIntelligenceChecks([]);
      }
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

  async function saveProfile(patch: Record<string, unknown>) {
    setProfileBusy(true);
    try {
      const response = await updateOwnerProfile(ownerId, patch);
      setProfile(response.profile);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar a ficha."); }
    finally { setProfileBusy(false); }
  }

  async function requestIntelligence() {
    if (!profile || !hasValidTreatmentConsent(profile) || intelligenceBusy) {
      setIntelligenceError("É necessário registrar a autorização de tratamento de dados antes de realizar consultas.");
      return;
    }
    setIntelligenceBusy(true);
    setIntelligenceError(null);
    setIntelligenceMessage(null);
    try {
      const response = await queryOwnerIntelligence(ownerId, [...OWNER_INTELLIGENCE_UI_CAPABILITIES]);
      setIntelligenceChecks((current) => [response.check, ...current.filter((check) => check.id !== response.check.id)]);
      setIntelligenceMessage(response.check.status === "NOT_CONFIGURED" ? "Fonte de dados ainda não configurada. Nenhum dado externo foi preenchido." : "Consulta concluída.");
    } catch (cause) {
      setIntelligenceError(intelligenceErrorMessage(cause));
    } finally { setIntelligenceBusy(false); }
  }

  if (isSessionLoading || loading) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando proprietário...</main>;

  return <ModulePage session={session} module={module}>
    <div className="mb-4 flex items-center justify-between gap-3"><Link to="/app/proprietarios" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Proprietários</Link><button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" />Atualizar</button></div>
    {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
    {!dashboard ? <p className="text-sm text-muted-foreground">Proprietário não encontrado.</p> : <>
      <header className="rounded-lg border border-border bg-card p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Ficha completa do proprietário</p><h1 className="mt-1 text-2xl font-semibold">{dashboard.owner.name}</h1><p className="mt-1 text-sm text-muted-foreground">{dashboard.owner.owner_type === "company" ? "Pessoa jurídica" : "Pessoa física"} · {dashboard.owner.status}</p></div><div className="flex flex-wrap gap-2">{canManageOwners ? <><button type="button" onClick={() => void togglePortal()} disabled={portalBusy} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold">{dashboard.owner.portal_enabled ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}{dashboard.owner.portal_enabled ? "Desativar portal" : "Ativar portal"}</button><button type="button" onClick={() => void regeneratePortal()} disabled={portalBusy} className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold"><RefreshCw className="h-3.5 w-3.5" />Regenerar link</button><button type="button" onClick={() => void archive()} className="inline-flex h-9 items-center gap-2 rounded-md border border-destructive/30 px-3 text-xs font-semibold text-destructive">Arquivar</button></> : null}</div></div><div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4"><Info label="Documento" value={dashboard.owner.document} /><Info label="Telefone" value={dashboard.owner.phone} /><Info label="WhatsApp" value={dashboard.owner.whatsapp} /><Info label="E-mail" value={dashboard.owner.email} /></div><div className="mt-4 flex flex-wrap gap-3 text-sm">{dashboard.owner.phone ? <a href={`tel:${dashboard.owner.phone.replace(/\D/g, "")}`} className="inline-flex items-center gap-1 text-primary"><Phone className="h-4 w-4" />Ligar</a> : null}{dashboard.owner.whatsapp ? <a href={`https://wa.me/${dashboard.owner.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary"><MessageCircle className="h-4 w-4" />WhatsApp</a> : null}{dashboard.owner.email ? <a href={`mailto:${dashboard.owner.email}`} className="inline-flex items-center gap-1 text-primary"><Mail className="h-4 w-4" />Enviar e-mail</a> : null}{dashboard.owner.portal_token && dashboard.owner.portal_enabled ? <button type="button" onClick={() => void copyPortalLink()} className="text-primary">{copied ? "Link copiado" : "Copiar link do portal"}</button> : null}</div></header>
      {profile ? <OwnerProfilePanel profile={profile} activeTab={profileTab} onTabChange={setProfileTab} canManage={canManageOwners} canViewCredit={canView(session?.access.appUser, "owners.credit.view")} busy={profileBusy} onSave={saveProfile} /> : null}
      {profile ? <OwnerIntelligencePanel profile={profile} checks={intelligenceChecks} busy={intelligenceBusy} message={intelligenceMessage} error={intelligenceError} onQuery={() => void requestIntelligence()} onOpenConsent={() => setProfileTab("treatment_consent")} /> : null}
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

const profileTabs: Array<[string, string]> = [
  ["identity", "Dados pessoais"], ["contact", "Contato"], ["address", "Endereço"], ["professional", "Profissional"],
  ["financial", "Financeiro"], ["credit", "Crédito"], ["legal", "Jurídico"], ["fiscal", "Fiscal"],
  ["treatment_consent", "Consentimento LGPD"],
];

function OwnerProfilePanel({ profile, activeTab, onTabChange, canManage, canViewCredit, busy, onSave }: {
  profile: OwnerProfile;
  activeTab: string;
  onTabChange: (tab: string) => void;
  canManage: boolean;
  canViewCredit: boolean;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const value = profile[activeTab as keyof OwnerProfile];
  const isObject = value && typeof value === "object" && !Array.isArray(value);
  const restricted = value === null;
  const [draft, setDraft] = useState(() => JSON.stringify(isObject ? value : {}, null, 2));
  useEffect(() => { setDraft(JSON.stringify(isObject ? value : {}, null, 2)); }, [activeTab, profile]);
  return <section className="mt-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase text-muted-foreground">Cadastro inteligente</p><h2 className="text-lg font-semibold">Ficha cadastral</h2></div>
    </div>
    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{profileTabs.map(([key, label]) => <button key={key} id={key === "treatment_consent" ? "consentimento-lgpd" : undefined} type="button" onClick={() => onTabChange(key)} className={`whitespace-nowrap rounded-md px-3 py-2 text-xs font-semibold ${activeTab === key ? "bg-primary text-primary-foreground" : "border border-border"}`}>{label}{key !== "identity" && key !== "contact" && key !== "address" && key !== "professional" && value === null ? " · restrito" : ""}</button>)}</div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
      <div>{restricted ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Dados restritos pela permissão do usuário.</p> : activeTab === "professional" || activeTab === "financial" ? <OwnerStructuredEditor kind={activeTab} profile={profile} canManage={canManage} busy={busy} onSave={onSave} /> : activeTab === "credit" && canViewCredit ? <OwnerCreditViewer credit={profile.credit} /> : activeTab === "credit" ? <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Dados de crédito restritos pela permissão do usuário.</p> : <textarea aria-label={`Dados ${activeTab}`} value={draft} onChange={(event) => setDraft(event.target.value)} readOnly={!canManage} className="min-h-32 w-full rounded-md border border-border bg-background p-3 font-mono text-xs" />}</div>
      {canManage && !restricted && activeTab !== "professional" && activeTab !== "financial" && activeTab !== "credit" ? <button type="button" disabled={busy} onClick={() => { try { void onSave({ [activeTab]: JSON.parse(draft) }); } catch { /* validação amigável fica no backend */ } }} className="self-start rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Salvar ficha</button> : null}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Valores preservam origem, confiança e consentimento LGPD. Consultas externas permanecem desativadas quando o provedor está NOT_CONFIGURED.</p>
  </section>;
}

function OwnerCreditViewer({ credit }: { credit: OwnerCreditData | null }) {
  const status = credit?.status ?? "NOT_CHECKED";
  const statusLabel: Record<string, string> = { NOT_CHECKED: "Não consultado", NOT_CONFIGURED: "Provider não configurado", CURRENT: "Atual", EXPIRED: "Expirado", PARTIAL: "Parcial", CLEAR: "Sem restrições", HAS_RESTRICTIONS: "Com restrições", ERROR: "Erro na consulta" };
  if (!credit || status === "NOT_CHECKED" || status === "NOT_CONFIGURED") {
    return <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">{statusLabel[status]}</p><p className="mt-1">{status === "NOT_CONFIGURED" ? "Fonte de crédito ainda não configurada." : "Execute uma consulta autorizada para obter dados de crédito."}</p></div>;
  }
  const restrictions = Array.isArray(credit.restrictions) ? credit.restrictions : [];
  const debts = Array.isArray(credit.debts) ? credit.debts : [];
  const negativeListings = Array.isArray(credit.negative_listings) ? credit.negative_listings : [];
  const protests = Array.isArray(credit.protests) ? credit.protests : [];
  const count = (value: number | null, fallback: number) => value == null ? fallback : value;
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Info label="Status da consulta" value={statusLabel[status] ?? status} /><Info label="Score" value={credit.score == null ? null : String(credit.score)} /><Info label="Faixa / escala" value={credit.score_range || credit.score_scale ? [credit.score_range, credit.score_scale].filter(Boolean).join(" · ") : null} /><Info label="Fonte" value={credit.provider} /></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Restrições" value={count(credit.restriction_count, restrictions.length)} /><Metric label="Dívidas" value={count(credit.debt_count, debts.length)} /><Metric label="Negativações" value={count(credit.negative_listing_count, negativeListings.length)} /><Metric label="Protestos" value={count(credit.protest_count, protests.length)} /></div>
    <p className="text-xs text-muted-foreground">Última consulta: {credit.checked_at ? new Date(credit.checked_at).toLocaleString("pt-BR") : "Não informado"}{credit.expires_at ? ` · Validade: ${new Date(credit.expires_at).toLocaleDateString("pt-BR")}` : ""}</p>
  </div>;
}

type StructuredEditorKind = "professional" | "financial";

function OwnerStructuredEditor({ kind, profile, canManage, busy, onSave }: {
  kind: StructuredEditorKind;
  profile: OwnerProfile;
  canManage: boolean;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const source = (profile[kind] && typeof profile[kind] === "object" ? profile[kind] : {}) as Record<string, unknown>;
  const [draft, setDraft] = useState<Record<string, unknown>>(source);
  useEffect(() => { setDraft(source); }, [profile, kind]);
  const setValue = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => void onSave({ [kind]: draft });
  if (kind === "professional") {
    return <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Profissão" value={String(draft.profession ?? "")} disabled={!canManage} onChange={(value) => setValue("profession", value)} />
      <Field label="Ocupação" value={String(draft.occupation ?? "")} disabled={!canManage} onChange={(value) => setValue("occupation", value)} />
      <label className="grid gap-1 text-xs font-medium"><span>Tipo de vínculo</span><select value={String(draft.employment_type ?? "")} disabled={!canManage} onChange={(event) => setValue("employment_type", event.target.value || null)} className="h-9 rounded-md border border-border bg-background px-2"><option value="">Selecione</option><option value="CLT">CLT</option><option value="PJ">PJ</option><option value="autonomo">Autônomo</option><option value="empresario">Empresário</option><option value="servidor">Servidor</option><option value="aposentado">Aposentado</option><option value="pensionista">Pensionista</option><option value="estudante">Estudante</option><option value="desempregado">Desempregado</option><option value="outro">Outro</option></select></label>
      <Field label="Empresa atual" value={String(draft.current_employer ?? "")} disabled={!canManage} onChange={(value) => setValue("current_employer", value)} />
      <Field label="CNPJ da empresa" value={String(draft.employer_cnpj ?? "")} disabled={!canManage} onChange={(value) => setValue("employer_cnpj", value)} />
      <Field label="Cargo" value={String(draft.role ?? "")} disabled={!canManage} onChange={(value) => setValue("role", value)} />
      <Field label="Data de admissão" type="date" value={String(draft.started_at ?? "")} disabled={!canManage} onChange={(value) => setValue("started_at", value)} />
      <Field label="Tempo de vínculo (meses)" type="number" value={draft.tenure_months == null ? "" : String(draft.tenure_months)} disabled={!canManage} onChange={(value) => setValue("tenure_months", value === "" ? null : Number(value))} />
      <div className="sm:col-span-2 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Status profissional: {String(draft.status ?? "pending")}</p>{canManage ? <button type="button" disabled={busy} onClick={save} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Salvar profissional</button> : null}</div>
    </div>;
  }
  const sources = Array.isArray(draft.income_sources) ? draft.income_sources as Array<Record<string, unknown>> : [];
  const assets = Array.isArray(draft.assets) ? draft.assets as Array<Record<string, unknown>> : [];
  const updateRow = (key: "income_sources" | "assets", index: number, field: string, value: unknown) => {
    const rows = (Array.isArray(draft[key]) ? draft[key] : []) as Array<Record<string, unknown>>;
    setValue(key, rows.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row));
  };
  return <div className="grid gap-3 sm:grid-cols-2">
    <Field label="Renda mensal declarada" type="number" value={draft.income_declared_monthly == null ? "" : String(draft.income_declared_monthly)} disabled={!canManage} onChange={(value) => setValue("income_declared_monthly", value === "" ? null : Number(value))} />
    <Field label="Renda mensal comprovada" type="number" value={draft.income_proven_monthly == null ? "" : String(draft.income_proven_monthly)} disabled={!canManage} onChange={(value) => setValue("income_proven_monthly", value === "" ? null : Number(value))} />
    <Field label="Renda familiar mensal" type="number" value={draft.family_income_monthly == null ? "" : String(draft.family_income_monthly)} disabled={!canManage} onChange={(value) => setValue("family_income_monthly", value === "" ? null : Number(value))} />
    <Field label="Renda variável mensal" type="number" value={draft.variable_income_monthly == null ? "" : String(draft.variable_income_monthly)} disabled={!canManage} onChange={(value) => setValue("variable_income_monthly", value === "" ? null : Number(value))} />
    <section className="sm:col-span-2 rounded-md border border-border p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Fontes de renda</h3>{canManage ? <button type="button" onClick={() => setValue("income_sources", [...sources, { id: crypto.randomUUID(), type: "salario", amount: 0, recurrence: "monthly", verification_status: "DECLARADA", provenance: "OWNER_DECLARED" }])} className="text-xs font-semibold text-primary">Adicionar fonte</button> : null}</div>{sources.length ? sources.map((source, index) => <div key={String(source.id ?? index)} className="grid gap-2 border-t border-border py-2 sm:grid-cols-3"><select value={String(source.type ?? "salario")} disabled={!canManage} onChange={(event) => updateRow("income_sources", index, "type", event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-xs"><option value="salario">Salário</option><option value="pro_labore">Pró-labore</option><option value="aluguel">Aluguel</option><option value="comissao">Comissão</option><option value="prestacao_servico">Prestação de serviço</option><option value="outras">Outras</option></select><input type="number" value={String(source.amount ?? "")} disabled={!canManage} onChange={(event) => updateRow("income_sources", index, "amount", Number(event.target.value))} className="h-9 rounded-md border border-border bg-background px-2 text-xs" placeholder="Valor" /><select value={String(source.verification_status ?? "DECLARADA")} disabled={!canManage} onChange={(event) => updateRow("income_sources", index, "verification_status", event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-xs"><option>DECLARADA</option><option>DOCUMENTADA</option><option>VERIFICADA</option><option>DESATUALIZADA</option></select></div>) : <p className="text-xs text-muted-foreground">Nenhuma fonte cadastrada.</p>}</section>
    <section className="sm:col-span-2 rounded-md border border-border p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase text-muted-foreground">Patrimônio</h3>{canManage ? <button type="button" onClick={() => setValue("assets", [...assets, { id: crypto.randomUUID(), type: "outro", label: "", declared_value: 0, verification_status: "DECLARADA", provenance: "OWNER_DECLARED" }])} className="text-xs font-semibold text-primary">Adicionar bem</button> : null}</div>{assets.length ? assets.map((asset, index) => <div key={String(asset.id ?? index)} className="grid gap-2 border-t border-border py-2 sm:grid-cols-3"><select value={String(asset.type ?? "outro")} disabled={!canManage} onChange={(event) => updateRow("assets", index, "type", event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-xs"><option value="imovel">Imóvel</option><option value="veiculo">Veículo</option><option value="participacao_societaria">Participação societária</option><option value="investimento">Investimento</option><option value="outro">Outro</option></select><input value={String(asset.label ?? "")} disabled={!canManage} onChange={(event) => updateRow("assets", index, "label", event.target.value)} className="h-9 rounded-md border border-border bg-background px-2 text-xs" placeholder="Descrição" /><input type="number" value={String(asset.declared_value ?? "")} disabled={!canManage} onChange={(event) => updateRow("assets", index, "declared_value", Number(event.target.value))} className="h-9 rounded-md border border-border bg-background px-2 text-xs" placeholder="Valor declarado" /></div>) : <p className="text-xs text-muted-foreground">Nenhum bem cadastrado.</p>}</section>
    <div className="sm:col-span-2 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Status: {String(draft.status ?? "PENDENTE")} · Capacidade: {String((draft.financial_capacity as Record<string, unknown> | undefined)?.status ?? "DATA_INSUFFICIENT")}</p>{canManage ? <button type="button" disabled={busy} onClick={save} className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground">Salvar financeiro</button> : null}</div>
  </div>;
}

function Field({ label, value, onChange, type = "text", disabled }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
  return <label className="grid gap-1 text-xs font-medium"><span>{label}</span><input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-border bg-background px-2" /></label>;
}

function OwnerIntelligencePanel({ profile, checks, busy, message, error, onQuery, onOpenConsent }: {
  profile: OwnerProfile;
  checks: OwnerCheck[];
  busy: boolean;
  message: string | null;
  error: string | null;
  onQuery: () => void;
  onOpenConsent: () => void;
}) {
  const consent = hasValidTreatmentConsent(profile);
  const latest = checks.find((check) => check.check_type === "intelligence");
  const checkedAt = latest?.checked_at ? new Date(latest.checked_at).toLocaleString("pt-BR") : null;
  return <section id="inteligencia-cadastral" className="mt-4 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground">Inteligência cadastral</p>
        <h2 className="text-lg font-semibold">Consulta de identidade, endereço e dados civis</h2>
        <p className="mt-1 text-xs text-muted-foreground">Consulta online controlada, sem preencher dados quando o provider não está configurado.</p>
      </div>
      <button type="button" onClick={onQuery} disabled={!consent || busy} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? "Buscando dados..." : latest ? "Atualizar dados" : "Buscar dados"}
      </button>
    </div>
    {!consent ? <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800"><p>É necessário registrar a autorização de tratamento de dados antes de realizar consultas.</p><button type="button" onClick={onOpenConsent} className="mt-2 font-semibold underline">Abrir consentimento LGPD</button></div> : null}
    {message ? <p role="status" className="mt-3 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-800">{message}</p> : null}
    {error ? <p role="alert" className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {OWNER_INTELLIGENCE_UI_CAPABILITIES.map((capability) => {
        const status = capabilityStatus(checks, capability);
        return <div key={capability} className="rounded-md border border-border p-3"><p className="text-sm font-medium">{OWNER_INTELLIGENCE_CAPABILITY_LABELS[capability]}</p><p className="mt-1 text-xs text-muted-foreground">{status.label}</p></div>;
      })}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Última tentativa: {checkedAt ?? "Não consultado"}</p>
  </section>;
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
