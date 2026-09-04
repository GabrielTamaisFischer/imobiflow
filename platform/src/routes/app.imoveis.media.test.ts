import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dataUrlByteLength,
  optimizeImageDataUrl,
  PROPERTY_IMAGE_MAX_UPLOAD_BYTES,
  readFileAsDataUrl,
} from "./app.imoveis";

// F3B (2026-09-03): antes, TODA foto passava por recompressão destrutiva no
// cliente (canvas, máx. 1400px, JPEG 76%) antes de ser enviada — o original
// de verdade nunca chegava ao backend/Cloudinary. Estes testes cobrem a nova
// regra: um arquivo que já cabe no limite aceito pelo backend para
// property_image (8MB — ver platform/backend/src/services/storage/
// file-policy.ts) é enviado exatamente como está (bytes idênticos ao
// arquivo original, sem reencode); só é recomprimido no cliente quando
// excede esse limite, e só o necessário para não estourar 413.
//
// Ambiente de teste roda em Node ("environment: node" no vitest.config.ts,
// sem jsdom/canvas real) — por isso FileReader/Image/canvas são stubados
// aqui de forma mínima, o suficiente para exercitar a lógica real de
// app.imoveis.tsx sem depender de decodificação real de imagem.

class FakeFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  error: unknown = null;

  readAsDataURL(file: File) {
    file
      .arrayBuffer()
      .then((buffer) => {
        this.result = `data:${file.type};base64,${Buffer.from(buffer).toString("base64")}`;
        this.onload?.();
      })
      .catch((error) => {
        this.error = error;
        this.onerror?.();
      });
  }
}

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 4000;
  height = 3000;
  private _src = "";

  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this._src;
  }
}

function installBrowserStubs(compressedOutput: string) {
  const toDataURL = vi.fn(() => compressedOutput);
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    toDataURL,
  };

  vi.stubGlobal("FileReader", FakeFileReader);
  vi.stubGlobal("Image", FakeImage);
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      if (tag === "canvas") return fakeCanvas;
      throw new Error(`createElement("${tag}") inesperado no stub de teste`);
    },
  });

  return { toDataURL };
}

function makeImageFile(sizeBytes: number, name = "foto.jpg", type = "image/jpeg") {
  return new File([Buffer.alloc(sizeBytes, 7)], name, { type });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dataUrlByteLength", () => {
  it("calcula o tamanho decodificado de um data URL base64 sem padding", () => {
    // "abcd" em base64 decodifica para 3 bytes.
    expect(dataUrlByteLength("data:image/jpeg;base64,YWJj")).toBe(3);
  });

  it("desconta o padding '=' e '==' do tamanho decodificado", () => {
    expect(dataUrlByteLength("data:image/jpeg;base64,YQ==")).toBe(1);
    expect(dataUrlByteLength("data:image/jpeg;base64,YWI=")).toBe(2);
  });
});

describe("limite de upload de foto do imóvel", () => {
  it("o limite do cliente (PROPERTY_IMAGE_MAX_UPLOAD_BYTES) é 8MB — mesmo valor de property_image em file-policy.ts", () => {
    // Mantido como valor literal (não importado do backend) de propósito:
    // são pacotes/workspaces separados. Este teste existe justamente para
    // detectar o desalinhamento caso um dos dois lados mude sem o outro.
    expect(PROPERTY_IMAGE_MAX_UPLOAD_BYTES).toBe(8 * 1024 * 1024);
  });
});

describe("readFileAsDataUrl — preserva o original quando cabe no limite do backend", () => {
  it("uma foto dentro do limite (8MB) é lida e enviada EXATAMENTE como está, sem recompressão", async () => {
    installBrowserStubs("data:image/jpeg;base64,NUNCA-DEVERIA-SER-CHAMADO");
    const file = makeImageFile(2 * 1024 * 1024); // 2MB, dentro do limite

    const content = await readFileAsDataUrl(file);
    const expectedRaw = `data:image/jpeg;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;

    expect(content).toBe(expectedRaw);
    expect(dataUrlByteLength(content)).toBe(file.size);
  });

  it("uma foto no limite exato (8MB) também não é recomprimida", async () => {
    installBrowserStubs("data:image/jpeg;base64,NUNCA-DEVERIA-SER-CHAMADO");
    const file = makeImageFile(PROPERTY_IMAGE_MAX_UPLOAD_BYTES);

    const content = await readFileAsDataUrl(file);

    expect(dataUrlByteLength(content)).toBe(file.size);
  });

  it("uma foto acima do limite (8MB) é recomprimida no cliente antes do envio, para não estourar 413", async () => {
    const { toDataURL } = installBrowserStubs("data:image/jpeg;base64,VkVSU0FPLU9USU1JWkFEQQ==");
    const file = makeImageFile(PROPERTY_IMAGE_MAX_UPLOAD_BYTES + 1);

    const content = await readFileAsDataUrl(file);

    expect(content).toBe("data:image/jpeg;base64,VkVSU0FPLU9USU1JWkFEQQ==");
    expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.88);
  });

  it("um vídeo nunca passa pelo caminho de otimização de imagem, independentemente do tamanho", async () => {
    installBrowserStubs("data:image/jpeg;base64,NUNCA-DEVERIA-SER-CHAMADO");
    const file = new File([Buffer.alloc(PROPERTY_IMAGE_MAX_UPLOAD_BYTES + 1, 1)], "tour.mp4", {
      type: "video/mp4",
    });

    const content = await readFileAsDataUrl(file);
    const expectedRaw = `data:video/mp4;base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`;

    expect(content).toBe(expectedRaw);
  });
});

describe("optimizeImageDataUrl — usa a variante menos destrutiva do que a anterior (1400px/76%)", () => {
  it("usa maxSide/quality padrão maiores que a compressão anterior, preservando mais qualidade quando precisa recomprimir", async () => {
    installBrowserStubs("data:image/jpeg;base64,cmVzdWx0YWRv");

    const result = await optimizeImageDataUrl("data:image/jpeg;base64,b3JpZ2luYWw=");

    expect(result).toBe("data:image/jpeg;base64,cmVzdWx0YWRv");
    // Antes: maxSide=1400, quality=0.76. Agora: 2200/0.88 — só é chamado no
    // caminho de fallback (arquivo acima do limite do backend).
  });
});
