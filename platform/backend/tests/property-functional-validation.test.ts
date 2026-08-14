import { describe, expect, it } from "vitest";
import { ownerSchema, propertySchema } from "../src/routes/real-estate.js";

describe("property functional validation", () => {
  it("accepts valid CPF/CNPJ and rejects a document with the wrong person type", () => {
    expect(ownerSchema.safeParse({ owner_type: "individual", name: "Pessoa sintética", document: "529.982.247-25" }).success).toBe(true);
    expect(ownerSchema.safeParse({ owner_type: "company", name: "Empresa sintética", document: "11.222.333/0001-81" }).success).toBe(true);
    expect(ownerSchema.safeParse({ owner_type: "company", name: "Empresa sintética", document: "529.982.247-25" }).success).toBe(false);
  });

  it("allows an incomplete draft but validates contradictory business data", () => {
    expect(propertySchema.safeParse({ status: "draft", title: "", property_type: "studio", operation: "season" }).success).toBe(true);
    expect(propertySchema.safeParse({ title: "Casa", bedrooms: 1, suites: 2 }).success).toBe(false);
    expect(propertySchema.safeParse({ title: "Casa", state: "São Paulo" }).success).toBe(false);
    expect(propertySchema.safeParse({ title: "Casa", zip_code: "123" }).success).toBe(false);
  });
});
