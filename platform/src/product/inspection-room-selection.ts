import { roomProgress } from "./inspection-progress";
import type { MysqlInspectionRoom } from "./inspections";

/**
 * SUB-BLOCO 3 — qual ambiente deve ficar selecionado quando a tela abre (ou
 * quando o ambiente selecionado deixou de existir, ex.: depois de remover).
 * Regra: primeiro ambiente incompleto; se todos completos (ou não há
 * itens), primeiro ambiente; sem ambientes, nenhum selecionado.
 */
export function pickInitialRoomId(rooms: ReadonlyArray<Pick<MysqlInspectionRoom, "id" | "items">>): string | null {
  if (rooms.length === 0) return null;
  const incomplete = rooms.find((room) => {
    const progress = roomProgress(room);
    return progress.total === 0 || progress.reviewed < progress.total;
  });
  return (incomplete ?? rooms[0]).id;
}
