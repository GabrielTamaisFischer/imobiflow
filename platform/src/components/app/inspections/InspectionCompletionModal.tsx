import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  busy: boolean;
  pendingCount: number;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * SUB-BLOCO 4 — aviso de UX antes de concluir com itens ainda não revisados
 * (substitui o window.confirm do SUB-BLOCO 3). A regra de negócio não muda:
 * o backend continua aceitando "completed" sem exigir 100% dos itens
 * revisados — isto é só uma confirmação explícita na interface.
 */
export function InspectionCompletionModal({ open, busy, pendingCount, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) cancelRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="complete-inspection-title" className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-lg">
        <h2 id="complete-inspection-title" className="text-lg font-semibold">Concluir vistoria com itens pendentes?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta vistoria ainda possui {pendingCount} {pendingCount === 1 ? "item não revisado" : "itens não revisados"}. Deseja concluir mesmo assim?
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="h-10 rounded-md border border-border px-4 text-sm">
            Voltar para revisar
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Concluir mesmo assim
          </button>
        </div>
      </div>
    </div>
  );
}
