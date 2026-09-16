import { describe, expect, it } from "vitest";
import {
  capabilityStatus,
  hasValidTreatmentConsent,
  intelligenceErrorMessage,
  latestIntelligenceCheck,
} from "./owner-intelligence-ui";

const profile = (consent: Record<string, unknown>) => ({ treatment_consent: consent }) as never;
const check = (status: string, summary: Record<string, unknown> = { sections: ["IDENTITY", "ADDRESS", "CIVIL"] }) => ({
  id: "check-1", owner_id: "owner-1", check_type: "intelligence", provider: "NOT_CONFIGURED", status,
  summary, warnings: [], checked_at: "2026-09-14T12:00:00.000Z", created_at: "2026-09-14T12:00:00.000Z",
});

describe("owner intelligence UI rules", () => {
  it("requires a non-empty consent timestamp and purpose", () => {
    expect(hasValidTreatmentConsent(profile({}))).toBe(false);
    expect(hasValidTreatmentConsent(profile({ authorized_at: "", purpose: "LGPD" }))).toBe(false);
    expect(hasValidTreatmentConsent(profile({ authorized_at: "2026-09-14", purpose: "consultas cadastrais" }))).toBe(true);
  });

  it("maps the controlled provider status without fabricating values", () => {
    expect(capabilityStatus([], "IDENTITY").label).toBe("Não consultado");
    expect(capabilityStatus([check("NOT_CONFIGURED")], "ADDRESS").label).toBe("Provider não configurado");
    expect(latestIntelligenceCheck([check("NOT_CONFIGURED")])?.summary).toEqual({ sections: ["IDENTITY", "ADDRESS", "CIVIL"] });
    expect(capabilityStatus([check("NOT_CONFIGURED", { sections: ["CREDIT"] })], "CREDIT").label).toBe("Provider não configurado");
    expect(capabilityStatus([check("NOT_CONFIGURED", { sections: ["LEGAL"] })], "LEGAL").label).toBe("Provider não configurado");
    expect(capabilityStatus([check("NOT_CONFIGURED", { sections: ["FISCAL"] })], "FISCAL").label).toBe("Provider não configurado");
  });

  it("keeps provider and consent errors visible", () => {
    expect(intelligenceErrorMessage(Object.assign(new Error("consent"), { code: "OWNER_TREATMENT_CONSENT_REQUIRED" }))).toContain("autorização");
    expect(intelligenceErrorMessage(new Error("Falha controlada"))).toBe("Falha controlada");
  });
});
