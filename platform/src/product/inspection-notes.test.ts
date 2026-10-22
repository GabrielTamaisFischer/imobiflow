import { describe, expect, it } from "vitest";
import { countInspectionNotes } from "./inspection-notes";

function room(overrides: { notes?: string | null; items?: Array<{ notes?: string | null }> } = {}) {
  return {
    id: "room-1",
    name: "Sala",
    position: 0,
    notes: overrides.notes ?? null,
    items: (overrides.items ?? []).map((item, index) => ({ id: `item-${index}`, name: `Item ${index}`, condition: "not_inspected" as const, position: index, notes: item.notes ?? null })),
  };
}

describe("countInspectionNotes (SUB-BLOCO 4 — contagem de observações do resumo)", () => {
  it("conta a observação geral da vistoria quando preenchida", () => {
    expect(countInspectionNotes({ notes: "Cliente presente na vistoria.", rooms: [] })).toBe(1);
  });

  it("não conta a observação geral quando vazia ou só espaços", () => {
    expect(countInspectionNotes({ notes: null, rooms: [] })).toBe(0);
    expect(countInspectionNotes({ notes: "   ", rooms: [] })).toBe(0);
    expect(countInspectionNotes({ notes: "", rooms: [] })).toBe(0);
  });

  it("conta notes de ambiente quando preenchidas", () => {
    expect(countInspectionNotes({ notes: null, rooms: [room({ notes: "Piso novo." })] })).toBe(1);
  });

  it("não conta notes de ambiente vazias/espaços", () => {
    expect(countInspectionNotes({ notes: null, rooms: [room({ notes: "   " })] })).toBe(0);
  });

  it("conta notes de item preenchidas, uma por item", () => {
    const withItems = room({ items: [{ notes: "Fissura na parede." }, { notes: null }, { notes: "Infiltração." }] });
    expect(countInspectionNotes({ notes: null, rooms: [withItems] })).toBe(2);
  });

  it("soma observação geral + ambiente + itens de vários ambientes, sem duplicar", () => {
    const sala = room({ notes: "Pintura recente.", items: [{ notes: "Rodapé solto." }] });
    const cozinha = room({ notes: null, items: [{ notes: "Vazamento na torneira." }, { notes: "  " }] });
    const total = countInspectionNotes({ notes: "Vistoria acompanhada pelo proprietário.", rooms: [sala, cozinha] });
    // 1 (geral) + 1 (sala.notes) + 1 (sala item) + 1 (cozinha item preenchido) = 4
    expect(total).toBe(4);
  });

  it("vistoria sem nenhuma observação conta zero", () => {
    expect(countInspectionNotes({ notes: null, rooms: [room(), room()] })).toBe(0);
  });
});
