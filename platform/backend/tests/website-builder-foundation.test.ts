import { describe, expect, it } from "vitest";
import { getMissingCloudinaryConfig } from "../src/services/storage/cloudinary-storage.js";
import { getMissingR2Config } from "../src/services/storage/r2-storage-provider.js";
import { buildWebsiteBuilderFoundationStatus } from "../src/services/website-builder-status.js";
import {
  buildBlankHomePageTemplate,
  normalizeTemplateStructure,
  sanitizeWebsiteSlug,
} from "../src/services/website-builder-foundation.js";

describe("website builder foundation", () => {
  it("cria estrutura de site em branco sem conteudo ficticio de producao", () => {
    const home = buildBlankHomePageTemplate();

    expect(home).toEqual({
      title: "Página inicial",
      slug: "home",
      pageType: "home",
      sections: [],
    });
  });

  it("normaliza slug com acentos, espacos e caracteres especiais", () => {
    expect(sanitizeWebsiteSlug("Site Da Mae - Alto Padrao 2026!")).toBe("site-da-mae-alto-padrao-2026");
    expect(sanitizeWebsiteSlug("!!!", "site-fallback")).toBe("site-fallback");
  });

  it("normaliza template estrutural com paginas, secoes e componentes", () => {
    const structure = normalizeTemplateStructure({
      pages: [
        {
          title: "Pagina Principal",
          slug: "Pagina Principal",
          pageType: "home",
          sections: [
            {
              name: "Hero",
              sectionType: "hero",
              components: [
                {
                  name: "Titulo",
                  componentType: "text",
                  propsJson: { text: "Texto editavel" },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(structure.pages[0]?.slug).toBe("pagina-principal");
    expect(structure.pages[0]?.sections[0]?.propsJson).toEqual({});
    expect(structure.pages[0]?.sections[0]?.components[0]?.propsJson).toEqual({ text: "Texto editavel" });
    expect(structure.pages[0]?.sections[0]?.components[0]?.styleJson).toEqual({});
    expect(structure.pages[0]?.sections[0]?.components[0]?.interactionJson).toEqual({});
  });

  it("usa home vazia quando template estrutural nao possui paginas", () => {
    const structure = normalizeTemplateStructure({ pages: [] });

    expect(structure.pages).toHaveLength(1);
    expect(structure.pages[0]?.slug).toBe("home");
    expect(structure.pages[0]?.sections).toEqual([]);
  });

  it("lista variaveis ausentes do Cloudinary sem fallback para navegador", () => {
    expect(getMissingCloudinaryConfig({})).toEqual([
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ]);

    expect(
      getMissingCloudinaryConfig({
        CLOUDINARY_CLOUD_NAME: "demo",
        CLOUDINARY_API_KEY: "key",
        CLOUDINARY_API_SECRET: "secret",
      }),
    ).toEqual([]);
  });

  it("mantem R2 como provider alternativo futuro", () => {
    expect(getMissingR2Config({})).toEqual([
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
      "R2_PUBLIC_BASE_URL",
    ]);
  });

  it("monta status tecnico quando MySQL e Cloudinary ainda nao foram configurados", () => {
    const status = buildWebsiteBuilderFoundationStatus({});

    expect(status.database).toEqual({
      provider: "mysql",
      configured: false,
      message: "DATABASE_URL ainda nao configurada. Configure o MySQL antes de criar sites reais.",
    });
    expect(status.storage.configured).toBe(false);
    expect(status.storage.missing).toEqual([
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ]);
  });

  it("monta status tecnico pronto quando MySQL e Cloudinary estao configurados", () => {
    const status = buildWebsiteBuilderFoundationStatus({
      DATABASE_URL: "mysql://user:pass@127.0.0.1:3306/imobiflow",
      STORAGE_PROVIDER: "cloudinary",
      CLOUDINARY_CLOUD_NAME: "demo",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
    });

    expect(status.database.configured).toBe(true);
    expect(status.storage).toEqual({
      provider: "cloudinary",
      configured: true,
      missing: [],
      message: "Cloudinary configurado para uploads reais.",
    });
  });
});
