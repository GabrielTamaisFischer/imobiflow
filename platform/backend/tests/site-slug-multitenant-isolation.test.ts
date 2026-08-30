import { beforeEach, describe, expect, it, vi } from "vitest";

// P0 multiempresa: reproduz e trava a regressão descoberta na homologação do
// núcleo de Imóveis (2026-08-30) — duas empresas diferentes conseguiam
// publicar exatamente o mesmo slug de site público. Como GET
// /public/sites/:slug resolve um único CompanySite pelo slug (sem contexto
// de empresa, pois é uma rota pública), a segunda empresa a publicar o slug
// tinha seu site "sequestrado": visitantes que pensavam estar no site dela
// caíam sempre no site da primeira empresa, inclusive enviando leads reais
// (nome/telefone/e-mail/mensagem) para o CRM da empresa errada.
//
// Correção em duas camadas:
//  1) isSiteSlugTakenByAnotherCompany() — checagem de aplicação usada em
//     PUT /site/settings (routes/sites.ts), devolve 409 SITE_SLUG_TAKEN.
//  2) company_sites.slug agora é @@unique([slug]) globalmente no banco
//     (migração 202608300003_site_slug_global_unique) — backstop contra
//     corridas, verificado manualmente neste sandbox com um INSERT direto
//     que falhou com ER_DUP_ENTRY após a migração.
//
// Este teste cobre a camada 1 (a única testável sem uma conexão MySQL real).

const { database } = vi.hoisted(() => ({
  database: {
    companySite: { findFirst: vi.fn() },
  },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));

import { isSiteSlugTakenByAnotherCompany } from "../src/services/mysql-real-estate.js";

describe("isolamento multiempresa do slug do site público", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloqueia quando o slug já pertence a OUTRA empresa", async () => {
    database.companySite.findFirst.mockResolvedValue({ id: "site-empresa-a" });

    const taken = await isSiteSlugTakenByAnotherCompany("empresa-b", "imoveis-premium");

    expect(taken).toBe(true);
    expect(database.companySite.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: "imoveis-premium", companyId: { not: "empresa-b" } },
      }),
    );
  });

  it("permite quando o slug está livre ou já é da própria empresa (edição)", async () => {
    database.companySite.findFirst.mockResolvedValue(null);

    const taken = await isSiteSlugTakenByAnotherCompany("empresa-a", "imoveis-premium");

    expect(taken).toBe(false);
  });
});
