import { describe, expect, it } from "vitest";
import {
  INSPECTION_UPLOAD_TARGET_BYTES,
  fitWithin,
  prepareInspectionPhotoForUpload,
  type PhotoEncoder,
} from "./inspection-photo-compression";

// Encoder falso: o tamanho de saída cresce com área e qualidade, como um JPEG real.
function fakeEncoder(width: number, height: number, bytesPerPixel = 0.5) {
  const calls: Array<{ width: number; height: number; quality: number }> = [];
  let released = false;
  const encoder: PhotoEncoder = {
    async decode() {
      return {
        width,
        height,
        source: {},
        release: () => {
          released = true;
        },
      };
    },
    async encode(_photo, w, h, quality) {
      calls.push({ width: w, height: h, quality });
      return new Blob([new Uint8Array(Math.round(w * h * quality * bytesPerPixel))], {
        type: "image/jpeg",
      });
    },
  };
  return { encoder, calls, wasReleased: () => released };
}

function photo(sizeBytes: number, name = "IMG_0001.jpeg", type = "image/jpeg") {
  return new File([new Uint8Array(sizeBytes)], name, { type, lastModified: 1_700_000_000_000 });
}

describe("compressão de foto da vistoria", () => {
  it("arquivo dentro do limite segue intacto (mesmo objeto, sem recodificar)", async () => {
    const original = photo(1_500_000, "foto.png", "image/png");
    const { encoder, calls } = fakeEncoder(4000, 3000);
    const result = await prepareInspectionPhotoForUpload(original, encoder);
    expect(result.file).toBe(original);
    expect(result.compressed).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("foto de celular grande fica abaixo de ~3 MB, mantém proporção e vira JPEG", async () => {
    const original = photo(6_500_000);
    const { encoder, calls, wasReleased } = fakeEncoder(4032, 3024);
    const result = await prepareInspectionPhotoForUpload(original, encoder);
    expect(result.compressed).toBe(true);
    expect(result.finalBytes).toBeLessThanOrEqual(INSPECTION_UPLOAD_TARGET_BYTES);
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.name).toBe("IMG_0001.jpg");
    expect(result.file.lastModified).toBe(original.lastModified);
    expect(result.width! / result.height!).toBeCloseTo(4032 / 3024, 2);
    expect(Math.max(result.width!, result.height!)).toBeLessThanOrEqual(2560);
    // Começa pela melhor qualidade e só reduz o necessário.
    expect(calls[0].quality).toBe(0.88);
    expect(wasReleased()).toBe(true);
    // O original não é alterado (a fila offline guarda este arquivo).
    expect(original.size).toBe(6_500_000);
    expect(original.type).toBe("image/jpeg");
  });

  it("reduz dimensões em etapas quando só a qualidade não basta, sem ampliar", async () => {
    const { encoder, calls } = fakeEncoder(8000, 6000, 1.2);
    const result = await prepareInspectionPhotoForUpload(photo(20_000_000), encoder);
    expect(result.finalBytes).toBeLessThanOrEqual(INSPECTION_UPLOAD_TARGET_BYTES);
    expect(calls.some((call) => Math.max(call.width, call.height) < 2560)).toBe(true);
    expect(calls.every((call) => call.width <= 8000 && call.height <= 6000)).toBe(true);
  });

  it("falha com erro claro (413) quando não é possível chegar ao limite", async () => {
    const { encoder } = fakeEncoder(8000, 6000, 50);
    await expect(prepareInspectionPhotoForUpload(photo(20_000_000), encoder)).rejects.toMatchObject(
      { code: "PHOTO_TOO_LARGE", status: 413 },
    );
  });

  it("sem encoder disponível, foto grande falha com erro claro em vez de 413 do servidor", async () => {
    await expect(prepareInspectionPhotoForUpload(photo(6_000_000), null)).rejects.toMatchObject({
      code: "PHOTO_TOO_LARGE",
    });
  });

  it("foto que não decodifica falha com mensagem clara em PT-BR e original intacto", async () => {
    const broken = photo(5_000_000);
    const encoder: PhotoEncoder = {
      async decode() {
        throw new DOMException("The source image could not be decoded.", "InvalidStateError");
      },
      async encode() {
        throw new Error("não deveria codificar");
      },
    };
    await expect(prepareInspectionPhotoForUpload(broken, encoder)).rejects.toMatchObject({
      code: "PHOTO_UNREADABLE",
      status: 422,
      message: expect.stringContaining("Não foi possível ler esta foto"),
    });
    expect(broken.size).toBe(5_000_000);
  });

  it("fitWithin preserva proporção e nunca amplia", () => {
    expect(fitWithin(4000, 3000, 2560)).toEqual({ width: 2560, height: 1920 });
    expect(fitWithin(3000, 4000, 2560)).toEqual({ width: 1920, height: 2560 });
    expect(fitWithin(800, 600, 2560)).toEqual({ width: 800, height: 600 });
  });
});
