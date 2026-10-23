import { ArrowLeft, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ModulePage } from "@/components/app/module-page";
import { InspectionStepper } from "@/components/app/inspections/InspectionStepper";
import { InspectionPropertySummaryCard } from "@/components/app/inspections/InspectionPropertySummaryCard";
import { InspectionBrokerSearchField } from "@/components/app/inspections/InspectionBrokerSearchField";
import { useInspectionPropertyDetail } from "@/components/app/inspections/use-inspection-property-detail";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage } from "@/product/app-access";
import { createMysqlInspection } from "@/product/inspections";
import { listProperties, listPropertyEligibleUsers, type PropertySummary } from "@/product/real-estate";
import { formatPropertySearchLabel } from "@/product/inspection-property-search";
import type { EligibleUser } from "@/product/sharing";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/vistorias/nova")({ component: NewInspectionPage });

// Busca server-side (código, título, endereço, cidade, bairro, proprietário)
// — igual à usada no formulário antigo inline, só movida para a rota
// dedicada /app/vistorias/nova.
function PropertySearchField({ selected, onSelect }: { selected: PropertySummary | null; onSelect: (property: PropertySummary | null) => void }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PropertySummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      listProperties({ search: term.trim() || undefined, page: 1, pageSize: 20 })
        .then((page) => { if (!cancelled) setResults(page.items); })
        .catch((e) => { if (!cancelled) { setResults([]); setSearchError(getSafeApiErrorMessage(e, "Não foi possível buscar imóveis.")); } })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [term, selected]);

  if (selected) {
    return (
      <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-input bg-background p-3 text-sm">
        <span>{formatPropertySearchLabel(selected)}</span>
        <button type="button" onClick={() => onSelect(null)} className="h-9 rounded-md border border-border px-3 text-sm">Trocar</button>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          id="new-inspection-property-search"
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Código, endereço ou título do imóvel"
          aria-describedby="new-inspection-property-search-status"
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
        />
      </div>
      <p id="new-inspection-property-search-status" role="status" className="text-xs text-muted-foreground">
        {searching ? "Buscando imóveis..." : searchError ? searchError : results.length === 0 ? "Nenhum imóvel encontrado." : `${results.length} imóvel(is) — mostrando até 20; refine a busca se necessário.`}
      </p>
      {results.length > 0 ? (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {results.map((property) => (
            <li key={property.id}>
              <button type="button" onClick={() => onSelect(property)} className="block min-h-11 w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none">
                {formatPropertySearchLabel(property)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function NewInspectionPage() {
  const { session, isLoading } = useSessionGuard();
  const navigate = useNavigate();
  const canCreate = canManage(session?.access.appUser, "inspections.manage");

  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [property, setProperty] = useState<PropertySummary | null>(null);
  const [type, setType] = useState<"entry" | "exit">("entry");
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const propertyDetail = useInspectionPropertyDetail(property?.id ?? null);

  useEffect(() => {
    if (isLoading || !session) return;
    let cancelled = false;
    setLoadingUsers(true);
    listPropertyEligibleUsers()
      .then((result) => { if (!cancelled) setUsers(result.users); })
      .catch(() => { /* seleção manual de responsável continua opcional sem a lista */ })
      .finally(() => { if (!cancelled) setLoadingUsers(false); });
    return () => { cancelled = true; };
  }, [isLoading, session]);

  if (isLoading) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Validando acesso...</main>;

  const module = getModuleByKey("inspections");

  if (!canCreate) {
    return (
      <ModulePage session={session} module={module}>
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Você não tem permissão para criar vistorias.
        </p>
      </ModulePage>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!property) { setError("Selecione um imóvel."); return; }
    setSaving(true);
    setError(null);
    try {
      // O backend valida de novo, de forma autoritativa, quem pode ser
      // responsável (mesma empresa, ativo, elegível) — o frontend nunca
      // confia só na seleção feita aqui (ver resolveAssignee em
      // inspections-mysql.ts).
      const created = await createMysqlInspection({
        id: crypto.randomUUID(),
        property_id: property.id,
        type,
        ...(assignedUserId ? { assigned_user_id: assignedUserId } : {}),
        notes: notes.trim() || null,
      });
      void navigate({ to: "/app/vistorias/$inspectionId", params: { inspectionId: created.inspection.id } });
    } catch (e) {
      setError(getSafeApiErrorMessage(e, "Não foi possível criar a vistoria."));
      setSaving(false);
    }
  }

  return (
    <ModulePage session={session} module={module}>
      <a
        href="/app/vistorias"
        onClick={(event) => { event.preventDefault(); void navigate({ to: "/app/vistorias" }); }}
        className="mb-4 inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Vistorias
      </a>

      <div className="space-y-4">
        <header>
          <h1 className="text-xl font-semibold">Nova vistoria</h1>
          <p className="text-sm text-muted-foreground">Selecione o imóvel e prepare a vistoria.</p>
          <div className="mt-3">
            <InspectionStepper current="initial" reachable={["initial"]} />
          </div>
        </header>

        <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-4">
          {error ? <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

          <div className="block text-sm font-medium">
            <label htmlFor="new-inspection-property-search">Buscar imóvel por código, endereço ou título</label>
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

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => void navigate({ to: "/app/vistorias" })} className="h-10 rounded-md border border-border px-4 text-sm">
              Cancelar
            </button>
            <button disabled={saving || !property} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Criar vistoria
            </button>
          </div>
        </form>
      </div>
    </ModulePage>
  );
}
