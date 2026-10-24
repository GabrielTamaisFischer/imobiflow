import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildSignedInspectionCertificate, type SignedReportSigner } from "../src/services/inspection-signing-pdf.js";

const JPG_BYTES = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAYABQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDnaKKK+1PRCiiigAooooAKKKKAP//Z",
  "base64",
);

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAB4AAAAoCAIAAABmcd1FAAAALklEQVR4nO3MQQEAQAQAsHNBBBNMXil4bQEW2fV2/KVXrVar1Wq1Wq1Wq9WH9QBErwFe9JDvQQAAAABJRU5ErkJggg==",
  "base64",
);

async function makeBaseReportBytes(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText("Laudo de Vistoria — Base", { x: 48, y: 780, size: 14, font });
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function signer(overrides: Partial<SignedReportSigner> = {}): SignedReportSigner {
  return {
    name: "Maria Silva",
    role: "owner",
    roleLabel: "Proprietário",
    document: "12345678901",
    signedAt: "2026-10-23T12:00:00.000Z",
    method: "drawn",
    consentText: "Declaro que li o laudo apresentado e concordo em registrar minha assinatura eletrônica neste documento.",
    signatureImage: { buffer: PNG_BYTES, mimeType: "image/png" },
    auditId: "audit-1",
    ...overrides,
  };
}

describe("buildSignedInspectionCertificate", () => {
  it("produz um PDF válido (bytes com o magic header %PDF-)", async () => {
    const baseReportBytes = await makeBaseReportBytes();
    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: "a".repeat(64),
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: [signer()],
    });
    expect(result.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(result.warnings).toEqual([]);
  });

  it("desenha a assinatura na propria pagina de assinaturas do laudo, sem criar pagina de certificado adicional", async () => {
    // F5-estabilizacao: a arquitetura atual (ver comentario em
    // inspection-signing-pdf.ts) nunca anexa uma segunda pagina - desenha
    // diretamente sobre a ultima pagina do laudo (a pagina de assinaturas
    // profissional). O teste antigo assumia a arquitetura anterior, que
    // anexava uma pagina de certificado separada.
    const baseReportBytes = await makeBaseReportBytes();
    const basePageCount = (await PDFDocument.load(baseReportBytes)).getPageCount();

    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: "b".repeat(64),
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: [signer()],
    });

    const finalDoc = await PDFDocument.load(result.buffer);
    expect(finalDoc.getPageCount()).toBe(basePageCount);
  });

  it("aceita o hash do documento como entrada mas nunca o exibe no laudo entregue ao cliente", async () => {
    // F5-estabilizacao: hash, auditId, metodo e texto de consentimento ficam
    // armazenados no dominio de assinatura (banco), nunca no PDF entregue -
    // ver comentario no topo de inspection-signing-pdf.ts.
    const baseReportBytes = await makeBaseReportBytes();
    const basePageCount = (await PDFDocument.load(baseReportBytes)).getPageCount();
    const hash = "c".repeat(64);
    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: hash,
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: [signer({ auditId: "audit-hash-check" })],
    });
    const finalDoc = await PDFDocument.load(result.buffer);
    expect(finalDoc.getPageCount()).toBe(basePageCount);
    const rawText = result.buffer.toString("latin1");
    expect(rawText).not.toContain(hash);
    expect(rawText).not.toContain("audit-hash-check");
  });

  it("incorpora a imagem de assinatura para PNG", async () => {
    const baseReportBytes = await makeBaseReportBytes();
    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: "d".repeat(64),
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: [signer({ signatureImage: { buffer: PNG_BYTES, mimeType: "image/png" } })],
    });
    expect(result.warnings).toEqual([]);
    const finalDoc = await PDFDocument.load(result.buffer);
    expect(finalDoc.getPageCount()).toBe((await PDFDocument.load(baseReportBytes)).getPageCount());
  });

  it("incorpora a imagem de assinatura para JPEG", async () => {
    const baseReportBytes = await makeBaseReportBytes();
    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: "e".repeat(64),
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: [
        signer({
          method: "typed",
          signatureImage: { buffer: JPG_BYTES, mimeType: "image/jpeg" },
        }),
      ],
    });
    expect(result.warnings).toEqual([]);
  });

  it("quando um signatário não possui imagem de assinatura, não lança erro — apenas registra no PDF sem imagem", async () => {
    const baseReportBytes = await makeBaseReportBytes();
    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: "f".repeat(64),
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: [signer({ signatureImage: null })],
    });
    expect(result.warnings).toEqual([]);
    const finalDoc = await PDFDocument.load(result.buffer);
    expect(finalDoc.getPageCount()).toBe((await PDFDocument.load(baseReportBytes)).getPageCount());
  });

  it("quando a imagem de assinatura está corrompida, coleta um warning em vez de lançar erro", async () => {
    const baseReportBytes = await makeBaseReportBytes();
    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: "0".repeat(64),
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: [
        signer({
          name: "Assinatura Corrompida",
          signatureImage: { buffer: Buffer.from("isto nao e uma imagem valida"), mimeType: "image/png" },
        }),
      ],
    });
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("Assinatura Corrompida");
  });

  it("suporta os quatro papeis do quadro de assinaturas (proprietario, inquilino/comprador, responsavel, testemunha) sem criar paginas novas", async () => {
    // F5-estabilizacao: a pagina de assinaturas do laudo tem 4 quadros fixos
    // (SIGNATURE_PAGE_LAYOUT) - nao ha mais um fluxo dinamico de N
    // signatarios com paginacao; cada papel ocupa seu proprio quadro na
    // mesma pagina, sempre.
    const baseReportBytes = await makeBaseReportBytes();
    const basePageCount = (await PDFDocument.load(baseReportBytes)).getPageCount();
    const roles: SignedReportSigner["role"][] = ["owner", "tenant_buyer", "responsible", "witness"];
    const fourSigners: SignedReportSigner[] = roles.map((role, index) =>
      signer({
        role,
        name: `Signatário ${index + 1}`,
        auditId: `audit-${index + 1}`,
        signatureImage: index % 2 === 0 ? { buffer: PNG_BYTES, mimeType: "image/png" } : { buffer: JPG_BYTES, mimeType: "image/jpeg" },
      }),
    );

    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: "1".repeat(64),
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: fourSigners,
    });

    expect(result.warnings).toEqual([]);
    const finalDoc = await PDFDocument.load(result.buffer);
    expect(finalDoc.getPageCount()).toBe(basePageCount);
  });

  it("lida com zero signatários (nenhum quadro é alterado, documento permanece igual em páginas)", async () => {
    const baseReportBytes = await makeBaseReportBytes();
    const basePageCount = (await PDFDocument.load(baseReportBytes)).getPageCount();
    const result = await buildSignedInspectionCertificate({
      baseReportBytes,
      documentHash: "2".repeat(64),
      generatedAt: "2026-10-23T12:00:00.000Z",
      signers: [],
    });
    expect(result.warnings).toEqual([]);
    const finalDoc = await PDFDocument.load(result.buffer);
    expect(finalDoc.getPageCount()).toBe(basePageCount);
  });
});
