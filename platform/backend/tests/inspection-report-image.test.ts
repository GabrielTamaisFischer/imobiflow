import { describe, expect, it, beforeEach } from "vitest";
import sharp from "sharp";
import {
  optimizeEvidenceImage,
  clearImageOptimizerCache,
  DEFAULT_IMAGE_DPI,
  DEFAULT_JPEG_QUALITY,
} from "../src/services/inspection-report-image.js";

// Sub-bloco 5D-B - testes do servico isolado de otimizacao de imagem usado
// pelo laudo de vistoria. Usa o proprio Sharp para gerar fixtures
// sinteticas (cor solida, tamanhos/proporcoes variados) em vez de arquivos
// binarios versionados - mantem o teste rapido e sem fixture externa.

const FULL_WIDTH_TARGET = { boxWidthPt: 495.28, boxHeightPt: 300 }; // 1 coluna real do layout
const HALF_WIDTH_TARGET = { boxWidthPt: 240.64, boxHeightPt: 220 }; // 2 colunas real do layout

async function makeJpeg(width: number, height: number, color = { r: 200, g: 60, b: 60 }): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } }).jpeg({ quality: 95 }).toBuffer();
}

async function makePngNoAlpha(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 30, g: 30, b: 180 } } }).png().toBuffer();
}

async function makePngWithAlpha(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 4, background: { r: 30, g: 30, b: 180, alpha: 0.4 } } }).png().toBuffer();
}

async function makeWebp(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 180, b: 40 } } }).webp({ quality: 90 }).toBuffer();
}

async function makeRotatedJpeg(width: number, height: number, orientation: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 10, g: 200, b: 10 } } })
    .withMetadata({ orientation })
    .jpeg()
    .toBuffer();
}

beforeEach(() => {
  clearImageOptimizerCache();
});

