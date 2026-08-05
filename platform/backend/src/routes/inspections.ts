import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { buildInspectionPdfBuffer } from "../services/inspection-pdf.js";
import {
  createStoredFileReference,
  deleteStoredFileByIdForEntity,
  findStoredFileByIdForEntity,
  type StoredFileRecord,
} from "../services/storage/stored-files.js";
import { recordUsageEvent } from "../services/usage-costs.js";
import type { RequestWithAccess } from "../types/access.js";

export const inspectionsRouter = Router();

inspectionsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const inspectionSelect =
  "id, company_id, property_id, assigned_to, inspection_type, status, scheduled_at, started_at, completed_at, title, summary, tenant_name, tenant_document, owner_name, public_token, pdf_url, metadata, created_at, updated_at, properties(id, code, title, neighborhood, city, state)";

const roomSelect =
  "id, company_id, inspection_id, name, position, general_condition, notes, created_at, updated_at";

const itemSelect =
  "id, company_id, inspection_id, room_id, label, category, condition, notes, repair_required, position, created_at, updated_at";

const mediaSelect =
  "id, company_id, inspection_id, room_id, item_id, media_type, file_url, storage_bucket, storage_path, file_name, mime_type, file_size, caption, position, created_by, created_at";

const signatureSelect =
  "id, company_id, inspection_id, signer_name, signer_document, signer_email, signer_phone, signer_role, status, signature_token, signature_url, signature_text, signed_at, ip_address, signed_user_agent, signed_payload, expires_at, created_at, updated_at";

const inspectionStorageBucket = "imobiflow-inspections";
const inspectionMediaEntityType = "inspection_media";

const defaultRooms = [
  "Entrada",
  "Sala",
  "Sacada",
  "Cozinha",
  "Área de serviço",
  "Quarto",
  "Suíte",
  "Banheiro",
  "Lavabo",
  "Garagem",
  "Entrega de chaves e acessórios",
];

const inspectionSchema = z.object({
  property_id: z.string().uuid(),
  assigned_to: z.string().uuid().optional().or(z.literal("")),
  inspection_type: z.enum(["entry", "exit", "maintenance", "periodic"]).default("entry"),
  status: z
    .enum(["draft", "scheduled", "in_progress", "waiting_signature", "completed", "cancelled", "archived"])
    .default("draft"),
  scheduled_at: z.string().datetime().optional().or(z.literal("")),
  title: z.string().min(2),
  summary: z.string().max(4000).optional().or(z.literal("")),
  tenant_name: z.string().max(180).optional().or(z.literal("")),
  tenant_document: z.string().max(40).optional().or(z.literal("")),
  owner_name: z.string().max(180).optional().or(z.literal("")),
  create_default_rooms: z.boolean().default(true),
});

const roomSchema = z.object({
  name: z.string().min(2),
  position: z.number().int().nonnegative().optional(),
  general_condition: z
    .enum(["excellent", "good", "regular", "poor", "damaged", "not_checked"])
    .default("not_checked"),
  notes: z.string().max(4000).optional().or(z.literal("")),
});

const itemSchema = z.object({
  room_id: z.string().uuid().optional().or(z.literal("")),
  label: z.string().min(2),
  category: z.string().max(120).optional().or(z.literal("")),
  condition: z
    .enum(["excellent", "good", "regular", "poor", "damaged", "not_checked"])
    .default("not_checked"),
  notes: z.string().max(4000).optional().or(z.literal("")),
  repair_required: z.boolean().default(false),
  position: z.number().int().nonnegative().optional(),
});

const mediaSchema = z.object({
  room_id: z.string().uuid().optional().or(z.literal("")),
  item_id: z.string().uuid().optional().or(z.literal("")),
  media_type: z.enum(["photo", "video", "audio", "document"]).default("photo"),
  file_url: z.string().url().optional().or(z.literal("")),
  stored_file_id: z.string().uuid().optional().or(z.literal("")),
  file_name: z.string().max(240).optional().or(z.literal("")),
  mime_type: z.string().max(120).optional().or(z.literal("")),
  file_size: z.number().int().nonnegative().optional(),
  caption: z.string().max(800).optional().or(z.literal("")),
  position: z.number().int().nonnegative().optional(),
});

