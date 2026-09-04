import { describe, expect, it } from "vitest";
import {
  buildWatermarkSettingsPayload,
  shouldWarnMissingWatermarkLogo,
  watermarkPositionLabel,
} from "./app.site";
import { WATERMARK_POSITIONS, type WatermarkLogo } from "@/product/sites";

// F3C (2026-09-04): este projeto não usa jsdom/DOM nos testes de unidade
// (vitest.config.ts usa environment "node", mesmo padrão já usado pela F3B
// em app.imoveis.media.test.ts) — por isso a UI de marca d'água é coberta
// testando as funções PURAS que ela usa (mapeamento de posição, shape do
// payload salvo, condição do aviso de "sem logo"), não renderizando o
// componente inteiro.

const SAMPLE_LOGO: WatermarkLogo = {
  url: "https://res.cloudinary.example/imobiflow/company-a/logos/logo-abc",
  original_filename: "logo.png",
  provider: "cloudinary",
  uploaded_at: "2026-09-04T00:00:00.000Z",
};

describe("F3C — watermarkPositionLabel", () => {
  it("tem um rótulo em português para cada uma das 5 posições do MVP", () => {
    for (const position of WATERMARK_POSITIONS) {
      expect(watermarkPositionLabel(position)).toEqual(expect.any(String));
      expect(watermarkPositionLabel(position).length).toBeGreaterThan(0);
    }
  });

  it("rótulos são únicos (nenhuma posição compartilha o texto de outra, evitando confusão no select)", () => {
    const labels = WATERMARK_POSITIONS.map((position) => watermarkPositionLabel(position));
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("F3C — buildWatermarkSettingsPayload (toggle/posição/opacidade)", () => {
  it("reflete o toggle desligado", () => {
    const payload = buildWatermarkSettingsPayload({
      watermark_enabled: false,
      watermark_position: "bottom-right",
      watermark_opacity: 60,
    });
    expect(payload).toEqual({ enabled: false, position: "bottom-right", opacity: 60 });
  });

  it("reflete o toggle ligado com posição e opacidade escolhidas", () => {
    const payload = buildWatermarkSettingsPayload({
      watermark_enabled: true,
      watermark_position: "top-left",
      watermark_opacity: 35,
    });
    expect(payload).toEqual({ enabled: true, position: "top-left", opacity: 35 });
  });

  it("o shape do payload bate exatamente com o que o backend espera (watermarkSettingsSchema)", () => {
    const payload = buildWatermarkSettingsPayload({
      watermark_enabled: true,
      watermark_position: "center",
      watermark_opacity: 100,
    });
    expect(Object.keys(payload).sort()).toEqual(["enabled", "opacity", "position"]);
  });
});

describe("F3C — shouldWarnMissingWatermarkLogo (estado sem logo)", () => {
  it("avisa quando habilitada e sem logo", () => {
    expect(shouldWarnMissingWatermarkLogo(true, null)).toBe(true);
  });

  it("não avisa quando habilitada e já existe logo", () => {
    expect(shouldWarnMissingWatermarkLogo(true, SAMPLE_LOGO)).toBe(false);
  });

  it("não avisa quando desabilitada, com ou sem logo (evita ruído desnecessário na tela)", () => {
    expect(shouldWarnMissingWatermarkLogo(false, null)).toBe(false);
    expect(shouldWarnMissingWatermarkLogo(false, SAMPLE_LOGO)).toBe(false);
  });
});
