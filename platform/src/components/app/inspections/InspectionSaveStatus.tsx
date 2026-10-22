import { resolveInspectionSaveStatus, INSPECTION_SAVE_STATUS_LABELS, type InspectionSaveStatusInput, type InspectionSaveStatusKey } from "@/product/inspection-save-status";

type Props = InspectionSaveStatusInput;

const DOT_STYLES: Record<InspectionSaveStatusKey, string> = {
  saving: "bg-muted-foreground animate-pulse",
  saved: "bg-emerald-600",
  saved_locally: "bg-amber-600",
  awaiting_connection: "bg-amber-600",
  syncing: "bg-primary animate-pulse",
  synced: "bg-emerald-600",
  conflict: "bg-destructive",
};

/**
 * SUB-BLOCO 3 (ajuste) — indicador único de estado de salvamento, visível no
 * cabeçalho (ver app.vistorias.$inspectionId.tsx). Não é um botão: é um
 * status derivado de sinais reais (ver resolveInspectionSaveStatus).
 */
export function InspectionSaveStatus(props: Props) {
  const status = resolveInspectionSaveStatus(props);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[status]}`} aria-hidden="true" />
      {INSPECTION_SAVE_STATUS_LABELS[status]}
    </span>
  );
}
