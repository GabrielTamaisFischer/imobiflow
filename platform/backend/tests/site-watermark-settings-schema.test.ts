import { describe, expect, it } from "vitest";

// F3C (2026-09-04): validação do bloco de configuração de watermark dentro
// de settings_json (PUT /site/settings). CompanySite.settingsJson já
// aceitava qualquer chave extra (catchall(z.unknown())) — este é o único
// pedaço de settings_json que precisa REJEITAR valor malformado/malicioso
// (posição fora do enum, opacidade fora da faixa) em vez de só aceitar.
import { siteSchema, watermarkSettingsSchema } from "../src/routes/sites.js";

function validSiteInput(overrides: Record<string, unknown> = {}) {
  return {
    slug: "imobiliaria-teste",
    brand_name: "Imobiliária Teste",
    primary_color: "#111827",
    ...overrides,
  };
}

describe("F3C — watermarkSettingsSchema (posição/opacidade)", () => {
  it("aceita as 5 posições do MVP", () => {
    for (const position of ["bottom-right", "bottom-left", "top-right", "top-left", "center"]) {
      const result = watermarkSettingsSchema.safeParse({ enabled: true, position, opacity: 60 });
      expect(result.success).toBe(true);
    }
  });

  it("rejeita uma posição fora do enum permitido", () => {
    const result = watermarkSettingsSchema.safeParse({ enabled: true, position: "diagonal", opacity: 60 });
    expect(result.success).toBe(false);
  });

  it("rejeita opacidade fora da faixa (abaixo de 10 ou acima de 100)", () => {
    expect(watermarkSettingsSchema.safeParse({ opacity: 0 }).success).toBe(false);
    expect(watermarkSettingsSchema.safeParse({ opacity: 5 }).success).toBe(false);
    expect(watermarkSettingsSchema.safeParse({ opacity: 101 }).success).toBe(false);
    expect(watermarkSettingsSchema.safeParse({ opacity: 1000 }).success).toBe(false);
  });

  it("rejeita opacidade não inteira ou de tipo errado", () => {
    expect(watermarkSettingsSchema.safeParse({ opacity: 55.5 }).success).toBe(false);
    expect(watermarkSettingsSchema.safeParse({ opacity: "60" }).success).toBe(false);
  });

  it("rejeita chaves desconhecidas (schema .strict — impede injeção de campo extra não previsto)", () => {
    const result = watermarkSettingsSchema.safeParse({ enabled: true, position: "center", opacity: 60, public_id: "algo" });
    expect(result.success).toBe(false);
  });

  it("aplica defaults seguros quando nada é informado: desabilitada, bottom-right, 60%", () => {
    const result = watermarkSettingsSchema.parse({});
    expect(result).toEqual({ enabled: false, position: "bottom-right", opacity: 60 });
  });

  it("enabled precisa ser booleano explícito, não qualquer valor truthy", () => {
    expect(watermarkSettingsSchema.safeParse({ enabled: "true" }).success).toBe(false);
    expect(watermarkSettingsSchema.safeParse({ enabled: 1 }).success).toBe(false);
  });
});

describe("F3C — siteSchema (PUT /site/settings) integra watermark com o default seguro", () => {
  it("empresa que nunca configurou watermark recebe o default DESABILITADO (nunca liga sozinha)", () => {
    const parsed = siteSchema.parse(validSiteInput());
    expect(parsed.settings_json.watermark).toEqual({ enabled: false, position: "bottom-right", opacity: 60 });
  });

  it("aceita e preserva uma configuração de watermark válida enviada pelo cliente", () => {
    const parsed = siteSchema.parse(
      validSiteInput({
        settings_json: { watermark: { enabled: true, position: "top-left", opacity: 40 } },
      }),
    );
    expect(parsed.settings_json.watermark).toEqual({ enabled: true, position: "top-left", opacity: 40 });
  });

  it("rejeita o payload inteiro de /site/settings se a posição da watermark for inválida", () => {
    const result = siteSchema.safeParse(
      validSiteInput({ settings_json: { watermark: { enabled: true, position: "canto-qualquer" } } }),
    );
    expect(result.success).toBe(false);
  });

  it("rejeita o payload inteiro de /site/settings se a opacidade da watermark for inválida", () => {
    const result = siteSchema.safeParse(
      validSiteInput({ settings_json: { watermark: { enabled: true, opacity: 500 } } }),
    );
    expect(result.success).toBe(false);
  });

  it("continua aceitando as demais chaves de settings_json normalmente (sem regressão do catchall)", () => {
    const parsed = siteSchema.parse(
      validSiteInput({
        settings_json: { show_prices: false, template_key: "premium_family_gold", watermark: { enabled: true } },
      }),
    );
    expect(parsed.settings_json.show_prices).toBe(false);
    expect(parsed.settings_json.template_key).toBe("premium_family_gold");
    expect(parsed.settings_json.watermark?.enabled).toBe(true);
  });
});
