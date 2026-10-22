import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { canManage, getSafeApiErrorMessage, isAdministrative } from "@/product/app-access";
import { canGenerateInspectionReport, createMysqlInspectionSignature, createMysqlItem, createMysqlRoom, downloadMysqlInspectionReport, generateMysqlInspectionComparison, generateMysqlInspectionReport, getMysqlInspection, patchMysqlInspection, syncMysqlInspectionOfflineQueue, type MysqlInspection } from "@/product/inspections";
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
                    Apagar vistoria
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

function InspectionF5FActions({ inspection, canEdit, onError }: { inspection: MysqlInspection; canEdit: boolean; onError: (error: unknown) => void }) {
  const canReport = canGenerateInspectionReport(inspection.status, canEdit);
  const [busy, setBusy] = useState(false); const [report, setReport] = useState<{ signed_url: string | null } | null>(null); const [comparison, setComparison] = useState<any>(null); const [comparisonFilter, setComparisonFilter] = useState("all"); const [signer, setSigner] = useState(""); const [signature, setSignature] = useState(""); const [baseline, setBaseline] = useState("");
  // Trava síncrona: `disabled` só vale após o próximo render, então cliques
  // no mesmo tick (duplo toque) disparavam vários POSTs de laudo.
  const inFlight = useRef(false);
  async function exclusive(run: () => Promise<void>) { if (inFlight.current) return; inFlight.current = true; setBusy(true); try { await run(); } finally { inFlight.current = false; setBusy(false); } }
  async function generate() { await exclusive(async () => { try { const result = await generateMysqlInspectionReport(inspection.id); setReport(result.report); } catch (error) { onError(error); } }); }
  // Sub-bloco 5B - download real do laudo (bytes autenticados), não mais um
  // link para signed_url (que é null hoje para os providers Local/R2). A
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
  async function compare() { if (!baseline) return; await exclusive(async () => { try { const result = await generateMysqlInspectionComparison(inspection.id, baseline); setComparison(result.comparison); } catch (error) { onError(error); } }); }
  const visibleRooms = comparison?.rooms?.map((room: any) => ({ ...room, items: room.items.filter((item: any) => comparisonFilter === "all" || (comparisonFilter === "changed" && item.changed) || (comparisonFilter === "worse" && item.outcome === "worse") || (comparisonFilter === "new" && ["new", "absent"].includes(item.outcome))) })).filter((room: any) => comparisonFilter === "all" || room.items.length > 0);
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Laudo e comparação</h2><button type="button" disabled={busy || !canReport} onClick={() => void generate()} aria-describedby={canReport ? undefined : "inspection-report-hint"} className="h-10 rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50">{busy ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}Exportar PDF</button>{report ? <button type="button" disabled={downloading} onClick={() => void downloadPdf()} className="inline-flex h-10 items-center rounded-md border border-border px-3 text-sm font-medium disabled:opacity-50">{downloading ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : null}Baixar laudo (PDF)</button> : null}</div>{canEdit && !canReport ? <p id="inspection-report-hint" className="text-xs text-muted-foreground">O laudo fica disponível depois que a vistoria for concluída.</p> : null}{canEdit && inspection.status === "completed" ? <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">Nome do signatário<input value={signer} onChange={(event) => setSigner(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input px-3" /></label><label className="text-sm">Imagem da assinatura<input type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setSignature(String(reader.result)); reader.readAsDataURL(file); }} className="mt-1 block w-full text-sm" /></label><button type="button" disabled={busy || !signer || !signature} onClick={() => void sign()} className="h-10 rounded-md border border-border px-3 text-sm sm:col-span-2">Registrar assinatura eletrônica simples</button></div> : null}<p className="text-xs text-muted-foreground">Assinatura online (link remoto para a outra parte assinar) — <button type="button" disabled className="font-medium underline-offset-2 disabled:cursor-default disabled:opacity-100" title="Em breve">Gerar link de assinatura (Em breve)</button></p><div className="grid gap-2 sm:grid-cols-[1fr_auto]"><label className="text-sm">ID da vistoria de entrada<input value={baseline} onChange={(event) => setBaseline(event.target.value)} placeholder="UUID da entrada" className="mt-1 h-10 w-full rounded-md border border-input px-3" /></label><button type="button" disabled={busy || !canEdit || !baseline || inspection.type !== "exit" || (inspection.status !== "completed" && inspection.status !== "archived")} onClick={() => void compare()} className="h-10 self-end rounded-md border border-border px-3 text-sm">Comparar entrada</button></div>{comparison ? <div className="space-y-2 rounded-md border border-border p-3"><div className="flex flex-wrap gap-2">{[ ["all", "Todos"], ["changed", "Alterados"], ["worse", "Pioraram"], ["new", "Novos/ausentes"] ].map(([value, label]) => <button key={value} type="button" onClick={() => setComparisonFilter(value)} className={`h-9 rounded-md border px-3 text-xs ${comparisonFilter === value ? "bg-muted font-semibold" : ""}`}>{label}</button>)}</div>{visibleRooms.map((room: any) => <div key={room.name}><p className="text-sm font-semibold">{room.name} · {room.outcome}</p>{room.items.map((item: any) => <p key={item.name} className="text-xs text-muted-foreground">{item.name}: {item.entry ?? "—"} → {item.exit ?? "—"} ({item.outcome})</p>)}</div>)}</div> : null}<p className="text-xs text-muted-foreground">A comparação aponta diferenças registradas entre as vistorias e não atribui responsabilidade. Relatórios e assinaturas exigem conexão e são armazenados como documentos privados.</p></section>;
}
