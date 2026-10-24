import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb, type Color } from "pdf-lib";
import { optimizeEvidenceImage, clearImageOptimizerCache, type OptimizeOptions } from "./inspection-report-image.js";

/**
 * Sub-bloco 5B - Gerador PROFISSIONAL do laudo de vistoria, separado de
 * `inspection-f5f.ts` (buildPdfBuffer) de proposito: aquele helper generico
 * (texto corrido, sem imagem) continua servindo comparacao e contrato sem
 * nenhuma alteracao. Este arquivo e especifico do laudo de vistoria e usa
 * pdf-lib (decisao aprovada no Sub-bloco 5A) para imagens, formas e
 * paginacao real.
 *
 * Este modulo e puro: nao acessa banco nem storage. O chamador (rota) busca
 * os dados e os BYTES das fotos (via readStoredFileBuffer) e monta o input
 * abaixo - isso torna o gerador testavel sem rede/DB.
 */

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

export type ReportCompany = {
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  logo: { buffer: Buffer; mimeType: string } | null;
};

export type ReportProperty = {
  code: string | null;
  title: string;
  propertyType: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  condominiumName: string | null;
  privateArea: number | null;
  totalArea: number | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  iptuCents: number | null;
  condominiumFeeCents: number | null;
  coverPhoto: { buffer: Buffer; mimeType: string } | null;
};

export type ReportPerson = { name: string; document: string | null };
export type ReportBroker = { name: string; creci: string | null };

export type ReportEvidence = {
  id: string;
  caption: string | null;
  /** null quando o formato nao pode ser incorporado nesta versao (ex.: WebP) ou os bytes nao puderam ser lidos. */
  buffer: Buffer | null;
  mimeType: string | null;
};

export type ReportItem = {
  id: string;
  name: string;
  condition: string;
  notes: string | null;
  evidence: ReportEvidence[];
};

export type ReportRoom = {
  id: string;
  name: string;
  notes: string | null;
  generalEvidence: ReportEvidence[];
  items: ReportItem[];
};

