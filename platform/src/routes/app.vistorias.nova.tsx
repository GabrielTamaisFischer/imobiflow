import { ArrowLeft, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ModulePage } from "@/components/app/module-page";
import { InspectionStepper } from "@/components/app/inspections/InspectionStepper";
import { InspectionPropertySummaryCard } from "@/components/app/inspections/InspectionPropertySummaryCard";
import { InspectionBrokerSearchField } from "@/components/app/inspections/InspectionBrokerSearchField";
import { InspectionCounterpartySearchField, type SelectedCounterparty } from "@/components/app/inspections/InspectionCounterpartySearchField";
import { useInspectionPropertyDetail } from "@/components/app/inspections/use-inspection-property-detail";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage } from "@/product/app-access";
import {
  createMysqlInspection, createMysqlItem, createMysqlRoom, getMysqlInspection, listMysqlInspections,
  type MysqlInspection,
} from "@/product/inspections";
import { listProperties, listPropertyEligibleUsers, type PropertySummary } from "@/product/real-estate";
import { formatPropertySearchLabel } from "@/product/inspection-property-search";
import type { EligibleUser } from "@/product/sharing";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/vistorias/nova")({ component: NewInspectionPage });

// Bloco 5 — "Criar vistoria de saída a partir da Entrada": funções puras
// extraídas do componente para permitir teste sem harness de renderização
// (este repositório não usa @testing-library/react — ver
// src/routes/portal.proprietario.$token.test.ts para o mesmo padrão).
//
// mergeCandidateEntries / pickDefaultReferenceEntryId decidem quais
// Entradas são elegíveis como referência e se há pré-seleção automática.
// buildStructureCopyPlan decide EXATAMENTE o que será copiado: só nomes e
// posições de ambientes/itens, nunca condition/notes/evidência — todo item
// do plano nasce com condition "not_inspected" e a ordem de chamadas segue
// o mesmo padrão de versionamento otimista usado em
// acceptSuggestedRooms (app.vistorias.$inspectionId.tsx).
export function mergeCandidateEntries(completed: MysqlInspection[], archived: MysqlInspection[]): MysqlInspection[] {
  return [...completed, ...archived];
}

export function pickDefaultReferenceEntryId(entries: MysqlInspection[]): string {
  return entries.length === 1 ? entries[0].id : "";
}

export type RoomCopyStep = { kind: "room"; expectedVersion: number; name: string; position: number; sourceRoomId: string };
export type ItemCopyStep = { kind: "item"; expectedVersion: number; name: string; position: number; condition: "not_inspected"; sourceRoomId: string; sourceItemId: string };
export type StructureCopyStep = RoomCopyStep | ItemCopyStep;

