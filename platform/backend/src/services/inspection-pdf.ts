type InspectionPdfInput = {
  inspection: {
    title: string;
    inspection_type: string;
    status: string;
    scheduled_at: string | null;
    summary: string | null;
    tenant_name: string | null;
    tenant_document: string | null;
    owner_name: string | null;
    properties?: {
      code?: string | null;
      title?: string | null;
      neighborhood?: string | null;
      city?: string | null;
      state?: string | null;
    } | Array<{
      code?: string | null;
      title?: string | null;
      neighborhood?: string | null;
      city?: string | null;
      state?: string | null;
    }> | null;
  };
  rooms: Array<{
    id: string;
    name: string;
    general_condition: string;
    notes: string | null;
  }>;
  items: Array<{
    id: string;
    room_id: string | null;
    label: string;
    category: string | null;
    condition: string;
    notes: string | null;
    repair_required: boolean;
  }>;
  media: Array<{
    room_id: string | null;
    item_id: string | null;
    file_name: string | null;
    caption: string | null;
    media_type: string;
  }>;
  signatures?: Array<{
    signer_name: string;
    signer_document: string | null;
    signer_role: string;
    status: string;
    signed_at: string | null;
  }>;
  generatedAt: string;
};

const typeLabels: Record<string, string> = {
  entry: "Entrada",
  exit: "Saida",
  maintenance: "Manutencao",
  periodic: "Periodica",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  scheduled: "Agendada",
  in_progress: "Em andamento",
  waiting_signature: "Aguardando assinatura",
  completed: "Concluida",
  cancelled: "Cancelada",
  archived: "Arquivada",
};

const conditionLabels: Record<string, string> = {
  excellent: "Excelente",
  good: "Bom",
  regular: "Regular",
  poor: "Ruim",
  damaged: "Danificado",
  not_checked: "Nao verificado",
};

const signerRoleLabels: Record<string, string> = {
  tenant: "Locatario",
  owner: "Proprietario",
  broker: "Corretor",
  manager: "Gestor",
  witness: "Testemunha",
};

export function buildInspectionPdfBuffer(input: InspectionPdfInput) {
  return createPdfBuffer(buildInspectionPdfLines(input));
}

