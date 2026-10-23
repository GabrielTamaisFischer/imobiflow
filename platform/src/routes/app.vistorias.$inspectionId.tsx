import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage, isAdministrative } from "@/product/app-access";
import {
  canGenerateInspectionReport, createMysqlInspectionSignature, createMysqlItem, createMysqlRoom,
  downloadMysqlInspectionReport, generateMysqlInspectionComparison, generateMysqlInspectionReport,
  getMysqlInspection, patchMysqlInspection, syncMysqlInspectionOfflineQueue,
  getMysqlInspectionComparison, downloadMysqlInspectionComparison, listMysqlInspections,
  MYSQL_ITEM_OUTCOME_LABELS, MYSQL_ROOM_OUTCOME_LABELS,
  type MysqlInspection, type MysqlInspectionComparisonResponse, type MysqlInspectionComparisonItem,
  type MysqlInspectionItemOutcome, type MysqlInspectionCondition,
} from "@/product/inspections";
import { InspectionEvidenceLightbox } from "@/components/app/inspections/InspectionEvidenceLightbox";
import type { InspectionEvidenceRow } from "@/product/inspections";
import { useSessionGuard } from "@/product/use-session-guard";
import { inspectionStatusLabels } from "@/product/inspection-dashboard";
import { listPropertyEligibleUsers } from "@/product/real-estate";
import type { EligibleUser } from "@/product/sharing";
import { inspectionOfflineConflictCount, isOfflineRuntime, pendingInspectionMutationCount } from "@/product/inspection-offline";
import { useInspectionEvidence } from "@/components/app/use-inspection-evidence";
import { useInspectionPropertyDetail } from "@/components/app/inspections/use-inspection-property-detail";
import { InspectionPropertySummaryCard } from "@/components/app/inspections/InspectionPropertySummaryCard";
import { InspectionBrokerSearchField } from "@/components/app/inspections/InspectionBrokerSearchField";
import { InspectionArchiveConfirmModal } from "@/components/app/inspections/InspectionArchiveConfirmModal";
import { InspectionCompletionModal } from "@/components/app/inspections/InspectionCompletionModal";
import { InspectionStatusBanner } from "@/components/app/inspections/InspectionStatusBanner";
import { InspectionRoomSidebar } from "@/components/app/inspections/InspectionRoomSidebar";
import { InspectionAddRoom } from "@/components/app/inspections/InspectionAddRoom";
import { InspectionSuggestedRoomsBanner } from "@/components/app/inspections/InspectionSuggestedRoomsBanner";
import { InspectionRoomWorkspace } from "@/components/app/inspections/InspectionRoomWorkspace";
import { InspectionSummaryPanel } from "@/components/app/inspections/InspectionSummaryPanel";
import { InspectionSaveStatus } from "@/components/app/inspections/InspectionSaveStatus";
import { buildInspectionPropertyBrief } from "@/product/inspection-property-brief";
import { buildSuggestedInspectionRooms } from "@/product/inspection-rooms";
import { buildSuggestedInspectionItems } from "@/product/inspection-item-presets";
import { overallProgress } from "@/product/inspection-progress";
import { pickInitialRoomId } from "@/product/inspection-room-selection";
import type { InspectionSaveStatusInput } from "@/product/inspection-save-status";

export const Route = createFileRoute("/app/vistorias/$inspectionId")({ component: InspectionDetailPageIntegrated });