export type ReportInspection = {
  id: string;
  type: "entry" | "exit";
  status: "draft" | "in_progress" | "completed" | "archived";
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type BuildProfessionalInspectionReportInput = {
  inspection: ReportInspection;
  company: ReportCompany;
  property: ReportProperty | null;
  owner: ReportPerson | null;
  tenantOrBuyer: (ReportPerson & { role: "tenant" | "buyer" }) | null;
  broker: ReportBroker | null;
  rooms: ReportRoom[];
  generatedAt: string;
  snapshotHash: string;
  /**
   * Sub-bloco 5D-B - permite ajustar DPI/qualidade da otimizacao de imagem
   * embutida no PDF. Opcional: sem isso, usa os valores padrao decididos
   * apos a comparacao 150 vs 180 DPI (ver inspection-report-image.ts). Util
   * para scripts de comparacao/teste; a rota de producao nao precisa setar.
   */
  imageOptimization?: OptimizeOptions;
};

export type BuildProfessionalInspectionReportResult = {
  buffer: Buffer;
  /** Avisos tecnicos (ex.: fotos WebP nao incorporadas) - para log server-side, nunca exibidos crus ao usuario. */
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Constantes de layout
// ---------------------------------------------------------------------------

const PAGE_WIDTH = 595.28; // A4 retrato, pontos
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const GAP = 14;

const PURPLE = rgb(0.486, 0.227, 0.929); // #7C3AED - roxo de marca do ImobiFlow
const DARK = rgb(0.13, 0.13, 0.16);
const GRAY = rgb(0.42, 0.42, 0.46);
const LIGHT_GRAY = rgb(0.88, 0.88, 0.9);
const WHITE = rgb(1, 1, 1);

export const SIGNATURE_PAGE_LAYOUT = {
  owner: { x: 50, topY: 638, width: 232, height: 150 },
  tenant_buyer: { x: 313, topY: 638, width: 232, height: 150 },
  responsible: { x: 50, topY: 432, width: 232, height: 150 },
  witness: { x: 313, topY: 432, width: 232, height: 150 },
} as const;

const TYPE_LABELS: Record<ReportInspection["type"], string> = { entry: "Entrada", exit: "Saida" };
const STATUS_LABELS: Record<ReportInspection["status"], string> = {
  draft: "Rascunho",
  in_progress: "Em andamento",
  completed: "Concluida",
  archived: "Arquivada",
};

/**
 * Mesmos 7 valores do dominio (ver itemConditions em inspections-mysql.ts) e
 * os mesmos 4 estados visiveis na UI aprovada (ver
 * src/product/inspection-item-status.ts displayStatusKeyFor): excellent/good
 * -> "Bom", fair/poor -> "Atencao", damaged -> "Avaria", not_applicable ->
 * "Nao se aplica". not_inspected nao tem um dos 4 botoes (vistoria ainda nao
 * revisada) - mantido fiel ao valor real do dominio nesse caso, nunca
 * inventado. Duplicado aqui porque backend e frontend sao pacotes separados
 * (@imobiflow/backend vs. platform/), sem um pacote compartilhado hoje -
 * MESMA regra, nao uma reimplementacao diferente.
 */
const CONDITION_DISPLAY: Record<string, { label: string; bucket: "good" | "attention" | "damaged" | "not_applicable" | null }> = {
  not_inspected: { label: "Nao vistoriado", bucket: null },
  excellent: { label: "Bom", bucket: "good" },
  good: { label: "Bom", bucket: "good" },
  fair: { label: "Atencao", bucket: "attention" },
  poor: { label: "Atencao", bucket: "attention" },
  damaged: { label: "Avaria", bucket: "damaged" },
  not_applicable: { label: "Nao se aplica", bucket: "not_applicable" },
};

function conditionDisplay(condition: string) {
  return CONDITION_DISPLAY[condition] ?? { label: condition, bucket: null };
}

const LEGEND_ITEMS: Array<{ label: string; color: Color }> = [
  { label: "Bom", color: rgb(0.16, 0.6, 0.35) },
  { label: "Atencao", color: rgb(0.85, 0.6, 0.1) },
  { label: "Avaria", color: rgb(0.8, 0.22, 0.22) },
  { label: "Nao se aplica", color: rgb(0.55, 0.55, 0.58) },
];

const CONDITION_COLOR: Record<string, Color> = {
  good: rgb(0.16, 0.6, 0.35),
  attention: rgb(0.85, 0.6, 0.1),
  damaged: rgb(0.8, 0.22, 0.22),
  not_applicable: rgb(0.55, 0.55, 0.58),
};

const WEBP_PLACEHOLDER_TEXT =
  "Evidencia fotografica disponivel no sistema, mas este formato de imagem nao pode ser incorporado nesta versao do PDF.";

// ---------------------------------------------------------------------------
// Helpers de texto/numero
// ---------------------------------------------------------------------------

function cleanText(value: string) {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = cleanText(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatDate(value: string | null) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
  } catch {
    return null;
  }
}

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatCurrencyCents(cents: number | null) {
  if (cents === null || cents === undefined) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatArea(value: number | null) {
  if (value === null || value === undefined) return null;
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} m2`;
}

/** Mascara documento (CPF/CNPJ) preservando apenas inicio/fim - nunca expoe o numero completo. */
export function maskDocument(document: string | null): string | null {
  if (!document) return null;
  const digits = document.replace(/\D/g, "");
  if (digits.length === 11) {
    // CPF: ddd.ddd.ddd-dd - preserva os 3 primeiros e os 2 ultimos (verificadores).
    return `${digits.slice(0, 3)}.***.***-${digits.slice(9, 11)}`;
  }
  if (digits.length === 14) {
    // CNPJ: dd.ddd.ddd/dddd-dd - preserva os 2 primeiros e os 2 ultimos.
    return `${digits.slice(0, 2)}.***.***/****-${digits.slice(12, 14)}`;
  }
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${digits.slice(0, 2)}${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-2)}`;
}

/** Nome de arquivo amigavel e seguro: laudo-vistoria-<codigo>-<tipo>-<data>.pdf. Sanitiza acentos, espacos, separadores e path traversal. */
export function buildReportFileName(input: { propertyCode: string | null; type: ReportInspection["type"]; generatedAt: string }): string {
  const code = sanitizeFileNameSegment(input.propertyCode || "imovel");
  const type = input.type === "exit" ? "saida" : "entrada";
  const date = new Date(input.generatedAt);
  const iso = Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
  return `laudo-vistoria-${code}-${type}${iso ? `-${iso}` : ""}.pdf`;
}

function sanitizeFileNameSegment(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || "imovel").slice(0, 60).toLowerCase();
}

// ---------------------------------------------------------------------------
// Gerador
// ---------------------------------------------------------------------------

type Fonts = { regular: PDFFont; bold: PDFFont };

class ReportBuilder {
  doc: PDFDocument;
  fonts: Fonts;
  pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;
  headerLabel: string;
  inspectionCode: string;
  internalPageCount = 0;
  imageOptions: OptimizeOptions;

  constructor(doc: PDFDocument, fonts: Fonts, headerLabel: string, inspectionCode: string, imageOptions: OptimizeOptions = {}) {
    this.doc = doc;
    this.fonts = fonts;
    this.headerLabel = headerLabel;
    this.inspectionCode = inspectionCode;
    this.imageOptions = imageOptions;
  }

  addPage(withHeader: boolean) {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(page);
    this.page = page;
    this.y = PAGE_HEIGHT - MARGIN_TOP;
    if (withHeader) {
      this.internalPageCount += 1;
      this.drawRunningHeader();
    }
  }

  drawRunningHeader() {
    const { regular } = this.fonts;
    this.page.drawText("ImobiFlow", { x: MARGIN_X, y: PAGE_HEIGHT - 32, size: 9, font: this.fonts.bold, color: PURPLE });
    const label = `Laudo de Vistoria  -  ${this.headerLabel}`;
    const width = regular.widthOfTextAtSize(label, 9);
    this.page.drawText(label, { x: PAGE_WIDTH - MARGIN_X - width, y: PAGE_HEIGHT - 32, size: 9, font: regular, color: GRAY });
    this.page.drawLine({ start: { x: MARGIN_X, y: PAGE_HEIGHT - 40 }, end: { x: PAGE_WIDTH - MARGIN_X, y: PAGE_HEIGHT - 40 }, thickness: 1, color: LIGHT_GRAY });
    this.y = PAGE_HEIGHT - 40 - 16;
  }

  /** Garante espaco vertical; quebra pagina (com cabecalho) se nao houver. */
  ensureSpace(height: number) {
    if (this.y - height < MARGIN_BOTTOM) {
      this.addPage(true);
    }
  }

  drawFootersAndPageNumbers(inspectionShortId: string, generatedAtLabel: string) {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      if (index === 0) return; // capa sem rodape de paginacao
      const { regular } = this.fonts;
      const text = `Pagina ${index + 1} de ${total}  -  Vistoria ${inspectionShortId}  -  Gerado em ${generatedAtLabel}`;
      const size = 8;
      const width = regular.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (PAGE_WIDTH - width) / 2, y: MARGIN_BOTTOM - 26, size, font: regular, color: GRAY });
    });
  }
}

