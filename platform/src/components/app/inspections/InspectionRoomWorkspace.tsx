import { Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { InspectionItemCard } from "./InspectionItemCard";
import { InspectionAddItem } from "./InspectionAddItem";
import { InspectionEvidencePanel } from "@/components/app/inspection-evidence-panel";
import { buildSuggestedInspectionItems, selectNewPresetItems } from "@/product/inspection-item-presets";
import {
  createMysqlItem, deleteMysqlItem, deleteMysqlRoom, getMysqlInspection, patchMysqlItem, patchMysqlRoom,
  type InspectionEvidenceRow, type MysqlInspection, type MysqlInspectionCondition, type MysqlInspectionItem, type MysqlInspectionRoom,
} from "@/product/inspections";

type Props = {
  inspection: MysqlInspection;
  room: MysqlInspectionRoom;
  canEdit: boolean;
  evidence: InspectionEvidenceRow[];
  evidenceLoading: boolean;
  onEvidenceChanged: () => Promise<void>;
  onChanged: (next: MysqlInspection) => void;
  onRoomRemoved: (roomId: string) => void;
  onError: (error: unknown) => void;
  /**
   * SUB-BLOCO 3 (ajuste) — avisa a página quando uma mutação deste workspace
   * (ambiente ou item) começa/termina, para alimentar o indicador único de
   * estado de salvamento no cabeçalho (ver InspectionSaveStatus). Opcional
   * para não quebrar quem ainda não precisa dele.
   */
  onSavingChange?: (saving: boolean) => void;
};

/**
 * Atualizações locais e imutáveis da árvore inspection → rooms → items, logo
 * após uma mutação bem-sucedida. Evita um refetch da vistoria inteira a cada
 * clique de status/observação; em caso de erro (ex.: conflito de versão), o
 * tratamento padrão da página (handleMutationError) já recarrega do servidor.
 */
function withItem(inspection: MysqlInspection, roomId: string, itemId: string, patch: Partial<MysqlInspectionItem>): MysqlInspection {
  return {
    ...inspection,
    version: inspection.version + 1,
    rooms: inspection.rooms.map((candidate) =>
      candidate.id !== roomId ? candidate : { ...candidate, items: candidate.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)) },
    ),
  };
}
function withNewItem(inspection: MysqlInspection, roomId: string, item: MysqlInspectionItem): MysqlInspection {
  return {
    ...inspection,
    version: inspection.version + 1,
    rooms: inspection.rooms.map((candidate) => (candidate.id !== roomId ? candidate : { ...candidate, items: [...candidate.items, item] })),
  };
}
function withoutItem(inspection: MysqlInspection, roomId: string, itemId: string): MysqlInspection {
  return {
    ...inspection,
    version: inspection.version + 1,
    rooms: inspection.rooms.map((candidate) => (candidate.id !== roomId ? candidate : { ...candidate, items: candidate.items.filter((item) => item.id !== itemId) })),
  };
}
function withRoomName(inspection: MysqlInspection, roomId: string, name: string): MysqlInspection {
  return { ...inspection, version: inspection.version + 1, rooms: inspection.rooms.map((candidate) => (candidate.id !== roomId ? candidate : { ...candidate, name })) };
}
function withoutRoom(inspection: MysqlInspection, roomId: string): MysqlInspection {
  return { ...inspection, version: inspection.version + 1, rooms: inspection.rooms.filter((candidate) => candidate.id !== roomId) };
}

