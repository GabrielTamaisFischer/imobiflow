import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { assertInspectionAccess, assertPropertyAccess, buildInspectionScopeFilter } from "../services/authorization.js";
import { IdempotencyConflictError, resolveIdempotencyKey, withIdempotency } from "../services/idempotency.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { getStorageProvider, getStorageProviderForName, buildStorageFolder } from "../services/storage/index.js";
import { deliveryAccessForPurpose } from "../services/storage/purposes.js";
import { validateUploadFile } from "../services/storage/file-policy.js";
import { createStoredFileRecord } from "../services/storage/stored-files.js";
import {
  buildInspectionSnapshot,
  buildPdfBuffer,
  CONDITION_LABELS,
  compareInspections,
  ITEM_OUTCOME_LABELS,
  ROOM_OUTCOME_LABELS,
  snapshotHash,
  summarizeComparison,
} from "../services/inspection-f5f.js";
import { readStoredFileBuffer } from "../services/storage/read-file.js";
import { IMOBIFLOW_REPORT_LOGO } from "../services/imobiflow-report-brand.js";
import { buildProfessionalInspectionReport, buildReportFileName } from "../services/inspection-report-pdf.js";
import type { StorageResourceType } from "../services/storage/types.js";
import type { AccessContext, RequestWithAccess } from "../types/access.js";

export const mysqlInspectionsRouter = Router();
mysqlInspectionsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const inspectionTypes = ["entry", "exit"] as const;
const inspectionStatuses = ["draft", "in_progress", "completed", "archived"] as const;
const itemConditions = ["not_inspected", "excellent", "good", "fair", "poor", "damaged", "not_applicable"] as const;

const counterpartyRoles = ["tenant", "buyer"] as const;
const createInspectionSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  assigned_user_id: z.string().uuid().optional(),
  counterparty_party_id: z.string().uuid().optional(),
  counterparty_role: z.enum(counterpartyRoles).optional(),
  type: z.enum(inspectionTypes),
  notes: z.string().trim().max(12000).optional().nullable(),
}).refine(
  (input) => Boolean(input.counterparty_party_id) === Boolean(input.counterparty_role),
  { message: "Informe pessoa e papel do inquilino/comprador em conjunto." },
);
const patchInspectionSchema = z.object({
  expected_version: z.number().int().positive(),
  assigned_user_id: z.string().uuid().optional(),
  notes: z.string().trim().max(12000).optional().nullable(),
  status: z.enum(inspectionStatuses).optional(),
}).refine((input) => input.assigned_user_id !== undefined || input.notes !== undefined || input.status !== undefined, {
  message: "Informe ao menos um campo para atualizar.",
});

const counterpartyUpdateSchema = z.object({
  expected_version: z.number().int().positive(),
  party_id: z.string().uuid().nullable(),
  role: z.enum(counterpartyRoles).nullable().optional(),
}).refine(
  (input) => input.party_id === null || input.role === "tenant" || input.role === "buyer",
  { message: "Informe o papel do participante selecionado." },
);

const nullableShortText = z.string().trim().max(500).nullable().optional();
const nullableLongText = z.string().trim().max(12000).nullable().optional();
const nullableBoolean = z.boolean().nullable().optional();
const inspectionGeneralInfoSchema = z.object({
  keys: z.object({
    type: nullableShortText,
    quantity: z.number().int().min(0).max(999).nullable().optional(),
    entry_location: nullableShortText,
  }).default({}),
  cleaning: z.object({
    description: nullableLongText,
  }).default({}),
  energy: z.object({
    supply_description: nullableShortText,
    sharing: nullableShortText,
    breakers_on: nullableBoolean,
    reading: nullableShortText,
  }).default({}),
  gas: z.object({
    registers_closed: nullableBoolean,
    supply_description: nullableShortText,
    sharing: nullableShortText,
    reading: nullableShortText,
  }).default({}),
  water: z.object({
    registers_closed: nullableBoolean,
    supply_description: nullableShortText,
    sharing: nullableShortText,
    reading: nullableShortText,
  }).default({}),
  dependencies: z.object({
    notes: nullableLongText,
  }).default({}),
});
const inspectionGeneralInfoUpdateSchema = z.object({
  expected_version: z.number().int().positive(),
  general_info: inspectionGeneralInfoSchema,
});
const roomSchema = z.object({
  id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  name: z.string().trim().min(1).max(140),
  position: z.number().int().min(0).max(9999).default(0),
  notes: z.string().trim().max(12000).optional().nullable(),
});
const roomPatchSchema = roomSchema.omit({ id: true }).partial({ name: true, position: true, notes: true }).extend({ expected_version: z.number().int().positive() })
  .refine((input) => input.name !== undefined || input.position !== undefined || input.notes !== undefined, { message: "Informe ao menos um campo para atualizar." });
const roomBatchSchema = z.object({
  expected_version: z.number().int().positive(),
  rooms: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(140),
    position: z.number().int().min(0).max(9999),
    notes: z.string().trim().max(12000).optional().nullable(),
    items: z.array(z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(160),
      condition: z.enum(itemConditions).default("not_inspected"),
      position: z.number().int().min(0).max(9999),
      notes: z.string().trim().max(12000).optional().nullable(),
    })).max(100),
  })).min(1).max(50),
});
const itemSchema = z.object({
  id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  name: z.string().trim().min(1).max(160),
  condition: z.enum(itemConditions).default("not_inspected"),
  position: z.number().int().min(0).max(9999).default(0),
  notes: z.string().trim().max(12000).optional().nullable(),
});
const itemPatchSchema = itemSchema.omit({ id: true }).partial({ name: true, condition: true, position: true, notes: true }).extend({ expected_version: z.number().int().positive() })
  .refine((input) => input.name !== undefined || input.condition !== undefined || input.position !== undefined || input.notes !== undefined, { message: "Informe ao menos um campo para atualizar." });
const versionSchema = z.object({ expected_version: z.number().int().positive() });
const evidenceCreateSchema = z.object({
  id: z.string().uuid().optional(),
  room_id: z.string().uuid().optional().nullable(),
  item_id: z.string().uuid().optional().nullable(),
  file_name: z.string().min(1).max(240),
  mime_type: z.string().min(3).max(120),
  size_bytes: z.number().int().positive().max(10 * 1024 * 1024),
  content_base64: z.string().min(1),
  caption: z.string().trim().max(240).optional().nullable(),
  position: z.number().int().min(0).max(9999).default(0),
});
const evidencePatchSchema = z.object({
  expected_version: z.number().int().positive(),
  caption: z.string().trim().max(240).optional().nullable(),
  position: z.number().int().min(0).max(9999).optional(),
}).refine((input) => input.caption !== undefined || input.position !== undefined, { message: "Informe caption ou position." });
const evidenceOrderSchema = z.object({ expected_version: z.number().int().positive(), evidence: z.array(z.object({ id: z.string().uuid(), position: z.number().int().min(0).max(9999) })).min(1).max(200) });

const inspectionInclude = {
  // street/neighborhood/city: usados só para montar um endereço curto na
  // listagem (/app/vistorias) e para a busca server-side por endereço -
  // nunca editados por este router.
  property: { select: { id: true, code: true, title: true, responsibleUserId: true, street: true, neighborhood: true, city: true } },
  assignedUser: { select: { id: true, name: true } },
  rooms: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }], include: { items: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }] } } },
} satisfies Prisma.InspectionInclude;

function invalid(message: string, code = "INSPECTION_INVALID") {
  return Object.assign(new Error(message), { statusCode: 400, code });
}
function conflict() {
  return Object.assign(new Error("A vistoria foi alterada por outra sessão. Atualize os dados antes de salvar."), { statusCode: 409, code: "INSPECTION_VERSION_CONFLICT" });
}
function notFound() {
  return Object.assign(new Error("Vistoria não encontrada."), { statusCode: 404, code: "INSPECTION_NOT_FOUND" });
}
async function latestInspectionGeneralInfo(companyId: string, inspectionId: string) {
  const row = await getPrisma().inspectionEvent.findFirst({
    where: { companyId, inspectionId, eventType: "inspection.general_info_updated" },
    orderBy: { createdAt: "desc" },
    select: { metadataJson: true },
  });
  const metadata = row?.metadataJson as any;
  return metadata?.general_info ?? {
    keys: {}, cleaning: {}, energy: {}, gas: {}, water: {}, dependencies: {},
  };
}

function serializeInspection(inspection: any) {
  return {
    id: inspection.id,
    property_id: inspection.propertyId,
    assigned_user_id: inspection.assignedUserId,
    created_by: inspection.createdBy,
    type: inspection.type,
    status: inspection.status,
    notes: inspection.notes,
    version: inspection.version,
    completed_at: inspection.completedAt?.toISOString() ?? null,
    archived_at: inspection.archivedAt?.toISOString() ?? null,
    created_at: inspection.createdAt.toISOString(),
    updated_at: inspection.updatedAt.toISOString(),
    property: inspection.property
      ? {
          id: inspection.property.id,
          code: inspection.property.code,
          title: inspection.property.title,
          street: inspection.property.street ?? null,
          neighborhood: inspection.property.neighborhood ?? null,
          city: inspection.property.city ?? null,
        }
      : undefined,
    assigned_user: inspection.assignedUser ? { id: inspection.assignedUser.id, name: inspection.assignedUser.name } : undefined,
    rooms: inspection.rooms?.map((room: any) => ({
      id: room.id, name: room.name, position: room.position, notes: room.notes,
      items: room.items?.map((item: any) => ({ id: item.id, name: item.name, condition: item.condition, position: item.position, notes: item.notes })) ?? [],
    })) ?? [],
  };
}