export async function buildProfessionalInspectionReport(
  input: BuildProfessionalInspectionReportInput,
): Promise<BuildProfessionalInspectionReportResult> {
  const warnings: string[] = [];
  const doc = await PDFDocument.create();
  doc.setTitle(`Laudo de Vistoria - ${input.inspection.id}`);
  doc.setProducer("ImobiFlow");
  doc.setCreationDate(new Date(input.generatedAt));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };

  const propertyLabel = input.property?.code ? `Imovel #${input.property.code}` : "Imovel";
  const inspectionShortId = input.inspection.id.slice(0, 8);
  const builder = new ReportBuilder(doc, fonts, propertyLabel, inspectionShortId, input.imageOptimization);

  drawCoverPage(builder, input, warnings);
  await embedCoverLogoIfAny(builder, input);
  // A capa tem layout proprio (cursor local, sem usar builder.y/ensureSpace).
  // Forca uma pagina nova (com cabecalho/rodape de pagina interna) antes de
  // continuar o fluxo normal - sem isso, as secoes seguintes desenhariam por
  // cima do conteudo da capa na mesma pagina.
  builder.addPage(true);
  drawCompanyAndPropertySection(builder, input);
  drawInspectionOverviewSection(builder, input);
  drawSummarySection(builder, input);
  drawLegendSection(builder);
  for (const [roomIndex, room] of input.rooms.entries()) {
    await drawRoomSection(builder, room, roomIndex, warnings);
  }
  drawGeneralObservationsSection(builder, input);
  drawDeclarationSection(builder, input);
  drawSignatureSection(builder, input);

  const generatedAtLabel = formatDateTime(input.generatedAt);
  builder.drawFootersAndPageNumbers(inspectionShortId, generatedAtLabel);

  // useObjectStreams: false - cada objeto/stream fica endereçável individualmente
  // (sem agrupar varios objetos em um unico ObjStm comprimido). Facilita
  // auditoria/depuracao do PDF gerado e simplifica a extracao de conteudo em
  // teste, sem custo pratico de tamanho relevante para um documento deste porte.
  const bytes = await doc.save({ useObjectStreams: false });
  // Sub-bloco 5D-B - o cache de otimizacao de imagem vive so durante UMA
  // geracao (evita reprocessar a mesma evidencia repetida no mesmo laudo).
  // Limpar aqui evita crescimento sem limite no processo de longa duracao
  // do servidor entre geracoes de laudos diferentes.
  clearImageOptimizerCache();
  return { buffer: Buffer.from(bytes), warnings };
}

// ---------------------------------------------------------------------------
// Secoes
// ---------------------------------------------------------------------------

function drawCoverPage(builder: ReportBuilder, input: BuildProfessionalInspectionReportInput, warnings: string[]) {
  builder.addPage(false);
  const { page, fonts } = builder;
  let y = PAGE_HEIGHT - 90;

  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 10, width: PAGE_WIDTH, height: 10, color: PURPLE });

  page.drawText("IMOBIFLOW", { x: MARGIN_X, y, size: 26, font: fonts.bold, color: PURPLE });
  y -= 34;
  page.drawText("LAUDO DE VISTORIA", { x: MARGIN_X, y, size: 18, font: fonts.bold, color: DARK });
  y -= 24;

  const typeLabel = TYPE_LABELS[input.inspection.type] ?? input.inspection.type;
  page.drawText(`Tipo: ${typeLabel}`, { x: MARGIN_X, y, size: 12, font: fonts.regular, color: GRAY });

  y -= 40;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: PAGE_WIDTH - MARGIN_X, y }, thickness: 1, color: LIGHT_GRAY });
  y -= 28;

  const rows: Array<[string, string | null]> = [
    ["Codigo da vistoria", builder.inspectionCode],
    ["Codigo do imovel", input.property?.code ?? null],
    ["Imovel", input.property?.title ?? null],
    ["Endereco", buildAddressLine(input.property)],
    ["Data", formatDate(input.inspection.completedAt ?? input.inspection.createdAt)],
    ["Responsavel", input.broker?.name ?? null],
    ["CRECI", input.broker?.creci ?? null],
    ["Status", STATUS_LABELS[input.inspection.status] ?? input.inspection.status],
  ];

  for (const [label, value] of rows) {
    if (!value) continue;
    page.drawText(`${label}:`, { x: MARGIN_X, y, size: 10, font: fonts.bold, color: DARK });
    const labelWidth = fonts.bold.widthOfTextAtSize(`${label}:`, 10);
    page.drawText(cleanText(value), { x: MARGIN_X + labelWidth + 6, y, size: 10, font: fonts.regular, color: DARK });
    y -= 18;
  }

  void warnings;
}

async function embedCoverLogoIfAny(builder: ReportBuilder, input: BuildProfessionalInspectionReportInput) {
  const logo = input.company.logo;
  if (!logo) return;
  const page = builder.pages[0];
  if (!page) return;
  try {
    const bytes = new Uint8Array(logo.buffer);
    const image = logo.mimeType === "image/png" ? await builder.doc.embedPng(bytes) : await builder.doc.embedJpg(bytes);
    const box = 64;
    const scaled = image.scaleToFit(box, box);
    page.drawImage(image, {
      x: PAGE_WIDTH - MARGIN_X - scaled.width,
      y: PAGE_HEIGHT - 40 - scaled.height,
      width: scaled.width,
      height: scaled.height,
    });
  } catch {
    // Logo nao pode ser lido/incorporado - capa segue sem logo, sem quebrar o laudo.
  }
}

function buildAddressLine(property: ReportProperty | null): string | null {
  if (!property) return null;
  const line1 = [property.street, property.number].filter(Boolean).join(", ");
  const parts = [line1 || null, property.complement, property.neighborhood, property.city && property.state ? `${property.city} - ${property.state}` : property.city || property.state, property.zipCode]
    .filter((part): part is string => Boolean(part && cleanText(part)));
  return parts.length ? parts.join(" - ") : null;
}

function drawSectionTitle(builder: ReportBuilder, title: string) {
  builder.ensureSpace(26);
  const { page, fonts } = builder;
  page.drawRectangle({ x: MARGIN_X, y: builder.y - 10, width: 4, height: 12, color: PURPLE });
  page.drawText(title.toUpperCase(), { x: MARGIN_X + 10, y: builder.y - 10, size: 11, font: fonts.bold, color: DARK });
  builder.y -= 22;
}

