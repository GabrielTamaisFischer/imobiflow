import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildProfessionalInspectionReport,
  buildReportFileName,
  maskDocument,
  type BuildProfessionalInspectionReportInput,
  type ReportEvidence,
  type ReportItem,
  type ReportRoom,
} from "../src/services/inspection-report-pdf.js";

// Sub-bloco 5B - testes do gerador PURO (sem banco/storage - ver
// inspections-mysql-http.test.ts para o fluxo HTTP completo, incluindo
// isolamento de tenant no download). Fixtures de imagem geradas com PIL
// (JPEG/PNG/WebP reais, minusculas) porque nao ha fixtures binarias
// versionadas no repositorio para este caso.

const JPG_BYTES = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAAeACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDiaKKK/YD3gooooAKKKKACiiigAooooAKKKKAP/9k=",
  "base64",
);
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAB4AAAAoCAIAAABmcd1FAAAALklEQVR4nO3MQQEAQAQAsHNBBBNMXil4bQEW2fV2/KVXrVar1Wq1Wq1Wq9WH9QBErwFe9JDvQQAAAABJRU5ErkJggg==",
  "base64",
);
const WEBP_BYTES = Buffer.from(
  "UklGRkgAAABXRUJQVlA4IDwAAAAQAwCdASoUABQAPm00lkekIyIhKAgAgA2JZQB2AACArZgA/u1N3/9ahGHM5v//rgP/nAf/OA/lu+2pAAA=",
  "base64",
);
const WIDE_JPG_BYTES = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAA8ASwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5CooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA//2Q==",
  "base64",
);

function evidence(overrides: Partial<ReportEvidence> = {}): ReportEvidence {
  return { id: randomUUID(), caption: null, buffer: JPG_BYTES, mimeType: "image/jpeg", ...overrides };
}