function decodeBase64File(value: string) {
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  try {
    const body = Buffer.from(payload, "base64");
    if (!body.length) throw new Error("empty");
    return body;
  } catch {
    throw invalid("Conteúdo do arquivo inválido.", "INVALID_UPLOAD");
  }
}

function serializeEvidence(row: any, signedUrl: string | null = null) {
  return {
    id: row.id,
    inspection_id: row.inspectionId,
    room_id: row.roomId,
    item_id: row.itemId,
    file_name: row.storedFile?.originalFilename ?? null,
    mime_type: row.storedFile?.mimeType ?? null,
    file_size: row.storedFile?.sizeBytes ?? null,
    width: row.storedFile?.width ?? null,
    height: row.storedFile?.height ?? null,
    caption: row.caption,
    position: row.position,
    created_at: row.createdAt.toISOString(),
    signed_url: signedUrl,
  };
}

async function evidenceSignedUrl(file: any, purpose = "inspection_evidence") {
  if (!file || deliveryAccessForPurpose(file.purpose ?? purpose) !== "authenticated") return null;
  const provider = getStorageProviderForName(file.provider as any);
  if (!provider.getAuthenticatedDownloadUrl) return null;
  return provider.getAuthenticatedDownloadUrl({ publicId: file.publicId, resourceType: file.resourceType as StorageResourceType, format: file.format });
}

