import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import {
  createLead,
  getLead,
  listCrmUsers,
  listLeads,
  loadCrmPipeline,
  moveLeadToStage,
  updateLead,
  createLeadActivity,
  getCrmRouting,
  getCrmSummary,
  updateCrmRouting,
  type CrmStage,
  type LeadInterest,
  type CrmUser,
  type Lead,
  type LeadActivity,
  type LeadEvent,
} from "@/product/crm";
import { useSessionGuard } from "@/product/use-session-guard";
import { toDateTimeLocalValue, toIsoOrEmpty } from "@/product/crm-date";

export const Route = createFileRoute("/app/crm")({
  component: CrmPage,
});

const interestLabels = {
  sale: "Compra",
  rent: "Locação",
  both: "Compra ou locação",
  not_defined: "Não definido",
};
function formatDate(value: string | null | undefined) { return value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Não definido"; }
function humanEvent(type: string, userName?: string | null) { const labels: Record<string, string> = { "lead.created": "Lead criado", "lead.received": "Lead recebido pelo Site", "lead.assigned": `Lead atribuído${userName ? ` a ${userName}` : ""}`, "lead.unassigned": "Responsável removido", "lead.contacted": "Contato registrado", "lead.stage_changed": "Lead movido no funil", "lead.won": "Lead marcado como ganho", "lead.lost": "Lead marcado como perdido" }; return labels[type] ?? "Atualização do lead"; }
type LeadDetailData = Lead & { interests?: LeadInterest[]; activities?: LeadActivity[]; events?: LeadEvent[] };

function CrmPage() {
  const { session, isLoading } = useSessionGuard();
  const canManage = Boolean(session?.access.appUser?.permissions.includes("crm.manage"));
  const module = getModuleByKey("crm");
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isCrmLoading, setIsCrmLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Lead["status"]>("open");
  const [users, setUsers] = useState<CrmUser[]>([]);
  const [selectedLead, setSelectedLead] = useState<(Lead & { interests?: LeadInterest[]; activities?: LeadActivity[]; events?: LeadEvent[] }) | null>(null);
  const [summary, setSummary] = useState({ unassigned: 0, without_first_contact: 0, follow_up_overdue: 0, follow_up_today: 0 });
  const [routing, setRouting] = useState<{ mode: "manual" | "round_robin"; user_ids: string[] }>({ mode: "manual", user_ids: [] });
  const [showRouting, setShowRouting] = useState(false);

  async function refreshCrm() {
    setIsCrmLoading(true);
    setError(null);

    try {
      const [pipelineResponse, leadsResponse, usersResponse, summaryResponse, routingResponse] = await Promise.all([
        loadCrmPipeline(),
        listLeads({ status: statusFilter, search: search || undefined, page: 1, page_size: 25 }),
        listCrmUsers(),
        getCrmSummary(),
        getCrmRouting(),
      ]);
      setStages(pipelineResponse.stages);
      setLeads(leadsResponse.leads);
      setUsers(usersResponse.users.filter((user) => user.status === "active"));
      setSummary(summaryResponse);
      setRouting({ mode: routingResponse.mode, user_ids: routingResponse.user_ids });
    } catch (crmError) {
      setError(crmError instanceof Error ? crmError.message : "Não foi possível carregar o CRM.");
    } finally {
      setIsCrmLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) {
      void refreshCrm();
    }
  }, [isLoading, session, statusFilter]);

  const leadsByStage = useMemo(
    () =>
      stages.map((stage) => ({
        ...stage,
        leads: leads.filter((lead) => lead.stage_id === stage.id),
      })),
    [leads, stages],
  );

  async function handleMoveLead(leadId: string, stageId: string) {
    if (!canManage) return;
    const currentLead = leads.find((lead) => lead.id === leadId);
    if (!currentLead || currentLead.stage_id === stageId) return;

    setLeads((current) =>
      current.map((lead) => (lead.id === leadId ? { ...lead, stage_id: stageId } : lead)),
    );

    try {
      const response = await moveLeadToStage(leadId, stageId);
      setLeads((current) => current.map((lead) => (lead.id === leadId ? response.lead : lead)));
    } catch (moveError) {
      setLeads((current) =>
        current.map((lead) => (lead.id === leadId ? { ...lead, stage_id: currentLead.stage_id } : lead)),
      );
      setError(moveError instanceof Error ? moveError.message : "Não foi possível mover o lead.");
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
      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Funil comercial</p>
          <p className="text-sm text-muted-foreground">
          Leads normalmente chegam automaticamente pelo site e por integrações. Cadastros manuais ficam disponíveis para exceções.
          </p>
        </div>
        {canManage ? <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adicionar manualmente
        </button> : null}
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Sem responsável", summary.unassigned], ["Sem primeiro contato", summary.without_first_contact], ["Follow-up atrasado", summary.follow_up_overdue], ["Follow-up hoje", summary.follow_up_today]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
      </section>
      <button type="button" onClick={() => setShowRouting((value) => !value)} className="mb-4 rounded-md border border-border px-3 py-2 text-sm">Distribuição de leads</button>
      {showRouting ? <RoutingPanel users={users} routing={routing} onSaved={(next) => { setRouting(next); setShowRouting(false); }} canManage={Boolean(session?.access.appUser?.permissions.includes("crm.manage"))} /> : null}

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: os leads criados aqui ficam apenas neste navegador para você testar
          o fluxo. O CRM autenticado usa a API e o banco operacional da empresa.
        </div>
      ) : null}

      <div className="mb-4 grid gap-2 rounded-lg border border-border bg-card p-3 md:grid-cols-[1fr_180px_auto]">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar nome, e-mail ou telefone" className="h-9 rounded-md border border-input bg-background px-3 text-sm" />
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Lead["status"])} className="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option value="open">Abertos</option><option value="won">Ganhos</option><option value="lost">Perdidos</option>
        </select>
        <button type="button" onClick={() => void refreshCrm()} className="h-9 rounded-md border border-border px-3 text-sm font-medium">Pesquisar</button>
      </div>

      {showForm && canManage ? (
        <LeadForm
          stages={stages}
          onCancel={() => setShowForm(false)}
          onCreated={(lead) => {
            setLeads((current) => [lead, ...current]);
            setShowForm(false);
          }}
        />
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isCrmLoading ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando funil...
        </section>
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum lead encontrado"
          description="O CRM começa vazio. Cadastre o primeiro lead real quando a operação comercial estiver pronta para usar o funil."
          {...(canManage ? { actionLabel: "Cadastrar lead", onAction: () => setShowForm(true) } : {})}
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-5">
          {leadsByStage.map((stage) => (
            <div
              key={stage.id}
              className="min-h-[360px] rounded-lg border border-border bg-card"
              onDragOver={(event) => { if (canManage) event.preventDefault(); }}
              onDrop={(event) => {
                event.preventDefault();
                const leadId = event.dataTransfer.getData("text/plain") || draggingLeadId;
                setDraggingLeadId(null);
                if (leadId && canManage) void handleMoveLead(leadId, stage.id);
              }}
            >
              <div className="border-b border-border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{stage.name}</p>
                    <p className="text-xs text-muted-foreground">{stage.probability}% de probabilidade</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    {stage.leads.length}
                  </span>
                </div>
              </div>
              <div className="space-y-3 p-3">
                {stage.leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stages={stages}
                    onDragStart={() => setDraggingLeadId(lead.id)}
                    onMove={(stageId) => void handleMoveLead(lead.id, stageId)}
                    onUpdated={(updatedLead) =>
                      setLeads((current) =>
                        current.map((item) => (item.id === updatedLead.id ? updatedLead : item)),
                      )
                    }
                    users={users}
                    canManage={canManage}
                    onOpen={async () => {
                      try {
                        const response = await getLead(lead.id);
                        setSelectedLead({ ...response.lead, interests: response.interests, activities: response.activities, events: response.events });
                      } catch (detailError) {
                        setError(detailError instanceof Error ? detailError.message : "Não foi possível abrir o lead.");
                      }
                    }}
                    onStatus={(status, reason) => { if (!canManage) return; void updateLead(lead.id, { status, lost_reason: reason }).then((response) => {
                      setLeads((current) => statusFilter === response.lead.status ? current.map((item) => item.id === lead.id ? response.lead : item) : current.filter((item) => item.id !== lead.id));
                    }).catch((statusError) => setError(statusError instanceof Error ? statusError.message : "Não foi possível atualizar o status.")); }}
                  />
                ))}
                {stage.leads.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    Sem leads nesta etapa.
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      )}
      {selectedLead ? <LeadDetail lead={selectedLead} users={users} canManage={canManage} onClose={() => setSelectedLead(null)} onSaved={(detail) => { setSelectedLead(detail); setLeads((current) => current.map((item) => item.id === detail.id ? detail : item)); }} /> : null}
    </ModulePage>
  );
}