function drawFieldLine(builder: ReportBuilder, label: string, value: string | null) {
  if (!value || !cleanText(value)) return;
  builder.ensureSpace(16);
  const { page, fonts } = builder;
  page.drawText(`${label}:`, { x: MARGIN_X, y: builder.y, size: 9.5, font: fonts.bold, color: DARK });
  const labelWidth = fonts.bold.widthOfTextAtSize(`${label}:`, 9.5);
  const lines = wrapText(fonts.regular, value, 9.5, CONTENT_WIDTH - labelWidth - 6);
  page.drawText(lines[0] ?? "", { x: MARGIN_X + labelWidth + 6, y: builder.y, size: 9.5, font: fonts.regular, color: DARK });
  builder.y -= 15;
  for (const extra of lines.slice(1)) {
    builder.ensureSpace(15);
    builder.page.drawText(extra, { x: MARGIN_X + labelWidth + 6, y: builder.y, size: 9.5, font: fonts.regular, color: DARK });
    builder.y -= 15;
  }
}

function drawParagraph(builder: ReportBuilder, text: string, opts: { size?: number; color?: Color; bold?: boolean } = {}) {
  const size = opts.size ?? 9.5;
  const font = opts.bold ? builder.fonts.bold : builder.fonts.regular;
  const lines = wrapText(font, text, size, CONTENT_WIDTH);
  for (const line of lines) {
    builder.ensureSpace(size + 4);
    builder.page.drawText(line, { x: MARGIN_X, y: builder.y, size, font, color: opts.color ?? DARK });
    builder.y -= size + 4;
  }
}

function drawCompanyAndPropertySection(builder: ReportBuilder, input: BuildProfessionalInspectionReportInput) {
  const { company, property, owner } = input;

  drawSectionTitle(builder, "Dados da empresa");
  drawFieldLine(builder, "Nome", company.name);
  drawFieldLine(builder, "CNPJ", company.document);
  drawFieldLine(builder, "Telefone", company.phone);
  drawFieldLine(builder, "E-mail", company.email);
  builder.y -= 6;

  drawSectionTitle(builder, "Dados do imovel");
  if (property) {
    drawFieldLine(builder, "Codigo", property.code);
    drawFieldLine(builder, "Titulo", property.title);
    drawFieldLine(builder, "Endereco", buildAddressLine(property));
    drawFieldLine(builder, "Condominio", property.condominiumName);
    drawFieldLine(builder, "Area privativa", formatArea(property.privateArea));
    drawFieldLine(builder, "Area total", formatArea(property.totalArea));
    const rooms = [
      property.bedrooms !== null ? `${property.bedrooms} dormitorio(s)` : null,
      property.suites !== null ? `${property.suites} suite(s)` : null,
      property.bathrooms !== null ? `${property.bathrooms} banheiro(s)` : null,
      property.parkingSpaces !== null ? `${property.parkingSpaces} vaga(s)` : null,
    ].filter(Boolean);
    if (rooms.length) drawFieldLine(builder, "Comodos", rooms.join(" - "));
    drawFieldLine(builder, "Condominio (taxa)", formatCurrencyCents(property.condominiumFeeCents));
    drawFieldLine(builder, "IPTU", formatCurrencyCents(property.iptuCents));
  } else {
    drawParagraph(builder, "Dados do imovel nao disponiveis para este laudo.", { color: GRAY });
  }
  builder.y -= 6;

  drawSectionTitle(builder, "Partes envolvidas");
  if (owner) {
    drawFieldLine(builder, "Proprietario", owner.name);
    drawFieldLine(builder, "Documento do proprietario", maskDocument(owner.document));
  }
  if (input.tenantOrBuyer) {
    const roleLabel = input.tenantOrBuyer.role === "tenant" ? "Inquilino" : "Comprador";
    drawFieldLine(builder, roleLabel, input.tenantOrBuyer.name);
    drawFieldLine(builder, `Documento (${roleLabel.toLowerCase()})`, maskDocument(input.tenantOrBuyer.document));
  }
  if (input.broker) {
    drawFieldLine(builder, "Responsavel pela vistoria", input.broker.name);
    drawFieldLine(builder, "CRECI", input.broker.creci);
  }
  builder.y -= 6;
}

function drawInspectionOverviewSection(builder: ReportBuilder, input: BuildProfessionalInspectionReportInput) {
  drawSectionTitle(builder, "Apontamentos da vistoria");
  drawParagraph(
    builder,
    "Este laudo registra o estado aparente de conservacao e funcionamento dos ambientes e itens observados na data da vistoria, com base nos registros, observacoes e evidencias fotograficas inseridos no ImobiFlow. A vistoria e predominantemente visual e nao substitui avaliacao tecnica especializada de estrutura, instalacoes ocultas ou vicios nao aparentes.",
    { size: 9, color: GRAY },
  );
  builder.y -= 10;

  drawSectionTitle(builder, "Layout do imovel");
  if (input.rooms.length === 0) {
    drawParagraph(builder, "Nenhum ambiente registrado nesta vistoria.", { size: 9, color: GRAY });
    builder.y -= 6;
    return;
  }

  const counts = new Map<string, number>();
  for (const room of input.rooms) counts.set(room.name, (counts.get(room.name) ?? 0) + 1);
  const entries = [...counts.entries()];
  const cols = 3;
  const cellWidth = (CONTENT_WIDTH - GAP * (cols - 1)) / cols;
  const cellHeight = 30;
  for (let i = 0; i < entries.length; i += cols) {
    builder.ensureSpace(cellHeight + 8);
    entries.slice(i, i + cols).forEach(([name, count], index) => {
      const x = MARGIN_X + index * (cellWidth + GAP);
      const y = builder.y - cellHeight;
      builder.page.drawRectangle({ x, y, width: cellWidth, height: cellHeight, borderColor: LIGHT_GRAY, borderWidth: 0.8, color: WHITE });
      builder.page.drawText(cleanText(name), { x: x + 8, y: y + 11, size: 8.5, font: builder.fonts.bold, color: DARK });
      const countText = String(count);
      const countWidth = builder.fonts.bold.widthOfTextAtSize(countText, 9);
      builder.page.drawText(countText, { x: x + cellWidth - 8 - countWidth, y: y + 11, size: 9, font: builder.fonts.bold, color: PURPLE });
    });
    builder.y -= cellHeight + 8;
  }
  builder.y -= 4;
}

