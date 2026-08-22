import { describe, expect, it } from "vitest";
import { formatBrazilianDocument, isValidBrazilianDocument, normalizeBrazilianDocument } from "./brazilian-document";

describe("Brazilian owner documents", () => {
  it("normalizes and formats CPF/CNPJ without storing punctuation", () => {
    expect(normalizeBrazilianDocument("529.982.247-25")).toBe("52998224725");
    expect(formatBrazilianDocument("52998224725")).toBe("529.982.247-25");
    expect(formatBrazilianDocument("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("validates document type and rejects repeated or malformed digits", () => {
    expect(isValidBrazilianDocument("529.982.247-25", "individual")).toBe(true);
    expect(isValidBrazilianDocument("11.222.333/0001-81", "company")).toBe(true);
    expect(isValidBrazilianDocument("111.111.111-11", "individual")).toBe(false);
    expect(isValidBrazilianDocument("529.982.247-25", "company")).toBe(false);
  });
});
