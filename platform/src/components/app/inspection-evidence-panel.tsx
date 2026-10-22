import { isOfflineRuntime } from "@/product/inspection-offline";
import {
  deleteMysqlInspectionEvidence,
  filterEvidenceFor,
  patchMysqlInspectionEvidence,
  removeMysqlOfflineInspectionEvidence,
  reorderMysqlInspectionEvidence,
  syncMysqlInspectionOfflineEvidenceQueue,
  updateMysqlOfflineInspectionEvidence,
  uploadMysqlInspectionEvidence,
  type InspectionEvidenceRow,
  type MysqlInspectionEvidence,
} from "@/product/inspections";
import { useState } from "react";
import { InspectionEvidenceGallery } from "./inspections/InspectionEvidenceGallery";

type Props = {
  inspectionId: string;
  roomId?: string | null;
  itemId?: string | null;
  expectedVersion: number;
  editable: boolean;
  evidence: InspectionEvidenceRow[];
  loading: boolean;
  /** SUB-BLOCO 4 — rótulo de contexto mostrado no lightbox (ex.: "Sala" ou "Sala · Paredes"). */
  contextLabel: string;
  onEvidenceChanged: () => Promise<void>;
  onChanged: () => Promise<void>;
  onError: (error: unknown) => void;
  /** SUB-BLOCO 4 — avisa a página de uma mutação de evidência em voo, para o indicador único de salvamento (ver InspectionSaveStatus). */
  onSavingChange?: (saving: boolean) => void;
};

export function InspectionEvidencePanel({
  inspectionId,
  roomId = null,
  itemId = null,
  expectedVersion,
  editable,
  evidence,
  loading,
  contextLabel,
  onEvidenceChanged,
  onChanged,
  onError,
  onSavingChange,
}: Props) {
  const rows = filterEvidenceFor(evidence, roomId, itemId);
  const [busy, setBusy] = useState(false);

  function notifySaving(saving: boolean) {
    onSavingChange?.(saving);
  }

  async function refresh() {
    await onEvidenceChanged();
  }

  async function upload(files: File[]) {
    if (!files.length || !editable) return;
    setBusy(true);
    notifySaving(true);
    try {
      for (const [index, file] of files.entries()) {
        await uploadMysqlInspectionEvidence(inspectionId, {
          room_id: roomId,
          item_id: itemId,
          file,
          position: rows.length + index,
        });
      }
      await refresh();
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
      notifySaving(false);
    }
  }

  async function remove(entry: MysqlInspectionEvidence) {
    if (!editable || !window.confirm("Remover esta evidência?")) return;
    setBusy(true);
    notifySaving(true);
    try {
      if ("offline_pending" in entry && entry.offline_pending) await removeMysqlOfflineInspectionEvidence(entry.id);
      else await deleteMysqlInspectionEvidence(inspectionId, entry.id, expectedVersion);
      await refresh();
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
      notifySaving(false);
    }
  }

  async function move(entry: MysqlInspectionEvidence, direction: -1 | 1) {
    const index = rows.findIndex((candidate) => candidate.id === entry.id);
    const target = index + direction;
    if (!editable || target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    notifySaving(true);
    try {
      if (next.some((candidate) => "offline_pending" in candidate && candidate.offline_pending)) {
        for (const [position, candidate] of next.entries())
          if ("offline_pending" in candidate && candidate.offline_pending)
            await updateMysqlOfflineInspectionEvidence(candidate.id, { position });
      } else {
        await reorderMysqlInspectionEvidence(inspectionId, expectedVersion, next.map((candidate, position) => ({ id: candidate.id, position })));
      }
      await refresh();
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
      notifySaving(false);
    }
  }

  async function retry(entry: MysqlInspectionEvidence) {
    setBusy(true);
    notifySaving(true);
    try {
      await syncMysqlInspectionOfflineEvidenceQueue(inspectionId);
      await refresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
      notifySaving(false);
    }
  }

  // SUB-BLOCO 4 — legenda (MysqlInspectionEvidence.caption) já existe no
  // domínio; expõe de forma simples. Uma foto ainda pendente de sincronizar
  // (offline_pending) edita a legenda localmente (updateMysqlOfflineInspectionEvidence);
  // uma foto já sincronizada exige conexão (patchMysqlInspectionEvidence
  // lança OFFLINE_EVIDENCE_UNSUPPORTED offline) — por isso isCaptionEditable
  // bloqueia esse caso específico em vez de tentar e falhar silenciosamente.
  function isCaptionEditable(entry: InspectionEvidenceRow) {
    if (!editable) return false;
    if (entry.offline_pending) return true;
    return !isOfflineRuntime();
  }

  async function saveCaption(entry: MysqlInspectionEvidence, caption: string) {
    setBusy(true);
    notifySaving(true);
    try {
      if ("offline_pending" in entry && entry.offline_pending) await updateMysqlOfflineInspectionEvidence(entry.id, { caption: caption || null });
      else await patchMysqlInspectionEvidence(inspectionId, entry.id, { expected_version: expectedVersion, caption: caption || null });
      await refresh();
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
      notifySaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-md border border-dashed border-border p-3" aria-label="Evidências">
      <InspectionEvidenceGallery
        rows={rows}
        loading={loading}
        editable={editable}
        isCaptionEditable={isCaptionEditable}
        busy={busy}
        contextLabel={contextLabel}
        emptyLabel="Nenhuma foto adicionada ainda."
        onUpload={upload}
        onMove={move}
        onRemove={remove}
        onRetry={retry}
        onCaptionSave={saveCaption}
      />
    </section>
  );
}