function drawSummarySection(builder: ReportBuilder, input: BuildProfessionalInspectionReportInput) {
  drawSectionTitle(builder, "Resumo da vistoria");

  const allItems = input.rooms.flatMap((room) => room.items);
  const reviewed = allItems.filter((item) => item.condition !== "not_inspected").length;
  const buckets = { good: 0, attention: 0, damaged: 0, not_applicable: 0 };
  for (const item of allItems) {
    const bucket = conditionDisplay(item.condition).bucket;
    if (bucket) buckets[bucket] += 1;
  }
  const totalPhotos = input.rooms.reduce(
    (sum, room) => sum + room.generalEvidence.length + room.items.reduce((itemSum, item) => itemSum + item.evidence.length, 0),
    0,
  );
  const isFilled = (value: string | null) => Boolean(value && cleanText(value));
  const observationsCount =
    (isFilled(input.inspection.notes) ? 1 : 0) +
    input.rooms.reduce((sum, room) => sum + (isFilled(room.notes) ? 1 : 0), 0) +
    allItems.reduce((sum, item) => sum + (isFilled(item.notes) ? 1 : 0), 0);
  const progress = allItems.length > 0 ? Math.round((reviewed / allItems.length) * 100) : 0;

  const cards: Array<[string, string]> = [
    ["Ambientes", String(input.rooms.length)],
    ["Itens", String(allItems.length)],
    ["Revisados", String(reviewed)],
    ["Bom", String(buckets.good)],
    ["Atencao", String(buckets.attention)],
    ["Avaria", String(buckets.damaged)],
    ["Nao se aplica", String(buckets.not_applicable)],
    ["Fotos", String(totalPhotos)],
    ["Observacoes", String(observationsCount)],
    ["Progresso", `${progress}%`],
  ];

  const cols = 3;
  const cardWidth = (CONTENT_WIDTH - GAP * (cols - 1)) / cols;
  const cardHeight = 46;
  for (let i = 0; i < cards.length; i += cols) {
    builder.ensureSpace(cardHeight + 10);
    const rowCards = cards.slice(i, i + cols);
    rowCards.forEach(([label, value], index) => {
      const x = MARGIN_X + index * (cardWidth + GAP);
      const y = builder.y - cardHeight;
      builder.page.drawRectangle({ x, y, width: cardWidth, height: cardHeight, borderColor: LIGHT_GRAY, borderWidth: 1, color: WHITE });
      builder.page.drawText(label, { x: x + 10, y: y + cardHeight - 16, size: 8.5, font: builder.fonts.regular, color: GRAY });
      builder.page.drawText(value, { x: x + 10, y: y + 10, size: 15, font: builder.fonts.bold, color: DARK });
    });
    builder.y -= cardHeight + 10;
  }
  builder.y -= 4;
}

function drawLegendSection(builder: ReportBuilder) {
  drawSectionTitle(builder, "Legenda dos estados");
  builder.ensureSpace(20);
  let x = MARGIN_X;
  for (const legend of LEGEND_ITEMS) {
    const boxSize = 11;
    builder.page.drawRectangle({ x, y: builder.y - boxSize + 2, width: boxSize, height: boxSize, color: legend.color, borderColor: DARK, borderWidth: 0.5 });
    const labelX = x + boxSize + 5;
    builder.page.drawText(legend.label, { x: labelX, y: builder.y - boxSize + 3, size: 9, font: builder.fonts.regular, color: DARK });
    x = labelX + builder.fonts.regular.widthOfTextAtSize(legend.label, 9) + 18;
  }
  builder.y -= 26;
}

type PhotoCell = {
  kind: "image" | "placeholder";
  image?: { ref: Awaited<ReturnType<PDFDocument["embedJpg"]>>; ratio: number };
  caption: string | null;
};

// Sub-bloco 5D-B - tamanho do box de destino para cada um dos dois slots
// reais usados pelo layout (ver cellSize/drawPhotoChunk): foto em largura
// total (1 coluna) ou foto em meia largura (2 colunas, inclusive quando faz
// parte de uma grade 2x2 - MAX_CELL_HEIGHT[4] nunca e usado por cellSize,
// so 1 e 2 existem na pratica). Isso e o box REAL usado para calcular o
// tamanho em pixels do resize, nao um valor arbitrario.
function targetBoxForCols(cols: 1 | 2): { boxWidthPt: number; boxHeightPt: number } {
  return cols === 1
    ? { boxWidthPt: CONTENT_WIDTH, boxHeightPt: MAX_CELL_HEIGHT[1] }
    : { boxWidthPt: (CONTENT_WIDTH - GAP) / 2, boxHeightPt: MAX_CELL_HEIGHT[2] };
}

// Replica, sem desenhar nada, a mesma logica de agrupamento de
// drawPhotoChunk (chunks de 4; dentro de um chunk de 3, os 2 primeiros vao
// em 2 colunas e o ultimo em largura total) para saber ANTES de embutir a
// imagem em qual slot (1 ou 2 colunas) ela vai cair. Mantem o calculo de
// layout em um unico lugar conceitual: se drawPhotoChunk mudar de regra,
// esta funcao precisa mudar junto (comentado nos dois pontos).
function resolveCellCols(indexInList: number, totalInList: number): 1 | 2 {
  const chunkStart = Math.floor(indexInList / 4) * 4;
  const chunkLen = Math.min(4, totalInList - chunkStart);
  const posInChunk = indexInList - chunkStart;
  if (chunkLen === 1) return 1;
  if (chunkLen === 2) return 2;
  if (chunkLen === 3) return posInChunk < 2 ? 2 : 1;
  return 2; // chunkLen === 4
}

