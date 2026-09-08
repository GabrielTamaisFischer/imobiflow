import { describe, expect, it } from "vitest";
import { buildPdfBuffer, compareConditions, compareInspections, snapshotHash, stableJson } from "../src/services/inspection-f5f.js";

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
});
