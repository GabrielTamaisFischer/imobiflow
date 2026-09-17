import { describe, expect, it } from "vitest";
import { selectCanonicalCandidate } from "../src/services/owner-360.js";

describe("Owner Intelligence 360 consolidation", () => {
  it("selects an official/verified source before declared values", () => {
    expect(selectCanonicalCandidate([
      { value: "SOLTEIRO", source: "declared", confidence: "high" },
      { value: "CASADO", source: "official", confidence: "medium" },
    ])).toMatchObject({ value: "CASADO", source: "official" });
  });

  it("uses confidence as deterministic tie-breaker for equal provenance", () => {
    expect(selectCanonicalCandidate([
      { value: "A", source: "document", confidence: "low" },
      { value: "B", source: "document", confidence: "high" },
    ])).toMatchObject({ value: "B", source: "document" });
  });

  it("keeps unknown/low-confidence sources from becoming canonical over a validated document", () => {
    expect(selectCanonicalCandidate([
      { value: "Renda A", source: "estimated", confidence: "high" },
      { value: "Renda B", source: "document", confidence: "low" },
    ])?.value).toBe("Renda B");
  });
});
