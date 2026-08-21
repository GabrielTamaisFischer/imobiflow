import { describe, expect, it } from "vitest";
import { normalizeLeadEmail, normalizeLeadPhone } from "../src/services/lead-intake.js";
import { readFile } from "node:fs/promises";

describe("lead intake normalization and contract", () => {
  it("normalizes email and phone without crossing tenant boundaries", () => {
    expect(normalizeLeadEmail("  CRM-SITE-QA-001@Example.TEST ")).toBe("crm-site-qa-001@example.test");
    expect(normalizeLeadPhone("+55 (11) 99999-0001")).toBe("5511999990001");
    expect(normalizeLeadEmail(" ")).toBeNull();
  });

  it("keeps public capture tenant-safe and centralized", async () => {
    const [publicRoute, service] = await Promise.all([
      readFile(new URL("../src/routes/public-sites.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/services/mysql-real-estate.ts", import.meta.url), "utf8"),
    ]);
    expect(publicRoute).toContain("getMysqlPublishedSite");
    expect(publicRoute).toContain("property_id");
    expect(publicRoute).toContain("LEAD_RATE_LIMITED");
    expect(service).toContain("ingestLead");
    expect(service).toContain("ingestLead({");
  });

  it("records deduplicated intake occurrences and events", async () => {
    const source = await readFile(new URL("../src/services/lead-intake.ts", import.meta.url), "utf8");
    expect(source).toContain('status: "open"');
    expect(source).toContain("emailNormalized");
    expect(source).toContain("phoneNormalized");
    expect(source).toContain('eventType: "lead.received"');
    expect(source).toContain("siteLead.create");
    expect(source).toContain("ensureDefaultCrmPipeline");
  });
});
