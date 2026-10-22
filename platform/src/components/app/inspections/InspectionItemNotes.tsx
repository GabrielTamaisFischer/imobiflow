import { useEffect, useState } from "react";

type Props = { notes: string | null; editable: boolean; onSave: (notes: string | null) => void };

/** Observação do item — mesmo campo InspectionItem.notes, sem paralelo. Salva no blur (sem request por tecla), igual ao padrão já usado em NotesEditor. */
export function InspectionItemNotes({ notes, editable, onSave }: Props) {
  const [value, setValue] = useState(notes ?? "");
  useEffect(() => setValue(notes ?? ""), [notes]);
  return (
    <label className="block text-xs">
      Observações
      <textarea
        value={value}
        disabled={!editable}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => { if (value !== (notes ?? "")) onSave(value.trim() ? value : null); }}
        rows={2}
        placeholder="Observações do item"
        className="mt-1 w-full rounded-md border border-input bg-background p-2 text-sm"
      />
    </label>
  );
}
