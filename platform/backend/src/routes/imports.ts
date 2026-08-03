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
import {
  parseFullDataImport,
  previewDataImport,
  type ImportSourceType,
  type ParsedImportRow,
} from "../services/csv-import.js";
import type { RequestWithAccess } from "../types/access.js";

export const importsRouter = Router();

importsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const importJobSelect =
  "id, company_id, import_type, source_type, file_name, status, total_rows, valid_rows, invalid_rows, imported_owners, imported_properties, skipped_rows, mapping_json, preview_json, error_report_json, metadata, started_at, finished_at, created_at, updated_at";

const importPreviewSchema = z.object({
  file_name: z.string().min(1).max(180),
  content_base64: z.string().min(1),
  import_type: z.enum(["properties", "owners", "owners_properties"]).default("owners_properties"),
  source_type: z.enum(["csv", "json", "excel", "xml", "zip"]).optional(),
  delimiter: z.string().max(1).optional().or(z.literal("")),
  mapping_json: z.record(z.string()).optional(),
});

const importStartSchema = importPreviewSchema.extend({
  allow_partial: z.boolean().optional().default(false),
});

importsRouter.get(
  "/",
  requirePermission("imports.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const { data, error } = await supabaseAdmin
        .from("import_jobs")
        .select(importJobSelect)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      res.json({ imports: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

importsRouter.get(
  "/:id/rows",
  requirePermission("imports.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const { data, error } = await supabaseAdmin
        .from("import_rows")
        .select("id, import_id, row_number, raw_data, mapped_data, status, errors_json, owner_id, property_id, created_at")
        .eq("company_id", companyId)
        .eq("import_id", req.params.id)
        .order("row_number", { ascending: true })
        .limit(200);

      if (error) throw error;

      res.json({ rows: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

importsRouter.post(
  "/preview",
  requirePermission("imports.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const input = importPreviewSchema.parse(req.body);
      const preview = await previewDataImport({
        fileName: input.file_name,
        contentBase64: input.content_base64,
        importType: input.import_type,
        sourceType: resolveSourceType(input.file_name, input.source_type),
        delimiter: input.delimiter || null,
        mappingOverride: input.mapping_json,
        maxRows: 50,
      });

      res.json({ preview });
    } catch (error) {
      next(error);
    }
  },
);

importsRouter.post(
  "/start",
  requirePermission("imports.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = importStartSchema.parse(req.body);
      const sourceType = resolveSourceType(input.file_name, input.source_type);
      const parsed = await parseFullDataImport({
        fileName: input.file_name,
        contentBase64: input.content_base64,
        importType: input.import_type,
        sourceType,
        delimiter: input.delimiter || null,
        mappingOverride: input.mapping_json,
      });

      if (!input.allow_partial && parsed.invalid_rows > 0) {
        return res.status(422).json({
          error: "IMPORT_HAS_INVALID_ROWS",
          message: "Corrija as linhas inválidas ou habilite importação parcial.",
          preview: parsed,
        });
      }

      const { data: importJob, error: importError } = await supabaseAdmin
        .from("import_jobs")
        .insert({
          company_id: companyId,
          created_by: userId,
          import_type: input.import_type,
          source_type: sourceType,
          file_name: input.file_name,
          status: "processing",
          total_rows: parsed.total_rows,
          valid_rows: parsed.valid_rows,
          invalid_rows: parsed.invalid_rows,
          mapping_json: parsed.mapping,
          preview_json: {
            headers: parsed.headers,
            delimiter: parsed.delimiter,
            source_type: parsed.source_type,
            preview_rows: parsed.preview_rows.slice(0, 20).map(sanitizeImportRowForStorage),
          },
          started_at: new Date().toISOString(),
        })
        .select(importJobSelect)
        .single();

      if (importError) throw importError;

      const rowsToInsert = parsed.rows.map((row) => ({
        company_id: companyId,
        import_id: importJob.id,
        row_number: row.row_number,
        raw_data: row.raw_data,
        mapped_data: sanitizeMappedDataForStorage(row.mapped_data),
        status: row.status,
        errors_json: row.errors,
      }));

      if (rowsToInsert.length) {
        const { error: rowsError } = await supabaseAdmin.from("import_rows").insert(rowsToInsert);
        if (rowsError) throw rowsError;
      }

      const result = await importRows({
        companyId,
        userId,
        importId: importJob.id,
        rows: parsed.rows,
        importType: input.import_type,
        allowPartial: input.allow_partial,
      });

      const finalStatus =
        result.failed_rows > 0 || parsed.invalid_rows > 0 ? "completed_with_errors" : "completed";
      const { data: updatedImport, error: updateError } = await supabaseAdmin
        .from("import_jobs")
        .update({
          status: finalStatus,
          imported_owners: result.imported_owners,
          imported_properties: result.imported_properties,
          skipped_rows: result.skipped_rows,
          error_report_json: result.errors,
          finished_at: new Date().toISOString(),
        })
        .eq("id", importJob.id)
        .eq("company_id", companyId)
        .select(importJobSelect)
        .single();

      if (updateError) throw updateError;

      await supabaseAdmin.from("audit_logs").insert({
        company_id: companyId,
        user_id: userId,
        action: "import.completed",
        entity_type: "import_jobs",
        entity_id: importJob.id,
        metadata: {
          import_type: input.import_type,
          file_name: input.file_name,
          total_rows: parsed.total_rows,
          ...result,
        },
      });

      res.status(201).json({ import: updatedImport, result });
    } catch (error) {
      next(error);
    }
  },
);

async function importRows(input: {
  companyId: string;
  userId: string;
  importId: string;
  rows: ParsedImportRow[];
  importType: "properties" | "owners" | "owners_properties";
  allowPartial: boolean;
}) {
  const result = {
    imported_owners: 0,
    imported_properties: 0,
    imported_media: 0,
    skipped_rows: 0,
    failed_rows: 0,
    errors: [] as Array<{ row_number: number; errors: string[] }>,
  };

  for (const row of input.rows) {
    if (row.status === "invalid") {
      result.skipped_rows += 1;
      result.errors.push({ row_number: row.row_number, errors: row.errors });
      continue;
    }

    try {
      const ownerId =
        input.importType !== "properties"
          ? await upsertOwner(input.companyId, input.userId, row.mapped_data.owner)
          : null;
      if (ownerId) result.imported_owners += 1;

      const propertyId =
        input.importType !== "owners"
          ? await createProperty(input.companyId, input.userId, ownerId, row.mapped_data.property)
          : null;
      if (propertyId) {
        result.imported_properties += 1;
        result.imported_media += await createPropertyMediaFromUrls(
          input.companyId,
          propertyId,
          row.mapped_data.property.media_urls,
        );
        result.imported_media += await createPropertyMediaFromImportedFiles(
          input.companyId,
          propertyId,
          row.mapped_data.property.media_files,
        );
      }

      await supabaseAdmin
        .from("import_rows")
        .update({
          status: "imported",
          owner_id: ownerId,
          property_id: propertyId,
        })
        .eq("company_id", input.companyId)
        .eq("import_id", input.importId)
        .eq("row_number", row.row_number);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao importar linha.";
      result.failed_rows += 1;
      result.errors.push({ row_number: row.row_number, errors: [message] });
      await supabaseAdmin
        .from("import_rows")
        .update({ status: "failed", errors_json: [message] })
        .eq("company_id", input.companyId)
        .eq("import_id", input.importId)
        .eq("row_number", row.row_number);

      if (!input.allowPartial) throw error;
    }
  }

  return result;
}

async function upsertOwner(companyId: string, userId: string, owner: Record<string, unknown>) {
  const name = readString(owner.name);
  if (!name) return null;

  const document = readString(owner.document);
  const email = readString(owner.email);

  let query = supabaseAdmin
    .from("property_owners")
    .select("id")
    .eq("company_id", companyId)
    .limit(1);

  if (document) query = query.eq("document", document);
  else if (email) query = query.ilike("email", email);
  else query = query.ilike("name", name);

  const existing = await query.maybeSingle<{ id: string }>();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id;

  const { data, error } = await supabaseAdmin
    .from("property_owners")
    .insert({
      company_id: companyId,
      created_by: userId,
      owner_type: document && document.replace(/\D/g, "").length > 11 ? "company" : "individual",
      name,
      document,
      email,
      phone: readString(owner.phone),
      whatsapp: readString(owner.phone),
      status: "active",
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

async function createProperty(
  companyId: string,
  userId: string,
  ownerId: string | null,
  property: Record<string, unknown>,
) {
  const code = readString(property.code);

  if (code) {
    const { data, error } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("company_id", companyId)
      .ilike("code", code)
      .maybeSingle<{ id: string }>();

    if (error) throw error;
    if (data?.id) {
      throw Object.assign(new Error(`Imovel com codigo ${code} ja existe.`), {
        code: "PROPERTY_DUPLICATE_CODE",
      });
    }
  }

  const { data, error } = await supabaseAdmin
    .from("properties")
    .insert({
      ...cleanPayload(stripImportOnlyFields(property)),
      company_id: companyId,
      created_by: userId,
      owner_id: ownerId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

async function createPropertyMediaFromUrls(
  companyId: string,
  propertyId: string,
  mediaUrls: unknown,
) {
  if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) return 0;

  const rows = mediaUrls
    .map((url, index) => ({
      company_id: companyId,
      property_id: propertyId,
      media_type: "photo",
      url: String(url),
      position: index,
    }))
    .filter((row) => row.url);

  if (rows.length === 0) return 0;

  const { error } = await supabaseAdmin.from("property_media").insert(rows);
  if (error) throw error;

  return rows.length;
}

async function createPropertyMediaFromImportedFiles(
  companyId: string,
  propertyId: string,
  mediaFiles: unknown,
) {
  if (!Array.isArray(mediaFiles) || mediaFiles.length === 0) return 0;

  const bucket = "imobiflow-property-media";
  let imported = 0;

  for (const [index, mediaFile] of mediaFiles.entries()) {
    if (!isRecord(mediaFile)) continue;

    const fileName = readString(mediaFile.file_name);
    const mimeType = readString(mediaFile.mime_type);
    const contentBase64 = readString(mediaFile.content_base64);
    const sizeBytes = typeof mediaFile.size_bytes === "number" ? mediaFile.size_bytes : null;

    if (!fileName || !contentBase64 || !sizeBytes || !isAllowedImageMime(mimeType) || sizeBytes > 10 * 1024 * 1024) {
      continue;
    }

    const buffer = Buffer.from(contentBase64, "base64");
    if (buffer.length !== sizeBytes) continue;

    const storagePath = `${companyId}/properties/${propertyId}/imports/${randomUUID()}-${sanitizeFileName(
      fileName,
      extensionForMime(mimeType),
    )}`;

    const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);

    const { error } = await supabaseAdmin.from("property_media").insert({
      company_id: companyId,
      property_id: propertyId,
      media_type: "photo",
      url: publicUrl,
      position: index,
      storage_bucket: bucket,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size: sizeBytes,
      is_cover: index === 0,
    });
    if (error) throw error;

    imported += 1;
  }

  return imported;
}

function isAllowedImageMime(value: string | null): value is "image/jpeg" | "image/png" | "image/webp" {
  return value === "image/jpeg" || value === "image/png" || value === "image/webp";
}

function extensionForMime(mimeType: "image/jpeg" | "image/png" | "image/webp") {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function sanitizeFileName(fileName: string, fallbackExtension: string) {
  const baseName = fileName.split(/[\\/]/).at(-1) || `arquivo.${fallbackExtension}`;
  const sanitized = baseName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized.includes(".") ? sanitized : `${sanitized || "arquivo"}.${fallbackExtension}`;
}

function stripImportOnlyFields(input: Record<string, unknown>) {
  const { media_files: _mediaFiles, media_urls: _mediaUrls, ...property } = input;
  return property;
}

function sanitizeImportRowForStorage(row: ParsedImportRow) {
  return {
    ...row,
    mapped_data: sanitizeMappedDataForStorage(row.mapped_data),
  };
}

function sanitizeMappedDataForStorage(mappedData: ParsedImportRow["mapped_data"]) {
  return {
    ...mappedData,
    property: {
      ...mappedData.property,
      media_files: sanitizeMediaFilesForStorage(mappedData.property.media_files),
    },
  };
}

function sanitizeMediaFilesForStorage(mediaFiles: unknown) {
  if (!Array.isArray(mediaFiles)) return undefined;
  return mediaFiles.map((file) => {
    if (!isRecord(file)) return file;
    const { content_base64: _contentBase64, ...safeFile } = file;
    return safeFile;
  });
}

function cleanPayload(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveSourceType(fileName: string, sourceType?: ImportSourceType): ImportSourceType {
  if (sourceType) return sourceType;
  const lowerFileName = fileName.toLowerCase();
  if (lowerFileName.endsWith(".json")) return "json";
  if (lowerFileName.endsWith(".xml")) return "xml";
  if (lowerFileName.endsWith(".zip")) return "zip";
  if (lowerFileName.endsWith(".xlsx") || lowerFileName.endsWith(".xls")) return "excel";
  return "csv";
}