describe("optimizeEvidenceImage", () => {
  it("otimiza um JPEG paisagem preservando aspect ratio e devolvendo formato jpeg", async () => {
    const buffer = await makeJpeg(1600, 1200);
    const result = await optimizeEvidenceImage("ev-1", buffer, "image/jpeg", FULL_WIDTH_TARGET);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("jpeg");
    expect(result!.width).toBeLessThanOrEqual(Math.round((FULL_WIDTH_TARGET.boxWidthPt / 72) * DEFAULT_IMAGE_DPI) + 1);
    const outMeta = await sharp(Buffer.from(result!.bytes)).metadata();
    const aspectIn = 1600 / 1200;
    const aspectOut = (outMeta.width ?? 1) / (outMeta.height ?? 1);
    expect(Math.abs(aspectIn - aspectOut)).toBeLessThan(0.02);
  });

  it("otimiza um JPEG retrato (vertical) corretamente", async () => {
    const buffer = await makeJpeg(1200, 1600);
    const result = await optimizeEvidenceImage("ev-2", buffer, "image/jpeg", HALF_WIDTH_TARGET);
    expect(result).not.toBeNull();
    const outMeta = await sharp(Buffer.from(result!.bytes)).metadata();
    expect((outMeta.height ?? 0)).toBeGreaterThan(outMeta.width ?? 0);
  });

  it("otimiza uma imagem quadrada corretamente", async () => {
    const buffer = await makeJpeg(1000, 1000);
    const result = await optimizeEvidenceImage("ev-3", buffer, "image/jpeg", HALF_WIDTH_TARGET);
    expect(result).not.toBeNull();
    const outMeta = await sharp(Buffer.from(result!.bytes)).metadata();
    expect(outMeta.width).toBe(outMeta.height);
  });

  it("PNG sem transparencia relevante e convertido para JPEG na versao embutida", async () => {
    const buffer = await makePngNoAlpha(1200, 900);
    const result = await optimizeEvidenceImage("ev-4", buffer, "image/png", FULL_WIDTH_TARGET);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("jpeg");
  });

  it("PNG com transparencia real e preservado como PNG", async () => {
    const buffer = await makePngWithAlpha(1200, 900);
    const result = await optimizeEvidenceImage("ev-5", buffer, "image/png", FULL_WIDTH_TARGET);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("png");
    const outMeta = await sharp(Buffer.from(result!.bytes)).metadata();
    expect(outMeta.hasAlpha).toBe(true);
  });

  it("WebP e decodificado e reencodado como JPEG", async () => {
    const buffer = await makeWebp(1400, 1000);
    const result = await optimizeEvidenceImage("ev-6", buffer, "image/webp", FULL_WIDTH_TARGET);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("jpeg");
  });

  it("nao amplia uma imagem menor que o alvo (withoutEnlargement)", async () => {
    // 50x40px e muito menor que qualquer box real do layout.
    const buffer = await makeJpeg(50, 40);
    const result = await optimizeEvidenceImage("ev-7", buffer, "image/jpeg", FULL_WIDTH_TARGET);
    expect(result).not.toBeNull();
    expect(result!.keptOriginalSize).toBe(true);
    const outMeta = await sharp(Buffer.from(result!.bytes)).metadata();
    expect(outMeta.width).toBeLessThanOrEqual(50);
    expect(outMeta.height).toBeLessThanOrEqual(40);
  });

  it("reduz uma imagem maior que o alvo (nao mantem tamanho original)", async () => {
    const buffer = await makeJpeg(4000, 3000);
    const result = await optimizeEvidenceImage("ev-8", buffer, "image/jpeg", HALF_WIDTH_TARGET);
    expect(result).not.toBeNull();
    expect(result!.keptOriginalSize).toBe(false);
    expect(result!.width).toBeLessThan(4000);
  });

  it("respeita a orientacao EXIF (foto marcada como rotacionada 90 graus sai com dimensoes trocadas)", async () => {
    // 100x60 com orientation=6 -> apos rotate() correto fica 60x100 (vertical).
    const buffer = await makeRotatedJpeg(2000, 1200, 6);
    const result = await optimizeEvidenceImage("ev-9", buffer, "image/jpeg", FULL_WIDTH_TARGET);
    expect(result).not.toBeNull();
    const outMeta = await sharp(Buffer.from(result!.bytes)).metadata();
    // dimensao apos orientacao correta: largura original (2000) torna-se a
    // altura e vice-versa, preservando a proporcao final como retrato.
    expect((outMeta.height ?? 0)).toBeGreaterThan(outMeta.width ?? 0);
  });

  it("retorna null para um buffer corrompido/invalido, sem lancar excecao", async () => {
    const corrupted = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
    const result = await optimizeEvidenceImage("ev-10", corrupted, "image/jpeg", FULL_WIDTH_TARGET);
    expect(result).toBeNull();
  });

  it("cacheia o resultado para a mesma evidencia + mesmo alvo (nao reprocessa)", async () => {
    const buffer = await makeJpeg(1600, 1200);
    const first = await optimizeEvidenceImage("ev-cache", buffer, "image/jpeg", FULL_WIDTH_TARGET);
    const second = await optimizeEvidenceImage("ev-cache", buffer, "image/jpeg", FULL_WIDTH_TARGET);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // mesma referencia de bytes (mesma Promise de cache resolvida), nao apenas conteudo igual.
    expect(second!.bytes).toBe(first!.bytes);
  });

  it("gera resultados diferentes para a MESMA evidencia quando o alvo (tamanho) muda", async () => {
    const buffer = await makeJpeg(1600, 1200);
    const full = await optimizeEvidenceImage("ev-multi-target", buffer, "image/jpeg", FULL_WIDTH_TARGET);
    const half = await optimizeEvidenceImage("ev-multi-target", buffer, "image/jpeg", HALF_WIDTH_TARGET);
    expect(full).not.toBeNull();
    expect(half).not.toBeNull();
    expect(full!.width).toBeGreaterThan(half!.width);
  });

  it("aplica qualidade/DPI customizados quando informados (usado nos testes comparativos 150 vs 180)", async () => {
    const buffer = await makeJpeg(1600, 1200);
    const at150 = await optimizeEvidenceImage("ev-dpi-150", buffer, "image/jpeg", FULL_WIDTH_TARGET, { dpi: 150, quality: DEFAULT_JPEG_QUALITY });
    const at180 = await optimizeEvidenceImage("ev-dpi-180", buffer, "image/jpeg", FULL_WIDTH_TARGET, { dpi: 180, quality: DEFAULT_JPEG_QUALITY });
    expect(at150).not.toBeNull();
    expect(at180).not.toBeNull();
    expect(at180!.width).toBeGreaterThan(at150!.width);
  });
});
