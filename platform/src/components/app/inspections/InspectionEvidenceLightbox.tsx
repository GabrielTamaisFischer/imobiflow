import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { InspectionEvidenceRow } from "@/product/inspections";

type Props = {
  rows: InspectionEvidenceRow[];
  index: number;
  contextLabel: string;
  onNavigate: (nextIndex: number) => void;
  onClose: () => void;
};

/**
 * SUB-BLOCO 4 — visualização ampliada (sem editor de imagem). Funciona com
 * teclado (Esc/←/→) e toque (os botões têm área grande o suficiente para
 * mobile).
 */
export function InspectionEvidenceLightbox({ rows, index, contextLabel, onNavigate, onClose }: Props) {
  const entry = rows[index];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && index > 0) onNavigate(index - 1);
      else if (event.key === "ArrowRight" && index < rows.length - 1) onNavigate(index + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, rows.length, onNavigate, onClose]);

  if (!entry) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label="Foto ampliada" className="fixed inset-0 z-[60] flex flex-col bg-black/90 p-4">
      <div className="flex items-center justify-between text-white">
        <p className="text-sm">
          {contextLabel} · Foto {index + 1} de {rows.length}
        </p>
        <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-md p-2 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {index > 0 ? (
          <button type="button" onClick={() => onNavigate(index - 1)} aria-label="Foto anterior" className="absolute left-2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70">
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}
        {entry.signed_url ? (
          <img src={entry.signed_url} alt={entry.caption || entry.file_name || "Evidência ampliada"} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-sm text-white/80">Prévia indisponível.</p>
        )}
        {index < rows.length - 1 ? (
          <button type="button" onClick={() => onNavigate(index + 1)} aria-label="Próxima foto" className="absolute right-2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70">
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}
      </div>
      {entry.caption ? <p className="mt-2 text-center text-sm text-white/80">{entry.caption}</p> : null}
    </div>
  );
}
