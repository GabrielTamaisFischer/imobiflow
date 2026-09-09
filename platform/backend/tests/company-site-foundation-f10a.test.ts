import { describe, expect, it } from "vitest";
import {
  applyCompanySiteTemplate,
  COMPANY_SITE_SECTION_TYPES,
  COMPANY_SITE_TEMPLATES,
  companySiteConfigSchema,
} from "../src/services/company-site-foundation.js";
import { publicSiteView } from "../src/services/mysql-real-estate.js";
import { requireSiteManage } from "../src/middleware/auth.js";

describe("F10A — CompanySite canônico", () => {
  it("oferece catálogo estrutural de templates sem conteúdo tenant-specific", () => {
    expect(COMPANY_SITE_TEMPLATES.map((template) => template.key)).toEqual([
      "classic",
      "modern",
      "minimal",
    ]);
    for (const template of COMPANY_SITE_TEMPLATES) {
      expect(
        template.sections.every((section) => COMPANY_SITE_SECTION_TYPES.includes(section.type)),
      ).toBe(true);
    }
  });

  it("instancia template por deep copy, evitando estado compartilhado entre empresas", () => {
    const a = applyCompanySiteTemplate("modern");
    const b = applyCompanySiteTemplate("modern");
    expect(a).toEqual(b);
    a.sections![0]!.props.title = "Empresa A";
    expect(b.sections![0]!.props.title).not.toBe("Empresa A");
  });

  it("valida seções, ordem, tema e bloqueia scripts/URLs javascript", () => {
    expect(
      companySiteConfigSchema.safeParse({
        theme: {
          primary: "#123456",
          secondary: "#111111",
          accent: "#abcdef",
          background: "#ffffff",
          text: "#000000",
          typography: "Inter",
          spacing: 24,
          radius: 12,
        },
        sections: [{ id: "hero", type: "HERO", enabled: true, order: 0, props: { title: "Olá" } }],
      }).success,
    ).toBe(true);
    expect(
      companySiteConfigSchema.safeParse({
        sections: [{ id: "x", type: "NOT_ALLOWED", enabled: true, order: 0, props: {} }],
      }).success,
    ).toBe(false);
    expect(
      companySiteConfigSchema.safeParse({
        sections: [
          {
            id: "x",
            type: "HERO",
            enabled: true,
            order: 0,
            props: { href: "javascript:alert(1)" },
          },
        ],
      }).success,
    ).toBe(false);
    expect(companySiteConfigSchema.safeParse({ custom_js: "alert(1)" }).success).toBe(false);
  });

  it("publica somente o snapshot publicado e não deixa draft substituir a versão pública", () => {
    const view = publicSiteView({
      id: "site-a",
      companyId: "company-a",
      slug: "empresa-a",
      customDomain: null,
      status: "published",
      brandName: "Draft A",
      headline: "Draft",
      description: "Draft",
      phone: null,
      whatsapp: null,
      email: null,
      logoUrl: null,
      primaryColor: "#000000",
      settingsJson: { template_key: "modern" },
      seoJson: {},
      templateKey: "modern",
      version: 3,
      publishedConfigJson: {
        brand_name: "Publicado A",
        headline: "Publicado",
        slug: "empresa-a",
        settings_json: { template_key: "classic" },
        seo_json: {},
        published_at: "2026-09-09T00:00:00.000Z",
      },
      publishedAt: new Date("2026-09-09T00:00:00.000Z"),
      createdAt: new Date("2026-09-08T00:00:00.000Z"),
      updatedAt: new Date("2026-09-09T00:00:00.000Z"),
    });
    expect(view.brand_name).toBe("Publicado A");
    expect(view.headline).toBe("Publicado");
    expect(view.settings_json).toEqual({ template_key: "classic" });
    expect(view).not.toHaveProperty("company_id");
    expect(view).not.toHaveProperty("published_config_json");
  });

  it("bloqueia Broker mesmo quando o catálogo legado ainda contém site.manage", () => {
    let nextCalled = false;
    let statusCode = 0;
    let body: unknown;
    const req = { access: { appUser: { role: "broker", permissions: ["site.manage"] } } } as never;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        body = value;
        return this;
      },
    } as never;
    requireSiteManage(req, res, () => {
      nextCalled = true;
    });
    expect(statusCode).toBe(403);
    expect(body).toMatchObject({ error: "PERMISSION_DENIED" });
    expect(nextCalled).toBe(false);
  });
});
