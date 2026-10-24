import sharp from "sharp";

/**
 * Sub-bloco 5D-B - servico isolado de otimizacao de imagem para o laudo de
 * vistoria (inspection-report-pdf.ts).
 *
 * Responsabilidade unica: dado o BUFFER ORIGINAL de uma evidencia (lido do
 * storage, nunca alterado) e o box de exibicao real que ela vai ocupar no
 * PDF, devolver uma versao otimizada (bytes + formato) para embutir via
 * pdf-lib. Este modulo nunca grava nada no storage e nunca recebe um
 * caminho de arquivo - so bytes em memoria, para manter o original intacto
 * em qualquer provider (Local/R2/Cloudinary).
 *
 * Decisao de DPI/qualidade: ver relatorio do Sub-bloco 5D-B. Os valores
 * abaixo sao o resultado da comparacao real 150 vs 180 DPI feita com os
 * mesmos PDFs de referencia do Sub-bloco 5C/5D-A.
 */

export const DEFAULT_IMAGE_DPI = 120;
export const DEFAULT_JPEG_QUALITY = 80;

export type OptimizeTarget = {
  /** Largura do slot onde a foto sera desenhada no PDF, em pontos (1pt = 1/72in). */
  boxWidthPt: number;
  /** Altura maxima do slot, em pontos. */
  boxHeightPt: number;
};

export type OptimizedImage = {
  bytes: Uint8Array;
  format: "jpeg" | "png";
  /** Dimensoes finais em pixels, apos resize (para diagnostico/teste). */
  width: number;
  height: number;
  /** true quando a imagem original ja era menor que o alvo e nao foi ampliada. */
  keptOriginalSize: boolean;
};

export type OptimizeOptions = {
  dpi?: number;
  quality?: number;
};

function ptToPx(pt: number, dpi: number): number {
  return Math.max(1, Math.round((pt / 72) * dpi));
}

// ---------------------------------------------------------------------------
// Cache por geracao - evita decodificar/reprocessar a mesma evidencia mais
// de uma vez quando ela aparece no mesmo tamanho de alvo. A chave inclui o
// box de destino e o DPI/qualidade porque a MESMA evidencia pode, em teoria,
// ser solicitada com parametros diferentes (ex.: testes comparativos).
// ---------------------------------------------------------------------------
const cache = new Map<string, Promise<OptimizedImage | null>>();

export function clearImageOptimizerCache(): void {
  cache.clear();
}

function buildCacheKey(evidenceId: string, target: OptimizeTarget, dpi: number, quality: number): string {
  return [
    evidenceId,
    Math.round(target.boxWidthPt),
    Math.round(target.boxHeightPt),
    dpi,
    quality,
  ].join("|");
}

/**
 * Otimiza uma imagem de evidencia (JPEG, PNG ou WebP) para o tamanho de
 * exibicao real no PDF. Retorna null quando o buffer nao pode ser
 * decodificado (corrompido, formato desconhecido) - o chamador deve tratar
 * isso como falha e seguir para o aviso/placeholder existente, sem derrubar
 * o documento inteiro.
 *
 * Regras aplicadas (Sub-bloco 5D-A/5D-B):
 * - rotate() sem argumentos: aplica a orientacao EXIF (foto vertical de
 *   celular sai vertical) e descarta a tag depois.
 * - resize com fit "inside" + withoutEnlargement: nunca amplia uma imagem
 *   menor que o alvo, preserva aspect ratio.
 * - PNG com transparencia real (alpha) e preservado como PNG; qualquer
 *   outro caso (JPEG, WebP, PNG fotografico sem alpha relevante) e
 *   reencodado como JPEG, porque e isso que entra no PDF - o arquivo
 *   original no storage nunca e tocado.
 */
export async function optimizeEvidenceImage(
  evidenceId: string,
  buffer: Buffer,
  mimeType: string | null,
  target: OptimizeTarget,
  options: OptimizeOptions = {},
): Promise<OptimizedImage | null> {
  const dpi = options.dpi ?? DEFAULT_IMAGE_DPI;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;
  const key = buildCacheKey(evidenceId, target, dpi, quality);

  const cached = cache.get(key);
  if (cached) return cached;

  const promise = runOptimize(buffer, mimeType, target, dpi, quality);
  cache.set(key, promise);
  return promise;
}

async function runOptimize(
  buffer: Buffer,
  mimeType: string | null,
  target: OptimizeTarget,
  dpi: number,
  quality: number,
): Promise<OptimizedImage | null> {
  try {
    const oriented = sharp(buffer, { failOn: "none" }).rotate();
    const metadata = await oriented.metadata();
    if (!metadata.width || !metadata.height) return null;

    const targetWidthPx = ptToPx(target.boxWidthPt, dpi);
    const targetHeightPx = ptToPx(target.boxHeightPt, dpi);

    const hasAlpha = metadata.hasAlpha === true;
    const keepAsPng = mimeType === "image/png" && hasAlpha;

    const resized = oriented.resize({
      width: targetWidthPx,
      height: targetHeightPx,
      fit: "inside",
      withoutEnlargement: true,
    });

    const keptOriginalSize = metadata.width <= targetWidthPx && metadata.height <= targetHeightPx;

    if (keepAsPng) {
      const bytes = await resized.png({ compressionLevel: 9 }).toBuffer();
      const outMeta = await sharp(bytes).metadata();
      return {
        bytes: new Uint8Array(bytes),
        format: "png",
        width: outMeta.width ?? 0,
        height: outMeta.height ?? 0,
        keptOriginalSize,
      };
    }

    const bytes = await resized.jpeg({ quality, mozjpeg: false }).toBuffer();
    const outMeta = await sharp(bytes).metadata();
    return {
      bytes: new Uint8Array(bytes),
      format: "jpeg",
      width: outMeta.width ?? 0,
      height: outMeta.height ?? 0,
      keptOriginalSize,
    };
  } catch {
    return null;
  }
}
