import { useState } from "react";
import { Camera, Upload } from "lucide-react";
import { InspectionEvidenceThumbnail } from "./InspectionEvidenceThumbnail";
import { InspectionEvidenceLightbox } from "./InspectionEvidenceLightbox";
import type { InspectionEvidenceRow, MysqlInspectionEvidence } from "@/product/inspections";

type Props = {
  rows: InspectionEvidenceRow[];
  loading: boolean;
  editable: boolean;
  isCaptionEditable: (entry: InspectionEvidenceRow) => boolean;
  busy: boolean;
  contextLabel: string;
  emptyLabel: string;
  onUpload: (files: File[]) => void;
  onMove: (entry: MysqlInspectionEvidence, direction: -1 | 1) => void;
  onRemove: (entry: MysqlInspectionEvidence) => void;
  onRetry: (entry: MysqlInspectionEvidence) => void;
  onCaptionSave: (entry: MysqlInspectionEvidence, caption: string) => void;
};

/**
 * SUB-BLOCO 4 — galeria com contador, upload, miniaturas maiores e
 * lightbox. Reaproveita a MESMA infraestrutura de evidência (upload,
 * compressão, offline queue, expected_version) — esta camada é só
 * apresentação sobre o que o painel (InspectionEvidencePanel) já faz.
 */
export function InspectionEvidenceGallery({ rows, loading, editable, isCaptionEditable, busy, contextLabel, emptyLabel, onUpload, onMove, onRemove, onRetry, onCaptionSave }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  function handleUploadChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length) onUpload(files);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {rows.length} {rows.length === 1 ? "foto" : "fotos"}
        </p>
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-primary bg-primary px-3 text-sm font-medium text-primary-foreground">
              <Camera className="h-4 w-4" />
              Tirar foto
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                onChange={handleUploadChange}
                disabled={busy}
              />
            </label>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border border-border px-3 text-sm">
              <Upload className="h-4 w-4" />
              Escolher fotos
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={handleUploadChange} disabled={busy} />
            </label>
          </div>
        ) : null}
      </div>
      {loading ? (
        <p className="mt-2 text-xs text-muted-foreground">Carregando evidências...</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map((entry, index) => (
            <InspectionEvidenceThumbnail
              key={entry.id}
              entry={entry}
              index={index}
              total={rows.length}
              editable={editable}
              busy={busy}
              onOpen={() => setLightboxIndex(index)}
              onMove={(direction) => onMove(entry, direction)}
              onRemove={() => onRemove(entry)}
              onRetry={() => onRetry(entry)}
              captionEditable={isCaptionEditable(entry)}
              onCaptionSave={(caption) => onCaptionSave(entry, caption)}
            />
          ))}
        </div>
      )}
      {lightboxIndex !== null ? (
        <InspectionEvidenceLightbox
          rows={rows}
          index={lightboxIndex}
          contextLabel={contextLabel}
          onNavigate={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}
