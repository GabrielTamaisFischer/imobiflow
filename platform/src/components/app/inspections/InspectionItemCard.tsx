import { Camera, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { InspectionItemStatusPicker } from "./InspectionItemStatusPicker";
import { InspectionItemNotes } from "./InspectionItemNotes";
import { InspectionEvidencePanel } from "@/components/app/inspection-evidence-panel";
import { filterEvidenceFor, type InspectionEvidenceRow, type MysqlInspectionCondition, type MysqlInspectionItem } from "@/product/inspections";

type Props = {
  item: MysqlInspectionItem;
  inspectionId: string;
  roomId: string;
  /** SUB-BLOCO 4 — nome do ambiente, só para identificar o contexto no lightbox (ex.: "Sala · Paredes"). */
  roomName: string;
  expectedVersion: number;
  canEdit: boolean;
  evidence: InspectionEvidenceRow[];
  evidenceLoading: boolean;
  onEvidenceChanged: () => Promise<void>;
  onEvidenceRefetch: () => Promise<void>;
  onStatusChange: (condition: MysqlInspectionCondition) => void;
  onNotesSave: (notes: string | null) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onError: (error: unknown) => void;
  onSavingChange?: (saving: boolean) => void;
};

/** Card de item (SUB-BLOCO 3) — nome, status (4 botões), observações, fotos; nada de formulário gigantesco. */
export function InspectionItemCard({
  item, inspectionId, roomId, roomName, expectedVersion, canEdit, evidence, evidenceLoading,
  onEvidenceChanged, onEvidenceRefetch, onStatusChange, onNotesSave, onRename, onRemove, onError, onSavingChange,
}: Props) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(item.name);
  const photoCount = filterEvidenceFor(evidence, roomId, item.id).length;

  function submitRename() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== item.name) onRename(trimmed);
    else setName(item.name);
    setRenaming(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={submitRename}
            onKeyDown={(event) => { if (event.key === "Enter") submitRename(); }}
            className="h-9 w-full rounded-md border border-input px-2 text-sm font-semibold"
          />
        ) : (
          <h4 className="font-semibold">{item.name}</h4>
        )}
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
            <button type="button" onClick={() => setRenaming(true)} aria-label={`Renomear ${item.name}`} className="rounded p-1 hover:text-foreground">
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" onClick={onRemove} aria-label={`Remover ${item.name}`} className="rounded p-1 text-destructive hover:text-destructive/80">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      <InspectionItemStatusPicker condition={item.condition} onChange={onStatusChange} disabled={!canEdit} />
      <InspectionItemNotes notes={item.notes} editable={canEdit} onSave={onNotesSave} />

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Camera className="h-3.5 w-3.5" />
        {photoCount > 0 ? `${photoCount} foto(s)` : "Sem fotos"}
      </div>
      <InspectionEvidencePanel
        inspectionId={inspectionId}
        roomId={roomId}
        itemId={item.id}
        expectedVersion={expectedVersion}
        editable={canEdit}
        evidence={evidence}
        loading={evidenceLoading}
        contextLabel={`${roomName} · ${item.name}`}
        onEvidenceChanged={onEvidenceChanged}
        onChanged={onEvidenceRefetch}
        onError={onError}
        onSavingChange={onSavingChange}
      />
    </div>
  );
}
