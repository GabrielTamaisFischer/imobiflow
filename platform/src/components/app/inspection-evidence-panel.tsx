import { Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import {
  deleteMysqlInspectionEvidence,
  listMysqlInspectionEvidence,
  listMysqlOfflineInspectionEvidence,
  removeMysqlOfflineInspectionEvidence,
  reorderMysqlInspectionEvidence,
  syncMysqlInspectionOfflineEvidenceQueue,
  updateMysqlOfflineInspectionEvidence,
  uploadMysqlInspectionEvidence,
  type MysqlInspectionEvidence,
} from "@/product/inspections";

type Props = {
  inspectionId: string;
  roomId?: string | null;
  itemId?: string | null;
  expectedVersion: number;
  editable: boolean;
  onChanged: () => Promise<void>;
  onError: (error: unknown) => void;
};

export function InspectionEvidencePanel({
  inspectionId,
  roomId = null,
  itemId = null,
  expectedVersion,
  editable,
  onChanged,
  onError,
}: Props) {
  const [rows, setRows] = useState<
    Array<
      MysqlInspectionEvidence & {
        offline_pending?: boolean;
        offline_status?: "pending" | "uploading" | "failed" | "synced";
      }
    >
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      for (const row of rows)
        if (row.offline_pending && row.signed_url) URL.revokeObjectURL(row.signed_url);
    },
    [rows],
  );

  async function refresh() {
    setLoading(true);
    try {
      await syncMysqlInspectionOfflineEvidenceQueue(inspectionId);
      const [remote, local] = await Promise.all([
        listMysqlInspectionEvidence(inspectionId),
        listMysqlOfflineInspectionEvidence(inspectionId),
      ]);
      const filteredRemote = remote.evidence.filter(
        (entry) => entry.room_id === (roomId ?? null) && entry.item_id === (itemId ?? null),
      );
      const filteredLocal = local.filter(
        (entry) => entry.room_id === (roomId ?? null) && entry.item_id === (itemId ?? null),
      );
      setRows([...filteredRemote, ...filteredLocal]);
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [inspectionId, roomId, itemId]);
  useEffect(() => {
    const onOnline = () => {
      void refresh();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [inspectionId, roomId, itemId]);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !editable) return;
    setBusy(true);
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
    }
  }

  async function remove(entry: MysqlInspectionEvidence) {
    if (!editable || !window.confirm("Remover esta evidência?")) return;
    setBusy(true);
    try {
      if ("offline_pending" in entry && entry.offline_pending)
        await removeMysqlOfflineInspectionEvidence(entry.id);
      else await deleteMysqlInspectionEvidence(inspectionId, entry.id, expectedVersion);
      await refresh();
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function move(entry: MysqlInspectionEvidence, direction: -1 | 1) {
    const index = rows.findIndex((candidate) => candidate.id === entry.id);
    const target = index + direction;
    if (!editable || target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    try {
      if (next.some((candidate) => "offline_pending" in candidate && candidate.offline_pending)) {
        for (const [position, candidate] of next.entries())
          if ("offline_pending" in candidate && candidate.offline_pending)
            await updateMysqlOfflineInspectionEvidence(candidate.id, { position });
      } else {
        await reorderMysqlInspectionEvidence(
          inspectionId,
          expectedVersion,
          next.map((candidate, position) => ({ id: candidate.id, position })),
        );
      }
      await refresh();
      await onChanged();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mt-4 rounded-md border border-dashed border-border p-3"
      aria-label="Evidências"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">Evidências</h4>
        {editable ? (
          <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-sm">
            <Upload className="h-4 w-4" />
            Adicionar fotos
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(event) => void upload(event)}
              disabled={busy}
            />
          </label>
        ) : null}
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">Carregando evidências...</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">Nenhuma evidência adicionada.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map((entry, index) => (
            <figure
              key={entry.id}
              className="overflow-hidden rounded-md border border-border bg-background"
            >
              <div className="aspect-square bg-muted">
                {entry.signed_url ? (
                  <img
                    src={entry.signed_url}
                    alt={entry.caption || entry.file_name || "Evidência"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    Prévia indisponível
                  </div>
                )}
              </div>
              <figcaption className="space-y-2 p-2 text-xs">
                <span className="block truncate">{entry.caption || entry.file_name || "Foto"}</span>
                {entry.offline_pending ? (
                  <>
                    <span className="block text-amber-700">
                      {entry.offline_status === "failed"
                        ? "Falha na sincronização"
                        : entry.offline_status === "uploading"
                          ? "Sincronizando..."
                          : "Salva no dispositivo — aguardando sincronização"}
                    </span>
                    {entry.offline_status === "failed" ? (
                      <button
                        type="button"
                        className="mt-1 rounded border px-2 py-1 text-xs"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void syncMysqlInspectionOfflineEvidenceQueue(inspectionId)
                            .then(() => refresh())
                            .catch(onError)
                            .finally(() => setBusy(false));
                        }}
                      >
                        Tentar novamente
                      </button>
                    ) : null}
                  </>
                ) : null}
                {editable ? (
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      className="rounded border px-2 py-1"
                      disabled={busy || index === 0}
                      onClick={() => void move(entry, -1)}
                      aria-label="Mover para esquerda"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="rounded border px-2 py-1"
                      disabled={busy || index === rows.length - 1}
                      onClick={() => void move(entry, 1)}
                      aria-label="Mover para direita"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="text-destructive"
                      disabled={busy}
                      onClick={() => void remove(entry)}
                      aria-label="Remover evidência"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {busy ? (
        <p className="mt-2 inline-flex items-center text-xs text-muted-foreground">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Processando...
        </p>
      ) : null}
    </section>
  );
}