const uploadUrlSchema = z.object({
  file_name: z.string().min(2).max(240),
  mime_type: z.string().min(3).max(120),
  file_size: z.number().int().positive().max(25 * 1024 * 1024),
});

const signatureSchema = z.object({
  signer_name: z.string().min(2).max(180),
  signer_document: z.string().max(40).optional().or(z.literal("")),
  signer_email: z.string().email().optional().or(z.literal("")),
  signer_phone: z.string().max(40).optional().or(z.literal("")),
  signer_role: z.enum(["tenant", "owner", "broker", "manager", "witness"]).default("tenant"),
  expires_at: z.string().datetime().optional().or(z.literal("")),
});

const signSignatureSchema = z.object({
  signature_text: z.string().min(2).max(180),
  accepted_terms: z.literal(true),
});

const updateRoomSchema = roomSchema.partial();
const updateItemSchema = itemSchema.partial();
const updateInspectionSchema = inspectionSchema
  .omit({ property_id: true, create_default_rooms: true })
  .partial();

function cleanEmpty<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]),
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function rejectClientStorageLocation(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  if ("storage_bucket" in body || "storage_path" in body) {
    throw Object.assign(new Error("Bucket e caminho de storage são definidos pelo servidor."), {
      statusCode: 400,
      code: "CLIENT_STORAGE_LOCATION_FORBIDDEN",
    });
  }
}

async function ensurePropertyBelongsToCompany(propertyId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id, title, property_owners(name)")
    .eq("id", propertyId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string; title: string; property_owners: { name: string } | null }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Imóvel inválido para esta empresa."), {
      statusCode: 422,
      code: "INVALID_PROPERTY",
    });
  }

  return data;
}

async function ensureInspectionBelongsToCompany(inspectionId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("inspections")
    .select("id")
    .eq("id", inspectionId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Vistoria inválida para esta empresa."), {
      statusCode: 404,
      code: "INSPECTION_NOT_FOUND",
    });
  }
}

async function ensureRoomBelongsToCompany(roomId: string | null, inspectionId: string, companyId: string) {
  if (!roomId) return null;

  const { data, error } = await supabaseAdmin
    .from("inspection_rooms")
    .select("id")
    .eq("id", roomId)
    .eq("inspection_id", inspectionId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Ambiente inválido para esta vistoria."), {
      statusCode: 422,
      code: "INVALID_INSPECTION_ROOM",
    });
  }

  return data.id;
}

async function ensureItemBelongsToCompany(itemId: string, inspectionId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("inspection_items")
    .select("id")
    .eq("id", itemId)
    .eq("inspection_id", inspectionId)
    .eq("company_id", companyId)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Item inválido para esta vistoria."), {
      statusCode: 422,
      code: "INVALID_INSPECTION_ITEM",
    });
  }
}

async function ensureSignatureBelongsToCompany(
  signatureId: string,
  inspectionId: string,
  companyId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("inspection_signatures")
    .select(signatureSelect)
    .eq("id", signatureId)
    .eq("inspection_id", inspectionId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw Object.assign(new Error("Assinatura inválida para esta vistoria."), {
      statusCode: 404,
      code: "INSPECTION_SIGNATURE_NOT_FOUND",
    });
  }

  return data;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "arquivo";
}

