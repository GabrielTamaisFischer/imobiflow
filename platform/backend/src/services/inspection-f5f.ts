import { createHash } from "node:crypto";

export const CONDITION_ORDER: Record<string, number | null> = {
  not_inspected: null,
  not_applicable: null,
  excellent: 5,
  good: 4,
  fair: 3,
  poor: 2,
  damaged: 1,
};

export const CONDITION_LABELS: Record<string, string> = {
  not_inspected: "Não vistoriado",
  not_applicable: "Não aplicável",
  excellent: "Excelente",
  good: "Bom",
  fair: "Regular",
  poor: "Ruim",
  damaged: "Danificado",
};

export type InspectionSnapshot = {
  inspection_id: string;
  company_id: string;
  property: { id: string; code: string | null; title: string } | null;
  type: string;
  status: string;
  assigned_user: { id: string; name: string } | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  archived_at: string | null;
  version: number;
  notes: string | null;
  rooms: Array<{
    id: string;
    name: string;
    position: number;
    notes: string | null;
    items: Array<{ id: string; name: string; condition: string; position: number; notes: string | null }>;
  }>;
  evidence: Array<{ id: string; room_id: string | null; item_id: string | null; file_name: string | null; caption: string | null; position: number }>;
};

export function compareConditions(entry: string, exit: string) {
  const from = CONDITION_ORDER[entry] ?? null;
  const to = CONDITION_ORDER[exit] ?? null;
  if (from === null || to === null) return { outcome: "not_comparable" as const, changed: entry !== exit };
  if (to < from) return { outcome: "worse" as const, changed: true };
  if (to > from) return { outcome: "better" as const, changed: true };
  return { outcome: "same" as const, changed: false };
}

export function compareInspections(entry: InspectionSnapshot, exit: InspectionSnapshot) {
  if (entry.company_id !== exit.company_id) throw new Error("As vistorias pertencem a empresas diferentes.");
  if (!entry.property || !exit.property || entry.property.id !== exit.property.id) {
    throw new Error("A comparação exige vistorias do mesmo imóvel.");
  }
  const entryRooms = new Map(entry.rooms.map((room) => [stableKey(room.name, room.position), room]));
  const exitRooms = new Map(exit.rooms.map((room) => [stableKey(room.name, room.position), room]));
  const rooms = Array.from(new Set([...entryRooms.keys(), ...exitRooms.keys()])).map((key) => {
    const before = entryRooms.get(key);
    const after = exitRooms.get(key);
    const entryItems = new Map((before?.items ?? []).map((item) => [stableKey(item.name, item.position), item]));
    const exitItems = new Map((after?.items ?? []).map((item) => [stableKey(item.name, item.position), item]));
    const items = Array.from(new Set([...entryItems.keys(), ...exitItems.keys()])).map((itemKey) => {
      const first = entryItems.get(itemKey);
      const second = exitItems.get(itemKey);
      if (!first || !second) return { name: (second ?? first)!.name, entry: first?.condition ?? null, exit: second?.condition ?? null, outcome: second ? "new" : "absent", changed: true, entry_notes: first?.notes ?? null, exit_notes: second?.notes ?? null };
      const result = compareConditions(first.condition, second.condition);
      return { name: second.name, entry: first.condition, exit: second.condition, ...result, entry_notes: first.notes, exit_notes: second.notes };
    });
    return { name: after?.name ?? before?.name ?? key, entry_notes: before?.notes ?? null, exit_notes: after?.notes ?? null, outcome: before && after ? "matched" : after ? "new" : "absent", items };
  });
  return { entry_inspection_id: entry.inspection_id, exit_inspection_id: exit.inspection_id, property_id: entry.property.id, rooms };
}

export function snapshotHash(snapshot: unknown) {
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

export function buildInspectionSnapshot(inspection: any, evidence: any[] = []): InspectionSnapshot {
  return {
    inspection_id: inspection.id,
    company_id: inspection.companyId,
    property: inspection.property ? { id: inspection.property.id, code: inspection.property.code ?? null, title: inspection.property.title } : null,
    type: inspection.type,
    status: inspection.status,
    assigned_user: inspection.assignedUser ? { id: inspection.assignedUser.id, name: inspection.assignedUser.name } : null,
    created_by: inspection.createdBy,
    created_at: inspection.createdAt.toISOString(),
    updated_at: inspection.updatedAt.toISOString(),
    completed_at: inspection.completedAt?.toISOString() ?? null,
    archived_at: inspection.archivedAt?.toISOString() ?? null,
    version: inspection.version,
    notes: inspection.notes ?? null,
    rooms: (inspection.rooms ?? []).map((room: any) => ({ id: room.id, name: room.name, position: room.position, notes: room.notes ?? null, items: (room.items ?? []).map((item: any) => ({ id: item.id, name: item.name, condition: item.condition, position: item.position, notes: item.notes ?? null })) })),
    evidence: evidence.map((row: any) => ({ id: row.id, room_id: row.roomId ?? null, item_id: row.itemId ?? null, file_name: row.storedFile?.originalFilename ?? null, caption: row.caption ?? null, position: row.position })),
  };
}

export function buildPdfBuffer(title: string, sections: string[]) {
  const lines = [title, "", ...sections.flatMap((section) => wrap(section, 100)), "Gerado pelo ImobiFlow — documento privado da vistoria."];
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
  const pageContents = pages.map((page) => ["BT", "/F1 10 Tf", "50 790 Td", ...page.flatMap((line, index) => [`(${pdfEscape(line)}) Tj`, index < page.length - 1 ? "0 -14 Td" : "ET"]), ""].join("\n"));
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ...pages.flatMap((_, index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${4 + index * 2} 0 R >>`,
      `<< /Length ${Buffer.byteLength(pageContents[index], "utf8")} >>\nstream\n${pageContents[index]}\nendstream`,
    ]),
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets[index + 1] = Buffer.byteLength(pdf, "utf8"); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

function stableKey(name: string, position: number) { return `${name.trim().toLocaleLowerCase("pt-BR")}::${position}`; }
function wrap(value: string, width: number) { const words = value.split(/\s+/); const result: string[] = []; let line = ""; for (const word of words) { if ((line + " " + word).trim().length > width) { if (line) result.push(line); line = word; } else line = `${line} ${word}`.trim(); } if (line) result.push(line); return result.length ? result : [""]; }
function pdfEscape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)").replace(/[\r\n]/g, " "); }