async function prepareEvidenceCell(
  doc: PDFDocument,
  evidence: ReportEvidence,
  warnings: string[],
  contextLabel: string,
  cols: 1 | 2,
  imageOptions: OptimizeOptions,
): Promise<PhotoCell> {
  const caption = evidence.caption && cleanText(evidence.caption) ? cleanText(evidence.caption) : null;
  if (!evidence.buffer) {
    warnings.push(`Evidencia ${evidence.id} (${contextLabel}) tem formato nao suportado (${evidence.mimeType ?? "desconhecido"}) e foi substituida por um aviso no laudo.`);
    return { kind: "placeholder", caption };
  }

  // Sub-bloco 5D-B: otimiza (decode + EXIF rotate + resize para o box real
  // + reencode) antes de embutir. Cobre JPEG, PNG e WebP - o Sharp resolve
  // o WebP tambem, eliminando o placeholder antigo para esse formato
  // quando a decodificacao funciona. O arquivo original em storage nunca e
  // tocado: so o buffer em memoria aqui e transformado.
  const target = targetBoxForCols(cols);
  const optimized = await optimizeEvidenceImage(evidence.id, evidence.buffer, evidence.mimeType, target, imageOptions);
  if (optimized) {
    try {
      // IMPORTANTE: embedJpg/embedPng precisam de um Uint8Array com
      // byteOffset 0 no ArrayBuffer subjacente (ver nota historica abaixo).
      // optimized.bytes ja vem de sharp().toBuffer() -> new Uint8Array(...),
      // mas reforcamos aqui porque e o ponto que realmente chama embedJpg.
      const bytes = new Uint8Array(optimized.bytes);
      const image = optimized.format === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      return { kind: "image", image: { ref: image, ratio: image.width / image.height }, caption };
    } catch {
      // Segue para a tentativa com o buffer original abaixo antes de desistir.
    }
  }

  // Fallback: a otimizacao falhou (buffer corrompido ou formato que o
  // Sharp nao decodificou) - tenta o caminho antigo (embed direto do
  // original) so para JPEG/PNG, que e o unico caso em que pdf-lib consegue
  // embutir sem decodificar via Sharp. Preserva o comportamento anterior ao
  // Sub-bloco 5D como rede de seguranca; nunca derruba o laudo inteiro.
  if (evidence.mimeType === "image/jpeg" || evidence.mimeType === "image/png") {
    try {
      // IMPORTANTE: embedJpg/embedPng precisam de um Uint8Array com
      // byteOffset 0 no ArrayBuffer subjacente. Um Buffer do Node pode ter
      // byteOffset != 0 (ex.: resultado de Buffer.concat/slice) e, nesse
      // caso, o parser de JPEG do pdf-lib le a partir do inicio do
      // ArrayBuffer compartilhado em vez do inicio real do arquivo,
      // falhando com "SOI not found" mesmo em um JPEG valido. new
      // Uint8Array(buffer) copia os bytes para um buffer novo com offset 0.
      const bytes = new Uint8Array(evidence.buffer);
      const image = evidence.mimeType === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      return { kind: "image", image: { ref: image, ratio: image.width / image.height }, caption };
    } catch {
      warnings.push(`Evidencia ${evidence.id} (${contextLabel}) nao pode ser decodificada e foi substituida por um aviso no laudo.`);
      return { kind: "placeholder", caption };
    }
  }

  warnings.push(`Evidencia ${evidence.id} (${contextLabel}) tem formato nao suportado (${evidence.mimeType ?? "desconhecido"}) e foi substituida por um aviso no laudo.`);
  return { kind: "placeholder", caption };
}

const MAX_CELL_HEIGHT: Record<1 | 2 | 4, number> = { 1: 300, 2: 220, 4: 170 };
const CAPTION_RESERVED = 14;

function cellSize(cols: 1 | 2, ratio: number | null): { width: number; height: number } {
  const width = cols === 1 ? CONTENT_WIDTH : (CONTENT_WIDTH - GAP) / 2;
  const maxHeight = MAX_CELL_HEIGHT[cols === 1 ? 1 : 2];
  const aspect = ratio ?? 4 / 3;
  let height = width / aspect;
  let finalWidth = width;
  if (height > maxHeight) {
    height = maxHeight;
    finalWidth = height * aspect;
  }
  return { width: finalWidth, height };
}

function drawPhotoCell(builder: ReportBuilder, cell: PhotoCell, x: number, rowTop: number, width: number, height: number) {
  const { page, fonts } = builder;
  if (cell.kind === "image" && cell.image) {
    page.drawImage(cell.image.ref, { x, y: rowTop - height, width, height });
  } else {
    page.drawRectangle({ x, y: rowTop - height, width, height, borderColor: LIGHT_GRAY, borderWidth: 1, color: rgb(0.97, 0.97, 0.98) });
    const lines = wrapText(fonts.regular, WEBP_PLACEHOLDER_TEXT, 8, width - 16);
    let textY = rowTop - height / 2 + ((lines.length - 1) * 10) / 2;
    for (const line of lines) {
      const lineWidth = fonts.regular.widthOfTextAtSize(line, 8);
      page.drawText(line, { x: x + (width - lineWidth) / 2, y: textY, size: 8, font: fonts.regular, color: GRAY });
      textY -= 10;
    }
  }
  if (cell.caption) {
    const lines = wrapText(fonts.regular, cell.caption, 8, width).slice(0, 2);
    let captionY = rowTop - height - 11;
    for (const line of lines) {
      page.drawText(line, { x, y: captionY, size: 8, font: fonts.regular, color: GRAY });
      captionY -= 10;
    }
  }
}

