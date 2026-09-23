import { describe, expect, it } from "vitest";
import { maskOwnerDocument, mergeProfileGroup, ownerEnrichmentProvider, ownerProfileDefaults, reconcileProviderIdentity } from "../src/services/owner-profile.js";

describe("owner profile/enrichment foundation", () => {
  it("creates all canonical profile groups empty", () => {
    const defaults = ownerProfileDefaults();
    expect(Object.keys(defaults)).toEqual(expect.arrayContaining(["identity", "contact", "address", "professional", "financial", "credit", "legal", "fiscal", "provenance", "confidence", "treatment_consent"]));
  });

  it("merges a section without discarding existing values", () => {
    expect(mergeProfileGroup({ profession: "Engenheira", source: "manual" }, { employer: "QA" })).toEqual({ profession: "Engenheira", source: "manual", employer: "QA" });
  });

  it("masks CPF/CNPJ when sensitive permission is absent", () => {
    expect(maskOwnerDocument("529.982.247-25")).toBe("***.***.247-25");
    expect(maskOwnerDocument("11.222.333/0001-81")).toBe("**.***.***/****-81");
  });

  it("uses the safe NOT_CONFIGURED provider without external calls", async () => {
    expect(ownerEnrichmentProvider.name).toBe("NOT_CONFIGURED");
    await expect(ownerEnrichmentProvider.run({ ownerId: "qa", document: null, sections: ["identity"] })).resolves.toMatchObject({ status: "NOT_CONFIGURED" });
  });

  it("reconciles provider identity additively and surfaces conflicting fields", () => {
    const result = reconcileProviderIdentity({ full_name: "Nome canônico", birth_date: "1980-01-01" }, { full_name: "Nome divergente", birth_date: "1980-01-01", parentage: ["Mãe QA"] });
    expect(result.accepted).toEqual(["birth_date", "parentage"]);
    expect(result.conflicts).toEqual([{ field: "full_name", current: "Nome canônico", incoming: "Nome divergente" }]);
    expect(result.merged).toEqual({ full_name: "Nome canônico", birth_date: "1980-01-01", parentage: ["Mãe QA"] });
  });
});