/** Coluna central (SUB-BLOCO 3): cabeçalho do ambiente + itens + ações do ambiente. */
export function InspectionRoomWorkspace({ inspection, room, canEdit, evidence, evidenceLoading, onEvidenceChanged, onChanged, onRoomRemoved, onError, onSavingChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [renamingRoom, setRenamingRoom] = useState(false);
  const [roomName, setRoomName] = useState(room.name);

  function notifySaving(saving: boolean) {
    onSavingChange?.(saving);
  }

  async function saveRoomName() {
    const trimmed = roomName.trim();
    setRenamingRoom(false);
    if (!trimmed || trimmed === room.name) { setRoomName(room.name); return; }
    setBusy(true);
    notifySaving(true);
    try {
      await patchMysqlRoom(inspection.id, room.id, { expected_version: inspection.version, name: trimmed });
      onChanged((await getMysqlInspection(inspection.id)).inspection);
    } catch (error) { onError(error); setRoomName(room.name); } finally { setBusy(false); notifySaving(false); }
  }

  async function removeRoom() {
    if (!window.confirm(`Remover o ambiente "${room.name}" e todos os seus itens?`)) return;
    setBusy(true);
    notifySaving(true);
    try {
      await deleteMysqlRoom(inspection.id, room.id, inspection.version);
      onChanged((await getMysqlInspection(inspection.id)).inspection);
      onRoomRemoved(room.id);
    } catch (error) { onError(error); } finally { setBusy(false); notifySaving(false); }
  }

  async function updateItem(itemId: string, patch: { condition?: MysqlInspectionCondition; notes?: string | null; name?: string }) {
    notifySaving(true);
    try {
      await patchMysqlItem(inspection.id, room.id, itemId, { expected_version: inspection.version, ...patch });
      onChanged((await getMysqlInspection(inspection.id)).inspection);
    } catch (error) { onError(error); } finally { notifySaving(false); }
  }

  async function removeItem(itemId: string) {
    if (!window.confirm("Remover este item?")) return;
    setBusy(true);
    notifySaving(true);
    try {
      await deleteMysqlItem(inspection.id, room.id, itemId, inspection.version);
      onChanged((await getMysqlInspection(inspection.id)).inspection);
    } catch (error) { onError(error); } finally { setBusy(false); notifySaving(false); }
  }

  async function addItems(names: string[]) {
    setBusy(true);
    notifySaving(true);
    let current = inspection;
    try {
      for (const [index, name] of names.entries()) {
        const { item } = await createMysqlItem(current.id, room.id, {
          id: crypto.randomUUID(), expected_version: current.version, name, condition: "not_inspected", position: room.items.length + index,
        });
        current = withNewItem(current, room.id, item);
        onChanged(current);
      }
      onChanged((await getMysqlInspection(inspection.id)).inspection);
    } catch (error) { onError(error); } finally { setBusy(false); notifySaving(false); }
  }

  const presetToOffer = room.items.length === 0 ? selectNewPresetItems([], buildSuggestedInspectionItems(room.name)) : [];

  // Upload/remoção/reordenação de evidência bumpa Inspection.version no
  // backend (ver POST .../evidence) — precisa resincronizar, senão a
  // próxima mutação de item/ambiente falha com INSPECTION_VERSION_CONFLICT.
  async function refetchAfterEvidenceChange() {
    onChanged((await getMysqlInspection(inspection.id)).inspection);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        {renamingRoom ? (
          <input
            autoFocus
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            onBlur={() => void saveRoomName()}
            onKeyDown={(event) => { if (event.key === "Enter") void saveRoomName(); }}
            className="h-10 rounded-md border border-input px-3 text-lg font-semibold"
          />
        ) : (
          <h2 className="text-lg font-semibold">{room.name}</h2>
        )}
        {canEdit ? (
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => setRenamingRoom(true)} className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm">
              <Pencil className="h-4 w-4" />Renomear
            </button>
            <button type="button" disabled={busy} onClick={() => void removeRoom()} className="inline-flex h-9 items-center gap-1 rounded-md border border-destructive/40 px-3 text-sm text-destructive">
              <Trash2 className="h-4 w-4" />Remover ambiente
            </button>
          </div>
        ) : null}
      </div>

      {/* SUB-BLOCO 3 (ajuste) — fotos do ambiente como um todo, sem vínculo
          com um item específico. Mesma infraestrutura de evidência dos
          itens (InspectionEvidencePanel + InspectionEvidence existente):
          aqui só não passamos itemId, então filterEvidenceFor(evidence,
          room.id, null) traz só as fotos gerais, nunca as de um item. */}
      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="text-sm font-medium">Fotos gerais do ambiente</p>
        <p className="text-xs text-muted-foreground">Visão geral do ambiente (ex.: foto panorâmica), sem vínculo com um item específico.</p>
        <InspectionEvidencePanel
          inspectionId={inspection.id}
          roomId={room.id}
          expectedVersion={inspection.version}
          editable={canEdit}
          evidence={evidence}
          loading={evidenceLoading}
          contextLabel={room.name}
          onEvidenceChanged={onEvidenceChanged}
          onChanged={refetchAfterEvidenceChange}
          onError={onError}
          onSavingChange={onSavingChange}
        />
      </div>

      {room.items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-sm">
          <p className="text-muted-foreground">Nenhum item neste ambiente ainda.</p>
          {canEdit && presetToOffer.length > 0 ? (
            <button type="button" disabled={busy} onClick={() => void addItems(presetToOffer)} className="mt-2 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Usar itens padrão deste ambiente
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {room.items.map((item) => (
            <InspectionItemCard
              key={item.id}
              item={item}
              inspectionId={inspection.id}
              roomId={room.id}
              roomName={room.name}
              expectedVersion={inspection.version}
              canEdit={canEdit}
              evidence={evidence}
              evidenceLoading={evidenceLoading}
              onEvidenceChanged={onEvidenceChanged}
              onEvidenceRefetch={refetchAfterEvidenceChange}
              onStatusChange={(condition) => void updateItem(item.id, { condition })}
              onNotesSave={(notes) => void updateItem(item.id, { notes })}
              onRename={(name) => void updateItem(item.id, { name })}
              onRemove={() => void removeItem(item.id)}
              onError={onError}
              onSavingChange={onSavingChange}
            />
          ))}
        </div>
      )}

      {canEdit ? <InspectionAddItem busy={busy} onAdd={(name) => addItems([name])} /> : null}
    </div>
  );
}