function NotesEditor({ inspection, editable, onSave, saving }: { inspection: MysqlInspection; editable: boolean; onSave: (notes: string) => Promise<void>; saving: boolean }) { const [notes, setNotes] = useState(inspection.notes ?? ""); useEffect(() => setNotes(inspection.notes ?? ""), [inspection.notes]); return <section className="rounded-lg border border-border bg-card p-4"><label className="block text-sm font-medium">Observações<textarea value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} rows={4} className="mt-1 w-full rounded-md border border-input bg-background p-3 text-sm" /></label>{editable ? <button type="button" onClick={() => void onSave(notes)} disabled={saving} className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"><Save className="h-4 w-4" />Salvar observações</button> : null}</section>; }

function AssigneeEditor({ inspection, users, loadingUsers, saving, onSave }: { inspection: MysqlInspection; users: EligibleUser[]; loadingUsers: boolean; saving: boolean; onSave: (id: string | null) => Promise<void> }) {
  const [value, setValue] = useState<string | null>(inspection.assigned_user_id ?? null);
  useEffect(() => setValue(inspection.assigned_user_id ?? null), [inspection.assigned_user_id]);
  return (
    <div className="mt-4 rounded-md border border-border p-3">
      <InspectionBrokerSearchField
        users={users}
        loadingUsers={loadingUsers}
        selectedUserId={value}
        onSelect={(user) => setValue(user?.id ?? null)}
        label="Alterar responsável"
        inputId="inspection-assignee-search"
      />
      <button type="button" disabled={saving} onClick={() => void onSave(value)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
        <Save className="h-4 w-4" />Salvar responsável
      </button>
    </div>
  );
}

function InspectionDetailPageIntegrated() {
  const { inspectionId } = Route.useParams();
  const { session, isLoading } = useSessionGuard();
  const [inspection, setInspection] = useState<MysqlInspection | null>(null);
  const [users, setUsers] = useState<EligibleUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  // SUB-BLOCO 3 (ajuste) — indicador único de estado de salvamento (ver
  // InspectionSaveStatus/resolveInspectionSaveStatus). savingCount conta
  // mutações em voo desta tela (registro + ambientes/itens, via
  // onSavingChange do InspectionRoomWorkspace); justSaved é a confirmação
  // transitória "Salvo" após uma mutação do REGISTRO (responsável,
  // observações, iniciar/concluir/arquivar) terminar com sucesso.
  const [savingCount, setSavingCount] = useState(0);
  const [justSaved, setJustSaved] = useState(false);
  const justSavedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // SUB-BLOCO 3 — ambiente selecionado no workspace central; banner de
  // sugestões de ambientes (a partir do cadastro do imóvel) e estado de
  // criação em massa desses ambientes sugeridos/manuais.
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [suggestedRoomsDismissed, setSuggestedRoomsDismissed] = useState(false);
  const [creatingRooms, setCreatingRooms] = useState(false);
  const canEdit = canManage(session?.access.appUser, "inspections.manage");
  // F5G — editar o registro principal (responsável/observações gerais) e
  // arquivar exigem cargo administrativo (owner/admin/manager); corretor e
  // vistoriador continuam liberados para o trabalho operacional (ambientes,
  // itens, evidências, iniciar/concluir) mesmo tendo inspections.manage.
  // O backend reforça exatamente a mesma regra (nunca confiar só na UI).
  const canEditRecord = canEdit && isAdministrative(session?.access.appUser);
  const evidenceState = useInspectionEvidence(inspectionId, (e) => setError(getSafeApiErrorMessage(e, "Não foi possível carregar as evidências.")));
  const mutable = Boolean(inspection && inspection.status !== "completed" && inspection.status !== "archived");
  const propertyDetail = useInspectionPropertyDetail(inspection?.property_id ?? null);
  // SUB-BLOCO 3 — sugestão determinística (sem IA) de ambientes a partir do
  // cadastro do imóvel. Só é oferecida enquanto a vistoria não tiver nenhum
  // ambiente ainda (nunca sobrescreve/duplica ambientes já preenchidos).
  const propertyBrief = useMemo(() => (propertyDetail.property ? buildInspectionPropertyBrief(propertyDetail.property) : null), [propertyDetail.property]);
  const suggestedRooms = useMemo(() => (propertyBrief ? buildSuggestedInspectionRooms(propertyBrief) : []), [propertyBrief]);
  async function reload() { setLoading(true); setLoadingUsers(true); try { const [result, eligible] = await Promise.all([getMysqlInspection(inspectionId), listPropertyEligibleUsers()]); setInspection(result.inspection); setUsers(eligible.users); } catch (e) { setError(getSafeApiErrorMessage(e, "Não foi possível carregar a vistoria.")); } finally { setLoading(false); setLoadingUsers(false); } }
  useEffect(() => { if (!isLoading && session) void reload(); }, [isLoading, session, inspectionId]);
  async function refreshOfflineState() { setOffline(isOfflineRuntime()); setPending(await pendingInspectionMutationCount(inspectionId)); setConflicts(await inspectionOfflineConflictCount(inspectionId)); }
  async function syncOffline() { setSyncing(true); try { await syncMysqlInspectionOfflineQueue(inspectionId); await reload(); } finally { setSyncing(false); await refreshOfflineState(); } }
  useEffect(() => { void refreshOfflineState(); const update = () => { void refreshOfflineState(); if (!isOfflineRuntime()) void syncOffline(); }; window.addEventListener("online", update); window.addEventListener("offline", update); return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); }; }, [inspectionId]);
  // SUB-BLOCO 3 — seleção do ambiente: mantém a seleção atual enquanto ela
  // ainda existir; caso contrário (primeira carga, ou ambiente selecionado
  // foi removido), cai para pickInitialRoomId (primeiro incompleto, senão o
  // primeiro, senão nenhum). Nunca perde a seleção só porque a árvore da
  // vistoria foi atualizada (ex.: depois de marcar um item como revisado).
  useEffect(() => {
    if (!inspection) return;
    setSelectedRoomId((current) => {
      if (current && inspection.rooms.some((room) => room.id === current)) return current;
      return pickInitialRoomId(inspection.rooms);
    });
  }, [inspection]);
  useEffect(() => () => { if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current); }, []);
  function beginSaving() { setSavingCount((n) => n + 1); }
  function endSaving() { setSavingCount((n) => Math.max(0, n - 1)); }
  function endSavingWithFlash() {
    setSavingCount((n) => Math.max(0, n - 1));
    setJustSaved(true);
    if (justSavedTimeoutRef.current) clearTimeout(justSavedTimeoutRef.current);
    justSavedTimeoutRef.current = setTimeout(() => setJustSaved(false), 2500);
  }
  if (isLoading || loading) return <main className="flex min-h-screen items-center justify-center"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando vistoria...</main>;
  if (!inspection) return <ModulePage session={session} module={getModuleByKey("inspections")}><p role="alert">{error || "Vistoria não encontrada."}</p></ModulePage>;
  const currentInspection = inspection;
  async function saveAssignee(id: string | null) { beginSaving(); try { setInspection((await patchMysqlInspection(currentInspection.id, { expected_version: currentInspection.version, assigned_user_id: id })).inspection); endSavingWithFlash(); } catch (e) { endSaving(); setError(getSafeApiErrorMessage(e, "Não foi possível salvar o responsável.")); if ((e as { code?: string }).code === "INSPECTION_VERSION_CONFLICT") void reload(); } }
  async function saveNotes(notes: string) { beginSaving(); try { setInspection((await patchMysqlInspection(currentInspection.id, { expected_version: currentInspection.version, notes })).inspection); endSavingWithFlash(); } catch (e) { endSaving(); setError(getSafeApiErrorMessage(e, "Não foi possível salvar.")); if ((e as { code?: string }).code === "INSPECTION_VERSION_CONFLICT") void reload(); } }
  async function move(status: "in_progress" | "completed" | "archived") {
    beginSaving();
    try {
      setInspection((await patchMysqlInspection(currentInspection.id, { expected_version: currentInspection.version, status })).inspection);
      endSavingWithFlash();
    } catch (e) {
      endSaving();
      setError(getSafeApiErrorMessage(e, "Não foi possível alterar o status."));
      if ((e as { code?: string }).code === "INSPECTION_VERSION_CONFLICT") void reload();
    }
  }
  // SUB-BLOCO 3 — a regra de negócio de conclusão (status completed) não
  // muda; a UI apenas avisa, com confirmação, quando ainda há itens não
  // revisados, para evitar uma conclusão acidental.
  // SUB-BLOCO 3/4 — a regra de negócio de conclusão (status completed) não
  // muda; a UI apenas avisa, com um modal (não mais window.confirm), quando
  // ainda há itens não revisados, para evitar uma conclusão acidental.
  // Concluir sempre exige conexão (patchMysqlInspection bloqueia offline para
  // completed/archived) — avisamos antes de tentar, em vez de deixar o
  // usuário descobrir isso só depois do clique.
  function completeWithConfirmation() {
    if (offline) { setError("Concluir a vistoria exige conexão com a internet. Você pode continuar revisando os itens offline e concluir quando a conexão voltar."); return; }
    const progress = overallProgress(currentInspection.rooms);
    const pendingItems = progress.total - progress.reviewed;
    if (pendingItems > 0) { setCompletionModalOpen(true); return; }
    void move("completed");
  }
  function confirmCompleteWithPending() {
    setCompletionModalOpen(false);
    void move("completed");
  }
  async function archiveInspection() {
    if (currentInspection.status === "archived") return;
    setArchiving(true);
    beginSaving();
    try {
      setInspection((await patchMysqlInspection(currentInspection.id, { expected_version: currentInspection.version, status: "archived" })).inspection);
      setArchiveModalOpen(false);
      endSavingWithFlash();
    } catch (e) {
      endSaving();
      handleMutationError(e);
    } finally {
      setArchiving(false);
    }
  }
  function handleMutationError(e: unknown) { const code = (e as { code?: string }).code; if (code === "INSPECTION_VERSION_CONFLICT") { setError("Esta vistoria foi atualizada em outra sessão. Atualizamos os dados para você."); void reload(); return; } if (code === "INSPECTION_NOT_MUTABLE") { setError("Esta vistoria não pode mais ser alterada."); void reload(); return; } setError(getSafeApiErrorMessage(e, "Não foi possível salvar.")); }
  // SUB-BLOCO 3 — aceitar sugestões cria os ambientes (e os itens padrão de
  // cada categoria) sequencialmente; expected_version é incrementado
  // localmente a cada chamada (mesma convenção de InspectionRoomWorkspace,
  // já que criar ambiente/item sempre bumpa a versão no backend) e, ao
  // final, um refetch garante que o estado local bata com o servidor.
  async function acceptSuggestedRooms(selectedNames: string[]) {
    setCreatingRooms(true);
    try {
      let version = currentInspection.version;
      let position = currentInspection.rooms.length;
      for (const name of selectedNames) {
        const { room } = await createMysqlRoom(currentInspection.id, { id: crypto.randomUUID(), expected_version: version, name, position });
        version += 1;
        position += 1;
        const presetItems = buildSuggestedInspectionItems(name);
        for (const [itemIndex, itemName] of presetItems.entries()) {
          await createMysqlItem(currentInspection.id, room.id, { id: crypto.randomUUID(), expected_version: version, name: itemName, condition: "not_inspected", position: itemIndex });
          version += 1;
        }
      }
      const refreshed = await getMysqlInspection(currentInspection.id);
      setInspection(refreshed.inspection);
      setSuggestedRoomsDismissed(true);
      const created = refreshed.inspection.rooms.find((room) => selectedNames.includes(room.name));
      setSelectedRoomId(created?.id ?? pickInitialRoomId(refreshed.inspection.rooms));
    } catch (e) {
      handleMutationError(e);
    } finally {
      setCreatingRooms(false);
    }
  }
  async function addRoomManually(name: string) {
    setCreatingRooms(true);
    try {
      const { room } = await createMysqlRoom(currentInspection.id, { id: crypto.randomUUID(), expected_version: currentInspection.version, name, position: currentInspection.rooms.length });
      const refreshed = await getMysqlInspection(currentInspection.id);
      setInspection(refreshed.inspection);
      setSelectedRoomId(room.id);
    } catch (e) {
      handleMutationError(e);
    } finally {
      setCreatingRooms(false);
    }
  }
  function handleRoomRemoved(roomId: string) {
    setSelectedRoomId((current) => (current === roomId ? null : current));
  }
  const saving = savingCount > 0;
  // SUB-BLOCO 3 (ajuste) — um único indicador de salvamento no cabeçalho,
  // derivado só de sinais reais (ver resolveInspectionSaveStatus): nunca
  // mostra "Salvo"/"Sincronizado" com fila pendente ou conflito em aberto.
  const saveStatusInput: InspectionSaveStatusInput = { saving, justSaved, offline, pending, conflicts, syncing };
  const showSuggestedRoomsBanner = canEdit && mutable && currentInspection.rooms.length === 0 && suggestedRooms.length > 0 && !suggestedRoomsDismissed;
  const selectedRoom = currentInspection.rooms.find((room) => room.id === selectedRoomId) ?? null;
  const mainContent = showSuggestedRoomsBanner ? (
    <InspectionSuggestedRoomsBanner suggestions={suggestedRooms} busy={creatingRooms} onAccept={acceptSuggestedRooms} onDismiss={() => setSuggestedRoomsDismissed(true)} />
  ) : selectedRoom ? (
    <InspectionRoomWorkspace
      inspection={currentInspection}
      room={selectedRoom}
      canEdit={canEdit && mutable}
      evidence={evidenceState.evidence}
      evidenceLoading={evidenceState.loading}
      onEvidenceChanged={evidenceState.refresh}
      onChanged={setInspection}
      onRoomRemoved={handleRoomRemoved}
      onError={handleMutationError}
      onSavingChange={(savingNow) => (savingNow ? beginSaving() : endSaving())}
    />
  ) : (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
      {currentInspection.rooms.length === 0 ? "Nenhum ambiente adicionado ainda." : "Selecione um ambiente para ver os itens."}
    </p>
  );
  return (
    <ModulePage session={session} module={getModuleByKey("inspections")}>
      <Link to="/app/vistorias" className="mb-4 inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm">
        <ArrowLeft className="mr-1 h-4 w-4" />Vistorias
      </Link>
      <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
        <InspectionSaveStatus {...saveStatusInput} />
        {pending > 0 && !offline && !syncing ? <button type="button" onClick={() => void syncOffline()} className="h-9 rounded-md border border-border px-3 text-sm">Sincronizar agora</button> : null}
      </div>
      <div className="space-y-4">
        <header className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{inspection.property?.code || "Vistoria"}</h1>
              <p className="text-sm text-muted-foreground">{inspection.property?.title || "Imóvel vinculado"}</p>
              <p className="mt-2 text-sm">Status: {inspectionStatusLabels[inspection.status]}</p>
            </div>
            {canEditRecord ? (
              <div className="flex flex-wrap gap-2">
                {mutable ? (
                  <button type="button" onClick={() => setEditMode((v) => !v)} className="h-9 rounded-md border border-border px-3 text-sm font-medium">
                    {editMode ? "Concluir edição" : "Editar vistoria"}
                  </button>
                ) : null}
                {inspection.status !== "archived" ? (
                  <button type="button" onClick={() => setArchiveModalOpen(true)} className="h-9 rounded-md border border-destructive/40 px-3 text-sm font-medium text-destructive">
                    Arquivar vistoria
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {!editMode || !canEditRecord || !mutable ? (
            <p className="mt-2 text-sm">Responsável: {inspection.assigned_user?.name || "Não definido"}</p>
          ) : (
            <AssigneeEditor inspection={inspection} users={users} loadingUsers={loadingUsers} saving={false} onSave={saveAssignee} />
          )}
        </header>

        <InspectionStatusBanner status={currentInspection.status} />

        <InspectionPropertySummaryCard property={propertyDetail.property} loading={propertyDetail.loading} error={propertyDetail.error} />

        {error ? <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
        <InspectionF5FActions inspection={inspection} canEdit={canEdit} onError={handleMutationError} />
        <NotesEditor inspection={inspection} editable={canEditRecord && mutable && editMode} onSave={saveNotes} saving={false} />

        {/* SUB-BLOCO 3 — mobile/tablet (<lg): seletor de ambientes em pills,
            workspace central e resumo como accordion. */}
        <div className="space-y-4 lg:hidden">
          <InspectionRoomSidebar rooms={currentInspection.rooms} selectedRoomId={selectedRoomId} onSelect={setSelectedRoomId} variant="pills" />
          {canEdit && mutable ? <InspectionAddRoom onAdd={addRoomManually} busy={creatingRooms} /> : null}
          {mainContent}
          <details className="rounded-lg border border-border bg-card">
            <summary className="cursor-pointer p-3 text-sm font-semibold">Resumo da vistoria</summary>
            <div className="border-t border-border p-3">
              <InspectionSummaryPanel inspection={currentInspection} evidence={evidenceState.evidence} canEdit={canEdit} mutable={mutable} busy={saving} onStart={() => void move("in_progress")} onComplete={completeWithConfirmation} />
            </div>
          </details>
        </div>

        {/* SUB-BLOCO 3 — desktop (>=lg): ambientes à esquerda, itens do
            ambiente no centro, resumo/progresso à direita. */}
        <div className="hidden gap-4 lg:grid lg:grid-cols-[220px_1fr_280px]">
          <div className="space-y-3">
            <InspectionRoomSidebar rooms={currentInspection.rooms} selectedRoomId={selectedRoomId} onSelect={setSelectedRoomId} variant="sidebar" />
            {canEdit && mutable ? <InspectionAddRoom onAdd={addRoomManually} busy={creatingRooms} /> : null}
          </div>
          <div className="rounded-lg border border-border bg-card p-4">{mainContent}</div>
          <InspectionSummaryPanel inspection={currentInspection} evidence={evidenceState.evidence} canEdit={canEdit} mutable={mutable} busy={saving} onStart={() => void move("in_progress")} onComplete={completeWithConfirmation} />
        </div>
      </div>
      <InspectionArchiveConfirmModal open={archiveModalOpen} busy={archiving} onConfirm={() => void archiveInspection()} onCancel={() => setArchiveModalOpen(false)} />
      <InspectionCompletionModal
        open={completionModalOpen}
        busy={saving}
        pendingCount={overallProgress(currentInspection.rooms).total - overallProgress(currentInspection.rooms).reviewed}
        onConfirm={confirmCompleteWithPending}
        onCancel={() => setCompletionModalOpen(false)}
      />
    </ModulePage>
  );
}


/**
 * Bloco 5 - Comparacao Entrada x Saida.
 *
 * Labels PT-BR de condicao dos itens, so para apresentacao (o dominio real
 * tem 7 valores - ver inspection-item-status.ts - a comparacao so LE,
 * nunca grava, entao pode mostrar todos os 7, nao so os 4 do picker).
 */
export const COMPARISON_CONDITION_LABELS: Record<MysqlInspectionCondition, string> = {
  not_inspected: "Nao vistoriado",
  excellent: "Otimo",
  good: "Bom",
  fair: "Atencao",
  poor: "Ruim",
  damaged: "Avaria",
  not_applicable: "Nao se aplica",
};

export type ComparisonFilterKey = "all" | "changed" | "same" | "better" | "worse" | "new" | "with_photos";
export const COMPARISON_FILTERS: Array<{ key: ComparisonFilterKey; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "changed", label: "Alterados" },
  { key: "same", label: "Sem alteracao" },
  { key: "worse", label: "Pior estado" },
  { key: "better", label: "Melhor estado" },
  { key: "new", label: "Novos" },
  { key: "with_photos", label: "Com fotos" },
];
export function itemMatchesComparisonFilter(item: MysqlInspectionComparisonItem, filter: ComparisonFilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "with_photos") return item.entry_evidence.length > 0 || item.exit_evidence.length > 0;
  if (filter === "new") return item.outcome === "new" || item.outcome === "absent";
  if (filter === "changed") return item.changed;
  return item.outcome === (filter as MysqlInspectionItemOutcome);
}

// Bloco 5 — decisao do botao contextual de comparacao (nunca generico na
// dashboard, sempre dentro da vistoria). Extraida como funcao pura para
// teste sem harness de renderizacao, seguindo o padrao de
// portal.proprietario.$token.test.ts (ver nova.test.ts no mesmo Bloco 5).
//
//   - Saida com comparacao ja existente -> alternar exibicao (ver/ocultar).
//   - Saida sem comparacao, elegivel (completed/archived) e com >=1 Entrada
//     candidata do mesmo imovel -> selecionar e comparar.
//   - Saida sem nenhuma Entrada candidata, ou nao elegivel -> nenhum botao.
//   - Entrada com uma comparacao ja feita contra alguma Saida -> ver.
//   - Entrada sem nenhuma comparacao feita, ou vistoria em outro tipo
//     irrelevante -> nenhum botao.
export type ComparisonButtonMode =
  | { kind: "none" }
  | { kind: "toggle_view"; viewingAs: "exit" | "entry" }
  | { kind: "select_and_compare"; candidateCount: number; requiresSelection: boolean };

export function resolveComparisonButtonMode(params: {
  inspectionType: "entry" | "exit";
  hasActiveComparison: boolean;
  canCompare: boolean;
  candidateEntryCount: number;
}): ComparisonButtonMode {
  const { inspectionType, hasActiveComparison, canCompare, candidateEntryCount } = params;
  if (inspectionType === "exit") {
    if (hasActiveComparison) return { kind: "toggle_view", viewingAs: "exit" };
    if (canCompare && candidateEntryCount > 0) {
      return { kind: "select_and_compare", candidateCount: candidateEntryCount, requiresSelection: candidateEntryCount > 1 };
    }
    return { kind: "none" };
  }
  // inspectionType === "entry"
  if (hasActiveComparison) return { kind: "toggle_view", viewingAs: "entry" };
  return { kind: "none" };
}

/** Linha de fotos Entrada|Saida de um ambiente ou item - lado a lado no
 * desktop, empilhada no mobile (grid-cols-1 sm:grid-cols-2), sempre com o
 * rotulo do lado visivel. Abre em lightbox ao clicar; associacao e 100%
 * deterministica (vem pronta do backend via id de ambiente/item). */
function ComparisonPhotoRow({ entryEvidence, exitEvidence, onOpen }: { entryEvidence: InspectionEvidenceRow[]; exitEvidence: InspectionEvidenceRow[]; onOpen: (rows: InspectionEvidenceRow[], index: number) => void }) {
  if (entryEvidence.length === 0 && exitEvidence.length === 0) return null;
  function Thumbs({ label, rows }: { label: string; rows: InspectionEvidenceRow[] }) {
    if (rows.length === 0) return <div className="text-xs text-muted-foreground">{label}: sem fotos</div>;
    return (
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
        <div className="flex flex-wrap gap-2">
          {rows.map((evidence, index) => (
            <button key={evidence.id} type="button" onClick={() => onOpen(rows, index)} className="block h-16 w-16 overflow-hidden rounded border border-border">
              {evidence.signed_url ? <img src={evidence.signed_url} alt={evidence.caption ?? evidence.file_name ?? "foto"} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">sem preview</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 grid gap-3 sm:grid-cols-2">
      <Thumbs label="Entrada" rows={entryEvidence} />
      <Thumbs label="Saida" rows={exitEvidence} />
    </div>
  );
}

function InspectionComparisonPanel({ data, exitInspectionId, filter, onFilterChange }: { data: MysqlInspectionComparisonResponse; exitInspectionId: string; filter: ComparisonFilterKey; onFilterChange: (filter: ComparisonFilterKey) => void }) {
  const [lightbox, setLightbox] = useState<{ rows: InspectionEvidenceRow[]; index: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  async function downloadComparisonPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, fileName } = await downloadMysqlInspectionComparison(exitInspectionId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }
  const { comparison, summary } = data;
  const visibleRooms = comparison.rooms
    .map((room) => ({ ...room, items: room.items.filter((item) => itemMatchesComparisonFilter(item, filter)) }))
    .filter((room) => filter === "all" || room.items.length > 0);
  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <div>
        <h3 className="text-base font-semibold">Comparacao Entrada x Saida</h3>
        <p className="mt-1 text-xs text-muted-foreground">{data.disclaimer}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {([
          ["Itens", summary.total],
          ["Sem alteracao", summary.same],
          ["Alterados", summary.changed],
          ["Melhor estado", summary.better],
          ["Pior estado", summary.worse],
          ["Novos", summary.new],
          ["Ausentes", summary.absent],
          ["Nao comparaveis", summary.not_comparable],
        ] as Array<[string, number]>).map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-muted/30 p-2 text-center">
            <p className="text-lg font-semibold leading-none">{value}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {COMPARISON_FILTERS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => onFilterChange(key)} className={`h-9 rounded-md border px-3 text-xs ${filter === key ? "bg-muted font-semibold" : "border-border"}`}>{label}</button>
        ))}
      </div>
      <div className="space-y-3">
        {visibleRooms.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum item corresponde a este filtro.</p> : null}
        {visibleRooms.map((room) => (
          <div key={`${room.entry_room_id ?? ""}-${room.exit_room_id ?? ""}-${room.name}`} className="rounded-md border border-border p-3">
            <p className="text-sm font-semibold">{room.name} <span className="ml-2 text-xs font-normal text-muted-foreground">{MYSQL_ROOM_OUTCOME_LABELS[room.outcome]}</span></p>
            <ComparisonPhotoRow entryEvidence={room.entry_evidence} exitEvidence={room.exit_evidence} onOpen={(rows, index) => setLightbox({ rows, index })} />
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              {room.items.map((item) => (
                <div key={`${item.entry_item_id ?? ""}-${item.exit_item_id ?? ""}-${item.name}`} className="text-sm">
                  <p>
                    <span className="font-medium">{item.name}</span>
                    <span className="ml-2 text-muted-foreground">
                      {item.entry ? COMPARISON_CONDITION_LABELS[item.entry] : "-"} {"→"} {item.exit ? COMPARISON_CONDITION_LABELS[item.exit] : "-"}
                    </span>
                    <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs">{MYSQL_ITEM_OUTCOME_LABELS[item.outcome]}</span>
                  </p>
                  <ComparisonPhotoRow entryEvidence={item.entry_evidence} exitEvidence={item.exit_evidence} onOpen={(rows, index) => setLightbox({ rows, index })} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <button type="button" disabled={downloading} onClick={() => void downloadComparisonPdf()} className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50">
          {downloading ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}Baixar relatorio comparativo
        </button>
      </div>
      {lightbox ? <InspectionEvidenceLightbox rows={lightbox.rows} index={lightbox.index} contextLabel="Comparacao Entrada x Saida" onNavigate={(index) => setLightbox((current) => (current ? { ...current, index } : current))} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

function InspectionF5FActions({ inspection, canEdit, onError }: { inspection: MysqlInspection; canEdit: boolean; onError: (error: unknown) => void }) {
  const canReport = canGenerateInspectionReport(inspection.status, canEdit);
  const [busy, setBusy] = useState(false); const [report, setReport] = useState<{ signed_url: string | null } | null>(null); const [signer, setSigner] = useState(""); const [signature, setSignature] = useState("");
  // Trava sincrona: `disabled` so vale apos o proximo render, entao cliques
  // no mesmo tick (duplo toque) disparavam varios POSTs de laudo.
  const inFlight = useRef(false);
  async function exclusive(run: () => Promise<void>) { if (inFlight.current) return; inFlight.current = true; setBusy(true); try { await run(); } finally { inFlight.current = false; setBusy(false); } }
  async function generate() { await exclusive(async () => { try { const result = await generateMysqlInspectionReport(inspection.id); setReport(result.report); } catch (error) { onError(error); } }); }
  // Sub-bloco 5B - download real do laudo (bytes autenticados), nao mais um
  // link para signed_url (que e null hoje para os providers Local/R2). A
  // trava `downloading` evita duplo clique disparando dois downloads.
  const [downloading, setDownloading] = useState(false);
  async function downloadPdf() {
    if (downloading) return;
    setDownloading(true);
    try {
      const { blob, fileName } = await downloadMysqlInspectionReport(inspection.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(error);
    } finally {
      setDownloading(false);
    }
  }
  async function sign() { if (!signer || !signature) return; await exclusive(async () => { try { await createMysqlInspectionSignature(inspection.id, { signer_name: signer, signer_role: "responsible", accepted_terms: true, signature_base64: signature }); setSigner(""); setSignature(""); } catch (error) { onError(error); } }); }

  // Bloco 5 - estado da comparacao Entrada x Saida. `activeComparison` e o
  // que esta exibido no painel (seja a comparacao ja existente, carregada
  // via GET sem efeito colateral, seja uma recem-gerada via POST).
  const [activeComparison, setActiveComparison] = useState<MysqlInspectionComparisonResponse | null>(null);
  const [activeExitId, setActiveExitId] = useState<string | null>(null);
  const [comparisonFilter, setComparisonFilter] = useState<ComparisonFilterKey>("all");
  const [panelOpen, setPanelOpen] = useState(false);
  const [loadingContext, setLoadingContext] = useState(true);
  // SAIDA: entradas do mesmo imovel, compativeis para comparar.
  const [candidateEntries, setCandidateEntries] = useState<MysqlInspection[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const canCompare = inspection.type === "exit" && (inspection.status === "completed" || inspection.status === "archived");

  useEffect(() => {
    let cancelled = false;
    async function loadContext() {
      setLoadingContext(true);
      try {
        if (inspection.type === "exit") {
          const existing = await getMysqlInspectionComparison(inspection.id);
          if (cancelled) return;
          if (existing) {
            setActiveComparison(existing);
            setActiveExitId(inspection.id);
            return;
          }
          if (!canCompare) return;
          const [completed, archived] = await Promise.all([
            listMysqlInspections(1, 50, "completed", { type: "entry", property_id: inspection.property_id }),
            listMysqlInspections(1, 50, "archived", { type: "entry", property_id: inspection.property_id }),
          ]);
          if (cancelled) return;
          const entries = [...completed.inspections, ...archived.inspections];
          setCandidateEntries(entries);
          if (entries.length === 1) setSelectedEntryId(entries[0].id);
        } else if (inspection.type === "entry") {
          const [completed, archived, inProgress, draft] = await Promise.all([
            listMysqlInspections(1, 50, "completed", { type: "exit", property_id: inspection.property_id }),
            listMysqlInspections(1, 50, "archived", { type: "exit", property_id: inspection.property_id }),
            listMysqlInspections(1, 50, "in_progress", { type: "exit", property_id: inspection.property_id }),
            listMysqlInspections(1, 50, "draft", { type: "exit", property_id: inspection.property_id }),
          ]);
          if (cancelled) return;
          const exits = [...completed.inspections, ...archived.inspections, ...inProgress.inspections, ...draft.inspections];
          for (const exit of exits) {
            const result = await getMysqlInspectionComparison(exit.id);
            if (cancelled) return;
            if (result && result.comparison.entry_inspection_id === inspection.id) {
              setActiveComparison(result);
              setActiveExitId(exit.id);
              break;
            }
          }
        }
      } catch (error) {
        if (!cancelled) onError(error);
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    }
    void loadContext();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspection.id, inspection.type, inspection.property_id, inspection.status]);

  async function compare() {
    if (!selectedEntryId) return;
    await exclusive(async () => {
      try {
        const result = await generateMysqlInspectionComparison(inspection.id, selectedEntryId);
        setActiveComparison(result);
        setActiveExitId(inspection.id);
        setPanelOpen(true);
      } catch (error) {
        onError(error);
      }
    });
  }

  // Botao contextual: nunca mostrado na dashboard, so aqui dentro da
  // vistoria, e nunca desabilitado ocupando espaco sem utilidade. A decisao
  // de QUAL variante mostrar (ou nenhuma) vem de resolveComparisonButtonMode
  // (funcao pura, testada em app.vistorias.$inspectionId.test.ts) — aqui só
  // traduzimos o modo resolvido para JSX.
  const comparisonButtonMode = resolveComparisonButtonMode({
    inspectionType: inspection.type,
    hasActiveComparison: Boolean(activeComparison),
    canCompare,
    candidateEntryCount: candidateEntries.length,
  });
  let comparisonButton: ReactNode = null;
  if (comparisonButtonMode.kind === "toggle_view") {
    const label = comparisonButtonMode.viewingAs === "entry" ? "Ver comparacao Entrada x Saida" : "Ver comparacao";
    comparisonButton = <button type="button" onClick={() => setPanelOpen((v) => !v)} className="h-10 rounded-md border border-border px-3 text-sm font-medium">{panelOpen ? "Ocultar comparacao" : label}</button>;
  } else if (comparisonButtonMode.kind === "select_and_compare") {
    comparisonButton = (
      <div className="flex flex-wrap items-end gap-2">
        {comparisonButtonMode.requiresSelection ? (
          <label className="text-sm">Vistoria de entrada
            <select value={selectedEntryId} onChange={(event) => setSelectedEntryId(event.target.value)} className="mt-1 h-10 rounded-md border border-input px-2 text-sm">
              <option value="">Selecione...</option>
              {candidateEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.property?.code ?? entry.id.slice(0, 8)} - {entry.assigned_user?.name ?? "sem responsavel"}</option>)}
            </select>
          </label>
        ) : null}
        <button type="button" disabled={busy || !selectedEntryId} onClick={() => void compare()} className="h-10 rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50">{busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}Comparar com vistoria de entrada</button>
      </div>
    );
  }

  return <section className="space-y-3 rounded-lg border border-border bg-card p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Documentos</h2><button type="button" disabled={busy || !canReport} onClick={() => void generate()} aria-describedby={canReport ? undefined : "inspection-report-hint"} className="h-10 rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50">{busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}Exportar PDF</button>{report ? <button type="button" disabled={downloading} onClick={() => void downloadPdf()} className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50">{downloading ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}Baixar laudo (PDF)</button> : null}</div>{canEdit && !canReport ? <p id="inspection-report-hint" className="text-xs text-muted-foreground">O laudo fica disponivel depois que a vistoria for concluida.</p> : null}{canEdit && inspection.status === "completed" ? <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Nome do signatario<input value={signer} onChange={(event) => setSigner(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input px-3" /></label><label className="text-sm">Imagem da assinatura<input type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setSignature(String(reader.result)); reader.readAsDataURL(file); }} className="mt-1 block w-full text-sm" /></label><button type="button" disabled={busy || !signer || !signature} onClick={() => void sign()} className="h-10 rounded-md border border-border px-3 text-sm sm:col-span-2">Registrar assinatura eletronica simples</button></div> : null}

    {!loadingContext && comparisonButton ? <div className="border-t border-border pt-3">{comparisonButton}</div> : null}
    {panelOpen && activeComparison && activeExitId ? <InspectionComparisonPanel data={activeComparison} exitInspectionId={activeExitId} filter={comparisonFilter} onFilterChange={setComparisonFilter} /> : null}

    <p className="text-xs text-muted-foreground">A comparacao aponta diferencas registradas entre as vistorias e nao atribui responsabilidade. Relatorios e assinaturas exigem conexao e sao armazenados como documentos privados.</p></section>;
}
