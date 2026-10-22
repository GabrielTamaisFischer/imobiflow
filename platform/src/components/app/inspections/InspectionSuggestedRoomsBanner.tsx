import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { SuggestedInspectionRoom } from "@/product/inspection-rooms";

type Props = {
  suggestions: SuggestedInspectionRoom[];
  busy: boolean;
  onAccept: (selectedNames: string[]) => Promise<void>;
  onDismiss: () => void;
};

/**
 * "Ambientes sugeridos a partir do cadastro do imóvel" (SUB-BLOCO 3). Só
 * aparece quando a vistoria ainda não tem nenhum ambiente — nunca sobrescreve
 * ambientes já criados (ver app.vistorias.$inspectionId.tsx: a checagem
 * `inspection.rooms.length === 0` é feita por quem renderiza este banner).
 * Nada é criado até o usuário clicar em "Criar ambientes selecionados":
 * cada sugestão pode ser desmarcada antes disso.
 */
export function InspectionSuggestedRoomsBanner({ suggestions, busy, onAccept, onDismiss }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(suggestions.map((room) => room.name)));

  function toggle(name: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <section className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4" aria-label="Ambientes sugeridos">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-semibold">Ambientes sugeridos a partir do cadastro do imóvel</p>
          <p className="text-xs text-muted-foreground">Desmarque o que não se aplica, ou adicione manualmente depois. Cada ambiente já entra com os itens padrão da categoria.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((room) => (
          <label key={room.name} className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${selected.has(room.name) ? "border-primary bg-primary/10" : "border-border"}`}>
            <input type="checkbox" checked={selected.has(room.name)} onChange={() => toggle(room.name)} className="h-4 w-4" />
            {room.name}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || selected.size === 0}
          onClick={() => void onAccept(Array.from(selected))}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Criar ambientes selecionados
        </button>
        <button type="button" disabled={busy} onClick={onDismiss} className="h-10 rounded-md border border-border px-4 text-sm">
          Adicionar manualmente
        </button>
      </div>
    </section>
  );
}