async function loadEvidence(companyId: string, inspectionId: string) {
  const rows = await getPrisma().inspectionEvidence.findMany({
    where: { companyId, inspectionId },
    include: { storedFile: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return Promise.all(rows.map(async (row) => serializeEvidence(row, await evidenceSignedUrl(row.storedFile))));
}

async function privateArtifactUrl(file: any, purpose: string) {
  if (!file || deliveryAccessForPurpose(file.purpose ?? purpose) !== "authenticated") return null;
  const provider = getStorageProviderForName(file.provider as any);
  return provider.getAuthenticatedDownloadUrl?.({ publicId: file.publicId, resourceType: file.resourceType as StorageResourceType, format: file.format }) ?? null;
}

function artifactDto(file: any, metadata: any, signedUrl: string | null) {
  return { id: file.id, entity_id: file.entityId, purpose: file.purpose, file_name: file.originalFilename, mime_type: file.mimeType, size_bytes: file.sizeBytes, created_at: file.createdAt.toISOString(), metadata, signed_url: signedUrl };
}

async function artifactFiles(companyId: string, entityType: string, inspectionId: string, purpose: string) {
  const rows = await getPrisma().storedFile.findMany({ where: { companyId, entityType, purpose }, orderBy: { createdAt: "desc" } });
  return rows.filter((row: any) => (row.metadataJson as any)?.inspection_id === inspectionId);
}

async function resolveCounterpartyParty(companyId: string, partyId: string) {
  const party = await getPrisma().party.findFirst({
    where: {
      id: partyId,
      companyId,
      status: "active",
    },
    select: {
      id: true,
      name: true,
      taxId: true,
      rg: true,
      email: true,
      phone: true,
      whatsapp: true,
      addressJson: true,
    },
  });
  if (!party) throw invalid("Inquilino/comprador inválido para esta empresa.", "INVALID_INSPECTION_COUNTERPARTY");
  return party;
}

type InspectionCounterpartyRole = (typeof counterpartyRoles)[number];

type InspectionCounterpartySnapshot = {
  party_id: string;
  role: InspectionCounterpartyRole;
  name: string;
  document: string | null;
  rg: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: unknown;
  status: string;
  linked_at: string;
};

async function latestInspectionCounterparty(companyId: string, inspectionId: string): Promise<InspectionCounterpartySnapshot | null> {
  const row = await getPrisma().inspectionEvent.findFirst({
    where: {
      companyId,
      inspectionId,
      eventType: { in: ["inspection.counterparty_linked", "inspection.counterparty_removed"] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { eventType: true, metadataJson: true, createdAt: true },
  });
  if (!row || row.eventType === "inspection.counterparty_removed") return null;
  const metadata = (row.metadataJson ?? {}) as Record<string, unknown>;
  const partyId = typeof metadata.party_id === "string" ? metadata.party_id : null;
  const role: InspectionCounterpartyRole | null =
    metadata.role === "buyer" ? "buyer" : metadata.role === "tenant" ? "tenant" : null;
  if (!partyId || !role) return null;
  const party = await getPrisma().party.findFirst({
    where: { id: partyId, companyId },
    select: {
      id: true,
      name: true,
      taxId: true,
      rg: true,
      email: true,
      phone: true,
      whatsapp: true,
      addressJson: true,
      status: true,
    },
  });
  if (!party) return null;
  return {
    party_id: party.id,
    role,
    name: party.name,
    document: party.taxId ?? null,
    rg: party.rg ?? null,
    email: party.email ?? null,
    phone: party.phone ?? null,
    whatsapp: party.whatsapp ?? null,
    address: party.addressJson ?? null,
    status: party.status,
    linked_at: row.createdAt.toISOString(),
  };
}

async function resolveAssignee(companyId: string, requestedUserId: string | undefined, fallbackUserId: string) {
  const userId = requestedUserId ?? fallbackUserId;
  const user = await getPrisma().appUser.findFirst({
    where: { id: userId, companyId, status: "active", roleRecord: { permissions: { some: { permission: { key: { in: ["inspections.view", "inspections.manage"] } } } } } },
    select: { id: true },
  });
  if (!user) throw invalid("Responsável inválido para esta empresa.", "INVALID_INSPECTION_ASSIGNEE");
  return user.id;
}

async function findInspection(req: RequestWithAccess, inspectionId: string, permissionKey: string) {
  await assertInspectionAccess(req.access!, inspectionId, permissionKey, "INSPECT");
  const inspection = await getPrisma().inspection.findFirst({
    where: { id: inspectionId, AND: [buildInspectionScopeFilter(req.access!, permissionKey, "INSPECT")] },
    include: inspectionInclude,
  });
  if (!inspection) throw notFound();
  return inspection;
}

function isAdministrativeInspectionRole(access: AccessContext) {
  return administrativeInspectionRoles.has(access.appUser.role?.toLowerCase() ?? "");
}

function ensureMutable(inspection: { status: string }, access: AccessContext, requestedStatus?: string, hasOtherChanges = false) {
  // Owner/admin/manager podem corrigir integralmente o conteúdo de uma
  // vistoria já concluída/arquivada. O status continua protegido por
  // nextStatus(); esta exceção só libera edição de dados/estrutura/evidências.
  if (isAdministrativeInspectionRole(access)) return;
  const isArchivingCompleted = inspection.status === "completed" && requestedStatus === "archived" && !hasOtherChanges;
  if (inspection.status === "archived" || (inspection.status === "completed" && !isArchivingCompleted)) {
    throw Object.assign(new Error("Vistoria concluída ou arquivada não pode ser alterada."), { statusCode: 409, code: "INSPECTION_NOT_MUTABLE" });
  }
}

// F5G — editar o registro principal da vistoria (responsável/observações
// gerais) e arquivar exigem cargo administrativo (owner/admin/manager), não
// bastando possuir inspections.manage: esse permissão também é concedida a
// corretor e vistoriador (ver roleTemplates em services/roles.ts), que devem
// continuar livres para o trabalho operacional (ambientes, itens, evidências
// e as transições draft→in_progress→completed). Backend é autoritativo: o
// frontend só reflete esta mesma regra para não mostrar a ação, nunca decide
// por si só.
const administrativeInspectionRoles = new Set(["owner", "admin", "manager"]);
function requireAdministrativeRole(access: AccessContext) {
  const role = access.appUser.role?.toLowerCase() ?? "";
  if (!administrativeInspectionRoles.has(role)) {
    throw Object.assign(new Error("Esta ação exige um cargo administrativo (owner, admin ou manager)."), { statusCode: 403, code: "INSPECTION_ADMIN_ROLE_REQUIRED" });
  }
}

async function bumpVersion(tx: Prisma.TransactionClient, inspectionId: string, companyId: string, expectedVersion: number, data: Prisma.InspectionUpdateManyMutationInput = {}) {
  const result = await tx.inspection.updateMany({ where: { id: inspectionId, companyId, version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
  if (result.count !== 1) throw conflict();
}

async function event(tx: Prisma.TransactionClient, companyId: string, inspectionId: string, actorId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  await tx.inspectionEvent.create({ data: { companyId, inspectionId, actorId, eventType, metadataJson: metadata as Prisma.InputJsonValue } });
}

function nextStatus(current: string, requested: string) {
  if (current === requested) return requested;
  const allowed: Record<string, string[]> = { draft: ["in_progress", "archived"], in_progress: ["completed", "archived"], completed: ["archived"], archived: [] };
  if (!allowed[current]?.includes(requested)) throw invalid("Transição de status inválida.", "INVALID_INSPECTION_TRANSITION");
  return requested;
}

mysqlInspectionsRouter.get("/participants/search", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (search.length < 2) {
      res.json({ participants: [] });
      return;
    }
    const participants = await getPrisma().party.findMany({
      where: {
        companyId: access.company.id,
        status: "active",
        OR: [
          { name: { contains: search } },
          { taxId: { contains: search } },
          { taxIdNormalized: { contains: search.replace(/\D/g, "") } },
          { phone: { contains: search } },
          { whatsapp: { contains: search } },
          { email: { contains: search } },
        ],
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: 20,
      select: {
        id: true,
        name: true,
        taxId: true,
        rg: true,
        email: true,
        phone: true,
        whatsapp: true,
        addressJson: true,
        roles: { where: { role: { in: ["tenant", "buyer"] }, status: "active" }, select: { role: true } },
      },
    });
    res.json({
      participants: participants.map((party) => ({
        party_id: party.id,
        name: party.name,
        document: party.taxId ?? null,
        rg: party.rg ?? null,
        email: party.email ?? null,
        phone: party.phone ?? party.whatsapp ?? null,
        address: party.addressJson ?? null,
        available_roles: party.roles
          .map((entry) => entry.role)
          .filter((role): role is "tenant" | "buyer" => role === "tenant" || role === "buyer"),
      })),
    });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.get("/", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const page = Number(req.query.page ?? 1), pageSize = Number(req.query.page_size ?? 25);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw invalid("Paginação inválida.", "INVALID_PAGINATION");
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !inspectionStatuses.includes(status as any)) throw invalid("Status inválido.", "INVALID_INSPECTION_STATUS");
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    if (type && !inspectionTypes.includes(type as any)) throw invalid("Tipo de vistoria inválido.", "INVALID_INSPECTION_TYPE");
    // Bloco 5 — seleção de entrada compatível para comparação: o frontend
    // usa este filtro para listar candidatas (mesmo imóvel) sem precisar de
    // uma rota dedicada. O escopo de tenant/propriedade continua garantido
    // pelo buildInspectionScopeFilter abaixo, não por este parâmetro.
    const propertyId = typeof req.query.property_id === "string" ? req.query.property_id : undefined;
    if (propertyId && !/^[0-9a-f-]{36}$/i.test(propertyId)) throw invalid("Imóvel inválido.", "INVALID_PROPERTY_ID");
    // Busca server-side (UX /app/vistorias): código/título/endereço do
    // imóvel e nome do responsável. MySQL com collation utf8mb4_unicode_ci
    // (padrão do projeto) já compara `contains` sem diferenciar
    // maiúsculas/minúsculas - não é preciso (e o provider MySQL do Prisma
    // não aceita) `mode: "insensitive"`.
    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const searchFilter: Prisma.InspectionWhereInput | undefined = search
      ? {
          OR: [
            // id: não existe ainda um "código da vistoria" amigável
            // sequencial persistido (exigiria uma coluna/contador novo no
            // schema - fora do escopo desta passada de UX) - até lá, buscar
            // pelo UUID da vistoria (ou um prefixo dele) cobre o caso de
            // alguém colar o identificador copiado de outra tela/suporte.
            { id: { contains: search } },
            { property: { code: { contains: search } } },
            { property: { title: { contains: search } } },
            { property: { street: { contains: search } } },
            { property: { neighborhood: { contains: search } } },
            { property: { city: { contains: search } } },
            { assignedUser: { name: { contains: search } } },
          ],
        }
      : undefined;
    const where: Prisma.InspectionWhereInput = {
      AND: [
        buildInspectionScopeFilter(req.access!, "inspections.view", "INSPECT"),
        ...(status ? [{ status }] : []),
        ...(type ? [{ type }] : []),
        ...(propertyId ? [{ propertyId }] : []),
        ...(searchFilter ? [searchFilter] : []),
      ],
    };
    const prisma = getPrisma();
    const [total, rows] = await prisma.$transaction([
      prisma.inspection.count({ where }),
      prisma.inspection.findMany({ where, include: inspectionInclude, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ inspections: rows.map(serializeInspection), pagination: { page, page_size: pageSize, total, total_pages: Math.ceil(total / pageSize), has_next: page * pageSize < total, has_previous: page > 1 } });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = createInspectionSchema.parse(req.body), access = req.access!, companyId = access.company.id;
    await assertPropertyAccess(access, input.property_id, "inspections.manage", "INSPECT");
    const assignedUserId = await resolveAssignee(companyId, input.assigned_user_id, access.appUser.id);
    const counterparty = input.counterparty_party_id
      ? await resolveCounterpartyParty(companyId, input.counterparty_party_id)
      : null;
    const key = resolveIdempotencyKey(req, `inspection.create:${input.id}`);
    const { result, replayed } = await withIdempotency(companyId, "inspection.create", key, async () => {
      const created = await getPrisma().$transaction(async (tx) => {
        const inspection = await tx.inspection.create({ data: { id: input.id, companyId, propertyId: input.property_id, assignedUserId, createdBy: access.appUser.id, type: input.type, notes: input.notes ?? null }, include: inspectionInclude });
        await event(tx, companyId, inspection.id, access.appUser.id, "inspection.created", { property_id: inspection.propertyId, type: inspection.type, assigned_user_id: inspection.assignedUserId });
        if (counterparty && input.counterparty_role) {
          await event(tx, companyId, inspection.id, access.appUser.id, "inspection.counterparty_linked", {
            party_id: counterparty.id,
            role: input.counterparty_role,
          });
        }
        return serializeInspection(inspection);
      });
      return { inspection: created };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.get("/:id", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try { res.json({ inspection: serializeInspection(await findInspection(req, String(req.params.id), "inspections.view")) }); } catch (error) { next(error); }
});

mysqlInspectionsRouter.get("/:id/counterparty", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const inspection = await findInspection(req, String(req.params.id), "inspections.view");
    res.json({ counterparty: await latestInspectionCounterparty(req.access!.company.id, inspection.id) });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.put("/:id/counterparty", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, access);
    const input = counterpartyUpdateSchema.parse(req.body);
    const party = input.party_id ? await resolveCounterpartyParty(access.company.id, input.party_id) : null;
    await getPrisma().$transaction(async (tx) => {
      await bumpVersion(tx, inspection.id, access.company.id, input.expected_version);
      if (party && input.role) {
        await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.counterparty_linked", {
          party_id: party.id,
          role: input.role,
        });
      } else {
        await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.counterparty_removed", {});
      }
    });
    const updated = await getPrisma().inspection.findUniqueOrThrow({ where: { id: inspection.id }, include: inspectionInclude });
    res.json({
      inspection: serializeInspection(updated),
      counterparty: await latestInspectionCounterparty(access.company.id, inspection.id),
    });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.get("/:id/general-info", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const inspection = await findInspection(req, String(req.params.id), "inspections.view");
    res.json({ general_info: await latestInspectionGeneralInfo(req.access!.company.id, inspection.id) });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.put("/:id/general-info", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const input = inspectionGeneralInfoUpdateSchema.parse(req.body);
    const inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, access);
    const updated = await getPrisma().$transaction(async (tx) => {
      await bumpVersion(tx, inspection.id, access.company.id, input.expected_version);
      await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.general_info_updated", {
        general_info: input.general_info,
      });
      return tx.inspection.findUniqueOrThrow({ where: { id: inspection.id }, include: inspectionInclude });
    });
    res.json({ inspection: serializeInspection(updated), general_info: input.general_info });
  } catch (error) { next(error); }
});

// F5E: evidências são armazenadas no pipeline canônico StoredFile/Cloudinary.
// O DTO só expõe uma URL autenticada curta gerada a partir do registro seguro;
// nunca expõe secureUrl/publicId persistidos.
mysqlInspectionsRouter.get("/:id/evidence", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const inspection = await findInspection(req, String(req.params.id), "inspections.view");
    res.json({ evidence: await loadEvidence(req.access!.company.id, inspection.id) });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/:id/evidence", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!;
    const inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const input = evidenceCreateSchema.parse(req.body);
    const body = decodeBase64File(input.content_base64);
    const policy = validateUploadFile({ purpose: "inspection_evidence", fileName: input.file_name, mimeType: input.mime_type, declaredSizeBytes: input.size_bytes, body });
    const roomId = input.room_id ?? null;
    const itemId = input.item_id ?? null;
    if (roomId) {
      const room = await getPrisma().inspectionRoom.findFirst({ where: { id: roomId, inspectionId: inspection.id, companyId: access.company.id }, select: { id: true } });
      if (!room) throw notFound();
    }
    if (itemId) {
      const item = await getPrisma().inspectionItem.findFirst({ where: { id: itemId, companyId: access.company.id, room: { inspectionId: inspection.id } }, select: { id: true, roomId: true } });
      if (!item || (roomId && item.roomId !== roomId)) throw notFound();
    }
    const evidenceId = input.id ?? randomUUID();
    const key = resolveIdempotencyKey(req, `inspection.evidence.create:${evidenceId}`);
    const { result, replayed } = await withIdempotency(access.company.id, "inspection.evidence.create", key, async () => {
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({
        companyId: access.company.id,
        entityType: "inspection_evidence",
        entityId: evidenceId,
        purpose: "inspection_evidence",
        fileName: input.file_name,
        mimeType: policy.normalizedMimeType,
        sizeBytes: policy.measuredSizeBytes,
        body,
        folder: buildStorageFolder({ companyId: access.company.id, purpose: "inspection_evidence", inspectionId: inspection.id }),
        deliveryAccess: deliveryAccessForPurpose("inspection_evidence"),
      });
      await getPrisma().$transaction(async (tx) => {
        await bumpVersion(tx, inspection.id, access.company.id, inspection.version);
        const file = await tx.storedFile.create({ data: {
          companyId: access.company.id, entityType: "inspection_evidence", entityId: evidenceId,
          provider: uploaded!.provider, publicId: uploaded!.publicId, resourceType: uploaded!.resourceType,
          secureUrl: uploaded!.secureUrl, originalFilename: input.file_name, mimeType: policy.normalizedMimeType,
          sizeBytes: policy.measuredSizeBytes, format: uploaded!.format ?? null, uploadedBy: access.appUser.id,
          purpose: "inspection_evidence", metadataJson: { inspection_id: inspection.id, room_id: roomId, item_id: itemId },
        } });
        const evidence = await tx.inspectionEvidence.create({ data: { id: evidenceId, companyId: access.company.id, inspectionId: inspection.id, roomId, itemId, storedFileId: file.id, caption: input.caption ?? null, position: input.position } , include: { storedFile: true } });
        await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.evidence_added", { evidence_id: evidence.id, room_id: roomId, item_id: itemId, position: input.position });
        return evidence.id;
      });
      return { evidence_id: evidenceId };
    });
    const row = await getPrisma().inspectionEvidence.findUniqueOrThrow({ where: { id: result.evidence_id }, include: { storedFile: true } });
    res.status(replayed ? 200 : 201).json({ evidence: serializeEvidence(row, await evidenceSignedUrl(row.storedFile)), replayed });
  } catch (error) {
    // Best-effort compensação: só remove o asset criado por esta requisição,
    // mantendo a resposta sanitizada caso o banco rejeite a associação.
    if (uploaded) {
      try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as StorageResourceType, deliveryAccess: "authenticated" }); } catch { /* não mascarar a causa original */ }
    }
    next(error);
  }
});

mysqlInspectionsRouter.patch("/:id/evidence/order", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const input = evidenceOrderSchema.parse(req.body);
    const ids = input.evidence.map((entry) => entry.id);
    const rows = await getPrisma().inspectionEvidence.findMany({ where: { id: { in: ids }, inspectionId: inspection.id, companyId: access.company.id }, select: { id: true } });
    if (rows.length !== ids.length) throw notFound();
    await getPrisma().$transaction(async (tx) => {
      await bumpVersion(tx, inspection.id, access.company.id, input.expected_version);
      for (const entry of input.evidence) await tx.inspectionEvidence.update({ where: { id: entry.id }, data: { position: entry.position } });
      await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.evidence_reordered", { count: ids.length });
    });
    res.json({ evidence: await loadEvidence(access.company.id, inspection.id) });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.patch("/:id/evidence/:evidenceId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const input = evidencePatchSchema.parse(req.body);
    const existing = await getPrisma().inspectionEvidence.findFirst({ where: { id: String(req.params.evidenceId), inspectionId: inspection.id, companyId: access.company.id }, include: { storedFile: true } });
    if (!existing) throw notFound();
    await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, access.company.id, input.expected_version); await tx.inspectionEvidence.update({ where: { id: existing.id }, data: { ...(input.caption !== undefined ? { caption: input.caption } : {}), ...(input.position !== undefined ? { position: input.position } : {}) } }); await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.evidence_updated", { evidence_id: existing.id }); });
    const row = await getPrisma().inspectionEvidence.findUniqueOrThrow({ where: { id: existing.id }, include: { storedFile: true } });
    res.json({ evidence: serializeEvidence(row, await evidenceSignedUrl(row.storedFile)) });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.delete("/:id/evidence/:evidenceId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const existing = await getPrisma().inspectionEvidence.findFirst({ where: { id: String(req.params.evidenceId), inspectionId: inspection.id, companyId: access.company.id }, include: { storedFile: true } });
    if (!existing) throw notFound();
    const { expected_version } = versionSchema.parse(req.body);
    if (inspection.version !== expected_version) throw conflict();
    // O banco é a fonte de verdade: remove as linhas (com checagem de versão)
    // ANTES do asset. Se a transação falhar (ex.: 409), o arquivo continua
    // intacto e referenciado. Se só a remoção no provider falhar depois, sobra
    // um asset órfão privado — preferível a um registro apontando para nada.
    await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, access.company.id, expected_version); await tx.inspectionEvidence.delete({ where: { id: existing.id } }); await tx.storedFile.delete({ where: { id: existing.storedFileId } }); await event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.evidence_removed", { evidence_id: existing.id }); });
    let storageCleanup: "deleted" | "pending" = "deleted";
    try {
      const provider = getStorageProviderForName(existing.storedFile.provider as any);
      await provider.deleteFile({ publicId: existing.storedFile.publicId, resourceType: existing.storedFile.resourceType as StorageResourceType, deliveryAccess: deliveryAccessForPurpose("inspection_evidence") });
    } catch {
      storageCleanup = "pending";
      console.warn("[inspections] asset de evidência removido do banco, mas não do storage", { stored_file_id: existing.storedFileId });
    }
    res.json({ ok: true, evidence_id: existing.id, storage_cleanup: storageCleanup });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.patch("/:id", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = patchInspectionSchema.parse(req.body), access = req.access!, companyId = access.company.id;
    const existing = await findInspection(req, String(req.params.id), "inspections.manage");
    const status = input.status === undefined ? undefined : nextStatus(existing.status, input.status);
    const hasOtherChanges = input.assigned_user_id !== undefined || input.notes !== undefined;
    if (hasOtherChanges || status === "archived") requireAdministrativeRole(access);
    ensureMutable(existing, access, status, hasOtherChanges);
    const assignedUserId = input.assigned_user_id === undefined ? undefined : await resolveAssignee(companyId, input.assigned_user_id, access.appUser.id);
    const updated = await getPrisma().$transaction(async (tx) => {
      await bumpVersion(tx, existing.id, companyId, input.expected_version, { ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(assignedUserId ? { assignedUserId } : {}), ...(status ? { status, ...(status === "completed" ? { completedAt: new Date() } : {}), ...(status === "archived" ? { archivedAt: new Date() } : {}) } : {}) });
      const row = await tx.inspection.findUniqueOrThrow({ where: { id: existing.id }, include: inspectionInclude });
      await event(tx, companyId, row.id, access.appUser.id, status === "in_progress" ? "inspection.started" : status === "completed" ? "inspection.completed" : status === "archived" ? "inspection.archived" : "inspection.updated", { version: row.version });
      return serializeInspection(row);
    });
    res.json({ inspection: updated });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.delete("/:id", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    requireAdministrativeRole(access);
    const inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    const prisma = getPrisma();

    const [evidenceRows, signingProcesses, companyFiles] = await Promise.all([
      prisma.inspectionEvidence.findMany({
        where: { companyId: access.company.id, inspectionId: inspection.id },
        include: { storedFile: true },
      }),
      prisma.inspectionSigningProcess.findMany({
        where: { companyId: access.company.id, inspectionId: inspection.id },
        include: { reportFile: true, parties: { include: { signatureFile: true } } },
      }),
      prisma.storedFile.findMany({ where: { companyId: access.company.id } }),
    ]);

    const files = new Map<string, any>();
    for (const row of evidenceRows) files.set(row.storedFile.id, row.storedFile);
    for (const process of signingProcesses) {
      files.set(process.reportFile.id, process.reportFile);
      for (const party of process.parties) if (party.signatureFile) files.set(party.signatureFile.id, party.signatureFile);
    }
    for (const file of companyFiles) {
      if ((file.metadataJson as any)?.inspection_id === inspection.id) files.set(file.id, file);
    }
    const fileIds = [...files.keys()];

    await prisma.$transaction(async (tx) => {
      await tx.inspectionSigningProcess.deleteMany({ where: { companyId: access.company.id, inspectionId: inspection.id } });
      await tx.inspectionEvidence.deleteMany({ where: { companyId: access.company.id, inspectionId: inspection.id } });
      if (fileIds.length) await tx.storedFile.deleteMany({ where: { companyId: access.company.id, id: { in: fileIds } } });
      await tx.inspection.delete({ where: { id: inspection.id } });
    });

    let storageCleanupPending = 0;
    for (const file of files.values()) {
      try {
        await getStorageProviderForName(file.provider as any).deleteFile({
          publicId: file.publicId,
          resourceType: file.resourceType as StorageResourceType,
          deliveryAccess: deliveryAccessForPurpose(file.purpose),
        });
      } catch {
        storageCleanupPending += 1;
      }
    }

    res.json({ ok: true, deleted_id: inspection.id, storage_cleanup_pending: storageCleanupPending });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/:id/rooms/batch", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = roomBatchSchema.parse(req.body);
    const access = req.access!;
    const companyId = access.company.id;
    const inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, access);

    const updated = await getPrisma().$transaction(async (tx) => {
      // Uma única checagem/bump de versão para todo o lote. Antes, o frontend
      // fazia dezenas de requests sequenciais e ficava visualmente preso até
      // um F5 quando alguma chamada demorava/conflitava.
      await bumpVersion(tx, inspection.id, companyId, input.expected_version);

      for (const roomInput of input.rooms) {
        const room = await tx.inspectionRoom.create({
          data: {
            id: roomInput.id,
            companyId,
            inspectionId: inspection.id,
            name: roomInput.name,
            position: roomInput.position,
            notes: roomInput.notes ?? null,
          },
        });

        for (const itemInput of roomInput.items) {
          await tx.inspectionItem.create({
            data: {
              id: itemInput.id,
              companyId,
              roomId: room.id,
              name: itemInput.name,
              condition: itemInput.condition,
              position: itemInput.position,
              notes: itemInput.notes ?? null,
            },
          });
        }
      }

      await event(tx, companyId, inspection.id, access.appUser.id, "inspection.rooms_batch_added", {
        room_count: input.rooms.length,
        item_count: input.rooms.reduce((total, room) => total + room.items.length, 0),
      });

      const row = await tx.inspection.findUniqueOrThrow({ where: { id: inspection.id }, include: inspectionInclude });
      return serializeInspection(row);
    });

    res.status(201).json({ inspection: updated });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/:id/rooms", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = roomSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const key = resolveIdempotencyKey(req, `inspection.room.create:${input.id}`);
    const { result, replayed } = await withIdempotency(companyId, "inspection.room.create", key, async () => {
      const room = await getPrisma().$transaction(async (tx) => {
        await bumpVersion(tx, inspection.id, companyId, input.expected_version);
        const created = await tx.inspectionRoom.create({ data: { id: input.id, companyId, inspectionId: inspection.id, name: input.name, position: input.position, notes: input.notes ?? null } });
        await event(tx, companyId, inspection.id, access.appUser.id, "inspection.room_added", { room_id: created.id });
        return created;
      });
      return { room: { id: room.id, name: room.name, position: room.position, notes: room.notes } };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.patch("/:id/rooms/:roomId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = roomPatchSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const room = await getPrisma().inspectionRoom.findFirst({ where: { id: String(req.params.roomId), inspectionId: inspection.id, companyId } });
    if (!room) throw notFound();
    const updated = await getPrisma().$transaction(async (tx) => {
      await bumpVersion(tx, inspection.id, companyId, input.expected_version);
      const row = await tx.inspectionRoom.update({ where: { id: room.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.position !== undefined ? { position: input.position } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) } });
      await event(tx, companyId, inspection.id, access.appUser.id, "inspection.room_updated", { room_id: row.id });
      return row;
    });
    res.json({ room: { id: updated.id, name: updated.name, position: updated.position, notes: updated.notes } });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.delete("/:id/rooms/:roomId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = versionSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const room = await getPrisma().inspectionRoom.findFirst({ where: { id: String(req.params.roomId), inspectionId: inspection.id, companyId }, select: { id: true } });
    if (!room) throw notFound();
    await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, companyId, input.expected_version); await tx.inspectionRoom.delete({ where: { id: room.id } }); await event(tx, companyId, inspection.id, access.appUser.id, "inspection.room_removed", { room_id: room.id }); });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.post("/:id/rooms/:roomId/items", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = itemSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const room = await getPrisma().inspectionRoom.findFirst({ where: { id: String(req.params.roomId), inspectionId: inspection.id, companyId }, select: { id: true } });
    if (!room) throw notFound();
    const key = resolveIdempotencyKey(req, `inspection.item.create:${input.id}`);
    const { result, replayed } = await withIdempotency(companyId, "inspection.item.create", key, async () => {
      const item = await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, companyId, input.expected_version); const created = await tx.inspectionItem.create({ data: { id: input.id, companyId, roomId: room.id, name: input.name, condition: input.condition, position: input.position, notes: input.notes ?? null } }); await event(tx, companyId, inspection.id, access.appUser.id, "inspection.item_added", { item_id: created.id, room_id: room.id }); return created; });
      return { item: { id: item.id, name: item.name, condition: item.condition, position: item.position, notes: item.notes } };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.patch("/:id/rooms/:roomId/items/:itemId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = itemPatchSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const item = await getPrisma().inspectionItem.findFirst({ where: { id: String(req.params.itemId), roomId: String(req.params.roomId), companyId, room: { inspectionId: inspection.id } } });
    if (!item) throw notFound();
    const updated = await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, companyId, input.expected_version); const row = await tx.inspectionItem.update({ where: { id: item.id }, data: { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.condition !== undefined ? { condition: input.condition } : {}), ...(input.position !== undefined ? { position: input.position } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}) } }); await event(tx, companyId, inspection.id, access.appUser.id, "inspection.item_updated", { item_id: row.id }); return row; });
    res.json({ item: { id: updated.id, name: updated.name, condition: updated.condition, position: updated.position, notes: updated.notes } });
  } catch (error) { next(error); }
});

