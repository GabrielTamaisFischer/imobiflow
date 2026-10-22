import { roomProgress, progressPercent } from "@/product/inspection-progress";
import type { MysqlInspectionRoom } from "@/product/inspections";

type Props = {
  rooms: MysqlInspectionRoom[];
  selectedRoomId: string | null;
  onSelect: (roomId: string) => void;
};

/**
 * Lista de ambientes com progresso (SUB-BLOCO 3). Um único componente serve
 * os dois layouts da tela: coluna lateral no desktop (variant="sidebar",
 * `hidden lg:block` no wrapper de quem chama) e seletor horizontal no
 * mobile (variant="pills", `flex lg:hidden`) — ver app.vistorias.$inspectionId.tsx.
 */
export function InspectionRoomSidebar({ rooms, selectedRoomId, onSelect, variant = "sidebar" }: Props & { variant?: "sidebar" | "pills" }) {
  if (rooms.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum ambiente ainda.</p>;
  }
  if (variant === "pills") {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Ambientes">
        {rooms.map((room) => {
          const progress = roomProgress(room);
          const selected = room.id === selectedRoomId;
          return (
            <button
              key={room.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onSelect(room.id)}
              className={`flex-shrink-0 rounded-md border px-3 py-2 text-left text-sm ${selected ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}
            >
              <span className="block">{room.name}</span>
              <span className="block text-xs text-muted-foreground">{progress.reviewed}/{progress.total} · {progressPercent(progress)}%</span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <nav aria-label="Ambientes" className="space-y-1">
      {rooms.map((room) => {
        const progress = roomProgress(room);
        const selected = room.id === selectedRoomId;
        return (
          <button
            key={room.id}
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(room.id)}
            className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${selected ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <span className="flex items-center justify-between font-medium">
              {room.name}
              <span className="text-xs font-normal text-muted-foreground">{progressPercent(progress)}%</span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{progress.reviewed} de {progress.total} itens</span>
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progressPercent(progress)}%` }} />
            </div>
          </button>
        );
      })}
    </nav>
  );
}
