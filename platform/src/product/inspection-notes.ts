import type { MysqlInspection } from "./inspections";

/**
 * SUB-BLOCO 4 — contagem determinística de observações do resumo.
 *
 * Conta, sem duplicar e sem contar string vazia/espaços:
 *   - a observação geral da vistoria (inspection.notes), se preenchida;
 *   - notes de cada ambiente (room.notes), se existir e preenchida — o
 *     domínio já suporta esse campo (patchMysqlRoom aceita `notes`), mesmo
 *     que a tela atual do workspace não exponha mais um editor dedicado
 *     para ele (decisão do SUB-BLOCO 3: só renomear/remover ambiente);
 *   - notes de cada item (item.notes) preenchidas.
 *
 * Não inventa um campo que o domínio não tem: não existe nota por foto, e
 * não existe nota separada por "vistoria completa" fora de inspection.notes.
 */
function isFilled(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

export function countInspectionNotes(inspection: Pick<MysqlInspection, "notes" | "rooms">): number {
  let count = 0;
  if (isFilled(inspection.notes)) count += 1;
  for (const room of inspection.rooms) {
    if (isFilled(room.notes)) count += 1;
    for (const item of room.items) {
      if (isFilled(item.notes)) count += 1;
    }
  }
  return count;
}
