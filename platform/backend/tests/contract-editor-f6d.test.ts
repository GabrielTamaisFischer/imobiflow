import { describe, expect, it } from "vitest";
import { assertSafeContractContent, resolveContractPlaceholders } from "../src/services/contract-editor-f6d.js";

describe("F6D contract editor", () => {
  it("resolves only allowlisted placeholders including multiple parties", () => {
    const result = resolveContractPlaceholders("{{property.code}} · {{owners}} · {{tenants}}", { property: { code: "QA-1" }, parties: [{ party_type: "owner", name: "A" }, { party_type: "owner", name: "B" }, { party_type: "tenant", name: "T" }] });
    expect(result.unknown).toEqual([]);
    expect(result.resolved).toBe("QA-1 · A, B · T");
  });
  it("reports unknown namespaces and rejects executable markup", () => {
    expect(resolveContractPlaceholders("{{process.env}}", {}).unknown).toEqual(["process.env"]);
    expect(() => assertSafeContractContent("<script>alert(1)</script>")).toThrow();
  });
});