mysqlInspectionsRouter.delete("/:id/rooms/:roomId/items/:itemId", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = versionSchema.parse(req.body), access = req.access!, companyId = access.company.id, inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    ensureMutable(inspection, req.access!);
    const item = await getPrisma().inspectionItem.findFirst({ where: { id: String(req.params.itemId), roomId: String(req.params.roomId), companyId, room: { inspectionId: inspection.id } }, select: { id: true } });
    if (!item) throw notFound();
    await getPrisma().$transaction(async (tx) => { await bumpVersion(tx, inspection.id, companyId, input.expected_version); await tx.inspectionItem.delete({ where: { id: item.id } }); await event(tx, companyId, inspection.id, access.appUser.id, "inspection.item_removed", { item_id: item.id }); });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// F5F: relatórios, assinaturas eletrônicas simples e comparação são artefatos
// privados no StoredFile. O snapshot fica no metadataJson para que o documento
// emitido não mude quando a Inspection corrente evoluir.
// Sub-bloco 5B - monta o input do laudo profissional (pdf-lib). Nao
// reimplementa a logica de progresso/condicoes (isso fica no gerador e no
// frontend); so busca dados reais e bytes de evidencia. Gaps documentados:
// (1) inquilino/comprador so e preenchido quando exatamente um Contract
// aponta para esta Inspection via entryInspectionId/exitInspectionId com uma
// unica parte tenant/buyer - caso contrario a secao fica omitida (nunca
// inventada); (2) foto de capa do imovel nao e carregada aqui (galeria de
// Property e outro dominio, nao carregado neste fluxo) - fica null.
async function buildReportInput(access: AccessContext, inspection: any, evidence: any[], snapshotHashValue: string) {
  const prisma = getPrisma();
  const companyId = access.company.id;
  const warnings: string[] = [];

  // Cada busca e isolada (try/catch proprio) de proposito: nenhuma secao
  // opcional do laudo (empresa, imovel, responsavel/CRECI, contrato) pode
  // derrubar a geracao inteira por uma falha pontual - cai para null e segue,
  // igual ja fazia a logo (ver abaixo). Isso tambem cobre ambientes onde um
  // modelo Prisma mais novo (Contract, PropertyOwner, Party) nao esteja
  // totalmente disponivel.
  async function safe<T>(label: string, run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (error) {
      warnings.push(`Nao foi possivel carregar "${label}" para o laudo: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  const [company, property, assignedUser, linkedContract] = await Promise.all([
    safe("empresa", () => prisma.company.findFirst({ where: { id: companyId }, select: { name: true, document: true, phone: true, email: true } })),
    safe("imovel", () => prisma.property.findFirst({
      where: { id: inspection.propertyId, companyId },
      select: {
        code: true, title: true, propertyType: true, operation: true,
        street: true, number: true, complement: true, neighborhood: true, city: true, state: true, zipCode: true,
        latitude: true, longitude: true, primaryDetailsJson: true, featuresJson: true,
        condominiumName: true, privateArea: true, totalArea: true, bedrooms: true, suites: true, bathrooms: true, parkingSpaces: true,
        iptuCents: true, condominiumFeeCents: true, ownerId: true,
      },
    })),
    safe("responsavel/CRECI", () => prisma.appUser.findFirst({
      where: { id: inspection.assignedUserId, companyId },
      select: {
        name: true,
        party: { select: { roles: { where: { role: "broker" }, select: { brokerProfile: { select: { creciNumber: true } } } } } },
      },
    })),
    safe("contrato vinculado (inquilino/comprador)", () => prisma.contract.findFirst({
      where: { companyId, OR: [{ entryInspectionId: inspection.id }, { exitInspectionId: inspection.id }] },
      select: { parties: { where: { partyType: { in: ["tenant", "buyer"] } }, select: { partyType: true, name: true, document: true } } },
    })),
  ]);

  const owner = property?.ownerId
    ? await safe("proprietario", () => prisma.propertyOwner.findFirst({ where: { id: property.ownerId!, companyId }, select: { name: true, document: true } }))
    : null;

  // A marca do laudo e sempre a identidade oficial do ImobiFlow. Ela fica
  // embarcada no backend para nao depender de logo da imobiliaria, storage
  // externo ou rede durante a geracao.
  const logoBuffer = {
    buffer: Buffer.from(IMOBIFLOW_REPORT_LOGO.buffer),
    mimeType: IMOBIFLOW_REPORT_LOGO.mimeType,
  };

  let tenantOrBuyer: { name: string; document: string | null; role: "tenant" | "buyer" } | null = null;
  const directCounterparty = await safe("inquilino/comprador vinculado a vistoria", () => latestInspectionCounterparty(companyId, inspection.id));
  if (directCounterparty) {
    tenantOrBuyer = {
      name: directCounterparty.name,
      document: directCounterparty.document,
      role: directCounterparty.role,
    };
  } else {
    const contractParties = linkedContract?.parties ?? [];
    if (contractParties.length === 1) {
      const party = contractParties[0];
      tenantOrBuyer = { name: party.name, document: party.document ?? null, role: party.partyType === "buyer" ? "buyer" : "tenant" };
    } else if (contractParties.length > 1) {
      warnings.push("Mais de uma parte (inquilino/comprador) vinculada ao contrato desta vistoria: secao omitida para evitar ambiguidade.");
    }
  }

  const broker = assignedUser
    ? { name: assignedUser.name, creci: assignedUser.party?.roles.find((role: any) => role.brokerProfile)?.brokerProfile?.creciNumber ?? null }
    : null;

  const evidenceByRoom = new Map<string, any[]>();
  const evidenceByItem = new Map<string, any[]>();
  for (const row of evidence) {
    if (row.itemId) {
      const list = evidenceByItem.get(row.itemId) ?? [];
      list.push(row);
      evidenceByItem.set(row.itemId, list);
    } else if (row.roomId) {
      const list = evidenceByRoom.get(row.roomId) ?? [];
      list.push(row);
      evidenceByRoom.set(row.roomId, list);
    }
  }

  async function toReportEvidence(row: any) {
    const storedFile = row.storedFile;
    const mimeType: string | null = storedFile?.mimeType ?? null;
    let buffer: Buffer | null = null;
    if (storedFile && (mimeType === "image/jpeg" || mimeType === "image/png" || mimeType === "image/webp")) {
      try {
        buffer = await readStoredFileBuffer(storedFile);
      } catch {
        warnings.push(`Nao foi possivel ler os bytes da evidencia ${row.id} no storage; ela sera omitida do laudo.`);
      }
    } else if (storedFile) {
      warnings.push(`Evidencia ${row.id} em formato nao incorporavel (${mimeType ?? "desconhecido"}): o laudo exibira um aviso no lugar da foto.`);
    }
    return { id: row.id, caption: row.caption ?? null, buffer, mimeType };
  }

  // Pré-carrega todas as evidências com concorrência limitada. Antes, o
  // carregamento acontecia item por item/ambiente por ambiente; em laudos
  // grandes isso serializava dezenas ou centenas de leituras do storage.
  const reportEvidenceById = new Map<string, Awaited<ReturnType<typeof toReportEvidence>>>();
  const evidenceConcurrency = 8;
  for (let start = 0; start < evidence.length; start += evidenceConcurrency) {
    const batch = evidence.slice(start, start + evidenceConcurrency);
    const prepared = await Promise.all(batch.map(toReportEvidence));
    prepared.forEach((entry, index) => reportEvidenceById.set(batch[index]!.id, entry));
  }
  const resolvePrepared = (rows: any[]) =>
    rows.map((row) => reportEvidenceById.get(row.id)).filter((entry): entry is Awaited<ReturnType<typeof toReportEvidence>> => Boolean(entry));

  const generalEvidence = resolvePrepared(evidence.filter((row: any) => !row.roomId && !row.itemId));

  const rooms = [];
  for (const room of inspection.rooms ?? []) {
    const generalEvidence = resolvePrepared(evidenceByRoom.get(room.id) ?? []);
    const items: any[] = [];
    for (const item of room.items ?? []) {
      const itemEvidence = resolvePrepared(evidenceByItem.get(item.id) ?? []);
      items.push({ id: item.id, name: item.name, condition: item.condition, notes: item.notes ?? null, evidence: itemEvidence });
    }
    rooms.push({ id: room.id, name: room.name, notes: room.notes ?? null, generalEvidence, items });
  }

  const generalInfo = await latestInspectionGeneralInfo(companyId, inspection.id);

  let mapImage: { buffer: Buffer; mimeType: string } | null = null;
  if (property?.latitude != null && property?.longitude != null) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4500);
      const lat = Number(property.latitude).toFixed(6);
      const lng = Number(property.longitude).toFixed(6);
      const url = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=16&size=900x300&markers=${lat},${lng},red-pushpin`;
      const response = await fetch(url, { signal: controller.signal, headers: { "User-Agent": "ImobiFlow/1.0 inspection-report" } });
      clearTimeout(timeout);
      if (response.ok) mapImage = { buffer: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get("content-type")?.includes("png") ? "image/png" : "image/jpeg" };
    } catch {
      warnings.push("Mapa do imóvel indisponível; o endereço textual será mantido no laudo.");
    }
  }

  let qrImage: { buffer: Buffer; mimeType: string } | null = null;
  const publicBaseUrl = process.env.PUBLIC_APP_URL || "https://imobiflow-staging.vercel.app";
  const validationUrl = `${publicBaseUrl.replace(/\/$/, "")}/app/vistorias/${inspection.id}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(validationUrl)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (response.ok) qrImage = { buffer: Buffer.from(await response.arrayBuffer()), mimeType: "image/png" };
  } catch {
    warnings.push("QR Code de consulta indisponível nesta geração.");
  }

  const input = {
    inspection: {
      id: inspection.id, type: inspection.type, status: inspection.status, notes: inspection.notes ?? null,
      completedAt: inspection.completedAt ? new Date(inspection.completedAt).toISOString() : null,
      createdAt: new Date(inspection.createdAt).toISOString(),
    },
    company: company
      ? { name: company.name, document: company.document ?? null, phone: company.phone ?? null, email: company.email ?? null, logo: logoBuffer }
      : { name: "ImobiFlow", document: null, phone: null, email: null, logo: logoBuffer },
    property: property
      ? {
          code: property.code ?? null, title: property.title, propertyType: property.propertyType ?? null, operation: property.operation ?? null,
          street: property.street ?? null, number: property.number ?? null, complement: property.complement ?? null,
          neighborhood: property.neighborhood ?? null, city: property.city ?? null, state: property.state ?? null, zipCode: property.zipCode ?? null,
          latitude: property.latitude ?? null, longitude: property.longitude ?? null,
          condominiumName: property.condominiumName ?? null, privateArea: property.privateArea ?? null, totalArea: property.totalArea ?? null,
          bedrooms: property.bedrooms ?? null, suites: property.suites ?? null, bathrooms: property.bathrooms ?? null, parkingSpaces: property.parkingSpaces ?? null,
          iptuCents: property.iptuCents ?? null, condominiumFeeCents: property.condominiumFeeCents ?? null,
          primaryDetails: (property.primaryDetailsJson as Record<string, unknown> | null) ?? null,
          features: (property.featuresJson as Record<string, unknown> | null) ?? null,
          mapImage,
          coverPhoto: null,
        }
      : null,
    owner: owner ? { name: owner.name, document: owner.document ?? null } : null,
    tenantOrBuyer,
    broker,
    generalInfo,
    generalEvidence,
    validationUrl,
    qrImage,
    rooms,
    generatedAt: new Date().toISOString(),
    snapshotHash: snapshotHashValue,
  };

  return { input, warnings, propertyCode: property?.code ?? null };
}

mysqlInspectionsRouter.post("/:id/report", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  const reportStartedAt = Date.now();
  try {
    const access = req.access!;
    const inspection = await findInspection(req, String(req.params.id), "inspections.manage");
    if (inspection.status !== "completed" && inspection.status !== "archived") throw invalid("O laudo final exige uma vistoria concluída.", "INSPECTION_REPORT_REQUIRES_COMPLETED");
    const regenerate = req.body?.regenerate === true;
    const existing = await artifactFiles(access.company.id, "inspection_report", inspection.id, "inspection_report");
    if (existing.length && !regenerate) {
      const file = existing[0];
      return res.json({ report: artifactDto(file, file.metadataJson, await privateArtifactUrl(file, "inspection_report")), replayed: true });
    }
    const evidence = await getPrisma().inspectionEvidence.findMany({ where: { companyId: access.company.id, inspectionId: inspection.id }, include: { storedFile: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    const snapshot = buildInspectionSnapshot(inspection, evidence);
    const hash = snapshotHash(snapshot);
    const reportId = randomUUID();
    const inputStartedAt = Date.now();
    const { input: reportInput, warnings: reportWarnings, propertyCode } = await buildReportInput(access, inspection, evidence, hash);
    const inputElapsedMs = Date.now() - inputStartedAt;
    const pdfStartedAt = Date.now();
    const { buffer: body, warnings: pdfWarnings } = await buildProfessionalInspectionReport(reportInput);
    const pdfElapsedMs = Date.now() - pdfStartedAt;
    const allWarnings = [...reportWarnings, ...pdfWarnings];
    if (allWarnings.length) {
      // Avisos tecnicos ficam so no log do servidor (nunca expostos ao cliente).
      console.warn(`[inspection.report] vistoria ${inspection.id}: ${allWarnings.join(" | ")}`);
    }
    const fileName = buildReportFileName({ propertyCode, type: inspection.type as "entry" | "exit", generatedAt: reportInput.generatedAt });
    const policy = validateUploadFile({ purpose: "inspection_report", fileName, mimeType: "application/pdf", declaredSizeBytes: body.byteLength, body });
    const key = resolveIdempotencyKey(req, `inspection.report:${inspection.id}:${reportId}`);
    const { result, replayed } = await withIdempotency(access.company.id, "inspection.report", key, async () => {
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "inspection_report", entityId: reportId, purpose: "inspection_report", fileName, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "inspection_report", inspectionId: inspection.id }), deliveryAccess: deliveryAccessForPurpose("inspection_report") });
      await createStoredFileRecord({ companyId: access.company.id, entityType: "inspection_report", entityId: reportId, file: uploaded, uploadedBy: access.appUser.id, purpose: "inspection_report", metadata: { inspection_id: inspection.id, inspection_version: inspection.version, snapshot, snapshot_hash: hash, generated_at: reportInput.generatedAt, file_name: fileName, warning_count: allWarnings.length } });
      await getPrisma().$transaction(async (tx) => event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.report_generated", { report_id: reportId, inspection_version: inspection.version, snapshot_hash: hash, regenerated: regenerate }));
      return { report_id: reportId, snapshot_hash: hash };
    });
    const file = await getPrisma().storedFile.findFirstOrThrow({ where: { companyId: access.company.id, entityType: "inspection_report", entityId: result.report_id, purpose: "inspection_report" } });
    console.info("[inspection.report.performance]", {
      inspectionId: inspection.id,
      evidenceCount: evidence.length,
      roomCount: inspection.rooms?.length ?? 0,
      inputElapsedMs,
      pdfElapsedMs,
      totalElapsedMs: Date.now() - reportStartedAt,
      bytes: body.byteLength,
    });
    return res.status(replayed ? 200 : 201).json({ report: artifactDto(file, file.metadataJson, await privateArtifactUrl(file, "inspection_report")), replayed });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as StorageResourceType, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

mysqlInspectionsRouter.get("/:id/reports", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const inspection = await findInspection(req, String(req.params.id), "inspections.view");
    const rows = await artifactFiles(req.access!.company.id, "inspection_report", inspection.id, "inspection_report");
    res.json({ reports: await Promise.all(rows.map(async (row: any) => artifactDto(row, row.metadataJson, await privateArtifactUrl(row, "inspection_report")))) });
  } catch (error) { next(error); }
});

// Sub-bloco 5B - download autenticado canonico do laudo. Resolve o gap de
// signed_url: null para Local/R2 (so Cloudinary implementa
// getAuthenticatedDownloadUrl hoje): le os bytes via readStoredFileBuffer
// (funciona nos 3 providers) e serve o PDF diretamente por esta rota
// autenticada, sem depender de URL temporaria do navegador. Escopo de
// tenant identico as demais rotas (findInspection + artifactFiles filtram
// por companyId do access context) - empresa A nunca encontra o laudo de
// empresa B, mesmo sabendo publicId/UUID/nome de arquivo.
mysqlInspectionsRouter.get("/:id/report/download", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const inspection = await findInspection(req, String(req.params.id), "inspections.view");
    const rows = await artifactFiles(access.company.id, "inspection_report", inspection.id, "inspection_report");
    const reportIdParam = typeof req.query.report_id === "string" ? req.query.report_id : undefined;
    const file = reportIdParam ? rows.find((row: any) => row.entityId === reportIdParam) : rows[0];
    if (!file) throw invalid("Gere o laudo antes de fazer o download.", "INSPECTION_REPORT_NOT_FOUND");
    const body = await readStoredFileBuffer(file);
    const fileName = file.originalFilename || `laudo-vistoria-${inspection.id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/["\\]/g, "")}"`);
    res.setHeader("Content-Length", String(body.byteLength));
    res.status(200).send(body);
  } catch (error) { next(error); }
});

const signatureSchema = z.object({ report_id: z.string().uuid().optional(), signer_name: z.string().trim().min(1).max(180), signer_role: z.enum(["responsible", "owner", "tenant", "other"]), accepted_terms: z.boolean().default(true), signature_base64: z.string().min(1).max(8_000_000) });
mysqlInspectionsRouter.post("/:id/signatures", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!, inspection = await findInspection(req, String(req.params.id), "inspections.manage"), input = signatureSchema.parse(req.body);
    if (inspection.status !== "completed") throw invalid("A assinatura exige uma vistoria concluída e não arquivada.", "INSPECTION_SIGNATURE_REQUIRES_COMPLETED");
    if (!input.accepted_terms) throw invalid("É necessário confirmar a assinatura.", "SIGNATURE_TERMS_REQUIRED");
    const reports = await artifactFiles(access.company.id, "inspection_report", inspection.id, "inspection_report");
    const report = input.report_id ? reports.find((row: any) => row.entityId === input.report_id) : reports[0];
    if (!report) throw invalid("Gere o laudo antes de assinar.", "INSPECTION_REPORT_REQUIRED");
    const body = decodeBase64File(input.signature_base64);
    const mimeType = input.signature_base64.startsWith("data:image/jpeg") ? "image/jpeg" : input.signature_base64.startsWith("data:image/webp") ? "image/webp" : "image/png";
    const signatureId = randomUUID();
    const signatureExtension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const signatureFileName = `signature-${signatureId}.${signatureExtension}`;
    const policy = validateUploadFile({ purpose: "inspection_signature", fileName: signatureFileName, mimeType, declaredSizeBytes: body.byteLength, body });
    const storage = getStorageProvider();
    uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "inspection_signature", entityId: signatureId, purpose: "inspection_signature", fileName: signatureFileName, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "inspection_signature", inspectionId: inspection.id }), deliveryAccess: deliveryAccessForPurpose("inspection_signature") });
    const metadata = { inspection_id: inspection.id, report_id: report.entityId, signer_name: input.signer_name, signer_role: input.signer_role, accepted_terms: input.accepted_terms, signed_at: new Date().toISOString(), signature_hash: snapshotHash(body.toString("base64")) };
    await createStoredFileRecord({ companyId: access.company.id, entityType: "inspection_signature", entityId: signatureId, file: uploaded, uploadedBy: access.appUser.id, purpose: "inspection_signature", metadata });
    await getPrisma().$transaction(async (tx) => event(tx, access.company.id, inspection.id, access.appUser.id, "inspection.signature_created", { signature_id: signatureId, report_id: report.entityId, signer_role: input.signer_role }));
    const file = await getPrisma().storedFile.findFirstOrThrow({ where: { companyId: access.company.id, entityType: "inspection_signature", entityId: signatureId, purpose: "inspection_signature" } });
    res.status(201).json({ signature: artifactDto(file, metadata, await privateArtifactUrl(file, "inspection_signature")), signature_type: "simple_electronic_capture" });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as StorageResourceType, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

mysqlInspectionsRouter.get("/:id/signatures", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try { const inspection = await findInspection(req, String(req.params.id), "inspections.view"); const rows = await artifactFiles(req.access!.company.id, "inspection_signature", inspection.id, "inspection_signature"); res.json({ signatures: await Promise.all(rows.map(async (row: any) => artifactDto(row, row.metadataJson, await privateArtifactUrl(row, "inspection_signature")))) }); } catch (error) { next(error); }
});

// Comparação entrada × saída. Gera artefato privado no storage, por isso exige
// inspections.manage (antes bastava view). As duas vistorias são carregadas
// pelo mesmo escopo de sessão (companyId + escopo do imóvel), então um ID de
// outra empresa responde 404 sem revelar existência. O resultado descreve
// diferenças estruturais; nunca atribui responsabilidade.
const comparisonSchema = z.object({ baseline_inspection_id: z.string().uuid(), regenerate: z.boolean().optional().default(false) });
const COMPARISON_DISCLAIMER = "Comparação estrutural: indica diferenças registradas entre as vistorias e não atribui responsabilidade.";

// Bloco 5 — anexa as fotos (já com signed_url, via loadEvidence) de cada lado
// em cada ambiente/item da comparação, usando os ids reais que
// compareInspections expõe (entry_room_id/exit_room_id/entry_item_id/
// exit_item_id). item_id === null é evidência "geral" do ambiente, não de um
// item específico. Associação 100% determinística pelos ids já existentes —
// nunca por IA tentando casar fotos visualmente.
function decorateComparisonWithEvidence(comparison: any, entryEvidence: any[], exitEvidence: any[]) {
  for (const room of comparison.rooms) {
    room.entry_evidence = room.entry_room_id ? entryEvidence.filter((ev: any) => ev.room_id === room.entry_room_id && ev.item_id === null) : [];
    room.exit_evidence = room.exit_room_id ? exitEvidence.filter((ev: any) => ev.room_id === room.exit_room_id && ev.item_id === null) : [];
    for (const item of room.items) {
      item.entry_evidence = item.entry_item_id ? entryEvidence.filter((ev: any) => ev.item_id === item.entry_item_id) : [];
      item.exit_evidence = item.exit_item_id ? exitEvidence.filter((ev: any) => ev.item_id === item.exit_item_id) : [];
    }
  }
  return comparison;
}

// Bloco 5 — texto do PDF comparativo: identificação do imóvel, datas,
// responsáveis, resumo e labels PT-BR. Nunca atribui culpa — só descreve a
// diferença estrutural registrada (ex.: nunca "dano causado pelo locatário").
function buildComparisonPdfSections(entry: any, exit: any, comparison: any, summary: ReturnType<typeof summarizeComparison>) {
  const propertyLabel = exit.property ? [exit.property.code, exit.property.title].filter(Boolean).join(" — ") : exit.propertyId;
  return [
    `Imóvel: ${propertyLabel}`,
    `Vistoria de entrada: ${entry.id}${entry.completedAt ? ` (concluída em ${entry.completedAt.toISOString()})` : ""}`,
    `Vistoria de saída: ${exit.id}${exit.completedAt ? ` (concluída em ${exit.completedAt.toISOString()})` : ""}`,
    `Responsável entrada: ${entry.assignedUser?.name ?? "-"}`,
    `Responsável saída: ${exit.assignedUser?.name ?? "-"}`,
    `Status da vistoria de saída: ${exit.status}`,
    COMPARISON_DISCLAIMER,
    `Resumo: ${summary.total} itens | sem alteração ${summary.same} | alterados ${summary.changed} | melhor estado ${summary.better} | pior estado ${summary.worse} | não comparáveis ${summary.not_comparable} | novos ${summary.new} | ausentes ${summary.absent}`,
    ...comparison.rooms.flatMap((room: any) => [
      `Ambiente ${room.name}: ${ROOM_OUTCOME_LABELS[room.outcome] ?? room.outcome}`,
      ...room.items.map((item: any) => `  Item ${item.name}: ${item.entry ? (CONDITION_LABELS[item.entry] ?? item.entry) : "-"} -> ${item.exit ? (CONDITION_LABELS[item.exit] ?? item.exit) : "-"} (${ITEM_OUTCOME_LABELS[item.outcome] ?? item.outcome})`),
    ]),
  ];
}

mysqlInspectionsRouter.post("/:id/comparison", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!, input = comparisonSchema.parse(req.body);
    const exitId = String(req.params.id);
    if (input.baseline_inspection_id === exitId) throw invalid("Selecione uma vistoria de entrada diferente da vistoria atual.", "COMPARISON_SAME_INSPECTION");
    const exit = await findInspection(req, exitId, "inspections.manage");
    const entry = await findInspection(req, input.baseline_inspection_id, "inspections.view");
    if (entry.companyId !== access.company.id || exit.companyId !== access.company.id || entry.propertyId !== exit.propertyId) throw invalid("A comparação exige vistorias do mesmo imóvel.", "COMPARISON_SCOPE_INVALID");
    if (entry.type !== "entry" || exit.type !== "exit") throw invalid("Compare uma vistoria de saída com uma vistoria de entrada.", "COMPARISON_TYPE_INVALID");
    if (!["completed", "archived"].includes(entry.status) || !["completed", "archived"].includes(exit.status)) throw invalid("A comparação exige vistorias concluídas.", "COMPARISON_REQUIRES_COMPLETED");
    const [entryEvidence, exitEvidence] = await Promise.all([loadEvidence(access.company.id, entry.id), loadEvidence(access.company.id, exit.id)]);
    const comparison = compareInspections(buildInspectionSnapshot(entry, entryEvidence as any), buildInspectionSnapshot(exit, exitEvidence as any));
    const hash = snapshotHash(comparison);
    decorateComparisonWithEvidence(comparison, entryEvidence, exitEvidence);
    const summary = summarizeComparison(comparison);
    // Reaproveita só o artefato gerado contra ESTA mesma entrada; antes qualquer
    // comparação anterior da saída era devolvida, mesmo com outra baseline.
    const existing = (await artifactFiles(access.company.id, "inspection_comparison", exit.id, "inspection_comparison"))
      .filter((row: any) => (row.metadataJson as any)?.baseline_inspection_id === entry.id);
    if (existing.length && !input.regenerate) return res.json({ comparison, summary, disclaimer: COMPARISON_DISCLAIMER, report: artifactDto(existing[0], existing[0].metadataJson, await privateArtifactUrl(existing[0], "inspection_comparison")), replayed: true });
    const comparisonId = randomUUID();
    const fileName = `comparison-${exit.id}-${comparisonId}.pdf`;
    const body = buildPdfBuffer("Comparação de vistorias", buildComparisonPdfSections(entry, exit, comparison, summary).concat([`Hash: ${hash}`]));
    const policy = validateUploadFile({ purpose: "inspection_comparison", fileName, mimeType: "application/pdf", declaredSizeBytes: body.byteLength, body });
    const storage = getStorageProvider();
    uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "inspection_comparison", entityId: comparisonId, purpose: "inspection_comparison", fileName, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "inspection_comparison", inspectionId: exit.id }), deliveryAccess: deliveryAccessForPurpose("inspection_comparison") });
    await createStoredFileRecord({ companyId: access.company.id, entityType: "inspection_comparison", entityId: comparisonId, file: uploaded, uploadedBy: access.appUser.id, purpose: "inspection_comparison", metadata: { inspection_id: exit.id, baseline_inspection_id: entry.id, comparison, comparison_hash: hash } });
    await getPrisma().$transaction(async (tx) => event(tx, access.company.id, exit.id, access.appUser.id, "inspection.comparison_generated", { comparison_id: comparisonId, baseline_inspection_id: entry.id, comparison_hash: hash }));
    const file = await getPrisma().storedFile.findFirstOrThrow({ where: { companyId: access.company.id, entityType: "inspection_comparison", entityId: comparisonId, purpose: "inspection_comparison" } });
    res.status(201).json({ comparison, summary, disclaimer: COMPARISON_DISCLAIMER, report: artifactDto(file, file.metadataJson, await privateArtifactUrl(file, "inspection_comparison")) });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as StorageResourceType, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

// Bloco 5 — leitura da comparação já gerada, sem efeito colateral (não gera
// nem faz upload de nada). Usado pela tela de detalhe para decidir o label
// do botão ("Comparar com vistoria de entrada" vs "Ver comparação") sem
// disparar geração. 404 se nenhuma comparação foi gerada ainda.
mysqlInspectionsRouter.get("/:id/comparison", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const exit = await findInspection(req, String(req.params.id), "inspections.view");
    const rows = await artifactFiles(access.company.id, "inspection_comparison", exit.id, "inspection_comparison");
    const file = rows[0];
    if (!file) throw Object.assign(new Error("Nenhuma comparação foi gerada para esta vistoria."), { statusCode: 404, code: "COMPARISON_NOT_FOUND" });
    const metadata = file.metadataJson as any;
    const baselineId = metadata?.baseline_inspection_id as string | undefined;
    if (!baselineId) throw Object.assign(new Error("Nenhuma comparação foi gerada para esta vistoria."), { statusCode: 404, code: "COMPARISON_NOT_FOUND" });
    // Revalida escopo (tenant/imóvel) contra a entrada registrada no artefato —
    // se ela não pertence mais ao escopo do usuário, 404 sem revelar nada.
    const entry = await findInspection(req, baselineId, "inspections.view");
    if (entry.companyId !== access.company.id || exit.companyId !== access.company.id || entry.propertyId !== exit.propertyId) {
      throw Object.assign(new Error("Nenhuma comparação foi gerada para esta vistoria."), { statusCode: 404, code: "COMPARISON_NOT_FOUND" });
    }
    const comparison = metadata.comparison;
    const [entryEvidence, exitEvidence] = await Promise.all([loadEvidence(access.company.id, entry.id), loadEvidence(access.company.id, exit.id)]);
    decorateComparisonWithEvidence(comparison, entryEvidence, exitEvidence);
    const summary = summarizeComparison(comparison);
    res.json({ comparison, summary, disclaimer: COMPARISON_DISCLAIMER, report: artifactDto(file, metadata, await privateArtifactUrl(file, "inspection_comparison")) });
  } catch (error) {
    next(error);
  }
});

// Bloco 5 — download autenticado do PDF comparativo, espelhando
// /:id/report/download: lê os bytes via readStoredFileBuffer para funcionar
// nos 3 providers de storage (Local/R2 não implementam
// getAuthenticatedDownloadUrl). Escopo de tenant idêntico às demais rotas.
mysqlInspectionsRouter.get("/:id/comparison/download", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const inspection = await findInspection(req, String(req.params.id), "inspections.view");
    const rows = await artifactFiles(access.company.id, "inspection_comparison", inspection.id, "inspection_comparison");
    const file = rows[0];
    if (!file) throw Object.assign(new Error("Gere a comparação antes de fazer o download."), { statusCode: 404, code: "COMPARISON_NOT_FOUND" });
    const body = await readStoredFileBuffer(file);
    const fileName = file.originalFilename || `comparacao-vistoria-${inspection.id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName.replace(/["\\]/g, "")}"`);
    res.setHeader("Content-Length", String(body.byteLength));
    res.status(200).send(body);
  } catch (error) { next(error); }
});

export { inspectionTypes, inspectionStatuses, itemConditions, nextStatus, ensureMutable, IdempotencyConflictError };
