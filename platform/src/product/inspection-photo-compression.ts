/**
 * Preparação de foto de vistoria para upload.
 *
 * Por quê: a evidência vai em JSON/base64 (+33%) para uma Vercel Function, cujo
 * corpo é limitado a 4,5 MB. Fotos de celular (4–8 MB) falhavam com 413.
 * Mantendo o arquivo enviado em até ~3 MB, o corpo fica em ~4 MB.
 *
 * Regras:
 * - arquivo já dentro do limite é enviado como está (sem recodificar);
 * - proporção sempre preservada; nunca amplia;
 * - o original NÃO é alterado: a fila offline guarda o arquivo capturado e a
 *   versão reduzida é gerada só no momento do envio;
 * - decodificação/codificação usam APIs assíncronas (createImageBitmap,
 *   OffscreenCanvas.convertToBlob / canvas.toBlob) com Blob, sem base64.
 */
export const INSPECTION_UPLOAD_TARGET_BYTES = 1_200_000;
export const INSPECTION_PHOTO_MAX_SIDE = 1920;
export const INSPECTION_PHOTO_MIN_SIDE = 1080;
const QUALITY_STEPS = [0.82, 0.76, 0.7, 0.64];
const SIDE_STEP = 0.8;

export type DecodedPhoto = { width: number; height: number; source: unknown; release?: () => void };
export type PhotoEncoder = {
  decode(file: Blob): Promise<DecodedPhoto>;
  encode(photo: DecodedPhoto, width: number, height: number, quality: number): Promise<Blob>;
};

export type PreparedPhoto = {
  file: File;
  compressed: boolean;
  originalBytes: number;
  finalBytes: number;
  width: number | null;
  height: number | null;
};

export function fitWithin(width: number, height: number, maxSide: number) {
  const ratio = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function jpegName(name: string) {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name || "foto"}.jpg`;
}

export class PhotoPreparationError extends Error {
  code: "PHOTO_TOO_LARGE" | "PHOTO_UNREADABLE";
  status: number;

  constructor(message: string, code: "PHOTO_TOO_LARGE" | "PHOTO_UNREADABLE" = "PHOTO_TOO_LARGE") {
    super(message);
    this.code = code;
    this.status = code === "PHOTO_TOO_LARGE" ? 413 : 422;
  }
}

/**
 * WebP novo precisa virar JPEG (Sub-bloco 5B): o gerador de laudo PDF usa
 * pdf-lib, que não decodifica WebP nativamente. Em vez de uma segunda
 * dependência de decodificação no backend, normalizamos no mesmo pipeline
 * de compressão que já existe no navegador (Canvas/OffscreenCanvas já
 * decodificam WebP e já sabem gerar JPEG — reaproveita quality steps,
 * orientação EXIF e compressão existentes, sem uploader paralelo).
 */
function isWebpFile(file: File) {
  return file.type.toLowerCase().trim() === "image/webp";
}

export async function prepareInspectionPhotoForUpload(
  file: File,
  encoder: PhotoEncoder | null = getDefaultPhotoEncoder(),
  targetBytes = INSPECTION_UPLOAD_TARGET_BYTES,
): Promise<PreparedPhoto> {
  const needsWebpNormalization = isWebpFile(file);
  if (file.size <= targetBytes && !needsWebpNormalization) {
    return {
      file,
      compressed: false,
      originalBytes: file.size,
      finalBytes: file.size,
      width: null,
      height: null,
    };
  }
  if (!encoder) {
    if (needsWebpNormalization) {
      // Fora do navegador (SSR/teste) não há como normalizar — preserva o
      // arquivo original. O backend ainda aceita WebP e o gerador de PDF
      // trata esse caso explicitamente (ver inspection-report-pdf.ts).
      return {
        file,
        compressed: false,
        originalBytes: file.size,
        finalBytes: file.size,
        width: null,
        height: null,
      };
    }
    throw new PhotoPreparationError(
      "Não foi possível otimizar esta foto neste navegador. Tente uma foto menor.",
    );
  }
  let photo: DecodedPhoto;
  try {
    photo = await encoder.decode(file);
  } catch {
    // O navegador lança erro técnico em inglês ("could not be decoded"); o
    // usuário recebe uma mensagem clara. O arquivo original não é alterado.
    throw new PhotoPreparationError(
      "Não foi possível ler esta foto. O arquivo pode estar corrompido ou em formato não suportado.",
      "PHOTO_UNREADABLE",
    );
  }
  try {
    let maxSide = Math.min(INSPECTION_PHOTO_MAX_SIDE, Math.max(photo.width, photo.height));
    while (true) {
      const size = fitWithin(photo.width, photo.height, maxSide);
      for (const quality of QUALITY_STEPS) {
        const blob = await encoder.encode(photo, size.width, size.height, quality);
        if (blob.size <= targetBytes) {
          const prepared = new File([blob], jpegName(file.name), {
            type: "image/jpeg",
            lastModified: file.lastModified,
          });
          return {
            file: prepared,
            compressed: true,
            originalBytes: file.size,
            finalBytes: prepared.size,
            width: size.width,
            height: size.height,
          };
        }
      }
      if (maxSide <= INSPECTION_PHOTO_MIN_SIDE) break;
      maxSide = Math.max(INSPECTION_PHOTO_MIN_SIDE, Math.round(maxSide * SIDE_STEP));
    }
  } finally {
    photo.release?.();
  }
  throw new PhotoPreparationError(
    "A foto continua grande demais mesmo após otimização. Tente outra foto.",
  );
}

/** Encoder do navegador; null fora do browser (SSR/testes). */
export function getDefaultPhotoEncoder(): PhotoEncoder | null {
  if (typeof createImageBitmap !== "function") return null;
  const hasOffscreen = typeof OffscreenCanvas !== "undefined";
  const hasDocument = typeof document !== "undefined";
  if (!hasOffscreen && !hasDocument) return null;
  return {
    async decode(file) {
      // imageOrientation "from-image" aplica a rotação EXIF da câmera.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        release: () => bitmap.close(),
      };
    },
    async encode(photo, width, height, quality) {
      const bitmap = photo.source as ImageBitmap;
      if (hasOffscreen) {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext("2d");
        if (!context) throw new PhotoPreparationError("Não foi possível otimizar esta foto.");
        // Fundo branco: PNG com transparência não vira preto ao converter para JPEG.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        return canvas.convertToBlob({ type: "image/jpeg", quality });
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new PhotoPreparationError("Não foi possível otimizar esta foto.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new PhotoPreparationError("Não foi possível otimizar esta foto.")),
          "image/jpeg",
          quality,
        ),
      );
    },
  };
}
