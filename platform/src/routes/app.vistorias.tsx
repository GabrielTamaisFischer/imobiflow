import { Archive, Eye, Loader2, MoreVertical, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { InspectionStats } from "@/components/app/inspections/InspectionStats";
import { InspectionArchiveConfirmModal } from "@/components/app/inspections/InspectionArchiveConfirmModal";
import { useInspectionDashboard } from "@/components/app/inspections/use-inspection-dashboard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage, isAdministrative } from "@/product/app-access";
import {
  deleteMysqlInspection,
  listMysqlInspections,
  patchMysqlInspection,
  type MysqlInspection,
  type MysqlInspectionPage,
  type MysqlInspectionStatus,
} from "@/product/inspections";
import { inspectionStatusLabels, inspectionTypeLabels } from "@/product/inspection-dashboard";
import { overallProgress } from "@/product/inspection-progress";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/vistorias")({ component: InspectionsPage });

type TypeFilter = "entry" | "exit" | undefined;
const PAGE_SIZE = 20;

function shortAddress(property: MysqlInspection["property"]): string | null {
  if (!property) return null;
  const parts = [property.street, property.neighborhood ?? property.city].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function InspectionsPage() {
  const { session, isLoading } = useSessionGuard();
  const navigate = useNavigate();
  // app.vistorias.$inspectionId.tsx e app.vistorias.nova.tsx são rotas FILHAS
  // de /app/vistorias (nesting por arquivo com ponto) — quando qualquer uma
  // delas está ativa, esta página (o "layout"/dashboard) só precisa devolver
  // o Outlet; o próprio dashboard nunca aparece atrás da tela de detalhe ou
  // da tela de criação.
  const isChildRoute = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId !== "/app/vistorias" && match.routeId.startsWith("/app/vistorias/")),
  });
  const dashboard = useInspectionDashboard(!isLoading && Boolean(session) && !isChildRoute);

  const [rows, setRows] = useState<MysqlInspection[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<MysqlInspectionStatus | undefined>();
  const [type, setType] = useState<TypeFilter>(undefined);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [pagination, setPagination] = useState<MysqlInspectionPage["pagination"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MysqlInspection | null>(null);
  const [archiving, setArchiving] = useState(false);

  const module = getModuleByKey("inspections");
  const canCreate = canManage(session?.access.appUser, "inspections.manage");
  const canArchive = canCreate && isAdministrative(session?.access.appUser);
  const canDelete = canArchive;

  // Debounce da busca — evita 1 requisição por tecla digitada.
  useEffect(() => {
    const timer = window.setTimeout(() => { setPage(1); setSearch(searchInput.trim()); }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await listMysqlInspections(page, PAGE_SIZE, status, { type, search: search || undefined });
      setRows(result.inspections);
      setPagination(result.pagination);
    } catch (e) {
      setError(getSafeApiErrorMessage(e, "Não foi possível carregar as vistorias."));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (!isLoading && session && !isChildRoute) void refresh(); }, [isLoading, session, isChildRoute, page, status, type, search]);

  function clearFilters() { setStatus(undefined); setType(undefined); setSearchInput(""); setSearch(""); setPage(1); }
  function selectStatus(next: MysqlInspectionStatus | undefined) { setStatus(next); setPage(1); }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setArchiving(true);
    try {
      await patchMysqlInspection(archiveTarget.id, { expected_version: archiveTarget.version, status: "archived" });
      setArchiveTarget(null);
      await refresh();
      void dashboard.refresh();
    } catch (e) {
      setError(getSafeApiErrorMessage(e, "Não foi possível arquivar a vistoria."));
    } finally {
      setArchiving(false);
    }
  }

  async function deleteInspection(target: MysqlInspection) {
    if (!canDelete) return;
    const label = target.property?.code ? `Imóvel ${target.property.code}` : "esta vistoria";
    if (!window.confirm(`Excluir permanentemente a vistoria de ${label}? Esta ação remove ambientes, itens, fotos, relatórios e assinaturas vinculadas e não pode ser desfeita.`)) return;
    setError(null);
    try {
      await deleteMysqlInspection(target.id);
      await refresh();
      void dashboard.refresh();
    } catch (e) {
      setError(getSafeApiErrorMessage(e, "Não foi possível excluir a vistoria."));
    }
  }

  const hasActiveFilters = Boolean(status || type || search);
  const statusChips: Array<{ key: MysqlInspectionStatus | "all"; label: string }> = useMemo(
    () => [
      { key: "draft", label: inspectionStatusLabels.draft },
      { key: "in_progress", label: inspectionStatusLabels.in_progress },
      { key: "completed", label: inspectionStatusLabels.completed },
      { key: "archived", label: inspectionStatusLabels.archived },
    ],
    [],
  );

  if (isLoading) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Validando acesso...</main>;
  if (isChildRoute) return <Outlet />;

  return (
    <ModulePage session={session} module={module}>
      <div className="space-y-4">
        {canCreate ? (
          <div className="flex justify-end">
            <Link
              to="/app/vistorias/nova"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />Nova vistoria
            </Link>
          </div>
        ) : null}

        {dashboard.error ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{dashboard.error}</div> : null}
        <InspectionStats kpis={dashboard.kpis} loading={dashboard.loading} onSelectStatus={selectStatus} />

        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Pesquisar por código da vistoria, código do imóvel, endereço ou título"
              aria-label="Pesquisar vistorias"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {statusChips.map((chip) => {
              const active = status === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => selectStatus(status === chip.key ? undefined : (chip.key as MysqlInspectionStatus))}
                  aria-pressed={active}
                  className={`h-9 rounded-full border px-3 text-xs font-medium ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {chip.label}
                </button>
              );
            })}
            <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
            {([undefined, "entry", "exit"] as const).map((value) => {
              const active = type === value;
              return (
                <button
                  key={value ?? "all-types"}
                  type="button"
                  onClick={() => { setType(value); setPage(1); }}
                  aria-pressed={active}
                  className={`h-9 rounded-full border px-3 text-xs font-medium ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                >
                  {value ? inspectionTypeLabels[value] : "Entrada e saída"}
                </button>
              );
            })}
            {hasActiveFilters ? (
              <button type="button" onClick={clearFilters} className="h-9 rounded-md px-2 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
                Limpar filtros
              </button>
            ) : null}
          </div>
        </section>

        {error ? <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

        <section aria-label="Lista de vistorias" className="rounded-lg border border-border bg-card">
          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Carregando vistorias...
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Search}
                title={hasActiveFilters ? "Nenhuma vistoria encontrada para este filtro" : "Nenhuma vistoria encontrada"}
                description={hasActiveFilters ? "Ajuste a busca ou limpe os filtros para ver outras vistorias." : "Crie uma vistoria vinculada a um imóvel para iniciar o acompanhamento."}
                actionLabel={hasActiveFilters ? "Limpar filtros" : canCreate ? "Nova vistoria" : undefined}
                onAction={hasActiveFilters ? clearFilters : canCreate ? () => void navigate({ to: "/app/vistorias/nova" }) : undefined}
              />
            </div>
          ) : (
            <>
              {/* Cabeçalho só no desktop — no mobile cada vistoria é um card
                  autoexplicativo, sem precisar de rótulos de coluna. */}
              <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto] gap-3 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground lg:grid">
                <span>Vistoria</span>
                <span>Tipo</span>
                <span>Responsável</span>
                <span>Atualizada em</span>
                <span>Status</span>
                <span className="sr-only">Ações</span>
              </div>
              <ul className="divide-y divide-border lg:divide-y-0">
                {rows.map((inspection) => (
                  <InspectionRow
                    key={inspection.id}
                    inspection={inspection}
                    canArchive={canArchive}
                    canDelete={canDelete}
                    onArchive={() => setArchiveTarget(inspection)}
                    onDelete={() => void deleteInspection(inspection)}
                  />
                ))}
              </ul>
            </>
          )}
        </section>

        {pagination && pagination.total_pages > 1 ? (
          <div className="flex items-center justify-between gap-3">
            <button type="button" disabled={!pagination.has_previous} onClick={() => setPage((v) => v - 1)} className="h-10 rounded-md border border-border px-3 text-sm disabled:opacity-40">
              Anterior
            </button>
            <span className="text-sm text-muted-foreground">
              Página {pagination.page} de {pagination.total_pages} · {pagination.total} vistoria(s)
            </span>
            <button type="button" disabled={!pagination.has_next} onClick={() => setPage((v) => v + 1)} className="h-10 rounded-md border border-border px-3 text-sm disabled:opacity-40">
              Próxima
            </button>
          </div>
        ) : pagination ? (
          <p className="text-sm text-muted-foreground">{pagination.total} vistoria(s)</p>
        ) : null}
      </div>

      <InspectionArchiveConfirmModal
        open={Boolean(archiveTarget)}
        busy={archiving}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiveTarget(null)}
      />
    </ModulePage>
  );
}

