import { isItemReviewed } from "./inspection-item-status";
import type { MysqlInspectionItem, MysqlInspectionRoom } from "./inspections";

/** SUB-BLOCO 3 — cálculo determinístico de progresso (ambiente e vistoria). */

export type ProgressCount = { reviewed: number; total: number };

export function itemsProgress(items: ReadonlyArray<Pick<MysqlInspectionItem, "condition">>): ProgressCount {
  return { reviewed: items.filter((item) => isItemReviewed(item.condition)).length, total: items.length };
}

export function roomProgress(room: Pick<MysqlInspectionRoom, "items">): ProgressCount {
  return itemsProgress(room.items);
}

/**
 * Progresso geral da vistoria = itens revisados / itens totais, somados em
 * TODOS os ambientes — nunca a média dos percentuais de cada ambiente, que
 * daria peso igual a um ambiente com 2 itens e a um com 10 (diretriz do
 * Sub-bloco 3).
 */
export function overallProgress(rooms: ReadonlyArray<Pick<MysqlInspectionRoom, "items">>): ProgressCount {
  return rooms.reduce(
    (total, room) => {
      const progress = roomProgress(room);
      return { reviewed: total.reviewed + progress.reviewed, total: total.total + progress.total };
    },
    { reviewed: 0, total: 0 },
  );
}

/** Percentual arredondado só na apresentação — o cálculo em si usa as frações exatas. */
export function progressPercent({ reviewed, total }: ProgressCount): number {
  if (total <= 0) return 0;
  return Math.round((reviewed / total) * 100);
}
