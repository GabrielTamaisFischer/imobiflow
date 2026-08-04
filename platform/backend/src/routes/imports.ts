import { Router } from "express";
import { z } from "zod";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { previewDataImport, type ImportSourceType } from "../services/csv-import.js";
import { getImportReport, processNextImportBatch, retryFailedImportRows, rollbackImport, startResumableImport } from "../services/resumable-import.js";
import type { RequestWithAccess } from "../types/access.js";

export const importsRouter = Router();
importsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const previewSchema = z.object({
  file_name: z.string().min(1).max(240), content_base64: z.string().min(1),
  import_type: z.enum(["properties", "owners", "owners_properties"]).default("owners_properties"),
  source_type: z.enum(["csv", "json", "excel", "xml", "zip"]).optional(), delimiter: z.string().max(1).optional().or(z.literal("")),
  mapping_json: z.record(z.string()).optional(),
});
const startSchema = previewSchema.extend({
  allow_partial: z.boolean().default(true), mode: z.enum(["test", "full"]).default("test"),
  confirm_full_import: z.boolean().default(false), batch_size: z.number().int().min(1).max(100).optional(),
});

importsRouter.get("/", requirePermission("imports.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const jobs = await getPrisma().importJob.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, take: 30 });
    res.json({ imports: jobs.map(serialize) });
  } catch (error) { next(error); }
});

importsRouter.get("/:id/rows", requirePermission("imports.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const job = await getPrisma().importJob.findFirst({ where: { id: req.params.id, companyId }, select: { id: true } });
    if (!job) return res.status(404).json({ error: "IMPORT_NOT_FOUND" });
    const rows = await getPrisma().importRow.findMany({ where: { companyId, importJobId: job.id }, orderBy: { rowNumber: "asc" }, take: 200 });
    res.json({ rows: rows.map(serialize) });
  } catch (error) { next(error); }
});

importsRouter.post("/preview", requirePermission("imports.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = previewSchema.parse(req.body);
    const preview = await previewDataImport({ fileName: input.file_name, contentBase64: input.content_base64, importType: input.import_type,
      sourceType: resolveSourceType(input.file_name, input.source_type), delimiter: input.delimiter || null, mappingOverride: input.mapping_json, maxRows: 50 });
    res.json({ preview });
  } catch (error) { next(error); }
});

importsRouter.post("/start", requirePermission("imports.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = startSchema.parse(req.body);
    const result = await startResumableImport(getPrisma(), {
      companyId: req.access!.company.id, userId: req.access!.appUser.id, fileName: input.file_name,
      contentBase64: input.content_base64, importType: input.import_type, sourceType: resolveSourceType(input.file_name, input.source_type),
      delimiter: input.delimiter || null, mapping: input.mapping_json, allowPartial: input.allow_partial,
      mode: input.mode, confirmFullImport: input.confirm_full_import, batchSize: input.batch_size,
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});

importsRouter.post("/:id/process-next-batch", requirePermission("imports.manage"), async (req: RequestWithAccess, res, next) => {
  try { res.json(await processNextImportBatch(getPrisma(), req.access!.company.id, req.access!.appUser.id, req.params.id)); }
  catch (error) { next(error); }
});

importsRouter.get("/:id/report", requirePermission("imports.view"), async (req: RequestWithAccess, res, next) => {
  try { res.json(await getImportReport(getPrisma(), req.access!.company.id, req.params.id)); }
  catch (error) { next(error); }
});

importsRouter.post("/:id/retry-failed", requirePermission("imports.manage"), async (req: RequestWithAccess, res, next) => {
  try { res.json(await retryFailedImportRows(getPrisma(), req.access!.company.id, req.access!.appUser.id, req.params.id)); }
  catch (error) { next(error); }
});

importsRouter.post("/:id/rollback", requirePermission("imports.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const confirmation = z.object({ confirm_rollback: z.literal(true) }).parse(req.body);
    void confirmation;
    res.json(await rollbackImport(getPrisma(), req.access!.company.id, req.params.id));
  } catch (error) { next(error); }
});

function resolveSourceType(fileName: string, sourceType?: ImportSourceType): ImportSourceType {
  if (sourceType) return sourceType;
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".xml")) return "xml";
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  return "csv";
}

function serialize(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]));
}
