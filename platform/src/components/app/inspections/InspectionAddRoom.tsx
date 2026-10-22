import { Plus } from "lucide-react";
import { useState } from "react";

const COMMON_ROOM_NAMES = [
  "Sala", "Cozinha", "Quarto", "Suíte", "Banheiro", "Lavabo", "Área de serviço",
  "Varanda", "Garagem", "Quintal", "Escritório", "Corredor", "Escada",
  "Área gourmet", "Jardim", "Depósito", "Outros",
];

type Props = { onAdd: (name: string) => Promise<void>; busy: boolean };

/** "+ Adicionar ambiente" — nome comum (datalist) ou personalizado. InspectionRoom aceita qualquer `name`, então não há enum novo. */
export function InspectionAddRoom({ onAdd, busy }: Props) {
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
        <Plus className="h-4 w-4" />Adicionar ambiente
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <label className="block text-sm">
        Nome do ambiente
        <input
          autoFocus
          list="inspection-common-room-names"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void submit(); }}
          placeholder="Ex.: Sala, Quarto 2, Área gourmet..."
          className="mt-1 h-10 w-full rounded-md border border-input px-3"
        />
        <datalist id="inspection-common-room-names">
          {COMMON_ROOM_NAMES.map((option) => <option key={option} value={option} />)}
        </datalist>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setOpen(false); setName(""); }} className="h-9 rounded-md border border-border px-3 text-sm">Cancelar</button>
        <button type="button" disabled={busy || !name.trim()} onClick={() => void submit()} className="h-9 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground">Adicionar</button>
      </div>
    </div>
  );
}
