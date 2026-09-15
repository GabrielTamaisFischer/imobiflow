import { describe, expect, it } from "vitest";
import {
  buildOwner360Status,
  buildOwnerContractData,
  buildInsuranceApplicantData,
  buildFinancingApplicantData,
  normalizeOwnerAddress,
  normalizeOwnerCivil,
  normalizeOwnerCredit,
  normalizeOwnerLegal,
  normalizeOwnerIdentity,
  ownerIntelligenceRegistry,
} from "../src/services/owner-intelligence.js";

describe("Owner Intelligence 360 foundation", () => {
  it("exposes the explicit NOT_CONFIGURED provider without making external calls", async () => {
    const provider = ownerIntelligenceRegistry.resolve("IDENTITY");
    expect(provider?.name).toBe("NOT_CONFIGURED");
    expect(ownerIntelligenceRegistry.list()[0]?.capabilities).toContain("ADDRESS");
    await expect(provider?.query({ document: "52998224725", capabilities: ["IDENTITY"] })).resolves.toMatchObject({
      status: "not_configured",
      values: {},
      sections: ["IDENTITY"],
    });
  });

  it("normalizes identity, address and civil fields without inventing missing values", () => {
    const identity = normalizeOwnerIdentity({ cpf: "52998224725", full_name: "Pessoa QA", filiation: ["Mae QA"] });
    const address = normalizeOwnerAddress({ cep: "01001000", street: "Rua QA", city: "São Paulo", uf: "SP" });
    const civil = normalizeOwnerCivil({ marital_status: "casado", property_regime: "comunhao_parcial" });
    expect(identity.cpf.value).toBe("52998224725");
    expect(identity.birthDate.value).toBeNull();
    expect(address.postalCode.value).toBe("01001000");
    expect(address.state.value).toBe("SP");
    expect(civil.maritalStatus.value).toBe("casado");
    expect(civil.spouseCpf.value).toBeNull();
  });

  it("builds a truthful 360 status instead of treating NOT_CONFIGURED as verified", () => {
    const status = buildOwner360Status({
      profile: {
        identity: { cpf: "52998224725", full_name: "Pessoa QA", birth_date: "1990-01-01" },
        address: { city: "São Paulo", status: "declared" },
        financial: { income_declared: 5000 },
        treatment_consent: { authorized_at: "2026-09-14T00:00:00.000Z", purpose: "analysis" },
        fiscal: {},
      },
      checks: [],
    });
    expect(status.identity).toBe("complete");
    expect(status.address).toBe("declared");
    expect(status.income).toBe("declared");
    expect(status.credit).toBe("not_consulted");
    expect(status.legal).toBe("pending");
    expect(status.consent).toBe("valid");
  });

  it("builds contract, insurance and financing DTOs from the same owner profile source", () => {
    const input = { owner: { name: "Pessoa QA" }, profile: { identity: { full_name: "Pessoa QA" }, address: { city: "São Paulo" }, professional: { profession: "Arquiteta" }, financial: { assets: [{ type: "imovel" }], declared_assets_total: 100000, income_declared_monthly: 5000 } } };
    expect(buildInsuranceApplicantData(input)).toMatchObject({ professional: { profession: "Arquiteta" }, income: { declaredMonthly: 5000 } });
    expect(buildFinancingApplicantData(input).patrimony).toMatchObject({ declaredTotal: 100000 });
  });

  it("derives contract data from the canonical profile without provider-specific fields", () => {
    const data = buildOwnerContractData({
      owner: { name: "Pessoa QA", document: "52998224725" },
      profile: {
        identity: { rg: "QA-1", nationality: "Brasileira", birthplace: "São Paulo", profession: "Arquiteta", marital_status: "solteira" },
        professional: { employment_type: "PJ", current_employer: "Empresa QA", role: "Sócia", started_at: "2025-01-01" },
        financial: { income_declared_monthly: 5000, income_proven_monthly: 4000, income_sources: [{ type: "salario", amount: 4000 }] },
        address: { city: "São Paulo", state: "SP" },
      },
    });
    expect(data).toMatchObject({ name: "Pessoa QA", cpf: "52998224725", rg: "QA-1", profession: "Arquiteta", maritalStatus: "solteira", employment: { type: "PJ", employer: "Empresa QA", role: "Sócia" } });
    expect(data.income).toMatchObject({ declaredMonthly: 5000, provenMonthly: 4000 });
    expect(data.address).toEqual({ city: "São Paulo", state: "SP" });
  });

  it("normalizes factual credit data without inventing provider scale or details", () => {
    const credit = normalizeOwnerCredit({
      status: "CURRENT",
      score: "742",
      score_range: "701-800",
      score_scale: "0-1000",
      has_restrictions: false,
      restriction_count: 0,
      debts: [{ creditor: "Credor QA", amount: "1200.50", status: "OPEN" }],
      protests: [{ city: "São Paulo", state: "SP" }],
      provider: "CREDIT_BUREAU_QA",
    });
    expect(credit.status).toBe("CURRENT");
    expect(credit.score).toBe(742);
    expect(credit.score_range).toBe("701-800");
    expect(credit.score_scale).toBe("0-1000");
    expect(credit.restriction_count).toBe(0);
    expect(credit.debts[0]).toMatchObject({ amount: 1200.5, creditor: "Credor QA" });
    expect(credit.protests[0]).toMatchObject({ city: "São Paulo", state: "SP" });
    expect(credit.negative_listing_count).toBeNull();
  });

  it("keeps NOT_CONFIGURED distinct from a real clear result", () => {
    const notConfigured = normalizeOwnerCredit({ status: "not_configured" });
    const clear = normalizeOwnerCredit({ status: "CLEAR", has_restrictions: false, restriction_count: 0, debt_count: 0, protest_count: 0, negative_listing_count: 0 });
    expect(notConfigured.status).toBe("NOT_CONFIGURED");
    expect(notConfigured.confidence).toBe("unknown");
    expect(notConfigured.restriction_count).toBeNull();
    expect(clear.status).toBe("CLEAR");
    expect(clear.restriction_count).toBe(0);
  });

  it("normalizes factual legal processes and certificates without inferring liability", () => {
    const legal = normalizeOwnerLegal({
      status: "RECORDS_FOUND",
      processes: [{ process_number: "0001234-56.2026.8.26.0001", tribunal: "TJSP", procedural_class: "Ação cível", subject: "Cobrança", person_role: "réu", case_value: "1200.50", sealed: false, opposing_parties: ["Parte QA"] }],
      certificates: [{ type: "distribuição cível", issuing_authority: "TJSP", result_status: "NO_RECORDS_FOUND", expires_at: "2027-01-01" }],
      provider: "LEGAL_PROVIDER_QA",
    });
    expect(legal.status).toBe("RECORDS_FOUND");
    expect(legal.process_count).toBe(1);
    expect(legal.processes[0]).toMatchObject({ process_number: "0001234-56.2026.8.26.0001", person_role: "réu", case_value: 1200.5, sealed: false });
    expect(legal.certificates[0]).toMatchObject({ type: "distribuição cível", result_status: "NO_RECORDS_FOUND" });
    expect(legal.confidence).toBe("unknown");
  });

  it("keeps NOT_CONFIGURED distinct from no-records legal results", () => {
    expect(normalizeOwnerLegal({ status: "NOT_CONFIGURED" })).toMatchObject({ status: "NOT_CONFIGURED", has_records: null, process_count: null, processes: [] });
    expect(normalizeOwnerLegal({ status: "NO_RECORDS_FOUND" })).toMatchObject({ status: "NO_RECORDS_FOUND", has_records: false, process_count: 0 });
    expect(normalizeOwnerLegal({ status: "ERROR" })).toMatchObject({ status: "ERROR", has_records: null, process_count: null });
  });

  it("derives credit status from the canonical intelligence check", () => {
    expect(buildOwner360Status({ profile: {}, checks: [{ check_type: "intelligence", status: "NOT_CONFIGURED", summary: { sections: ["CREDIT"] } }] }).credit).toBe("not_configured");
    expect(buildOwner360Status({ profile: {}, checks: [{ check_type: "intelligence", status: "CLEAR", summary: { sections: ["CREDIT"], values: { has_restrictions: false } } }] }).credit).toBe("clear");
    expect(buildOwner360Status({ profile: {}, checks: [{ check_type: "intelligence", status: "HAS_RESTRICTIONS", summary: { sections: ["CREDIT"], values: { has_restrictions: true } } }] }).credit).toBe("has_restrictions");
  });

  it("derives legal status from an intelligence check scoped to LEGAL", () => {
    expect(buildOwner360Status({ profile: {}, checks: [{ check_type: "intelligence", status: "NOT_CONFIGURED", summary: { sections: ["LEGAL"] } }] }).legal).toBe("not_configured");
    expect(buildOwner360Status({ profile: {}, checks: [{ check_type: "intelligence", status: "RECORDS_FOUND", summary: { sections: ["LEGAL"] } }] }).legal).toBe("records_found");
  });
});
