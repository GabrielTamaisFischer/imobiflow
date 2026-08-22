import { describe, expect, it } from "vitest";
import {
  buildWebsiteDomainDnsChecklist,
  normalizeWebsiteDomain,
} from "../src/services/website-builder-domain.js";

describe("Website Builder domain helpers", () => {
  it("normalizes user provided domains without storing URLs", () => {
    expect(normalizeWebsiteDomain(" https://WWW.Exemplo.com.br/imoveis?x=1 ")).toBe("www.exemplo.com.br");
    expect(normalizeWebsiteDomain("site.imobiliaria.com.br.")).toBe("site.imobiliaria.com.br");
  });

  it("builds pending DNS instructions without pretending the domain is verified", () => {
    const checklist = buildWebsiteDomainDnsChecklist("imobiliaria.com.br", "minha-imobiliaria");

    expect(checklist.status).toBe("pending");
    expect(checklist.target).toBe("minha-imobiliaria.imobiflow-sites.local");
    expect(checklist.records.map((record) => record.type)).toEqual(["A", "CNAME"]);
  });

  it("uses a CNAME instruction for subdomains", () => {
    const checklist = buildWebsiteDomainDnsChecklist("site.imobiliaria.com.br", "site-demo");

    expect(checklist.records).toHaveLength(1);
    expect(checklist.records[0]).toMatchObject({
      type: "CNAME",
      name: "site",
      value: "site-demo.imobiflow-sites.local",
    });
  });
});
