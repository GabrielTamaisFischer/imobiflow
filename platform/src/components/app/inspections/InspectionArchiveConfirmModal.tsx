import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

type InspectionArchiveConfirmModalProps = {
  open: boolean;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmação de "Apagar vistoria". Não existe delete físico de Inspection
 * hoje — o comportamento real é arquivar (ver inspections-mysql.ts), então
 * o texto do modal é explícito sobre isso em vez de deixar implícito.
 */
export function InspectionArchiveConfirmModal({ open, busy, onConfirm, onCancel }: InspectionArchiveConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="archive-inspection-title" className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 id="archive-inspection-title" className="text-lg font-semibold">Apagar vistoria</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A vistoria será arquivada e deixará de aparecer no fluxo operacional padrão. Ela continua acessível no histórico, mas não pode mais ser editada.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-md border border-border px-4 text-sm">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Arquivar vistoria
          </button>
        </div>
      </div>
    </div>
  );
}