function RoutingPanel({ users, routing, onSaved, canManage }: { users: CrmUser[]; routing: { mode: "manual" | "round_robin"; user_ids: string[] }; onSaved: (routing: { mode: "manual" | "round_robin"; user_ids: string[] }) => void; canManage: boolean }) {
  const [mode, setMode] = useState(routing.mode); const [selected, setSelected] = useState(routing.user_ids); const [error, setError] = useState<string | null>(null);
  return <div className="mb-4 rounded-lg border border-border bg-card p-4"><p className="font-semibold">Distribuição de leads</p><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} disabled={!canManage} /> Manual</label><label className="mt-2 flex items-center gap-2 text-sm"><input type="radio" checked={mode === "round_robin"} onChange={() => setMode("round_robin")} disabled={!canManage} /> Automática — Round-robin</label>{mode === "round_robin" ? <div className="mt-3 space-y-2">{users.map((user) => <label key={user.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(user.id)} onChange={() => setSelected((current) => current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current, user.id])} disabled={!canManage} />{user.name}</label>)}</div> : null}{canManage ? <button type="button" onClick={async () => { try { await updateCrmRouting({ mode, user_ids: mode === "round_robin" ? selected : [] }); onSaved({ mode, user_ids: mode === "round_robin" ? selected : [] }); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar."); } }} className="mt-3 h-9 rounded border border-border px-3 text-sm">Salvar configuração</button> : <p className="mt-3 text-xs text-muted-foreground">Você pode visualizar, mas não alterar esta configuração.</p>}{error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}</div>;
}

function LeadDetail({ lead, users, canManage, onClose, onSaved }: { lead: LeadDetailData; users: CrmUser[]; canManage: boolean; onClose: () => void; onSaved: (lead: LeadDetailData) => void }) {
  const [isSaving, setIsSaving] = useState(false);
  const [activityType, setActivityType] = useState("whatsapp");
  const [activityBody, setActivityBody] = useState("");
  const [activityError, setActivityError] = useState<string | null>(null);
  async function saveActivity() {
    setActivityError(null);
    try { await createLeadActivity(lead.id, { type: activityType, body: activityBody }); const refreshed = await getLead(lead.id); onSaved({ ...refreshed.lead, interests: refreshed.interests, activities: refreshed.activities, events: refreshed.events }); setActivityBody(""); } catch (error) { setActivityError(error instanceof Error ? error.message : "Não foi possível registrar a atividade."); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-label="Detalhe do lead">
    <form className="w-full max-w-lg space-y-3 rounded-lg border border-border bg-card p-5 shadow-xl" onSubmit={async (event) => {
      event.preventDefault(); setIsSaving(true);
      const form = new FormData(event.currentTarget);
      const response = await updateLead(lead.id, { name: String(form.get("name")), email: String(form.get("email")), phone: String(form.get("phone")), source: String(form.get("source")), budget_cents: parseMoneyToCents(String(form.get("budget"))), assigned_to: String(form.get("assigned_to")) || undefined, notes: String(form.get("notes")), next_follow_up_at: toIsoOrEmpty(String(form.get("next_follow_up_at") || "")) }).finally(() => setIsSaving(false));
      onSaved({ ...response.lead, interests: lead.interests, activities: lead.activities, events: lead.events });
    }}>
      <div className="flex items-center justify-between"><h2 className="text-base font-semibold">Detalhe do lead</h2><button type="button" onClick={onClose} className="text-sm text-muted-foreground">Fechar</button></div>
      <Field label="Nome" name="name" required defaultValue={lead.name} disabled={!canManage} /><Field label="E-mail" name="email" type="email" defaultValue={lead.email ?? ""} disabled={!canManage} /><Field label="Telefone" name="phone" defaultValue={lead.phone ?? ""} disabled={!canManage} /><Field label="Origem" name="source" defaultValue={lead.source ?? ""} disabled={!canManage} /><Field label="Orçamento" name="budget" defaultValue={lead.budget_cents ? String(lead.budget_cents / 100) : ""} disabled={!canManage} /><Field label="Próximo follow-up" name="next_follow_up_at" type="datetime-local" defaultValue={toDateTimeLocalValue(lead.next_follow_up_at)} disabled={!canManage} />
      <label className="block space-y-1 text-sm"><span className="font-medium">Corretor responsável</span><select name="assigned_to" defaultValue={lead.assigned_to ?? ""} disabled={!canManage} className="h-10 w-full rounded border border-input bg-background px-3"><option value="">Sem responsável</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
      <label className="block space-y-1 text-sm"><span className="font-medium">Observações</span><textarea name="notes" defaultValue={lead.notes ?? ""} disabled={!canManage} rows={3} className="w-full rounded border border-input bg-background px-3 py-2" /></label>
      {lead.interests?.length ? <section className="rounded border border-border bg-muted/30 p-3"><p className="text-sm font-semibold">Imóveis de interesse</p><div className="mt-2 space-y-2">{lead.interests.map((interest) => <div key={interest.id} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{interest.property_code ?? "Imóvel"}</span>{interest.property_title ? ` — ${interest.property_title}` : ""} · {interest.source}</div>)}</div></section> : null}
      {canManage ? <div className="rounded border border-border p-3 space-y-2"><p className="text-sm font-semibold">Registrar atividade</p><select value={activityType} onChange={(event) => setActivityType(event.target.value)} className="h-9 w-full rounded border border-input bg-background px-2 text-sm"><option value="whatsapp">WhatsApp (registro manual)</option><option value="call">Ligação</option><option value="email">E-mail</option><option value="contact">Contato</option><option value="note">Nota</option></select><textarea value={activityBody} onChange={(event) => setActivityBody(event.target.value)} placeholder="Observação" className="w-full rounded border border-input px-2 py-2 text-sm" /><button type="button" onClick={() => void saveActivity()} className="h-9 rounded border border-border px-3 text-sm">Registrar atividade</button>{activityError ? <p className="text-xs text-destructive">{activityError}</p> : null}</div> : null}
      {lead.activities?.length ? <section className="rounded border border-border p-3"><p className="text-sm font-semibold">Atividades recentes</p>{lead.activities.map((activity) => <p key={activity.id} className="mt-1 text-xs text-muted-foreground">{activity.type}: {activity.body ?? ""}</p>)}</section> : null}
      <section className="rounded border border-border p-3"><p className="text-sm font-semibold">Timeline</p>{(lead.events ?? []).map((event) => <p key={event.id} className="mt-1 text-xs text-muted-foreground">{humanEvent(event.event_type, event.user_name)}</p>)}</section>
      <div className="text-xs text-muted-foreground">Primeiro contato: {formatDate(lead.first_contact_at)} · Último contato: {formatDate(lead.last_contact_at)} · Próximo follow-up: {formatDate(lead.next_follow_up_at)}</div>
      {canManage ? <button type="submit" disabled={isSaving} className="h-10 rounded bg-primary px-4 text-sm font-semibold text-primary-foreground">{isSaving ? "Salvando..." : "Salvar alterações"}</button> : null}
    </form>
  </div>;
}

function LeadForm({
  stages,
  onCancel,
  onCreated,
}: {
  stages: CrmStage[];
  onCancel: () => void;
  onCreated: (lead: Lead) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const budget = parseMoneyToCents(String(form.get("budget") ?? ""));
    const nextFollowUp = String(form.get("next_follow_up_at") ?? "");

    try {
      const response = await createLead({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        phone: String(form.get("phone") ?? ""),
        source: String(form.get("source") ?? ""),
        interest_type: String(form.get("interest_type") ?? "not_defined") as Lead["interest_type"],
        stage_id: String(form.get("stage_id") ?? "") || stages[0]?.id,
        budget_cents: budget,
        property_reference: String(form.get("property_reference") ?? ""),
        notes: String(form.get("notes") ?? ""),
        next_follow_up_at: nextFollowUp ? new Date(nextFollowUp).toISOString() : undefined,
      });

      onCreated(response.lead);
      formElement.reset();
    } catch (leadError) {
      setError(leadError instanceof Error ? leadError.message : "Não foi possível salvar o lead.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Novo lead</h2>
          <p className="text-sm text-muted-foreground">
            Registre apenas contatos reais recebidos pela imobiliária.
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
        <Field label="Nome do lead" name="name" required />
        <Field label="E-mail" name="email" type="email" />
        <Field label="Telefone/WhatsApp" name="phone" />
        <Field label="Origem" name="source" placeholder="Site, indicação, portal..." />
        <label className="space-y-1 text-sm">
          <span className="font-medium">Interesse</span>
          <select
            name="interest_type"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue="not_defined"
          >
            <option value="not_defined">Não definido</option>
            <option value="sale">Compra</option>
            <option value="rent">Locação</option>
            <option value="both">Compra ou locação</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium">Etapa</span>
          <select
            name="stage_id"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            defaultValue={stages[0]?.id}
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </label>
        <Field label="Orçamento aproximado" name="budget" inputMode="decimal" placeholder="Ex: 850.000" />
        <Field label="Imóvel de interesse" name="property_reference" />
        <Field label="Próximo follow-up" name="next_follow_up_at" type="datetime-local" />
      </div>

      <label className="mt-3 block space-y-1 text-sm">
        <span className="font-medium">Observações</span>
        <textarea
          name="notes"
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Resumo do atendimento, preferências e próximos passos."
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
          Salvar lead
        </button>
      </div>
    </form>
  );
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined;
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  disabled,
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  disabled?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        disabled={disabled}
        inputMode={inputMode}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

function LeadCard({
  lead,
  stages,
  onDragStart,
  onMove,
  onUpdated,
  users,
  canManage,
  onOpen,
  onStatus,
}: {
  lead: Lead;
  stages: CrmStage[];
  onDragStart: () => void;
  onMove: (stageId: string) => void;
  onUpdated: (lead: Lead) => void;
  users: CrmUser[];
  canManage: boolean;
  onOpen: () => void;
  onStatus: (status: Lead["status"], reason?: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLossForm, setShowLossForm] = useState(false);
  const [lossReason, setLossReason] = useState("sem retorno");
  const budget = lead.budget_cents
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        lead.budget_cents / 100,
      )
    : null;

  return (
    <article
      draggable={canManage}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", lead.id);
        onDragStart();
      }}
      className="rounded-md border border-border bg-background p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{lead.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{interestLabels[lead.interest_type]}</p>
        </div>
        <button type="button" onClick={onOpen} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Abrir detalhes do lead"><Search className="h-4 w-4 shrink-0" /></button>
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {lead.phone ? <p className="truncate">WhatsApp: {lead.phone}</p> : null}
        {lead.email ? <p className="truncate">E-mail: {lead.email}</p> : null}
        {lead.source ? <p className="truncate">Origem: {lead.source}</p> : null}
        {budget ? <p className="truncate">Orçamento: {budget}</p> : null}
      </div>

      {lead.notes ? (
        <p className="mt-3 line-clamp-3 rounded-md bg-muted p-2 text-xs leading-5 text-muted-foreground">
          {lead.notes}
        </p>
      ) : null}

      {isEditing && canManage ? (
        <form
          className="mt-3 space-y-2 rounded-md border border-border bg-muted/30 p-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            setIsSaving(true);
            setError(null);
            try {
              const response = await updateLead(lead.id, {
                name: String(form.get("name") ?? ""),
                phone: String(form.get("phone") ?? ""),
                source: String(form.get("source") ?? ""),
                notes: String(form.get("notes") ?? ""),
              });
              onUpdated(response.lead);
              setIsEditing(false);
            } catch (updateError) {
              setError(updateError instanceof Error ? updateError.message : "Não foi possível editar o lead.");
            } finally {
              setIsSaving(false);
            }
          }}
        >
          <input name="name" defaultValue={lead.name} required className="h-8 w-full rounded border border-input bg-background px-2 text-xs" aria-label="Nome do lead" />
          <input name="phone" defaultValue={lead.phone ?? ""} className="h-8 w-full rounded border border-input bg-background px-2 text-xs" aria-label="Telefone do lead" />
          <input name="source" defaultValue={lead.source ?? ""} className="h-8 w-full rounded border border-input bg-background px-2 text-xs" aria-label="Origem do lead" />
          <textarea name="notes" defaultValue={lead.notes ?? ""} rows={2} className="w-full rounded border border-input bg-background px-2 py-1 text-xs" aria-label="Observações do lead" />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={isSaving} className="h-8 rounded border border-border px-2 text-xs font-medium disabled:opacity-60">{isSaving ? "Salvando..." : "Salvar"}</button>
            <button type="button" onClick={() => setIsEditing(false)} className="h-8 rounded border border-border px-2 text-xs">Cancelar</button>
          </div>
        </form>
      ) : canManage ? (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="mt-3 h-8 w-full rounded-md border border-border text-xs font-medium transition hover:bg-accent"
        >
          Editar lead
        </button>
      ) : null}
      {lead.assigned_to ? <p className="mt-2 text-xs text-muted-foreground">Responsável: {users.find((user) => user.id === lead.assigned_to)?.name ?? "Usuário"}</p> : null}
      {canManage && lead.status === "open" ? <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => onStatus("won")} className="h-8 flex-1 rounded border border-emerald-500/40 px-2 text-xs text-emerald-700">Marcar ganho</button>
        <button type="button" onClick={() => setShowLossForm(true)} className="h-8 flex-1 rounded border border-destructive/40 px-2 text-xs text-destructive">Marcar perdido</button>
      </div> : null}
      {canManage && showLossForm ? <div className="mt-2 rounded border border-destructive/30 p-2"><label className="text-xs">Motivo<select value={lossReason} onChange={(event) => setLossReason(event.target.value)} className="mt-1 h-8 w-full rounded border border-input bg-background px-2 text-xs"><option value="preço">Preço</option><option value="desistência">Desistência</option><option value="sem retorno">Sem retorno</option><option value="imóvel indisponível">Imóvel indisponível</option><option value="fechou com concorrente">Fechou com concorrente</option><option value="financiamento">Financiamento</option><option value="outro">Outro</option></select></label><div className="mt-2 flex gap-2"><button type="button" onClick={() => { onStatus("lost", lossReason); setShowLossForm(false); }} className="h-8 rounded bg-destructive px-3 text-xs text-white">Confirmar perda</button><button type="button" onClick={() => setShowLossForm(false)} className="h-8 rounded border px-3 text-xs">Cancelar</button></div></div> : null}

      {lead.phone ? (
        <a
          href={`https://wa.me/${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
            `Olá, ${lead.name}. Aqui é da imobiliária. Podemos continuar seu atendimento pelo ImobiFlow?`,
          )}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-md border border-border text-xs font-medium transition hover:bg-accent"
        >
          Abrir WhatsApp
        </a>
      ) : null}

      {canManage ? <label className="mt-3 block text-xs text-muted-foreground">
        Mover para
        <select
          value={lead.stage_id ?? ""}
          onChange={(event) => onMove(event.target.value)}
          className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </label> : null}
    </article>
  );
}
