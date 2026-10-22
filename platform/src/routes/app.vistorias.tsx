import { ChevronDown, ChevronUp, ClipboardList, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { InspectionHowItWorks } from "@/components/app/inspections/InspectionHowItWorks";
import { InspectionStats } from "@/components/app/inspections/InspectionStats";
import { InspectionContinueCard } from "@/components/app/inspections/InspectionContinueCard";
import { InspectionRecentTable } from "@/components/app/inspections/InspectionRecentTable";
import { InspectionPendingCard } from "@/components/app/inspections/InspectionPendingCard";
import { InspectionQuickActions } from "@/components/app/inspections/InspectionQuickActions";
import { useInspectionDashboard } from "@/components/app/inspections/use-inspection-dashboard";
import { useInspectionPropertyDetail } from "@/components/app/inspections/use-inspection-property-detail";
import { InspectionPropertySummaryCard } from "@/components/app/inspections/InspectionPropertySummaryCard";
import { InspectionBrokerSearchField } from "@/components/app/inspections/InspectionBrokerSearchField";
import { InspectionStepper } from "@/components/app/inspections/InspectionStepper";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage } from "@/product/app-access";
import { createMysqlInspection, listMysqlInspections, type MysqlInspection, type MysqlInspectionPage, type MysqlInspectionStatus } from "@/product/inspections";
import { inspectionStatusLabels, inspectionTypeLabels } from "@/product/inspection-dashboard";
import { listProperties, listPropertyEligibleUsers, type PropertySummary } from "@/product/real-estate";
import { formatPropertySearchLabel } from "@/product/inspection-property-search";
import type { EligibleUser } from "@/product/sharing";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/vistorias")({ component: InspectionsPage });

