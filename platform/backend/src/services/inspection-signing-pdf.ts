import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SIGNATURE_PAGE_LAYOUT } from "./inspection-report-pdf.js";

/**
 * PDF final da Assinatura Online.
 *
 * O documento final e SEMPRE o mesmo laudo profissional usado em
 * "Exportar PDF". As assinaturas sao incorporadas diretamente nos quadros da
 * pagina de assinaturas. Hash, metodo, consentimento e identificadores de
 * auditoria permanecem armazenados no dominio de assinatura, mas nao sao
 * exibidos no laudo entregue ao cliente.
 */
export type SignedReportSigner = {
  name: string;
  role: "owner" | "tenant_buyer" | "responsible" | "witness";
  roleLabel: string;
  document: string | null;
  signedAt: string;
  method: "drawn" | "typed";
  consentText: string;
  signatureImage: { buffer: Buffer; mimeType: string } | null;
  auditId: string;
};

export type BuildSignedInspectionCertificateInput = {
  baseReportBytes: Buffer;
  documentHash: string;
  generatedAt: string;
  signatureLocation?: string | null;
  signers: SignedReportSigner[];
};

export type BuildSignedInspectionCertificateResult = {
  buffer: Buffer;
  warnings: string[];
};

function formatDateTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(iso));
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

  // O laudo profissional termina com uma pagina dedicada de assinaturas.
  // Nunca anexar uma segunda pagina/certificado: o cliente deve enxergar uma
  // unica area de assinaturas, limpa e coerente com o restante do laudo.
  const signaturePage = finalDoc.getPages().at(-1);
  if (!signaturePage) {
    return { buffer: Buffer.from(await finalDoc.save()), warnings: ["pagina de assinaturas nao encontrada"] };
  }

  for (const signer of input.signers) {
    const slot = SIGNATURE_PAGE_LAYOUT[signer.role];
    if (!slot) continue;

    try {
      if (signer.signatureImage) {
        const safeBytes = new Uint8Array(signer.signatureImage.buffer);
        const image =
          signer.signatureImage.mimeType === "image/jpeg"
            ? await finalDoc.embedJpg(safeBytes)
            : await finalDoc.embedPng(safeBytes);

        const maxWidth = slot.width - 30;
        const maxHeight = 54;
        const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        const signatureLineY = slot.topY - 98;

        signaturePage.drawImage(image, {
          x: slot.x + (slot.width - width) / 2,
          y: signatureLineY + 8,
          width,
          height,
        });
      }

      const name = signer.name.trim();
      const nameWidth = bold.widthOfTextAtSize(name, 8.2);
      if (name && nameWidth < slot.width - 22) {
        signaturePage.drawText(name, {
          x: slot.x + 12,
          y: slot.topY - 128,
          size: 8.2,
          font: bold,
          color: rgb(0.12, 0.12, 0.15),
        });
      }

      signaturePage.drawText(`Assinado eletronicamente em ${formatDateTime(signer.signedAt)}`, {
        x: slot.x + 12,
        y: slot.topY - 144,
        size: 7.2,
        font: regular,
        color: rgb(0.35, 0.35, 0.38),
      });
    } catch {
      warnings.push(`assinatura de ${signer.name}: nao foi possivel incorporar a imagem no quadro principal`);
    }
  }

  return { buffer: Buffer.from(await finalDoc.save()), warnings };
}