function InspectionRow({
  inspection,
  canArchive,
  canDelete,
  onArchive,
  onDelete,
}: {
  inspection: MysqlInspection;
  canArchive: boolean;
  canDelete: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const progress = overallProgress(inspection.rooms);
  const address = shortAddress(inspection.property);
  const canArchiveThis = canArchive && inspection.status !== "archived";

  const identity = (
    <div>
      <p className="font-semibold">{inspection.property?.code ? `Imóvel ${inspection.property.code}` : "Imóvel"}</p>
      <p className="text-sm text-muted-foreground">{inspection.property?.title || "Imóvel vinculado"}</p>
      {address ? <p className="text-xs text-muted-foreground">{address}</p> : null}
    </div>
  );
  const statusBadge = <span className="whitespace-nowrap rounded-full bg-muted px-2 py-1 text-xs font-medium">{inspectionStatusLabels[inspection.status]}</span>;
  const progressLine =
    inspection.status !== "completed" && inspection.status !== "archived" && progress.total > 0 ? (
      <p className="text-xs text-muted-foreground">{progress.reviewed}/{progress.total} itens vistoriados</p>
    ) : null;

  const actionsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Mais ações" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border">
          <MoreVertical className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to="/app/vistorias/$inspectionId" params={{ inspectionId: inspection.id }}>
            <Eye className="mr-2 h-4 w-4" aria-hidden="true" />Ver vistoria
          </Link>
        </DropdownMenuItem>
        {canArchiveThis ? (
          <DropdownMenuItem onSelect={onArchive}>
            <Archive className="mr-2 h-4 w-4" aria-hidden="true" />Arquivar vistoria
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Excluir vistoria
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <li>
      <div className="hidden items-center gap-3 px-4 py-3 lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto]">
        <Link
          to="/app/vistorias/$inspectionId"
          params={{ inspectionId: inspection.id }}
          className="contents"
          aria-label={`Abrir vistoria ${inspection.property?.code ?? inspection.id}`}
        >
          <div className="rounded-md transition hover:bg-muted/40">{identity}</div>
          <span className="text-sm">{inspectionTypeLabels[inspection.type]}</span>
          <span className="text-sm">{inspection.assigned_user?.name || "Não definido"}</span>
          <span className="text-sm text-muted-foreground">{new Date(inspection.updated_at).toLocaleDateString("pt-BR")}</span>
          <div className="space-y-1">{statusBadge}{progressLine}</div>
        </Link>
        <div className="flex justify-end">{actionsMenu}</div>
      </div>

      <div className="p-4 lg:hidden">
        <Link
          to="/app/vistorias/$inspectionId"
          params={{ inspectionId: inspection.id }}
          className="block rounded-md"
          aria-label={`Abrir vistoria ${inspection.property?.code ?? inspection.id}`}
        >
          <div className="flex items-start justify-between gap-3">
            {identity}
            {statusBadge}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Tipo</dt><dd>{inspectionTypeLabels[inspection.type]}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Responsável</dt><dd>{inspection.assigned_user?.name || "Não definido"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Atualizada</dt><dd>{new Date(inspection.updated_at).toLocaleDateString("pt-BR")}</dd></div>
            {progressLine ? <div><dt className="text-xs text-muted-foreground">Progresso</dt><dd>{progress.reviewed}/{progress.total}</dd></div> : null}
          </dl>
        </Link>
        <div className="mt-3 flex justify-end">{actionsMenu}</div>
      </div>
    </li>
  );
}
