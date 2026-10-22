import { describe, expect, it } from "vitest";
import { displayStatusKeyFor, domainValueForStatusKey, isItemReviewed, INSPECTION_ITEM_STATUSES } from "./inspection-item-status";
import type { MysqlInspectionCondition } from "./inspections";

describe("mapeamento UI (4 botões) → domínio real (7 valores)", () => {
  it("os 4 botões escrevem sempre um valor real e válido do domínio", () => {
    const written = INSPECTION_ITEM_STATUSES.map((status) => domainValueForStatusKey(status.key));
    const validValues: MysqlInspectionCondition[] = ["not_inspected", "excellent", "good", "fair", "poor", "damaged", "not_applicable"];
    for (const value of written) expect(validValues).toContain(value);
    expect(written).toEqual(["good", "fair", "damaged", "not_applicable"]);
  });

  it.each([
    ["not_inspected", null],
    ["excellent", "good"],
    ["good", "good"],
    ["fair", "attention"],
    ["poor", "attention"],
    ["damaged", "damaged"],
    ["not_applicable", "not_applicable"],
  ] as const)("condition=%s exibe botão destacado %s", (condition, expected) => {
    expect(displayStatusKeyFor(condition)).toBe(expected);
  });
});

describe("isItemReviewed", () => {
  it("not_inspected não é revisado; qualquer outro valor é", () => {
    expect(isItemReviewed("not_inspected")).toBe(false);
    for (const value of ["excellent", "good", "fair", "poor", "damaged", "not_applicable"] as const) {
      expect(isItemReviewed(value)).toBe(true);
    }
  });
});
