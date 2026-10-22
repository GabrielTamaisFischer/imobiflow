import { describe, expect, it } from "vitest";
import { itemsProgress, overallProgress, progressPercent, roomProgress } from "./inspection-progress";
import type { MysqlInspectionItem, MysqlInspectionRoom } from "./inspections";

function item(condition: MysqlInspectionItem["condition"]): MysqlInspectionItem {
  return { id: crypto.randomUUID(), name: "x", condition, position: 0, notes: null };
}
function room(items: MysqlInspectionItem[], overrides: Partial<MysqlInspectionRoom> = {}): MysqlInspectionRoom {
  return { id: crypto.randomUUID(), name: "Ambiente", position: 0, notes: null, items, ...overrides };
}

describe("progresso do item/ambiente/vistoria", () => {
  it("0 itens → 0/0 e 0%", () => {
    expect(itemsProgress([])).toEqual({ reviewed: 0, total: 0 });
    expect(progressPercent(itemsProgress([]))).toBe(0);
  });

  it("nenhum revisado (todos not_inspected) → 0/N", () => {
    const items = [item("not_inspected"), item("not_inspected"), item("not_inspected")];
    expect(roomProgress(room(items))).toEqual({ reviewed: 0, total: 3 });
  });

  it("parcialmente revisado", () => {
    const items = [item("good"), item("damaged"), item("not_inspected"), item("not_applicable")];
    const progress = roomProgress(room(items));
    expect(progress).toEqual({ reviewed: 3, total: 4 });
    expect(progressPercent(progress)).toBe(75);
  });

  it("100% revisado", () => {
    const items = [item("good"), item("fair"), item("not_applicable")];
    expect(progressPercent(roomProgress(room(items)))).toBe(100);
  });

  it("not_applicable e observação/foto não impedem o item de contar como revisado (regra: só condition importa)", () => {
    expect(itemsProgress([item("not_applicable")])).toEqual({ reviewed: 1, total: 1 });
  });

  it("vários ambientes com quantidades diferentes de itens: soma total, nunca média dos percentuais", () => {
    // Sala: 10 itens, 1 revisado (10%). Banheiro: 2 itens, 2 revisados (100%).
    // Média dos percentuais daria (10+100)/2 = 55%. A soma correta é 3/12 = 25%.
    const sala = room([item("good"), ...Array.from({ length: 9 }, () => item("not_inspected"))]);
    const banheiro = room([item("good"), item("fair")]);
    const total = overallProgress([sala, banheiro]);
    expect(total).toEqual({ reviewed: 3, total: 12 });
    expect(progressPercent(total)).toBe(25);
  });

  it("arredonda só na apresentação (5/8 = 62.5% → 63, não 62 nem 62.5)", () => {
    const items = [...Array.from({ length: 5 }, () => item("good")), ...Array.from({ length: 3 }, () => item("not_inspected"))];
    expect(progressPercent(roomProgress(room(items)))).toBe(63);
  });
});
