import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { InspectionEvidenceRow, MysqlInspectionEvidence } from "@/product/inspections";

type Props = {
  entry: InspectionEvidenceRow;
  index: number;
  total: number;
  editable: boolean;
  busy: boolean;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onRetry: () => void;
  captionEditable: boolean;
  onCaptionSave: (caption: string) => void;
};

/**
 * SUB-BLOCO 4 — miniatura maior e clicável (abre o lightbox), com estado de
 * sincronização visível e legenda editável quando o domínio permite
 * (MysqlInspectionEvidence.caption já existe — não é campo novo).
 */
export function InspectionEvidenceThumbnail({ entry, index, total, editable, busy, onOpen, onMove, onRemove, onRetry, captionEditable, onCaptionSave }: Props) {
  const [editingCaption, setEditingCaption] = useState(false);
  const [caption, setCaption] = useState(entry.caption ?? "");

  function submitCaption() {
    setEditingCaption(false);
    const trimmed = caption.trim();
    if (trimmed !== (entry.caption ?? "").trim()) onCaptionSave(trimmed || "");
  }

  return (
    <figure className="overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={onOpen}
        className="block aspect-square w-full bg-muted"
        aria-label={entry.caption || entry.file_name || `Ver foto ${index + 1} de ${total}`}
      >
        {entry.signed_url ? (
          <img src={entry.signed_url} alt={entry.caption || entry.file_name || "Evidência"} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">Prévia indisponível</div>
        )}
      </button>
      <figcaption className="space-y-2 p-2 text-xs">
        {editingCaption ? (
          <input
            autoFocus
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            onBlur={submitCaption}
            onKeyDown={(event) => { if (event.key === "Enter") submitCaption(); }}
            placeholder="Legenda (opcional)"
            className="h-8 w-full rounded border border-input px-2 text-xs"
          />
        ) : (
          <button
            type="button"
            disabled={!captionEditable}
            onClick={() => setEditingCaption(true)}
            className="block w-full truncate text-left disabled:cursor-default"
          >
            {entry.caption || entry.file_name || "Foto"}
          </button>
        )}
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
              <button type="button" className="mt-1 rounded border px-2 py-1 text-xs" disabled={busy} onClick={onRetry}>
                Tentar novamente
              </button>
            ) : null}
          </>
        ) : null}
        {editable ? (
          <div className="flex items-center justify-between gap-1">
            <button type="button" className="rounded border px-2 py-1" disabled={busy || index === 0} onClick={() => onMove(-1)} aria-label="Mover para esquerda">←</button>
            <button type="button" className="rounded border px-2 py-1" disabled={busy || index === total - 1} onClick={() => onMove(1)} aria-label="Mover para direita">→</button>
            <button type="button" className="text-destructive" disabled={busy} onClick={onRemove} aria-label="Remover evidência">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </figcaption>
      {busy ? (
        <span className="sr-only">Processando...</span>
      ) : null}
    </figure>
  );
}

export type { MysqlInspectionEvidence };
