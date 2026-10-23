import { describe, expect, it } from "vitest";
import {
  buildPdfBuffer,
  compareConditions,
  compareInspections,
  ITEM_OUTCOME_LABELS,
  ROOM_OUTCOME_LABELS,
  snapshotHash,
  stableJson,
  summarizeComparison,
  toWinAnsi,
} from "../src/services/inspection-f5f.js";

describe("F5F laudo, integridade e comparação", () => {
  it("gera PDF não vazio e hash determinístico", () => {
    const pdf = buildPdfBuffer("Laudo", ["Inspection QA", "Item: piso | Condição: good"]);
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.length).toBeGreaterThan(200);
    expect(snapshotHash({ b: 2, a: 1 })).toBe(snapshotHash({ a: 1, b: 2 }));
    expect(stableJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it("classifica condições sem inferir responsabilidade", () => {
    expect(compareConditions("excellent", "good").outcome).toBe("worse");
    expect(compareConditions("poor", "good").outcome).toBe("better");
    expect(compareConditions("good", "good").outcome).toBe("same");
    expect(compareConditions("not_inspected", "damaged").outcome).toBe("not_comparable");
  });

  it("compara rooms/items e exige mesmo imóvel/empresa", () => {
    const base = { company_id: "c1", property: { id: "p1", code: "P", title: "Casa" }, inspection_id: "i1", type: "entry", status: "completed", assigned_user: null, created_by: "u", created_at: "", updated_at: "", completed_at: null, archived_at: null, version: 1, notes: null, evidence: [], rooms: [{ id: "r1", name: "Sala", position: 0, notes: null, items: [{ id: "x", name: "Piso", position: 0, condition: "good", notes: null }] }] } as const;
    const result = compareInspections(base, { ...base, inspection_id: "i2", rooms: [{ ...base.rooms[0], items: [{ ...base.rooms[0].items[0], condition: "damaged" }] }] });
    expect(result.rooms[0].items[0].outcome).toBe("worse");
    expect(() => compareInspections(base, { ...base, inspection_id: "i3", property: { ...base.property, id: "p2" } })).toThrow();
  });

  it("Bloco 5 — expõe os ids reais de room/item de cada lado, para a camada HTTP anexar evidências sem recasar por nome+posição", () => {
    const base = { company_id: "c1", property: { id: "p1", code: "P", title: "Casa" }, inspection_id: "i1", type: "entry", status: "completed", assigned_user: null, created_by: "u", created_at: "", updated_at: "", completed_at: null, archived_at: null, version: 1, notes: null, evidence: [], rooms: [{ id: "r1", name: "Sala", position: 0, notes: null, items: [{ id: "x1", name: "Piso", position: 0, condition: "good", notes: null }] }] } as const;
    const exit = { ...base, inspection_id: "i2", rooms: [{ id: "r2", name: "Sala", position: 0, notes: null, items: [{ id: "x2", name: "Piso", position: 0, condition: "damaged", notes: null }] }] };
    const result = compareInspections(base, exit);
    expect(result.rooms[0].entry_room_id).toBe("r1");
    expect(result.rooms[0].exit_room_id).toBe("r2");
    expect(result.rooms[0].items[0].entry_item_id).toBe("x1");
    expect(result.rooms[0].items[0].exit_item_id).toBe("x2");
  });

  it("Bloco 5 — item novo/ausente também expõe o id do lado presente", () => {
    const base = { company_id: "c1", property: { id: "p1", code: "P", title: "Casa" }, inspection_id: "i1", type: "entry", status: "completed", assigned_user: null, created_by: "u", created_at: "", updated_at: "", completed_at: null, archived_at: null, version: 1, notes: null, evidence: [], rooms: [{ id: "r1", name: "Sala", position: 0, notes: null, items: [{ id: "x1", name: "Piso", position: 0, condition: "good", notes: null }] }] } as const;
    // Saída com um item extra (novo) que não existe na entrada.
    const exit = { ...base, inspection_id: "i2", rooms: [{ id: "r2", name: "Sala", position: 0, notes: null, items: [{ id: "x1b", name: "Piso", position: 0, condition: "good", notes: null }, { id: "y2", name: "Armário", position: 1, condition: "good", notes: null }] }] };
    const result = compareInspections(base, exit);
    const newItem = result.rooms[0].items.find((item) => item.name === "Armário")!;
    expect(newItem.outcome).toBe("new");
    expect(newItem.entry_item_id).toBeNull();
    expect(newItem.exit_item_id).toBe("y2");
  });

  it("Bloco 5 — summarizeComparison conta itens por outcome, sem contar ambientes", () => {
    const comparison = {
      rooms: [
        { items: [{ outcome: "same", changed: false }, { outcome: "worse", changed: true }] },
        { items: [{ outcome: "new", changed: true }, { outcome: "absent", changed: true }, { outcome: "not_comparable", changed: false }, { outcome: "better", changed: true }] },
      ],
    } as any;
    const summary = summarizeComparison(comparison);
    expect(summary).toEqual({ total: 6, same: 1, changed: 4, better: 1, worse: 1, not_comparable: 1, new: 1, absent: 1 });
  });

  it("Bloco 5 — labels PT-BR nunca atribuem culpa (sem menção a locatário/causado/responsável no texto)", () => {
    for (const label of [...Object.values(ITEM_OUTCOME_LABELS), ...Object.values(ROOM_OUTCOME_LABELS)]) {
      expect(label.toLowerCase()).not.toMatch(/locat[aá]rio|causad[oa]|respons[aá]vel|culpa/);
    }
    expect(ITEM_OUTCOME_LABELS.same).toBe("Sem alteração");
    expect(ITEM_OUTCOME_LABELS.better).toBe("Melhor estado");
    expect(ITEM_OUTCOME_LABELS.worse).toBe("Pior estado");
    expect(ITEM_OUTCOME_LABELS.not_comparable).toBe("Não comparável");
    expect(ITEM_OUTCOME_LABELS.new).toBe("Item novo");
    expect(ITEM_OUTCOME_LABELS.absent).toBe("Ausente na saída");
  });

  it("grava acentos em WinAnsiEncoding (1 byte por caractere), sem UTF-8 corrompido", () => {
    const pdf = buildPdfBuffer("Laudo de vistoria", ["Imóvel: Apartamento — Condição: ótimo; Não vistoriado; ação “ok”"]);
    expect(pdf.includes(Buffer.from("/Encoding /WinAnsiEncoding", "latin1"))).toBe(true);
    // "ó" deve ser o byte 0xF3; em UTF-8 seria 0xC3 0xB3 (exibido como "Ã³").
    expect(pdf.includes(Buffer.from([0x49, 0x6d, 0xf3, 0x76, 0x65, 0x6c]))).toBe(true); // "Imóvel"
    expect(pdf.includes(Buffer.from("Imóvel", "utf8"))).toBe(false);
    expect(pdf.includes(Buffer.from([0x97]))).toBe(true); // travessão "—" na WinAnsi
    // A tabela xref aponta para os offsets reais em bytes.
    const text = pdf.toString("latin1");
    const xrefStart = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split(/\s/)[0]);
    expect(text.slice(xrefStart, xrefStart + 4)).toBe("xref");
    const firstOffset = Number(text.slice(xrefStart).split("\n")[3].slice(0, 10));
    expect(text.slice(firstOffset, firstOffset + 7)).toBe("1 0 obj");
  });

  it("toWinAnsi troca caracteres sem representação por ?", () => {
    expect(toWinAnsi("Ação")).toBe("Ação");
    expect(toWinAnsi("casa 🏠")).toBe("casa ?");
    expect(toWinAnsi("…•€")).toBe(String.fromCharCode(0x85, 0x95, 0x80));
  });
});
