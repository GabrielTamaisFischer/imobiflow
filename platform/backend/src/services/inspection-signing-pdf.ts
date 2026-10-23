import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Assinatura Online (Bloco 5) — gerador do PDF final assinado: o laudo
 * original (bytes recebidos como entrada, nunca regerado aqui) com uma
 * página de certificado anexada ao final, listando cada signatário, seu
 * método de assinatura, data/hora, hash do documento e identificador de
 * auditoria.
 *
 * Puro (sem Prisma/storage/rede), igual a inspection-report-pdf.ts — a rota
 * busca os bytes do laudo e das imagens de assinatura via
 * readStoredFileBuffer e monta o input abaixo.
 *
 * Linguagem factual, nunca absoluta ("assinado eletronicamente em...", não
 * "esta assinatura tem validade jurídica garantida").
 */

export type SignedReportSigner = {
  name: string;
  roleLabel: string;
  signedAt: string; // ISO
  method: "drawn" | "typed";
  consentText: string;
  /** Imagem da assinatura — desenhada OU o texto digitado renderizado em
   * canvas pelo cliente. Sempre uma representação derivada; nunca a única
   * fonte de verdade (ver typedText/typedFontId no registro estruturado). */
  signatureImage: { buffer: Buffer; mimeType: string } | null;
  auditId: string;
};

export type BuildSignedInspectionCertificateInput = {
  baseReportBytes: Buffer;
  documentHash: string;
  generatedAt: string; // ISO
  signers: SignedReportSigner[];
};

export type BuildSignedInspectionCertificateResult = {
  buffer: Buffer;
  warnings: string[];
};

const PAGE_WIDTH = 595.28; // A4 em pontos
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export async function buildSignedInspectionCertificate(
  input: BuildSignedInspectionCertificateInput,
): Promise<BuildSignedInspectionCertificateResult> {
  const warnings: string[] = [];
  const finalDoc = await PDFDocument.load(input.baseReportBytes, { ignoreEncryption: true });
  const regular = await finalDoc.embedFont(StandardFonts.Helvetica);
  const bold = await finalDoc.embedFont(StandardFonts.HelveticaBold);

  let page = finalDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;

  function ensureSpace(height: number) {
    if (cursorY - height < MARGIN) {
      page = finalDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      cursorY = PAGE_HEIGHT - MARGIN;
    }
  }

  function writeLine(text: string, options: { size?: number; font?: typeof regular; color?: ReturnType<typeof rgb>; gap?: number } = {}) {
    const size = options.size ?? 11;
    const font = options.font ?? regular;
    ensureSpace(size + (options.gap ?? 6));
    page.drawText(text, { x: MARGIN, y: cursorY, size, font, color: options.color ?? rgb(0.1, 0.1, 0.1) });
    cursorY -= size + (options.gap ?? 6);
  }

  writeLine("Certificado de Assinatura Eletrônica", { size: 18, font: bold, gap: 14 });
  writeLine(`Documento (hash SHA-256): ${input.documentHash}`, { size: 9, color: rgb(0.4, 0.4, 0.4) });
  writeLine(`Certificado gerado em: ${formatDateTime(input.generatedAt)}`, { size: 9, color: rgb(0.4, 0.4, 0.4), gap: 20 });

  for (const signer of input.signers) {
    ensureSpace(140);
    writeLine(signer.name, { size: 13, font: bold, gap: 4 });
    writeLine(signer.roleLabel, { size: 10, color: rgb(0.35, 0.35, 0.35) });
    writeLine(`Assinado eletronicamente em ${formatDateTime(signer.signedAt)}.`, { size: 10 });
    writeLine(`Método: ${signer.method === "drawn" ? "Assinatura desenhada" : "Assinatura digitada"}.`, { size: 10 });
    writeLine(`Identificador de auditoria: ${signer.auditId}`, { size: 8, color: rgb(0.5, 0.5, 0.5) });
    writeLine(signer.consentText, { size: 8, color: rgb(0.5, 0.5, 0.5), gap: 8 });

    if (signer.signatureImage) {
      try {
        // IMPORTANTE: embedJpg/embedPng leem o ArrayBuffer subjacente a
        // partir do offset 0, ignorando o byteOffset do Buffer recebido —
        // um Buffer pequeno alocado do pool compartilhado do Node (padrao
        // para buffers < 4KB) tem byteOffset != 0, o que corrompe a leitura
        // do marcador SOI/PNG signature. new Uint8Array(buffer) copia os
        // bytes para um ArrayBuffer novo com offset 0 (mesmo padrao usado em
        // inspection-report-pdf.ts).
        const safeBytes = new Uint8Array(signer.signatureImage.buffer);
        const image =
          signer.signatureImage.mimeType === "image/jpeg"
            ? await finalDoc.embedJpg(safeBytes)
            : await finalDoc.embedPng(safeBytes);
        const maxWidth = 180;
        const maxHeight = 70;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        ensureSpace(height + 16);
        page.drawRectangle({ x: MARGIN, y: cursorY - height, width, height, borderColor: rgb(0.85, 0.85, 0.85), borderWidth: 1 });
        page.drawImage(image, { x: MARGIN, y: cursorY - height, width, height });
        cursorY -= height + 16;
      } catch {
        warnings.push(`assinatura de ${signer.name}: não foi possível incorporar a imagem da assinatura`);
        writeLine("(imagem da assinatura não pôde ser incorporada)", { size: 8, color: rgb(0.7, 0.3, 0.3), gap: 12 });
      }
    } else {
      writeLine("(assinatura sem imagem registrada)", { size: 8, color: rgb(0.7, 0.3, 0.3), gap: 12 });
    }
    cursorY -= 10;
  }

  const bytes = await finalDoc.save();
  return { buffer: Buffer.from(bytes), warnings };
}
