import { Plus } from "lucide-react";
import { useState } from "react";

type Props = { onAdd: (name: string) => Promise<void>; busy: boolean };

/** "+ Adicionar item personalizado" — mesmo InspectionItem, sem tabela paralela. */
export function InspectionAddItem({ onAdd, busy }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onAdd(trimmed);
    setName("");
    setOpen(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-md border border-dashed border-border px-3 text-sm font-medium">
        <Plus className="h-4 w-4" />Adicionar item personalizado
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
        placeholder="Ex.: Rodapé, Fechadura digital..."
        className="h-10 flex-1 rounded-md border border-input px-3 text-sm"
      />
      <button type="button" disabled={busy || !name.trim()} onClick={() => void submit()} className="h-10 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">Adicionar</button>
      <button type="button" onClick={() => { setOpen(false); setName(""); }} className="h-10 rounded-md border border-border px-3 text-sm">Cancelar</button>
    </div>
  );
}