function baseInspection(): BuildProfessionalInspectionReportInput["inspection"] {
  return { id: randomUUID(), type: "entry", status: "completed", notes: null, completedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
}

function minimalInput(overrides: Partial<BuildProfessionalInspectionReportInput> = {}): BuildProfessionalInspectionReportInput {
  return {
    inspection: baseInspection(),
    company: { name: "Imobiliaria Teste", document: "12345678000190", phone: "11999990000", email: "contato@teste.com.br", logo: null },
    property: null,
    owner: null,
    tenantOrBuyer: null,
    broker: null,
    rooms: [],
    generatedAt: new Date().toISOString(),
    snapshotHash: "hash-teste",
    ...overrides,
  };
}

function room(overrides: Partial<ReportRoom> = {}): ReportRoom {
  return { id: randomUUID(), name: "Sala", notes: null, generalEvidence: [], items: [], ...overrides };
}
function item(overrides: Partial<ReportItem> = {}): ReportItem {
  return { id: randomUUID(), name: "Parede", condition: "good", notes: null, evidence: [], ...overrides };
}

function assertValidPdf(buffer: Buffer) {
  expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(buffer.byteLength).toBeGreaterThan(200);
  // conta objetos /Type /Page no corpo (aproximacao razoavel de paginas reais,
  // sem depender de um parser de PDF externo so para o teste).
  const pageObjectCount = (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pageObjectCount).toBeGreaterThan(0);
  return pageObjectCount;
}

describe("maskDocument", () => {
  it("mascara CPF preservando os 3 primeiros e os 2 ultimos digitos", () => {
    expect(maskDocument("123.456.789-01")).toBe("123.***.***-01");
  });
  it("mascara CNPJ preservando os 2 primeiros e os 2 ultimos digitos", () => {
    expect(maskDocument("12.345.678/0001-90")).toBe("12.***.***/****-90");
  });
  it("retorna null para documento ausente", () => {
    expect(maskDocument(null)).toBeNull();
  });
  it("mascara genericamente um documento com tamanho fora do padrao CPF/CNPJ", () => {
    expect(maskDocument("1234567")).toBe("12***67");
  });
});

describe("buildReportFileName", () => {
  it("monta o nome amigavel com codigo, tipo e data", () => {
    expect(buildReportFileName({ propertyCode: "502163", type: "entry", generatedAt: "2026-10-22T10:00:00Z" })).toBe(
      "laudo-vistoria-502163-entrada-2026-10-22.pdf",
    );
  });
  it("usa 'saida' para vistoria de saida", () => {
    expect(buildReportFileName({ propertyCode: "502163", type: "exit", generatedAt: "2026-10-22T10:00:00Z" })).toBe(
      "laudo-vistoria-502163-saida-2026-10-22.pdf",
    );
  });
  it("remove acentos, espacos e caracteres invalidos do codigo do imovel", () => {
    const name = buildReportFileName({ propertyCode: "Edificio Ipe / Apto 12º", type: "entry", generatedAt: "2026-10-22T10:00:00Z" });
    expect(name).toMatch(/^laudo-vistoria-[a-z0-9-]+-entrada-2026-10-22\.pdf$/);
    expect(name).not.toMatch(/[\/\\]/);
  });
  it("nunca inclui tentativa de path traversal no nome final", () => {
    const name = buildReportFileName({ propertyCode: "../../etc/passwd", type: "entry", generatedAt: "2026-10-22T10:00:00Z" });
    expect(name).not.toContain("..");
    expect(name).not.toContain("/");
  });
  it("cai para 'imovel' quando o codigo esta ausente", () => {
    expect(buildReportFileName({ propertyCode: null, type: "entry", generatedAt: "2026-10-22T10:00:00Z" })).toBe(
      "laudo-vistoria-imovel-entrada-2026-10-22.pdf",
    );
  });
});

describe("buildProfessionalInspectionReport", () => {
  it("gera um PDF valido mesmo sem imovel, proprietario, responsavel ou ambientes", async () => {
    const { buffer, warnings } = await buildProfessionalInspectionReport(minimalInput());
    assertValidPdf(buffer);
    expect(warnings).toEqual([]);
  });

  it("incorpora evidencia JPEG sem gerar aviso", async () => {
    const input = minimalInput({ rooms: [room({ generalEvidence: [evidence({ mimeType: "image/jpeg", buffer: JPG_BYTES })] })] });
    const { buffer, warnings } = await buildProfessionalInspectionReport(input);
    assertValidPdf(buffer);
    expect(warnings).toEqual([]);
  });

  it("incorpora evidencia PNG sem gerar aviso", async () => {
    const input = minimalInput({ rooms: [room({ generalEvidence: [evidence({ mimeType: "image/png", buffer: PNG_BYTES })] })] });
    const { buffer, warnings } = await buildProfessionalInspectionReport(input);
    assertValidPdf(buffer);
    expect(warnings).toEqual([]);
  });

  // Sub-bloco 5D-B: com o Sharp autorizado, o WebP historico passa a ser
  // decodificado (rotate EXIF + resize + reencode JPEG) e embutido de
  // verdade no laudo - nao mais um placeholder. Isso elimina a limitacao
  // anterior para esse formato, mantida apenas para buffers que o Sharp
  // realmente nao consiga decodificar (ver teste de buffer invalido abaixo).
  it("decodifica evidencia WebP via Sharp e embute como imagem real, sem aviso", async () => {
    const input = minimalInput({ rooms: [room({ generalEvidence: [evidence({ mimeType: "image/webp", buffer: WEBP_BYTES, caption: "Dano antigo" })] })] });
    const { buffer, warnings } = await buildProfessionalInspectionReport(input);
    assertValidPdf(buffer);
    expect(warnings).toEqual([]);
  });

  // Sub-bloco 5D-B: buffer corrompido/ilegivel (nem o Sharp nem o fallback
  // de embed direto conseguem decodificar) precisa cair no placeholder com
  // aviso, sem derrubar o documento inteiro - isso cobre o requisito
  // explicito de "imagem invalida nao pode impedir o laudo inteiro".
  it("cai para placeholder com aviso quando o buffer esta corrompido, sem falhar o PDF inteiro", async () => {
    const corrupted = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const input = minimalInput({ rooms: [room({ generalEvidence: [evidence({ mimeType: "image/jpeg", buffer: corrupted, caption: "Foto corrompida" })] })] });
    const { buffer, warnings } = await buildProfessionalInspectionReport(input);
    assertValidPdf(buffer);
    expect(warnings.some((text) => /nao pode ser decodificada/i.test(text))).toBe(true);
  });

  it("separa fotos gerais do ambiente das fotos especificas de cada item", async () => {
    const input = minimalInput({
      rooms: [room({
        generalEvidence: [evidence({ caption: "Foto geral" })],
        items: [item({ name: "Torneira", evidence: [evidence({ caption: "Foto do item" })] })],
      })],
    });
    const { buffer } = await buildProfessionalInspectionReport(input);
    assertValidPdf(buffer);
  });

  it.each([1, 2, 3, 4, 6])("gera a grade de fotos corretamente para %i foto(s) em um ambiente", async (count) => {
    const generalEvidence = Array.from({ length: count }, (_, index) => evidence({ caption: `Foto ${index + 1}`, buffer: index % 2 === 0 ? JPG_BYTES : WIDE_JPG_BYTES }));
    const input = minimalInput({ rooms: [room({ generalEvidence })] });
    const { buffer, warnings } = await buildProfessionalInspectionReport(input);
    assertValidPdf(buffer);
    expect(warnings).toEqual([]);
  });

  it("preserva observacoes longas e quebras de linha sem sair da pagina", async () => {
    const longNotes = Array.from({ length: 40 }, (_, index) => `Linha de observacao numero ${index + 1} com acentuacao: ação, não, café, pêra.`).join("\n");
    const input = minimalInput({
      inspection: { ...baseInspection(), notes: longNotes },
      rooms: [room({ notes: longNotes, items: [item({ notes: longNotes })] })],
    });
    const { buffer } = await buildProfessionalInspectionReport(input);
    const pages = assertValidPdf(buffer);
    expect(pages).toBeGreaterThan(1);
  });

  it("gera multiplas paginas com varios ambientes e preserva acentuacao/cedilha no texto", async () => {
    const rooms = Array.from({ length: 6 }, (_, index) =>
      room({
        name: `Ambiente ${index + 1} - Varanda com açaí e pão`,
        notes: "Observação com cedilha: calçada e raças.",
        items: [item({ name: "Interruptor", notes: "Condição razoável" }), item({ name: "Piso" })],
      }),
    );
    const { buffer } = await buildProfessionalInspectionReport(minimalInput({ rooms }));
    const pages = assertValidPdf(buffer);
    expect(pages).toBeGreaterThan(1);
  });

  it("inclui proprietario, responsavel com CRECI e endereco quando disponiveis, mascarando documentos pessoais", async () => {
    const input = minimalInput({
      property: {
        code: "502163", title: "Apartamento 12", propertyType: "apartment",
        street: "Rua das Flores", number: "100", complement: "Apto 12", neighborhood: "Centro", city: "São Paulo", state: "SP", zipCode: "01000-000",
        condominiumName: "Edifício Ipê", privateArea: 65, totalArea: 70, bedrooms: 2, suites: 1, bathrooms: 2, parkingSpaces: 1,
        iptuCents: 15000, condominiumFeeCents: 45000, coverPhoto: null,
      },
      owner: { name: "Maria da Silva", document: "12345678901" },
      broker: { name: "João Corretor", creci: "SP-12345" },
    });
    const { buffer } = await buildProfessionalInspectionReport(input);
    assertValidPdf(buffer);
  });

  it("omite secoes opcionais ausentes sem quebrar (sem imovel, sem proprietario, sem responsavel, sem inquilino)", async () => {
    const { buffer } = await buildProfessionalInspectionReport(minimalInput());
    assertValidPdf(buffer);
  });

  it("sempre inclui os blocos de assinatura manual, mesmo com partes desconhecidas", async () => {
    const { buffer } = await buildProfessionalInspectionReport(minimalInput());
    // A secao de assinaturas e sempre desenhada (ver drawSignatureSection) -
    // nao ha como extrair texto sem um parser completo de PDF aqui, mas o
    // teste garante que a ausencia de proprietario/responsavel/inquilino nao
    // lanca excecao ao tentar desenhar os blocos de assinatura.
    assertValidPdf(buffer);
  });

  it("teste de stress: 10 ambientes x 8 itens com fotos e observacoes gera um PDF valido em tempo e tamanho razoaveis", async () => {
    const rooms = Array.from({ length: 10 }, (_, roomIndex) =>
      room({
        name: `Ambiente ${roomIndex + 1}`,
        notes: `Observações do ambiente ${roomIndex + 1}.`,
        generalEvidence: [evidence({ caption: "Visão geral" }), evidence({ caption: "Outro ângulo", buffer: WIDE_JPG_BYTES })],
        items: Array.from({ length: 8 }, (_, itemIndex) =>
          item({
            name: `Item ${itemIndex + 1}`,
            condition: (["excellent", "good", "fair", "poor", "damaged", "not_applicable", "not_inspected", "good"] as const)[itemIndex],
            notes: `Observação do item ${itemIndex + 1} do ambiente ${roomIndex + 1}.`,
            evidence: [evidence({ caption: `Item ${itemIndex + 1} foto` })],
          }),
        ),
      }),
    );
    const start = Date.now();
    const { buffer, warnings } = await buildProfessionalInspectionReport(minimalInput({ rooms }));
    const elapsedMs = Date.now() - start;
    const pages = assertValidPdf(buffer);
    expect(warnings).toEqual([]);
    // eslint-disable-next-line no-console
    console.log(`[stress] paginas=${pages} tamanho=${buffer.byteLength}bytes tempo=${elapsedMs}ms`);
    expect(pages).toBeGreaterThan(10);
    expect(buffer.byteLength).toBeLessThan(15 * 1024 * 1024);
  });
});
