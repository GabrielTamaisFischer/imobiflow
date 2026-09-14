import { describe, expect, it } from "vitest";
import {
  calculateInformativeFinancialCapacity,
  normalizeOwnerEmployment,
  normalizeOwnerFinancial,
  sanitizeEmploymentForPermissions,
} from "../src/services/owner-financial.js";

describe("Owner Intelligence Phase B financial contracts", () => {
  it("normalizes professional/employment data with provenance and history", () => {
    const employment = normalizeOwnerEmployment({
      profession: "Arquiteta",
      employment_type: "PJ",
      current_employer: "Empresa QA",
      role: "Sócia",
      history: [{ employer: "Anterior", role: "Analista", income_monthly: 4200, provenance: "DOCUMENT" }],
      provenance: "OWNER_DECLARED",
    });
    expect(employment.status).toBe("complete");
    expect(employment.history[0]).toMatchObject({ employer: "Anterior", income_monthly: 4200, provenance: "DOCUMENT" });
  });

  it("keeps declared and proven income distinct and accepts multiple sources/assets", () => {
    const financial = normalizeOwnerFinancial({
      income_declared_monthly: 9000,
      income_proven_monthly: 7000,
      income_sources: [{ type: "salario", amount: 7000, recurrence: "monthly", verification_status: "VERIFICADA", document_id: "doc-qa" }],
      assets: [{ type: "imovel", label: "Apartamento QA", property_id: "property-qa", declared_value: 300000, verification_status: "DECLARADA" }],
    });
    expect(financial.income_declared_monthly).toBe(9000);
    expect(financial.income_proven_monthly).toBe(7000);
    expect(financial.income_sources).toHaveLength(1);
    expect(financial.assets[0]?.property_id).toBe("property-qa");
  });

  it("derives informative capacity without an approval/rejection decision", () => {
    const result = calculateInformativeFinancialCapacity({
      income_declared_monthly: 9000,
      income_proven_monthly: 7000,
      family_income_monthly: 1000,
      variable_income_monthly: 500,
      other_income_monthly: null,
      declared_commitment_monthly: 2000,
    });
    expect(result.status).toBe("DATA_SUFFICIENT");
    expect(result.total_income_monthly).toBe(10500);
    expect(result.estimated_available_monthly).toBe(8500);
    expect(result).not.toHaveProperty("approved");
    expect(result).not.toHaveProperty("rejected");
  });

  it("masks employer and history from a user without financial permission", () => {
    const masked = sanitizeEmploymentForPermissions({
      profession: "Arquiteta",
      current_employer: "Empresa QA",
      employer_cnpj: "00.000.000/0001-00",
      history: [{ employer: "Anterior" }],
    }, false);
    expect(masked).toMatchObject({ profession: "Arquiteta" });
    expect(masked).not.toHaveProperty("current_employer");
    expect(masked).not.toHaveProperty("employer_cnpj");
    expect(masked).not.toHaveProperty("history");
  });

  it("rejects invalid financial enums and negative values", () => {
    expect(() => normalizeOwnerFinancial({ income_declared_monthly: -1 })).toThrow("não negativo");
    expect(() => normalizeOwnerFinancial({ income_sources: [{ type: "unknown", amount: 1 }] })).toThrow("tipo da fonte");
  });
});