function rowHeight(cells: PhotoCell[], cols: 1 | 2): number {
  return Math.max(...cells.map((cell) => cellSize(cols, cell.kind === "image" ? cell.image!.ratio : null).height)) + CAPTION_RESERVED;
}

// Sub-bloco 5C - achado da inspecao visual: o label ("Fotos gerais do
// ambiente") e o cabecalho do item tinham seu proprio ensureSpace pequeno,
// separado do ensureSpace (maior) da primeira linha de fotos logo depois.
// Isso deixava o label sozinho no fim de uma pagina, com as fotos indo
// para a pagina seguinte (orfao comprovado via renderizacao visual). Esta
// estimativa conservadora (pior caso por contagem de fotos) garante que o
// label/cabecalho so e desenhado se a primeira linha de fotos tambem couber,
// sem precisar decodificar as imagens duas vezes.
function estimateFirstPhotoRowHeight(evidenceCount: number): number {
  if (evidenceCount <= 0) return 0;
  const colsInFirstRow = evidenceCount === 1 ? 1 : 2;
  return MAX_CELL_HEIGHT[colsInFirstRow] + CAPTION_RESERVED + 8;
}

async function drawPhotoGrid(builder: ReportBuilder, evidenceList: ReportEvidence[], warnings: string[], contextLabel: string) {
  if (evidenceList.length === 0) return;
  const cells: PhotoCell[] = [];
  // Processa em pequenos lotes paralelos. Mantém o consumo de memória
  // controlado, mas evita o custo de Sharp totalmente sequencial quando há
  // muitas fotos na vistoria.
  const concurrency = 3;
  for (let start = 0; start < evidenceList.length; start += concurrency) {
    const batch = evidenceList.slice(start, start + concurrency);
    const prepared = await Promise.all(
      batch.map((evidence, offset) => {
        const index = start + offset;
        const cols = resolveCellCols(index, evidenceList.length);
        return prepareEvidenceCell(builder.doc, evidence, warnings, contextLabel, cols, builder.imageOptions);
      }),
    );
    cells.push(...prepared);
  }

  for (let i = 0; i < cells.length; i += 4) {
    const chunk = cells.slice(i, i + 4);
    await drawPhotoChunk(builder, chunk);
  }
}

async function drawPhotoChunk(builder: ReportBuilder, chunk: PhotoCell[]) {
  // Layout: 1 -> largura total; 2 -> 2 colunas; 3 -> 2 colunas + 1 linha cheia; 4 -> grade 2x2.
  const rows: Array<{ cols: 1 | 2; cells: PhotoCell[] }> =
    chunk.length === 1
      ? [{ cols: 1, cells: chunk }]
      : chunk.length === 2
        ? [{ cols: 2, cells: chunk }]
        : chunk.length === 3
          ? [{ cols: 2, cells: chunk.slice(0, 2) }, { cols: 1, cells: chunk.slice(2, 3) }]
          : [{ cols: 2, cells: chunk.slice(0, 2) }, { cols: 2, cells: chunk.slice(2, 4) }];

  const totalHeight = rows.reduce((sum, row) => sum + rowHeight(row.cells, row.cols) + 8, 0);
  builder.ensureSpace(totalHeight);

  for (const row of rows) {
    const height = rowHeight(row.cells, row.cols);
    builder.ensureSpace(height + 8);
    const rowTop = builder.y;
    row.cells.forEach((cell, index) => {
      const size = cellSize(row.cols, cell.kind === "image" ? cell.image!.ratio : null);
      const slotWidth = row.cols === 1 ? CONTENT_WIDTH : (CONTENT_WIDTH - GAP) / 2;
      const slotX = MARGIN_X + index * (slotWidth + GAP);
      const x = slotX + (slotWidth - size.width) / 2;
      drawPhotoCell(builder, cell, x, rowTop, size.width, size.height);
    });
    builder.y -= height + 8;
  }
}

async function drawRoomSection(builder: ReportBuilder, room: ReportRoom, roomIndex: number, warnings: string[]) {
  builder.ensureSpace(40);
  const { fonts } = builder;
  const reviewed = room.items.filter((item) => item.condition !== "not_inspected").length;
  builder.page.drawText(`${roomIndex + 1}. ${room.name.toUpperCase()}`, { x: MARGIN_X, y: builder.y, size: 12, font: fonts.bold, color: PURPLE });
  builder.y -= 14;
  builder.page.drawText(`${reviewed} de ${room.items.length} itens revisados`, { x: MARGIN_X, y: builder.y, size: 9, font: fonts.regular, color: GRAY });
  builder.y -= 16;
  builder.page.drawLine({ start: { x: MARGIN_X, y: builder.y }, end: { x: PAGE_WIDTH - MARGIN_X, y: builder.y }, thickness: 0.5, color: LIGHT_GRAY });
  builder.y -= 14;

  if (room.notes && cleanText(room.notes)) {
    drawParagraph(builder, `Observacoes do ambiente: ${room.notes}`, { size: 9 });
    builder.y -= 4;
  }

  if (room.generalEvidence.length > 0) {
    builder.ensureSpace(16 + estimateFirstPhotoRowHeight(room.generalEvidence.length));
    builder.page.drawText("Fotos gerais do ambiente", { x: MARGIN_X, y: builder.y, size: 9.5, font: fonts.bold, color: DARK });
    builder.y -= 14;
    await drawPhotoGrid(builder, room.generalEvidence, warnings, `${room.name} (geral)`);
  }

  for (const [itemIndex, item] of room.items.entries()) {
    await drawItemBlock(builder, room.name, item, roomIndex, itemIndex, warnings);
  }

  builder.y -= 8;
}