function buildInspectionStoragePath(companyId: string, inspectionId: string, fileName: string) {
  return `${companyId}/inspections/${inspectionId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

function inspectionStorageResourceType(mimeType: string) {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "raw";
}

function inspectionStorageBinding(
  file: StoredFileRecord | null,
  companyId: string,
  inspectionId: string,
) {
  if (!file || file.provider !== "supabase") return null;
  const metadata = file.metadataJson && typeof file.metadataJson === "object" && !Array.isArray(file.metadataJson)
    ? file.metadataJson as Record<string, unknown>
    : {};
  const expectedPrefix = `${companyId}/inspections/${inspectionId}/`;
  if (metadata.inspection_id !== inspectionId || !file.publicId.startsWith(expectedPrefix)) return null;
  return { file, bucket: inspectionStorageBucket, path: file.publicId };
}

async function requireInspectionStoredFile(companyId: string, inspectionId: string, storedFileId: string) {
  const file = await findStoredFileByIdForEntity(
    companyId,
    storedFileId,
    inspectionMediaEntityType,
    storedFileId,
  );
  const binding = inspectionStorageBinding(file, companyId, inspectionId);
  if (!binding) {
    throw Object.assign(new Error("Arquivo da vistoria não encontrado."), {
      statusCode: 404,
      code: "INSPECTION_FILE_NOT_FOUND",
    });
  }
  return binding;
}

async function withSignedMediaUrls<
  T extends { id: string; storage_path?: string | null; file_url?: string | null },
>(companyId: string, inspectionId: string, media: T[]) {
  return Promise.all(
    media.map(async (entry) => {
      if (!entry.storage_path) return { ...entry, signed_url: entry.file_url ?? null };

      const file = await findStoredFileByIdForEntity(
        companyId,
        entry.id,
        inspectionMediaEntityType,
        entry.id,
      );
      const binding = inspectionStorageBinding(file, companyId, inspectionId);
      if (!binding) return { ...entry, signed_url: null };

      const { data, error } = await supabaseAdmin.storage
        .from(binding.bucket)
        .createSignedUrl(binding.path, 60 * 60);

      return { ...entry, signed_url: error ? null : data.signedUrl };
    }),
  );
}

async function createDefaultRooms(companyId: string, inspectionId: string) {
  const { error } = await supabaseAdmin.from("inspection_rooms").insert(
    defaultRooms.map((name, index) => ({
      company_id: companyId,
      inspection_id: inspectionId,
      name,
      position: index + 1,
      general_condition: "not_checked",
    })),
  );

  if (error) throw error;
}

async function loadInspectionDetail(companyId: string, inspectionId: string) {
  const { data: inspection, error: inspectionError } = await supabaseAdmin
    .from("inspections")
    .select(inspectionSelect)
    .eq("company_id", companyId)
    .eq("id", inspectionId)
    .maybeSingle();

  if (inspectionError) throw inspectionError;
  if (!inspection) {
    throw Object.assign(new Error("Vistoria não encontrada."), {
      statusCode: 404,
      code: "INSPECTION_NOT_FOUND",
    });
  }

  const [
    { data: rooms, error: roomsError },
    { data: items, error: itemsError },
    { data: media, error: mediaError },
    { data: signatures, error: signaturesError },
  ] = await Promise.all([
    supabaseAdmin
      .from("inspection_rooms")
      .select(roomSelect)
      .eq("company_id", companyId)
      .eq("inspection_id", inspectionId)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("inspection_items")
      .select(itemSelect)
      .eq("company_id", companyId)
      .eq("inspection_id", inspectionId)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("inspection_media")
      .select(mediaSelect)
      .eq("company_id", companyId)
      .eq("inspection_id", inspectionId)
      .order("position", { ascending: true }),
    supabaseAdmin
      .from("inspection_signatures")
      .select(signatureSelect)
      .eq("company_id", companyId)
      .eq("inspection_id", inspectionId)
      .order("created_at", { ascending: true }),
  ]);

  if (roomsError) throw roomsError;
  if (itemsError) throw itemsError;
  if (mediaError) throw mediaError;
  if (signaturesError) throw signaturesError;

  return {
    inspection,
    rooms: rooms ?? [],
    items: items ?? [],
    media: media ?? [],
    signatures: signatures ?? [],
  };
}

async function refreshInspectionSignatureStatus(companyId: string, inspectionId: string) {
  const { count, error } = await supabaseAdmin
    .from("inspection_signatures")
    .select("id", { count: "exact", head: true })
    .eq("company_id", companyId)
    .eq("inspection_id", inspectionId)
    .eq("status", "pending");

  if (error) throw error;

  const nextStatus = count === 0 ? "completed" : "waiting_signature";
  const updatePayload =
    nextStatus === "completed"
      ? { status: nextStatus, completed_at: new Date().toISOString() }
      : { status: nextStatus };

  const { data, error: updateError } = await supabaseAdmin
    .from("inspections")
    .update(updatePayload)
    .eq("company_id", companyId)
    .eq("id", inspectionId)
    .select(inspectionSelect)
    .single();

  if (updateError) throw updateError;
  return data;
}

inspectionsRouter.get(
  "/",
  requirePermission("inspections.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;

      let query = supabaseAdmin
        .from("inspections")
        .select(inspectionSelect)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);

      const { data, error } = await query;
      if (error) throw error;

      res.json({ inspections: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.post(
  "/",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = inspectionSchema.parse(req.body);
      const property = await ensurePropertyBelongsToCompany(input.property_id, companyId);

      const { data: inspection, error } = await supabaseAdmin
        .from("inspections")
        .insert({
          ...cleanEmpty(input),
          company_id: companyId,
          created_by: userId,
          assigned_to: input.assigned_to || null,
          owner_name: input.owner_name || property.property_owners?.name || null,
        })
        .select(inspectionSelect)
        .single();

      if (error) throw error;

      if (input.create_default_rooms) {
        await createDefaultRooms(companyId, inspection.id);
      }

      res.status(201).json({ inspection });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.patch(
  "/:id",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);

      const input = updateInspectionSchema.parse(req.body);
      const { data: inspection, error } = await supabaseAdmin
        .from("inspections")
        .update(cleanEmpty(input))
        .eq("id", inspectionId)
        .eq("company_id", companyId)
        .select(inspectionSelect)
        .single();

      if (error) throw error;

      res.json({ inspection });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.delete(
  "/:id",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);

      await supabaseAdmin.from("inspection_signatures").delete().eq("inspection_id", inspectionId).eq("company_id", companyId);
      await supabaseAdmin.from("inspection_media").delete().eq("inspection_id", inspectionId).eq("company_id", companyId);
      await supabaseAdmin.from("inspection_items").delete().eq("inspection_id", inspectionId).eq("company_id", companyId);
      await supabaseAdmin.from("inspection_rooms").delete().eq("inspection_id", inspectionId).eq("company_id", companyId);
      const { error } = await supabaseAdmin
        .from("inspections")
        .delete()
        .eq("id", inspectionId)
        .eq("company_id", companyId);

      if (error) throw error;

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.get(
  "/:id/rooms",
  requirePermission("inspections.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);

      const [
        { data: rooms, error: roomsError },
        { data: items, error: itemsError },
        { data: media, error: mediaError },
      ] =
        await Promise.all([
          supabaseAdmin
            .from("inspection_rooms")
            .select(roomSelect)
            .eq("company_id", companyId)
            .eq("inspection_id", inspectionId)
            .order("position", { ascending: true }),
          supabaseAdmin
            .from("inspection_items")
            .select(itemSelect)
            .eq("company_id", companyId)
            .eq("inspection_id", inspectionId)
            .order("position", { ascending: true }),
          supabaseAdmin
            .from("inspection_media")
            .select(mediaSelect)
            .eq("company_id", companyId)
            .eq("inspection_id", inspectionId)
            .order("position", { ascending: true }),
        ]);

      if (roomsError) throw roomsError;
      if (itemsError) throw itemsError;
      if (mediaError) throw mediaError;

      res.json({
        rooms: rooms ?? [],
        items: items ?? [],
        media: await withSignedMediaUrls(companyId, inspectionId, media ?? []),
      });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.get(
  "/:id/media",
  requirePermission("inspections.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);

      const { data, error } = await supabaseAdmin
        .from("inspection_media")
        .select(mediaSelect)
        .eq("company_id", companyId)
        .eq("inspection_id", inspectionId)
        .order("position", { ascending: true });

      if (error) throw error;

      res.json({ media: await withSignedMediaUrls(companyId, inspectionId, data ?? []) });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.get(
  "/:id",
  requirePermission("inspections.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });

      const { inspection, rooms, items, media, signatures } = await loadInspectionDetail(companyId, inspectionId);

      res.json({
        inspection,
        rooms,
        items,
        media: await withSignedMediaUrls(companyId, inspectionId, media),
        signatures,
      });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.get(
  "/:id/signatures",
  requirePermission("inspections.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);

      const { data, error } = await supabaseAdmin
        .from("inspection_signatures")
        .select(signatureSelect)
        .eq("company_id", companyId)
        .eq("inspection_id", inspectionId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      res.json({ signatures: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.post(
  "/:id/signatures",
  requirePermission("inspections.sign"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);
      const input = signatureSchema.parse(req.body);

      const { data: signature, error } = await supabaseAdmin
        .from("inspection_signatures")
        .insert({
          ...cleanEmpty(input),
          company_id: companyId,
          inspection_id: inspectionId,
          status: "pending",
          signature_token: randomUUID(),
        })
        .select(signatureSelect)
        .single();

      if (error) throw error;

      const { data: inspection, error: inspectionError } = await supabaseAdmin
        .from("inspections")
        .update({
          status: "waiting_signature",
          public_token: randomUUID(),
        })
        .eq("company_id", companyId)
        .eq("id", inspectionId)
        .is("public_token", null)
        .select(inspectionSelect)
        .maybeSingle();

      if (inspectionError) throw inspectionError;

      if (!inspection) {
        const { data: existingInspection, error: existingInspectionError } = await supabaseAdmin
          .from("inspections")
          .update({ status: "waiting_signature" })
          .eq("company_id", companyId)
          .eq("id", inspectionId)
          .select(inspectionSelect)
          .single();

        if (existingInspectionError) throw existingInspectionError;
        return res.status(201).json({ signature, inspection: existingInspection });
      }

      return res.status(201).json({ signature, inspection });
    } catch (error) {
      return next(error);
    }
  },
);

inspectionsRouter.post(
  "/:id/signatures/:signatureId/sign",
  requirePermission("inspections.sign"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const inspectionId = readParam(req.params.id);
      const signatureId = readParam(req.params.signatureId);
      if (!inspectionId || !signatureId) {
        throw Object.assign(new Error("Assinatura não informada."), { statusCode: 400 });
      }

      await ensureInspectionBelongsToCompany(inspectionId, companyId);
      const currentSignature = await ensureSignatureBelongsToCompany(signatureId, inspectionId, companyId);
      if (currentSignature.status === "signed") {
        throw Object.assign(new Error("Assinatura já confirmada."), {
          statusCode: 409,
          code: "SIGNATURE_ALREADY_CONFIRMED",
        });
      }

      const input = signSignatureSchema.parse(req.body);
      const signedAt = new Date().toISOString();
      const { data: signature, error } = await supabaseAdmin
        .from("inspection_signatures")
        .update({
          status: "signed",
          signature_text: input.signature_text,
          signed_at: signedAt,
          ip_address: req.ip,
          signed_user_agent: req.headers["user-agent"] ?? null,
          signed_payload: {
            accepted_terms: input.accepted_terms,
            signed_by_user_id: userId,
            signed_at: signedAt,
          },
        })
        .eq("id", signatureId)
        .eq("inspection_id", inspectionId)
        .eq("company_id", companyId)
        .select(signatureSelect)
        .single();

      if (error) throw error;

      const inspection = await refreshInspectionSignatureStatus(companyId, inspectionId);

      res.json({ signature, inspection });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.post(
  "/:id/pdf",
  requirePermission("inspections.pdf"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });

      const generatedAt = new Date().toISOString();
      const detail = await loadInspectionDetail(companyId, inspectionId);
      const pdfBuffer = buildInspectionPdfBuffer({ ...detail, generatedAt });
      const storagePath = buildInspectionStoragePath(companyId, inspectionId, "laudo-vistoria.pdf");

      const { error: uploadError } = await supabaseAdmin.storage
        .from(inspectionStorageBucket)
        .upload(storagePath, pdfBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: signedPdf, error: signedPdfError } = await supabaseAdmin.storage
        .from(inspectionStorageBucket)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

      if (signedPdfError) throw signedPdfError;

      const metadata =
        detail.inspection.metadata && typeof detail.inspection.metadata === "object"
          ? detail.inspection.metadata
          : {};

      const { data: inspection, error: updateError } = await supabaseAdmin
        .from("inspections")
        .update({
          pdf_url: signedPdf.signedUrl,
          metadata: {
            ...metadata,
            pdf_storage_bucket: inspectionStorageBucket,
            pdf_storage_path: storagePath,
            pdf_generated_at: generatedAt,
          },
          updated_at: generatedAt,
        })
        .eq("id", inspectionId)
        .eq("company_id", companyId)
        .select(inspectionSelect)
        .single();

      if (updateError) throw updateError;

      await recordUsageEvent({
        companyId,
        userId: req.access!.appUser.id,
        metricKey: "pdf_generated",
        source: "inspection_pdf_generated",
        relatedEntityType: "inspection",
        relatedEntityId: inspectionId,
        metadata: {
          storage_bucket: inspectionStorageBucket,
          storage_path: storagePath,
          file_size_bytes: pdfBuffer.byteLength,
        },
      });

      res.status(201).json({
        inspection,
        pdf: {
          bucket: inspectionStorageBucket,
          path: storagePath,
          signed_url: signedPdf.signedUrl,
          generated_at: generatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.post(
  "/:id/media/upload-url",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);
      const input = uploadUrlSchema.parse(req.body);
      const storedFileId = randomUUID();
      const storagePath = buildInspectionStoragePath(companyId, inspectionId, input.file_name);

      const { data, error } = await supabaseAdmin.storage
        .from(inspectionStorageBucket)
        .createSignedUploadUrl(storagePath);

      if (error) throw error;

      await createStoredFileReference({
        id: storedFileId,
        companyId,
        entityType: inspectionMediaEntityType,
        entityId: storedFileId,
        provider: "supabase",
        publicId: storagePath,
        resourceType: inspectionStorageResourceType(input.mime_type),
        secureUrl: `supabase://${inspectionStorageBucket}/${storagePath}`,
        originalFilename: input.file_name,
        mimeType: input.mime_type,
        sizeBytes: input.file_size,
        uploadedBy: req.access!.appUser.id,
        metadata: { inspection_id: inspectionId },
      });

      res.status(201).json({
        stored_file_id: storedFileId,
        bucket: inspectionStorageBucket,
        path: storagePath,
        token: data.token,
        signed_url: data.signedUrl,
        expires_in_seconds: 60 * 60 * 2,
      });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.post(
  "/:id/media",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);
      rejectClientStorageLocation(req.body);
      const input = mediaSchema.parse(req.body);
      const { stored_file_id: storedFileId, ...mediaInput } = input;
      const storageBinding = storedFileId
        ? await requireInspectionStoredFile(companyId, inspectionId, storedFileId)
        : null;
      const roomId = await ensureRoomBelongsToCompany(input.room_id || null, inspectionId, companyId);
      if (input.item_id) {
        await ensureItemBelongsToCompany(input.item_id, inspectionId, companyId);
      }

      if (!input.file_url && !storageBinding) {
        throw Object.assign(new Error("Informe um arquivo ou URL para registrar a mídia."), {
          statusCode: 422,
          code: "MEDIA_FILE_REQUIRED",
        });
      }

      const { data: media, error } = await supabaseAdmin
        .from("inspection_media")
        .insert({
          ...cleanEmpty(mediaInput),
          ...(storageBinding ? { id: storageBinding.file.id } : {}),
          room_id: roomId,
          item_id: input.item_id || null,
          storage_bucket: storageBinding?.bucket ?? null,
          storage_path: storageBinding?.path ?? null,
          file_name: storageBinding?.file.originalFilename ?? mediaInput.file_name ?? null,
          mime_type: storageBinding?.file.mimeType ?? mediaInput.mime_type ?? null,
          file_size: storageBinding?.file.sizeBytes ?? mediaInput.file_size ?? null,
          company_id: companyId,
          inspection_id: inspectionId,
          created_by: userId,
        })
        .select(mediaSelect)
        .single();

      if (error) throw error;

      const [signedMedia] = await withSignedMediaUrls(companyId, inspectionId, [media]);

      const usageEvents = [];
      if (media.media_type === "photo") {
        usageEvents.push(
          recordUsageEvent({
            companyId,
            userId,
            metricKey: "photo_upload",
            source: "inspection_media_registered",
            relatedEntityType: "inspection_media",
            relatedEntityId: media.id,
            metadata: {
              inspection_id: inspectionId,
              room_id: roomId,
              item_id: input.item_id || null,
              file_size_bytes: media.file_size ?? null,
            },
          }),
        );
      }

      if (media.file_size && media.file_size > 0) {
        usageEvents.push(
          recordUsageEvent({
            companyId,
            userId,
            metricKey: "storage_mb",
            quantity: media.file_size / (1024 * 1024),
            source: "inspection_media_registered",
            relatedEntityType: "inspection_media",
            relatedEntityId: media.id,
            metadata: {
              inspection_id: inspectionId,
              media_type: media.media_type,
              storage_bucket: media.storage_bucket,
              storage_path: media.storage_path,
              file_size_bytes: media.file_size,
            },
          }),
        );
      }

      await Promise.all(usageEvents);

      res.status(201).json({ media: signedMedia });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.delete(
  "/:id/media/:mediaId",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      const mediaId = readParam(req.params.mediaId);
      if (!inspectionId || !mediaId) {
        throw Object.assign(new Error("Mídia da vistoria não informada."), { statusCode: 400 });
      }
      await ensureInspectionBelongsToCompany(inspectionId, companyId);

      const { data: media, error: findError } = await supabaseAdmin
        .from("inspection_media")
        .select(mediaSelect)
        .eq("id", mediaId)
        .eq("inspection_id", inspectionId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (findError) throw findError;
      if (!media) throw Object.assign(new Error("Mídia não encontrada."), { statusCode: 404 });

      const storageBinding = media.storage_path
        ? await requireInspectionStoredFile(companyId, inspectionId, media.id)
        : null;
      if (storageBinding) {
        const { error: storageError } = await supabaseAdmin.storage
          .from(storageBinding.bucket)
          .remove([storageBinding.path]);
        if (storageError) throw storageError;
      }

      const { error } = await supabaseAdmin
        .from("inspection_media")
        .delete()
        .eq("id", mediaId)
        .eq("inspection_id", inspectionId)
        .eq("company_id", companyId);

      if (error) throw error;

      if (storageBinding) {
        await deleteStoredFileByIdForEntity(
          companyId,
          storageBinding.file.id,
          inspectionMediaEntityType,
          storageBinding.file.id,
        );
      }

      res.json({ ok: true, media_id: mediaId });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.post(
  "/:id/rooms",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);
      const input = roomSchema.parse(req.body);

      const { data: room, error } = await supabaseAdmin
        .from("inspection_rooms")
        .insert({
          ...cleanEmpty(input),
          company_id: companyId,
          inspection_id: inspectionId,
        })
        .select(roomSelect)
        .single();

      if (error) throw error;

      res.status(201).json({ room });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.patch(
  "/:id/rooms/:roomId",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      const roomIdParam = readParam(req.params.roomId);
      if (!inspectionId || !roomIdParam) {
        throw Object.assign(new Error("Ambiente não informado."), { statusCode: 400 });
      }

      await ensureInspectionBelongsToCompany(inspectionId, companyId);
      await ensureRoomBelongsToCompany(roomIdParam, inspectionId, companyId);
      const input = updateRoomSchema.parse(req.body);

      const { data: room, error } = await supabaseAdmin
        .from("inspection_rooms")
        .update(cleanEmpty(input))
        .eq("id", roomIdParam)
        .eq("inspection_id", inspectionId)
        .eq("company_id", companyId)
        .select(roomSelect)
        .single();

      if (error) throw error;

      res.json({ room });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.post(
  "/:id/items",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      if (!inspectionId) throw Object.assign(new Error("Vistoria não informada."), { statusCode: 400 });
      await ensureInspectionBelongsToCompany(inspectionId, companyId);
      const input = itemSchema.parse(req.body);
      const roomId = await ensureRoomBelongsToCompany(input.room_id || null, inspectionId, companyId);

      const { data: item, error } = await supabaseAdmin
        .from("inspection_items")
        .insert({
          ...cleanEmpty(input),
          room_id: roomId,
          company_id: companyId,
          inspection_id: inspectionId,
        })
        .select(itemSelect)
        .single();

      if (error) throw error;

      res.status(201).json({ item });
    } catch (error) {
      next(error);
    }
  },
);

inspectionsRouter.patch(
  "/:id/items/:itemId",
  requirePermission("inspections.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const inspectionId = readParam(req.params.id);
      const itemId = readParam(req.params.itemId);
      if (!inspectionId || !itemId) {
        throw Object.assign(new Error("Item não informado."), { statusCode: 400 });
      }

      await ensureInspectionBelongsToCompany(inspectionId, companyId);
      await ensureItemBelongsToCompany(itemId, inspectionId, companyId);
      const input = updateItemSchema.parse(req.body);
      const roomId = input.room_id === undefined
        ? undefined
        : await ensureRoomBelongsToCompany(input.room_id || null, inspectionId, companyId);

      const { data: item, error } = await supabaseAdmin
        .from("inspection_items")
        .update({
          ...cleanEmpty(input),
          ...(input.room_id !== undefined ? { room_id: roomId } : {}),
        })
        .eq("id", itemId)
        .eq("inspection_id", inspectionId)
        .eq("company_id", companyId)
        .select(itemSelect)
        .single();

      if (error) throw error;

      res.json({ item });
    } catch (error) {
      next(error);
    }
  },
);