function InspectionsPage() {
  const { session, isLoading } = useSessionGuard();
  const isDetailRoute = useRouterState({ select: (state) => state.matches.some((match) => match.routeId === "/app/vistorias/$inspectionId") });
  const dashboard = useInspectionDashboard(!isLoading && Boolean(session) && !isDetailRoute);

  const [rows, setRows] = useState<MysqlInspection[]>([]); const [users, setUsers] = useState<EligibleUser[]>([]); const [page, setPage] = useState(1); const [status, setStatus] = useState<MysqlInspectionStatus | undefined>(); const [pagination, setPagination] = useState<MysqlInspectionPage["pagination"] | null>(null); const [loading, setLoading] = useState(true); const [showForm, setShowForm] = useState(false); const [showAllList, setShowAllList] = useState(false); const [error, setError] = useState<string | null>(null);
  const module = getModuleByKey("inspections"); const canCreate = canManage(session?.access.appUser, "inspections.manage");

  async function refresh() { setLoading(true); setError(null); try { const [ip, up] = await Promise.all([listMysqlInspections(page, 25, status), listPropertyEligibleUsers()]); setRows(ip.inspections); setPagination(ip.pagination); setUsers(up.users); } catch (e) { setError(getSafeApiErrorMessage(e, "Não foi possível carregar as vistorias.")); } finally { setLoading(false); } }
  useEffect(() => { if (!isLoading && session && (showAllList || showForm)) void refresh(); }, [isLoading, session, page, status, showAllList, showForm]);

  function openDraftsList() { setStatus("draft"); setPage(1); setShowAllList(true); }

  if (isLoading) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Validando acesso...</main>;
  if (isDetailRoute) return <Outlet />;

  return <ModulePage session={session} module={module}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={openDraftsList} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-medium">Ver rascunhos</button>
        {canCreate ? <button type="button" onClick={() => { setShowForm((v) => !v); if (!showAllList) setShowAllList(true); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" />Nova vistoria</button> : null}
      </div>

      <InspectionHowItWorks />
      {dashboard.error ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{dashboard.error}</div> : null}
      <InspectionStats kpis={dashboard.kpis} loading={dashboard.loading} />
      <InspectionContinueCard items={dashboard.continueItems} photoByPropertyId={dashboard.propertyPhotoByPropertyId} loading={dashboard.loading} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <InspectionRecentTable items={dashboard.recentItems} canEdit={canCreate} loading={dashboard.loading} />
        <InspectionPendingCard items={dashboard.pendingItems} loading={dashboard.loading} />
      </div>

      <InspectionQuickActions canCreate={canCreate} onNewInspection={() => { setShowForm(true); setShowAllList(true); }} />

      <section className="rounded-lg border border-border bg-card p-4">
        <button type="button" onClick={() => setShowAllList((v) => !v)} className="flex w-full items-center justify-between text-left text-sm font-semibold text-muted-foreground">
          Todas as vistorias
          {showAllList ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
        </button>
        {showAllList ? <div className="mt-4">
          {showForm && canCreate ? <NewInspectionForm users={users} loadingUsers={loading} onCancel={() => setShowForm(false)} onCreated={() => { setShowForm(false); setPage(1); void refresh(); void dashboard.refresh(); }} /> : null}
          {error ? <div role="alert" className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
          <div className="mb-4 flex flex-wrap items-center gap-2"><label className="text-sm font-medium" htmlFor="inspection-status">Status</label><select id="inspection-status" value={status ?? "all"} onChange={(e) => { setPage(1); setStatus(e.target.value === "all" ? undefined : e.target.value as MysqlInspectionStatus); }} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">Todos</option>{Object.entries(inspectionStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><span className="text-sm text-muted-foreground">{pagination?.total ?? 0} vistoria(s)</span></div>
          {loading ? <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando vistorias...</div> : rows.length === 0 ? <EmptyState icon={ClipboardList} title="Nenhuma vistoria encontrada" description="Crie uma vistoria vinculada a um imóvel para iniciar o acompanhamento." actionLabel={canCreate ? "Criar vistoria" : undefined} onAction={canCreate ? () => setShowForm(true) : undefined} /> : <><section className="grid gap-3 lg:grid-cols-2">{rows.map((inspection) => <Link key={inspection.id} to="/app/vistorias/$inspectionId" params={{ inspectionId: inspection.id }} className="rounded-lg border border-border bg-card p-4 transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{inspection.property?.code || "Imóvel"}</p><p className="text-sm text-muted-foreground">{inspection.property?.title || "Imóvel vinculado"}</p></div><span className="rounded-full bg-muted px-2 py-1 text-xs font-medium">{inspectionStatusLabels[inspection.status]}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Tipo</dt><dd>{inspectionTypeLabels[inspection.type]}</dd></div><div><dt className="text-xs text-muted-foreground">Responsável</dt><dd>{inspection.assigned_user?.name || "Não definido"}</dd></div><div><dt className="text-xs text-muted-foreground">Atualizada</dt><dd>{new Date(inspection.updated_at).toLocaleDateString("pt-BR")}</dd></div><div><dt className="text-xs text-muted-foreground">Versão</dt><dd>{inspection.version}</dd></div></dl></Link>)}</section><div className="mt-4 flex items-center justify-between gap-3"><button type="button" disabled={!pagination?.has_previous} onClick={() => setPage((v) => v - 1)} className="h-10 rounded-md border border-border px-3 text-sm disabled:opacity-40">Anterior</button><span className="text-sm text-muted-foreground">Página {pagination?.page ?? page} de {pagination?.total_pages || 1}</span><button type="button" disabled={!pagination?.has_next} onClick={() => setPage((v) => v + 1)} className="h-10 rounded-md border border-border px-3 text-sm disabled:opacity-40">Próxima</button></div></>}
        </div> : null}
      </section>
    </div>
  </ModulePage>;
}

// Busca server-side (código, título, endereço, cidade, bairro, proprietário).
// Antes a lista carregava só os 100 primeiros imóveis, sem busca: empresas com
// mais imóveis não conseguiam abrir vistoria para os demais.
function PropertySearchField({ selected, onSelect }: { selected: PropertySummary | null; onSelect: (property: PropertySummary | null) => void }) {
  const [term, setTerm] = useState(""); const [results, setResults] = useState<PropertySummary[]>([]); const [searching, setSearching] = useState(false); const [searchError, setSearchError] = useState<string | null>(null);
  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true); setSearchError(null);
      listProperties({ search: term.trim() || undefined, page: 1, pageSize: 20 })
        .then((page) => { if (!cancelled) setResults(page.items); })
        .catch((e) => { if (!cancelled) { setResults([]); setSearchError(getSafeApiErrorMessage(e, "Não foi possível buscar imóveis.")); } })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [term, selected]);
  if (selected) return <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-input bg-background p-3 text-sm"><span>{formatPropertySearchLabel(selected)}</span><button type="button" onClick={() => onSelect(null)} className="h-9 rounded-md border border-border px-3 text-sm">Trocar</button></div>;
  return <div className="mt-1 space-y-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><input id="inspection-property-search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Código, endereço ou título do imóvel" aria-describedby="inspection-property-search-status" className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm" /></div><p id="inspection-property-search-status" role="status" className="text-xs text-muted-foreground">{searching ? "Buscando imóveis..." : searchError ? searchError : results.length === 0 ? "Nenhum imóvel encontrado." : `${results.length} imóvel(is) — mostrando até 20; refine a busca se necessário.`}</p>{results.length > 0 ? <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">{results.map((property) => <li key={property.id}><button type="button" onClick={() => onSelect(property)} className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none">{formatPropertySearchLabel(property)}</button></li>)}</ul> : null}</div>;
}

function NewInspectionForm({
  users,
  loadingUsers,
  onCancel,
  onCreated,
}: {
  users: EligibleUser[];
  loadingUsers: boolean;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [type, setType] = useState<"entry" | "exit">("entry");
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const propertyDetail = useInspectionPropertyDetail(property?.id ?? null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!property) { setError("Selecione um imóvel."); return; }
    setSaving(true); setError(null);
    try {
      // O backend valida de novo, de forma autoritativa, quem pode ser
      // responsável (mesma empresa, ativo, elegível) — o frontend nunca
      // confia só na seleção feita aqui (ver resolveAssignee em
      // inspections-mysql.ts).
      await createMysqlInspection({ id: crypto.randomUUID(), property_id: property.id, type, ...(assignedUserId ? { assigned_user_id: assignedUserId } : {}), notes: notes.trim() || null });
      onCreated();
    } catch (e) {
      setError(getSafeApiErrorMessage(e, "Não foi possível criar a vistoria."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold">Nova vistoria</h2>
        <p className="text-sm text-muted-foreground">Busque o imóvel, defina o responsável e o tipo da vistoria.</p>
        <div className="mt-3"><InspectionStepper current="initial" /></div>
      </div>
      {error ? <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      <div className="block text-sm font-medium">
        <label htmlFor="inspection-property-search">Buscar imóvel por código, endereço ou título</label>
        <PropertySearchField selected={property} onSelect={setProperty} />
      </div>

      {property ? (
        <InspectionPropertySummaryCard property={propertyDetail.property} loading={propertyDetail.loading} error={propertyDetail.error} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <InspectionBrokerSearchField
          users={users}
          loadingUsers={loadingUsers}
          selectedUserId={assignedUserId}
          onSelect={(user) => setAssignedUserId(user?.id ?? null)}
          label="Responsável"
          inputId="new-inspection-assignee-search"
        />
        <label className="block text-sm font-medium">
          Tipo
          <select value={type} onChange={(e) => setType(e.target.value as "entry" | "exit")} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 font-normal">
            <option value="entry">Entrada</option>
            <option value="exit">Saída</option>
          </select>
        </label>
      </div>

      <label className="block text-sm font-medium">
        Observações gerais
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Opcional" className="mt-1 w-full rounded-md border border-input bg-background p-3 font-normal" />
      </label>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="h-10 rounded-md border border-border px-4 text-sm">Cancelar</button>
        <button disabled={saving || !property} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Criar vistoria
        </button>
      </div>
    </form>
  );
}