function buildInspectionPdfLines({ inspection, rooms, items, media, signatures = [], generatedAt }: InspectionPdfInput) {
  const property = Array.isArray(inspection.properties) ? inspection.properties[0] : inspection.properties;
  const address = [property?.neighborhood, property?.city, property?.state].filter(Boolean).join(", ");
  const lines = [
    "IMOBIFLOW - LAUDO DE VISTORIA",
    "",
    `Titulo: ${inspection.title}`,
    `Imovel: ${property?.title ?? "Nao informado"}`,
    `Codigo do imovel: ${property?.code ?? "Nao informado"}`,
    `Endereco/regiao: ${address || "Nao informado"}`,
    `Tipo: ${typeLabels[inspection.inspection_type] ?? inspection.inspection_type}`,
    `Status: ${statusLabels[inspection.status] ?? inspection.status}`,
    `Agendamento: ${formatDate(inspection.scheduled_at)}`,
    `Gerado em: ${formatDate(generatedAt)}`,
    "",
    "PARTES",
    `Proprietario: ${inspection.owner_name || "Nao informado"}`,
    `Locatario: ${inspection.tenant_name || "Nao informado"}`,
    `Documento do locatario: ${inspection.tenant_document || "Nao informado"}`,
    "",
    "RESUMO TECNICO",
    inspection.summary || "Nenhum resumo tecnico informado para esta vistoria.",
    "",
    "INDICADORES",
    `Ambientes: ${rooms.length}`,
    `Itens tecnicos: ${items.length}`,
    `Itens verificados: ${items.filter((item) => item.condition !== "not_checked").length}`,
    `Reparos sinalizados: ${items.filter((item) => item.repair_required).length}`,
    `Fotos/anexos: ${media.length}`,
    `Assinaturas: ${signatures.filter((signature) => signature.status === "signed").length}/${signatures.length}`,
    "",
    "AMBIENTES E CHECKLIST",
  ];

  for (const room of rooms) {
    const roomItems = items.filter((item) => item.room_id === room.id);
    const roomMedia = media.filter((entry) => entry.room_id === room.id);
    lines.push("");
    lines.push(`${room.name} - ${conditionLabels[room.general_condition] ?? room.general_condition}`);
    lines.push(`Registros: ${roomItems.length} item(ns), ${roomMedia.length} midia(s)`);
    if (room.notes) lines.push(`Observacoes: ${room.notes}`);

    if (roomItems.length === 0) {
      lines.push("Nenhum item tecnico registrado neste ambiente.");
      continue;
    }

    for (const item of roomItems) {
      const itemMedia = media.filter((entry) => entry.item_id === item.id);
      lines.push(
        `- ${item.label} | ${item.category || "Sem categoria"} | ${
          conditionLabels[item.condition] ?? item.condition
        } | ${item.repair_required ? "Reparo necessario" : "Sem reparo"} | ${itemMedia.length} midia(s)`,
      );
      if (item.notes) lines.push(`  Observacao: ${item.notes}`);
    }
  }

  if (signatures.length > 0) {
    lines.push("");
    lines.push("ASSINATURAS");
    for (const signature of signatures) {
      lines.push(
        `- ${signature.signer_name} | ${signerRoleLabels[signature.signer_role] ?? signature.signer_role} | ${
          signature.signer_document || "Documento nao informado"
        } | ${signature.status === "signed" ? `Assinada em ${formatDate(signature.signed_at)}` : "Pendente"}`,
      );
    }
  }

  if (media.length > 0) {
    lines.push("");
    lines.push("FOTOS E ANEXOS");
    for (const entry of media) {
      lines.push(`- ${entry.caption || entry.file_name || entry.media_type}`);
    }
  }

  lines.push("");
  lines.push("DECLARACOES FINAIS");
  lines.push("As fotos, videos e anexos registrados integram o laudo e detalham a real condicao do imovel.");
  lines.push(
    "Itens nao testados, sem acesso ou sem informacao suficiente devem permanecer expressamente indicados no checklist.",
  );
  lines.push(
    "Na devolucao do imovel, a conferencia de saida devera considerar este laudo, os registros fotograficos, os acessorios entregues e as observacoes de cada ambiente.",
  );
  lines.push("");
  lines.push("Documento gerado automaticamente pelo ImobiFlow.");
  return lines.flatMap((line) => wrapLine(line));
}

function createPdfBuffer(lines: string[]) {
  const pageLineLimit = 44;
  const pages = chunk(lines, pageLineLimit);
  const objects = new Map<number, string>();
  const pageIds: number[] = [];
  let nextId = 4;

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const pageLines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);

    const content = buildPageContent(pageLines);
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.set(
      contentId,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
  }

  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  const maxId = nextId - 1;
  const offsets = Array<number>(maxId + 1).fill(0);
  let pdf = "%PDF-1.4\n";

  for (let id = 1; id <= maxId; id += 1) {
    const object = objects.get(id);
    if (!object) continue;
    offsets[id] = Buffer.byteLength(pdf, "latin1");
    pdf += `${id} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}

function buildPageContent(lines: string[]) {
  return [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    "14 TL",
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET",
  ].join("\n");
}

function escapePdfText(value: string) {
  return normalizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function normalizePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapLine(line: string, maxLength = 92) {
  const normalized = normalizePdfText(line);
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length > maxLength) {
      lines.push(current);
      current = word;
      continue;
    }

    current = `${current} ${word}`;
  }

  if (current) lines.push(current);
  return lines;
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function formatDate(value: string | null) {
  if (!value) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}
