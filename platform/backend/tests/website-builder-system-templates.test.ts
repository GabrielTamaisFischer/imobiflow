import { describe, expect, it, vi } from "vitest";
import {
  ensureSystemWebsiteTemplates,
  systemWebsiteTemplates,
  SYSTEM_WEBSITE_TEMPLATE_COMPANY_ID,
} from "../src/services/website-builder-system-templates.js";

describe("Website Builder system templates", () => {
  it("exposes only structural system templates without fake production records", () => {
    expect(systemWebsiteTemplates.length).toBeGreaterThanOrEqual(2);
    expect(systemWebsiteTemplates.map((template) => template.slug)).toContain("site-em-branco");
    expect(systemWebsiteTemplates.map((template) => template.slug)).toContain("imobiliaria-premium-dourado");

    const serialized = JSON.stringify(systemWebsiteTemplates).toLowerCase();
    expect(serialized).not.toContain("preview");
    expect(serialized).not.toContain("teste");
    expect(serialized).not.toContain("apartamento teste");
    expect(serialized).not.toContain("lead fict");
  });

  it("keeps real estate blocks connected to published property sources", () => {
    const premium = systemWebsiteTemplates.find((template) => template.slug === "imobiliaria-premium-dourado");
    expect(premium).toBeTruthy();

    const serialized = JSON.stringify(premium);
    expect(serialized).toContain("published_properties");
    expect(serialized).toContain("Nenhum imóvel publicado ainda.");
  });

  it("upserts templates with the system company id", async () => {
    const upsert = vi.fn().mockResolvedValue({});

    await ensureSystemWebsiteTemplates({
      websiteTemplate: { upsert },
    } as never);

    expect(upsert).toHaveBeenCalledTimes(systemWebsiteTemplates.length);
    for (const call of upsert.mock.calls) {
      expect(call[0].where.companyId_slug.companyId).toBe(SYSTEM_WEBSITE_TEMPLATE_COMPANY_ID);
      expect(call[0].create.companyId).toBe(SYSTEM_WEBSITE_TEMPLATE_COMPANY_ID);
      expect(call[0].create.isSystem).toBe(true);
      expect(call[0].create.isActive).toBe(true);
    }
  });
});