export function buildStructureCopyPlan(reference: { rooms: MysqlInspection["rooms"] }, startVersion: number): StructureCopyStep[] {
  const steps: StructureCopyStep[] = [];
  let version = startVersion;
  const sortedRooms = [...reference.rooms].sort((a, b) => a.position - b.position);
  for (const [roomIndex, sourceRoom] of sortedRooms.entries()) {
    steps.push({ kind: "room", expectedVersion: version, name: sourceRoom.name, position: roomIndex, sourceRoomId: sourceRoom.id });
    version += 1;
    const sortedItems = [...sourceRoom.items].sort((a, b) => a.position - b.position);
    for (const [itemIndex, sourceItem] of sortedItems.entries()) {
      steps.push({ kind: "item", expectedVersion: version, name: sourceItem.name, position: itemIndex, condition: "not_inspected", sourceRoomId: sourceRoom.id, sourceItemId: sourceItem.id });
      version += 1;
    }
  }
  return steps;
}

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
  const [counterparty, setCounterparty] = useState<SelectedCounterparty | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const propertyDetail = useInspectionPropertyDetail(property?.id ?? null);

  // Bloco 5 — "Criar vistoria de saída a partir da Entrada": a Entrada
  // serve só de referência para a ESTRUTURA (nomes/posições de ambientes e
  // itens), nunca para estado/observação/evidência. Candidatas = vistorias
  // de Entrada do MESMO imóvel, concluídas ou arquivadas (mesma regra de
  // elegibilidade usada na comparação Entrada×Saída). O backend já garante
  // mesma empresa via escopo de sessão em todas as chamadas abaixo.
  const [useEntryReference, setUseEntryReference] = useState(false);
  const [candidateEntries, setCandidateEntries] = useState<MysqlInspection[]>([]);
  const [loadingCandidateEntries, setLoadingCandidateEntries] = useState(false);
  const [selectedReferenceEntryId, setSelectedReferenceEntryId] = useState("");

  useEffect(() => {
    if (type !== "exit" || !property) {
      setCandidateEntries([]);
      setSelectedReferenceEntryId("");
      return;
    }
    let cancelled = false;
    setLoadingCandidateEntries(true);
    Promise.all([
      listMysqlInspections(1, 50, "completed", { type: "entry", property_id: property.id }),
      listMysqlInspections(1, 50, "archived", { type: "entry", property_id: property.id }),
    ])
      .then(([completed, archived]) => {
        if (cancelled) return;
        const entries = mergeCandidateEntries(completed.inspections, archived.inspections);
        setCandidateEntries(entries);
        setSelectedReferenceEntryId(pickDefaultReferenceEntryId(entries));
      })
      .catch(() => { if (!cancelled) setCandidateEntries([]); })
      .finally(() => { if (!cancelled) setLoadingCandidateEntries(false); });
    return () => { cancelled = true; };
  }, [type, property]);

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
        ...(counterparty
          ? {
              counterparty_party_id: counterparty.participant.party_id,
              counterparty_role: counterparty.role,
            }
          : {}),
        notes: notes.trim() || null,
      });
      // Bloco 5 — copia só a ESTRUTURA (ambientes/itens) da Entrada
      // selecionada, sequencialmente, no mesmo padrão de acceptSuggestedRooms
      // (app.vistorias.$inspectionId.tsx): cada criação bumpa a versão no
      // backend, então o contador local precisa acompanhar. Nunca copia
      // condition/notes/evidência — todo item novo nasce "not_inspected",
      // sem observação, sem foto, porque é a Saída que deve preencher isso
      // de forma independente. Falha aqui não desfaz a vistoria já criada:
      // o usuário cai na tela de detalhe e pode montar a estrutura na mão.
      if (type === "exit" && useEntryReference && selectedReferenceEntryId) {
        try {
          const reference = await getMysqlInspection(selectedReferenceEntryId);
          const plan = buildStructureCopyPlan(reference.inspection, created.inspection.version);
          const createdRoomIdBySourceRoomId = new Map<string, string>();
          for (const step of plan) {
            if (step.kind === "room") {
              const { room } = await createMysqlRoom(created.inspection.id, { id: crypto.randomUUID(), expected_version: step.expectedVersion, name: step.name, position: step.position });
              createdRoomIdBySourceRoomId.set(step.sourceRoomId, room.id);
            } else {
              const targetRoomId = createdRoomIdBySourceRoomId.get(step.sourceRoomId);
              if (!targetRoomId) continue;
              await createMysqlItem(created.inspection.id, targetRoomId, { id: crypto.randomUUID(), expected_version: step.expectedVersion, name: step.name, condition: step.condition, position: step.position });
            }
          }
        } catch (structureError) {
          setError(getSafeApiErrorMessage(structureError, "A vistoria foi criada, mas não foi possível copiar a estrutura da entrada. Monte os ambientes manualmente."));
        }
      }
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

          {property ? (
            <div className="rounded-md border border-border p-3">
              <InspectionCounterpartySearchField
                value={counterparty}
                onChange={setCounterparty}
                defaultRole={property.operation === "sale" ? "buyer" : "tenant"}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                A pessoa é vinculada pelo cadastro central (Party). Nome, documento, telefone e e-mail não são duplicados na vistoria.
              </p>
            </div>
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

          {type === "exit" && property ? (
            <div className="rounded-md border border-border p-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={useEntryReference}
                  onChange={(e) => setUseEntryReference(e.target.checked)}
                  disabled={loadingCandidateEntries || candidateEntries.length === 0}
                />
                Usar vistoria de entrada como referência
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Copia só os ambientes e itens (nomes e ordem) da entrada escolhida. Estados, observações e fotos nunca são copiados — a saída deve ser preenchida de forma independente.
              </p>
              {loadingCandidateEntries ? (
                <p className="mt-2 text-xs text-muted-foreground">Buscando entradas compatíveis...</p>
              ) : candidateEntries.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma vistoria de entrada concluída ou arquivada para este imóvel.</p>
              ) : useEntryReference ? (
                candidateEntries.length > 1 ? (
                  <label className="mt-2 block text-sm">
                    Vistoria de entrada
                    <select
                      value={selectedReferenceEntryId}
                      onChange={(e) => setSelectedReferenceEntryId(e.target.value)}
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 font-normal"
                    >
                      <option value="">Selecione...</option>
                      {candidateEntries.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.assigned_user?.name ?? "sem responsável"} · {entry.completed_at ? new Date(entry.completed_at).toLocaleDateString("pt-BR") : "sem data"}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Entrada selecionada automaticamente (única compatível).</p>
                )
              ) : null}
            </div>
          ) : null}

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
