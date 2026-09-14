import { describe, expect, it } from "vitest";
import {
  buildOwner360Status,
  buildOwnerContractData,
  normalizeOwnerAddress,
  normalizeOwnerCivil,
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

  it("derives contract data from the canonical profile without provider-specific fields", () => {
    const data = buildOwnerContractData({
      owner: { name: "Pessoa QA", document: "52998224725" },
      profile: {
        identity: { rg: "QA-1", nationality: "Brasileira", birthplace: "São Paulo", profession: "Arquiteta", marital_status: "solteira" },
        address: { city: "São Paulo", state: "SP" },
      },
    });
    expect(data).toMatchObject({ name: "Pessoa QA", cpf: "52998224725", rg: "QA-1", profession: "Arquiteta", maritalStatus: "solteira" });
    expect(data.address).toEqual({ city: "São Paulo", state: "SP" });
  });
});
