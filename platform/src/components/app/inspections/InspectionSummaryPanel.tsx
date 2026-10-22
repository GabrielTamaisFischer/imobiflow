import { Loader2 } from "lucide-react";
import { overallProgress, progressPercent } from "@/product/inspection-progress";
import { countInspectionNotes } from "@/product/inspection-notes";
import type { InspectionEvidenceRow, MysqlInspection } from "@/product/inspections";
import { inspectionStatusLabels } from "@/product/inspection-dashboard";

type Props = {
  inspection: MysqlInspection;
  evidence: InspectionEvidenceRow[];
  canEdit: boolean;
  mutable: boolean;
  busy: boolean;
  onStart: () => void;
  onComplete: () => void;
};

/** Painel direito (SUB-BLOCO 3): números reais da vistoria + ações contextuais. */
export function InspectionSummaryPanel({ inspection, evidence, canEdit, mutable, busy, onStart, onComplete }: Props) {
  const rooms = inspection.rooms;
  const totalItems = rooms.reduce((sum, room) => sum + room.items.length, 0);
  const progress = overallProgress(rooms);
  const pending = progress.total - progress.reviewed;
  // SUB-BLOCO 4 — observação geral da vistoria + notes de ambiente + notes
  // de item preenchidos, sem contar string vazia/espaços (ver inspection-notes.ts).
  const notesCount = countInspectionNotes(inspection);
  // Evidência de toda a vistoria: geral + de cada ambiente/item (loadInspectionEvidenceBundle já traz tudo junto).
  const totalPhotos = evidence.length;

  return (
    <aside className="space-y-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Resumo da vistoria</h2>
      <dl className="grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Ambientes</dt><dd className="text-right font-medium">{rooms.length}</dd>
        <dt className="text-muted-foreground">Itens</dt><dd className="text-right font-medium">{totalItems}</dd>
        <dt className="text-muted-foreground">Revisados</dt><dd className="text-right font-medium">{progress.reviewed}</dd>
        <dt className="text-muted-foreground">Pendentes</dt><dd className="text-right font-medium">{pending}</dd>
        <dt className="text-muted-foreground">Fotos</dt><dd className="text-right font-medium">{totalPhotos}</dd>
        <dt className="text-muted-foreground">Observações</dt><dd className="text-right font-medium">{notesCount}</dd>
      </dl>
      <div className="space-y-1 border-t border-border pt-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Progresso</span>
          <span className="font-semibold">{progressPercent(progress)}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent(progress)}%` }} />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <span className="font-semibold">{inspectionStatusLabels[inspection.status]}</span>
        </div>
      </div>
      {canEdit && mutable ? (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">Cada alteração é salva automaticamente — não há um passo separado de "salvar rascunho".</p>
          {inspection.status === "draft" ? (
            <button type="button" disabled={busy} onClick={onStart} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              Iniciar vistoria
            </button>
          ) : null}
          {inspection.status === "in_progress" ? (
            <button type="button" disabled={busy} onClick={onComplete} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Concluir vistoria
            </button>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
