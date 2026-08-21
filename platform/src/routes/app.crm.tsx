import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import {
  createLead,
  listLeads,
  loadCrmPipeline,
  moveLeadToStage,
  updateLead,
  type CrmStage,
  type Lead,
} from "@/product/crm";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/crm")({
  component: CrmPage,
});

const interestLabels = {
  sale: "Compra",
  rent: "Locação",
  both: "Compra ou locação",
  not_defined: "Não definido",
};

function CrmPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("crm");
  const [stages, setStages] = useState<CrmStage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isCrmLoading, setIsCrmLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshCrm() {
    setIsCrmLoading(true);
    setError(null);

    try {
      const [pipelineResponse, leadsResponse] = await Promise.all([loadCrmPipeline(), listLeads()]);
      setStages(pipelineResponse.stages);
      setLeads(leadsResponse.leads);
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
  }, [isLoading, session]);

  const leadsByStage = useMemo(
    () =>
      stages.map((stage) => ({
        ...stage,
        leads: leads.filter((lead) => lead.stage_id === stage.id),
      })),
    [leads, stages],
  );

  async function handleMoveLead(leadId: string, stageId: string) {
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
            Cadastre leads reais e acompanhe cada negociação por etapa.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((current) => !current)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Novo lead
        </button>
      </div>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: os leads criados aqui ficam apenas neste navegador para você testar
          o fluxo. O CRM autenticado usa a API e o banco operacional da empresa.
        </div>
      ) : null}

      {showForm ? (
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
          actionLabel="Cadastrar lead"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <section className="grid gap-4 xl:grid-cols-5">
          {leadsByStage.map((stage) => (
            <div
              key={stage.id}
              className="min-h-[360px] rounded-lg border border-border bg-card"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const leadId = event.dataTransfer.getData("text/plain") || draggingLeadId;
                setDraggingLeadId(null);
                if (leadId) void handleMoveLead(leadId, stage.id);
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
    </ModulePage>
  );
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
  inputMode,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
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
}: {
  lead: Lead;
  stages: CrmStage[];
  onDragStart: () => void;
  onMove: (stageId: string) => void;
  onUpdated: (lead: Lead) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const budget = lead.budget_cents
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
        lead.budget_cents / 100,
      )
    : null;

  return (
    <article
      draggable
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
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
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

      {isEditing ? (
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
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="mt-3 h-8 w-full rounded-md border border-border text-xs font-medium transition hover:bg-accent"
        >
          Editar lead
        </button>
      )}

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

      <label className="mt-3 block text-xs text-muted-foreground">
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
      </label>
    </article>
  );
}