async function drawItemBlock(builder: ReportBuilder, roomName: string, item: ReportItem, roomIndex: number, itemIndex: number, warnings: string[]) {
  const display = conditionDisplay(item.condition);
  builder.ensureSpace(32 + estimateFirstPhotoRowHeight(item.evidence.length));
  const { fonts } = builder;
  builder.page.drawText(`${roomIndex + 1}.${itemIndex + 1}. ${item.name}`, { x: MARGIN_X, y: builder.y, size: 10, font: fonts.bold, color: DARK });

  const badgeColor = (display.bucket && CONDITION_COLOR[display.bucket]) ?? GRAY;
  const badgeLabel = display.label;
  const badgeTextWidth = fonts.bold.widthOfTextAtSize(badgeLabel, 8);
  const badgeWidth = badgeTextWidth + 16;
  const badgeX = PAGE_WIDTH - MARGIN_X - badgeWidth;
  builder.page.drawRectangle({ x: badgeX, y: builder.y - 2, width: badgeWidth, height: 14, color: badgeColor });
  builder.page.drawText(badgeLabel, { x: badgeX + 8, y: builder.y + 1, size: 8, font: fonts.bold, color: WHITE });

  builder.y -= 15;
  if (item.notes && cleanText(item.notes)) {
    drawParagraph(builder, item.notes, { size: 9, color: GRAY });
  }
  builder.y -= 4;

  if (item.evidence.length > 0) {
    await drawPhotoGrid(builder, item.evidence, warnings, `${roomName} - ${item.name}`);
  }
  builder.y -= 6;
}

function drawGeneralObservationsSection(builder: ReportBuilder, input: BuildProfessionalInspectionReportInput) {
  if (!input.inspection.notes || !cleanText(input.inspection.notes)) return;
  drawSectionTitle(builder, "Observacoes gerais");
  drawParagraph(builder, input.inspection.notes);
  builder.y -= 6;
}

function drawDeclarationSection(builder: ReportBuilder, input: BuildProfessionalInspectionReportInput) {
  drawSectionTitle(builder, "Declaracao final");
  drawParagraph(
    builder,
    "As partes declaram ter tomado conhecimento das condicoes descritas neste laudo de vistoria, composto pelos ambientes, itens, observacoes e registros fotograficos apresentados neste documento.",
  );
  void input;
  builder.y -= 10;
}

function drawSignatureCard(
  builder: ReportBuilder,
  slot: { x: number; topY: number; width: number; height: number },
  title: string,
  name: string | null,
  secondaryLabel: string,
  secondaryValue: string | null,
) {
  const { page, fonts } = builder;
  const bottomY = slot.topY - slot.height;
  page.drawRectangle({ x: slot.x, y: bottomY, width: slot.width, height: slot.height, borderColor: LIGHT_GRAY, borderWidth: 1, color: WHITE });
  page.drawRectangle({ x: slot.x, y: slot.topY - 30, width: slot.width, height: 30, color: rgb(0.965, 0.965, 0.975) });
  page.drawText(title.toUpperCase(), { x: slot.x + 12, y: slot.topY - 19, size: 9, font: fonts.bold, color: DARK });

  const lineY = slot.topY - 98;
  page.drawLine({ start: { x: slot.x + 12, y: lineY }, end: { x: slot.x + slot.width - 12, y: lineY }, thickness: 0.8, color: DARK });
  page.drawText(`Nome: ${name ? cleanText(name) : ""}`, { x: slot.x + 12, y: lineY - 18, size: 8.5, font: fonts.regular, color: DARK });
  page.drawText(`${secondaryLabel}: ${secondaryValue ? cleanText(secondaryValue) : ""}`, { x: slot.x + 12, y: lineY - 33, size: 8.5, font: fonts.regular, color: DARK });
}

function drawSignatureSection(builder: ReportBuilder, input: BuildProfessionalInspectionReportInput) {
  // Página dedicada e previsível: o PDF assinado sobrepõe as assinaturas
  // online nestes mesmos slots e depois anexa o certificado de auditoria.
  builder.addPage(true);
  const { page, fonts } = builder;
  page.drawText("ASSINATURAS", { x: MARGIN_X, y: 748, size: 16, font: fonts.bold, color: DARK });
  page.drawText("Assinaturas das partes e responsáveis vinculados a este laudo.", { x: MARGIN_X, y: 728, size: 9, font: fonts.regular, color: GRAY });

  const location = input.property?.city
    ? [cleanText(input.property.city), input.property.state ? cleanText(input.property.state) : null].filter(Boolean).join(" / ")
    : "________________________________";
  const date = formatDate(input.inspection.completedAt ?? input.generatedAt) ?? "____ / ____ / ______";

  page.drawText(`Local: ${location}`, { x: MARGIN_X, y: 696, size: 9.5, font: fonts.bold, color: DARK });
  page.drawText(`Data do laudo: ${date}`, { x: 330, y: 696, size: 9.5, font: fonts.bold, color: DARK });

  drawSignatureCard(builder, SIGNATURE_PAGE_LAYOUT.owner, "Proprietário", input.owner?.name ?? null, "CPF", maskDocument(input.owner?.document ?? null));
  drawSignatureCard(builder, SIGNATURE_PAGE_LAYOUT.tenant_buyer, "Inquilino / Comprador", input.tenantOrBuyer?.name ?? null, "CPF", maskDocument(input.tenantOrBuyer?.document ?? null));
  drawSignatureCard(builder, SIGNATURE_PAGE_LAYOUT.responsible, "Responsável pela vistoria", input.broker?.name ?? null, "CRECI", input.broker?.creci ?? null);
  drawSignatureCard(builder, SIGNATURE_PAGE_LAYOUT.witness, "Testemunha / Representante", null, "CPF", null);

  page.drawText("Quando a assinatura for realizada pela Assinatura Online do ImobiFlow, a imagem e a data/hora serão incorporadas automaticamente neste quadro no PDF final.", {
    x: MARGIN_X, y: 226, size: 8, font: fonts.regular, color: GRAY,
  });
}

