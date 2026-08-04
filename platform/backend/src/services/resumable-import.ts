import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { parseFullDataImport, type ImportSourceType, type ImportType, type ParsedImportRow } from "./csv-import.js";
import { importRemotePropertyImage, validateImageBytes } from "./import-media.js";
import { buildStorageFolder, getStorageProvider, getStorageProviderForName } from "./storage/index.js";
import { createStoredFileRecord } from "./storage/stored-files.js";
import type { StorageProviderName } from "./storage/types.js";

export const DEFAULT_IMPORT_BATCH_SIZE = 25;
export const MAX_IMPORT_BATCH_SIZE = 100;
export const TEST_IMPORT_LIMIT = 50;
const LOCK_DURATION_MS = 2 * 60_000;

export type StartImportInput = {
  companyId: string;
  userId: string;
  fileName: string;
  contentBase64: string;
  importType: ImportType;
  sourceType: ImportSourceType;
  delimiter?: string | null;
  mapping?: Record<string, string>;
  allowPartial: boolean;
  mode: "test" | "full";
  confirmFullImport: boolean;
  batchSize?: number;
};

export async function startResumableImport(prisma: PrismaClient, input: StartImportInput) {
  assertFullImportConfirmed(input.mode, input.confirmFullImport);
  const parsed = await parseFullDataImport({
    fileName: input.fileName,
    contentBase64: input.contentBase64,
    importType: input.importType,
    sourceType: input.sourceType,
    delimiter: input.delimiter,
    mappingOverride: input.mapping,
  });
  const selectedRows = selectRowsForMode(parsed.rows, input.mode);
  if (!input.allowPartial && selectedRows.some((row) => row.status === "invalid")) {
    throw Object.assign(httpError(422, "IMPORT_HAS_INVALID_ROWS", "Corrija as linhas invalidas ou habilite importacao parcial."), { preview: parsed });
  }
  const batchSize = clampImportBatchSize(input.batchSize);
  const job = await prisma.importJob.create({ data: {
    companyId: input.companyId, createdBy: input.userId, importType: input.importType,
    sourceType: input.sourceType, sourceName: input.fileName, mode: input.mode, status: "PENDING",
    totalRows: selectedRows.length, batchSize, nextCursor: selectedRows[0]?.row_number ?? 1,
    confirmFullImport: input.confirmFullImport, mappingJson: json(parsed.mapping),
    metadataJson: json({ original_total_rows: parsed.total_rows, test_limit_applied: input.mode === "test" && parsed.total_rows > TEST_IMPORT_LIMIT, allow_partial: input.allowPartial }),
  }});

  const stagedRows: ParsedImportRow[] = [];
  for (const row of selectedRows) stagedRows.push(await stageEmbeddedMedia(prisma, job.id, input, row));
  for (let offset = 0; offset < stagedRows.length; offset += 500) {
    await prisma.importRow.createMany({ data: stagedRows.slice(offset, offset + 500).map((row) => ({
      importJobId: job.id, companyId: input.companyId, rowNumber: row.row_number,
      externalId: readString(row.mapped_data.property.import_external_id) ?? readString(row.mapped_data.property.code),
      status: row.status === "valid" ? "PENDING" : "SKIPPED", errorCode: row.status === "invalid" ? "INVALID_ROW" : null,
      errorMessage: row.errors.join("; ") || null, sourcePayloadJson: json(row.raw_data), mappedDataJson: json(sanitizeMapped(row.mapped_data)),
      processedAt: row.status === "invalid" ? new Date() : null,
    })) });
  }
  await refreshJobCounters(prisma, input.companyId, job.id);
  return processNextImportBatch(prisma, input.companyId, input.userId, job.id);
}

export async function processNextImportBatch(prisma: PrismaClient, companyId: string, userId: string, jobId: string) {
  const lockToken = randomUUID();
  const now = new Date();
  const claimed = await prisma.importJob.updateMany({
    where: { id: jobId, companyId, status: { in: ["PENDING", "PARTIALLY_COMPLETED", "FAILED"] }, OR: [{ lockToken: null }, { lockExpiresAt: { lt: now } }] },
    data: { status: "PROCESSING", lockToken, lockExpiresAt: new Date(now.getTime() + LOCK_DURATION_MS), startedAt: now, lastError: null },
  });
  if (!claimed.count) {
    const existing = await prisma.importJob.findFirst({ where: { id: jobId, companyId }, select: { status: true } });
    if (!existing) throw httpError(404, "IMPORT_NOT_FOUND", "Importacao nao encontrada.");
    if (existing.status === "COMPLETED") return getImportReport(prisma, companyId, jobId);
    throw httpError(409, "IMPORT_BATCH_ALREADY_CLAIMED", "Outro processo ja assumiu este lote.");
  }

  const job = await prisma.importJob.findFirstOrThrow({ where: { id: jobId, companyId, lockToken } });
  const rows = await prisma.importRow.findMany({
    where: { importJobId: jobId, companyId, status: "PENDING", rowNumber: { gte: job.nextCursor } }, orderBy: { rowNumber: "asc" }, take: job.batchSize,
  });
  let lastError: string | null = null;
  for (const row of rows) {
    const owned = await prisma.importRow.updateMany({ where: { id: row.id, companyId, status: "PENDING" }, data: { status: "PROCESSING" } });
    if (!owned.count) continue;
    try {
      await processImportRow(prisma, job, row, userId);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha ao importar linha.";
      await prisma.importRow.updateMany({ where: { id: row.id, companyId }, data: { status: "FAILED", errorCode: errorCode(error), errorMessage: lastError, processedAt: new Date() } });
    }
  }
  const next = await prisma.importRow.findFirst({ where: { importJobId: jobId, companyId, status: "PENDING" }, orderBy: { rowNumber: "asc" }, select: { rowNumber: true } });
  const failed = await prisma.importRow.count({ where: { importJobId: jobId, companyId, status: "FAILED" } });
  await prisma.importJob.updateMany({ where: { id: jobId, companyId, lockToken }, data: {
    status: next ? "PARTIALLY_COMPLETED" : failed ? "PARTIALLY_COMPLETED" : "COMPLETED",
    nextCursor: next?.rowNumber ?? job.totalRows + 1, lockToken: null, lockExpiresAt: null, lastError,
    finishedAt: next ? null : new Date(),
  }});
  await refreshJobCounters(prisma, companyId, jobId);
  return getImportReport(prisma, companyId, jobId);
}

export async function retryFailedImportRows(prisma: PrismaClient, companyId: string, userId: string, jobId: string) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, companyId } });
  if (!job) throw httpError(404, "IMPORT_NOT_FOUND", "Importacao nao encontrada.");
  const first = await prisma.importRow.findFirst({ where: { importJobId: jobId, companyId, status: "FAILED" }, orderBy: { rowNumber: "asc" } });
  if (!first) return getImportReport(prisma, companyId, jobId);
  await prisma.$transaction([
    prisma.importRow.updateMany({ where: { importJobId: jobId, companyId, status: "FAILED" }, data: { status: "PENDING", errorCode: null, errorMessage: null, processedAt: null } }),
    prisma.importJob.updateMany({ where: { id: jobId, companyId }, data: { status: "PENDING", nextCursor: first.rowNumber, finishedAt: null, lastError: null } }),
  ]);
  return processNextImportBatch(prisma, companyId, userId, jobId);
}

export async function getImportReport(prisma: PrismaClient, companyId: string, jobId: string) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, companyId } });
  if (!job) throw httpError(404, "IMPORT_NOT_FOUND", "Importacao nao encontrada.");
  const failures = await prisma.importRow.findMany({ where: { importJobId: jobId, companyId, status: "FAILED" }, orderBy: { rowNumber: "asc" }, take: 100, select: { rowNumber: true, externalId: true, errorCode: true, errorMessage: true } });
  return { import: serializeJob(job), failures, has_pending_batches: await prisma.importRow.count({ where: { importJobId: jobId, companyId, status: "PENDING" } }) > 0 };
}

export async function rollbackImport(prisma: PrismaClient, companyId: string, jobId: string) {
  const job = await prisma.importJob.findFirst({ where: { id: jobId, companyId } });
  if (!job) throw httpError(404, "IMPORT_NOT_FOUND", "Importacao nao encontrada.");
  if (job.rolledBackAt) return { import: serializeJob(job), rollback: job.rollbackJson };
  const files = await prisma.storedFile.findMany({ where: { companyId, importJobId: jobId } });
  const createdOwnerRows = await prisma.importRow.findMany({ where: { companyId, importJobId: jobId, action: { in: ["CREATED_OWNER", "CREATED_PROPERTY_OWNER"] }, ownerId: { not: null } }, select: { ownerId: true } });
  const createdOwnerIds = createdOwnerRows.map((row) => row.ownerId).filter((id): id is string => Boolean(id));
  let deletedFiles = 0;
  let failedFileDeletes = 0;
  for (const file of files) {
    try { await getStorageProviderForName(file.provider as StorageProviderName).deleteFile({ publicId: file.publicId, resourceType: file.resourceType as "image" | "video" | "raw" }); deletedFiles += 1; } catch { failedFileDeletes += 1; }
  }
  if (failedFileDeletes) throw httpError(502, "IMPORT_ROLLBACK_STORAGE_FAILED", `${failedFileDeletes} arquivo(s) nao puderam ser apagados; o rollback permanece retomavel.`);
  const result = await prisma.$transaction(async (tx) => {
    const deletedMedia = await tx.propertyMedia.deleteMany({ where: { companyId, property: { importJobId: jobId } } });
    const deletedFilesDb = await tx.storedFile.deleteMany({ where: { companyId, importJobId: jobId } });
    const deletedProperties = await tx.property.deleteMany({ where: { companyId, importJobId: jobId } });
    const deletedOwners = createdOwnerIds.length ? await tx.propertyOwner.deleteMany({ where: { companyId, id: { in: createdOwnerIds }, properties: { none: {} } } }) : { count: 0 };
    const rollback = { deleted_properties: deletedProperties.count, deleted_owners: deletedOwners.count, deleted_media: deletedMedia.count, deleted_file_records: deletedFilesDb.count, deleted_provider_files: deletedFiles };
    const updated = await tx.importJob.update({ where: { id: jobId }, data: { status: "CANCELED", rolledBackAt: new Date(), rollbackJson: json(rollback) } });
    return { import: serializeJob(updated), rollback };
  });
  return result;
}

async function processImportRow(prisma: PrismaClient, job: Awaited<ReturnType<PrismaClient["importJob"]["findFirstOrThrow"]>>, row: Awaited<ReturnType<PrismaClient["importRow"]["findFirstOrThrow"]>>, userId: string) {
  const mapped = row.mappedDataJson as unknown as ParsedImportRow["mapped_data"];
  let ownerId: string | null = null;
  let ownerCreated = false;
  if (job.importType !== "properties") {
    const owner = await upsertOwner(prisma, job.companyId, userId, mapped.owner);
    ownerId = owner.id; ownerCreated = owner.created;
  }
  if (job.importType === "owners") {
    await prisma.importRow.update({ where: { id: row.id }, data: { status: "IMPORTED", action: ownerCreated ? "CREATED_OWNER" : "EXISTING_OWNER", ownerId, processedAt: new Date() } });
    return;
  }
  const externalId = row.externalId;
  const duplicate = externalId ? await prisma.property.findFirst({ where: { companyId: job.companyId, OR: [{ importSource: job.sourceType, importExternalId: externalId }, { code: externalId }] }, select: { id: true } }) : null;
  if (duplicate) {
    await prisma.importRow.update({ where: { id: row.id }, data: { status: "DUPLICATE", action: "SKIPPED", propertyId: duplicate.id, ownerId, processedAt: new Date() } });
    return;
  }
  const property = await prisma.property.create({ data: propertyCreateData(job, userId, ownerId, mapped.property, externalId) });
  const media = await persistMedia(prisma, job, row, property.id, userId, mapped.property);
  await prisma.importRow.update({ where: { id: row.id }, data: { status: "IMPORTED", action: ownerCreated ? "CREATED_PROPERTY_OWNER" : "CREATED_PROPERTY", propertyId: property.id, ownerId, processedAt: new Date(), errorMessage: media.failed ? `${media.failed} foto(s) falharam.` : null } });
  await prisma.importJob.update({ where: { id: job.id }, data: { importedPhotos: { increment: media.imported }, failedPhotos: { increment: media.failed } } });
}

async function upsertOwner(prisma: PrismaClient, companyId: string, userId: string, owner: Record<string, unknown>) {
  const name = readString(owner.name); if (!name) return { id: null, created: false };
  const document = readString(owner.document); const email = readString(owner.email);
  const existing = await prisma.propertyOwner.findFirst({ where: { companyId, ...(document ? { document } : email ? { email } : { name }) }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const created = await prisma.propertyOwner.create({ data: { companyId, createdBy: userId, name, document, email, phone: readString(owner.phone), whatsapp: readString(owner.phone), ownerType: document?.replace(/\D/g, "").length! > 11 ? "company" : "individual", addressJson: {}, status: "active" } });
  return { id: created.id, created: true };
}

function propertyCreateData(job: { id: string; companyId: string; sourceType: string }, userId: string, ownerId: string | null, value: Record<string, unknown>, externalId: string | null): Prisma.PropertyUncheckedCreateInput {
  return { companyId: job.companyId, createdBy: userId, ownerId, code: readString(value.code), title: readString(value.title) ?? `Imovel ${externalId ?? "importado"}`,
    description: readString(value.description), propertyType: readString(value.property_type) ?? "apartment", operation: readString(value.operation) ?? "sale", status: readString(value.status) ?? "draft",
    street: readString(value.street), number: readString(value.number), complement: readString(value.complement), neighborhood: readString(value.neighborhood), city: readString(value.city), state: readString(value.state), zipCode: readString(value.zip_code),
    bedrooms: readNumber(value.bedrooms), bathrooms: readNumber(value.bathrooms), suites: readNumber(value.suites), parkingSpaces: readNumber(value.parking_spaces), privateArea: readNumber(value.private_area), totalArea: readNumber(value.total_area),
    salePriceCents: readNumber(value.sale_price_cents), rentPriceCents: readNumber(value.rent_price_cents), condominiumFeeCents: readNumber(value.condominium_fee_cents), iptuCents: readNumber(value.iptu_cents),
    nearbyHighways: [], captureJson: {}, primaryDetailsJson: {}, measurementsJson: {}, commercialTermsJson: {}, featuresJson: [], amenityGroupsJson: [], videosJson: videoJson(value), publicationSettingsJson: {},
    importSource: job.sourceType, importExternalId: externalId, importJobId: job.id, importedAt: new Date() };
}

async function persistMedia(prisma: PrismaClient, job: { id: string; companyId: string; sourceType: string }, row: { id: string }, propertyId: string, userId: string, property: Record<string, unknown>) {
  let imported = 0; let failed = 0; let position = 0;
  for (const item of arrayRecords(property.media_files)) {
    const secureUrl = readString(item.secure_url); const publicId = readString(item.public_id);
    if (!secureUrl || !publicId) { failed += 1; continue; }
    const stored = await prisma.storedFile.updateMany({ where: { companyId: job.companyId, importJobId: job.id, publicId }, data: { entityType: "property", entityId: propertyId } });
    if (!stored.count) { failed += 1; continue; }
    await prisma.propertyMedia.create({ data: { companyId: job.companyId, propertyId, mediaType: "photo", url: secureUrl, position, storagePath: publicId, mimeType: readString(item.mime_type), fileSize: readNumber(item.size_bytes), isCover: position === 0 } }); imported += 1; position += 1;
  }
  for (const sourceUrl of arrayStrings(property.media_urls)) {
    try {
      const existing = await prisma.storedFile.findFirst({ where: { companyId: job.companyId, sourceUrl }, orderBy: { createdAt: "desc" } });
      if (existing) {
        await prisma.propertyMedia.create({ data: { companyId: job.companyId, propertyId, mediaType: "photo", url: existing.secureUrl, position, storagePath: existing.publicId, mimeType: existing.mimeType, fileSize: existing.sizeBytes, isCover: position === 0 } });
        imported += 1; position += 1; continue;
      }
      const { uploaded } = await importRemotePropertyImage({ companyId: job.companyId, userId, propertyId, importJobId: job.id, importSource: job.sourceType, sourceUrl, position });
      await prisma.propertyMedia.create({ data: { companyId: job.companyId, propertyId, mediaType: "photo", url: uploaded.secureUrl, position, storagePath: uploaded.publicId, mimeType: uploaded.mimeType, fileSize: uploaded.sizeBytes, isCover: position === 0 } }); imported += 1; position += 1;
    } catch { failed += 1; }
  }
  return { imported, failed };
}

async function stageEmbeddedMedia(prisma: PrismaClient, jobId: string, input: StartImportInput, row: ParsedImportRow) {
  const staged = [] as Array<Record<string, unknown>>;
  for (const file of arrayRecords(row.mapped_data.property.media_files)) {
    const content = readString(file.content_base64); const mimeType = readString(file.mime_type); const fileName = readString(file.file_name); const size = readNumber(file.size_bytes);
    if (!content || !mimeType || !fileName || !size) continue;
    try {
      const bytes = Buffer.from(content, "base64");
      if (bytes.length !== size) throw Object.assign(new Error("Tamanho da imagem ZIP inconsistente."), { code: "IMPORT_IMAGE_SIZE" });
      validateImageBytes(bytes, mimeType);
      const provider = getStorageProvider();
      const uploaded = await provider.uploadFile({ companyId: input.companyId, entityType: "import_job", entityId: jobId, purpose: "property_image", fileName, mimeType, sizeBytes: bytes.length, body: bytes, folder: buildStorageFolder({ companyId: input.companyId, purpose: "property_image" }), metadata: { importJobId: jobId, rowNumber: row.row_number } });
      await createStoredFileRecord({ companyId: input.companyId, entityType: "import_job", entityId: jobId, file: uploaded, uploadedBy: input.userId, importJobId: jobId, importSource: input.sourceType, metadata: { row_number: row.row_number } });
      staged.push({ public_id: uploaded.publicId, secure_url: uploaded.secureUrl, mime_type: uploaded.mimeType, size_bytes: uploaded.sizeBytes });
    } catch {
      await prisma.importJob.update({ where: { id: jobId }, data: { failedPhotos: { increment: 1 } } });
    }
  }
  return { ...row, mapped_data: { ...row.mapped_data, property: { ...row.mapped_data.property, media_files: staged } } };
}

async function refreshJobCounters(prisma: PrismaClient, companyId: string, jobId: string) {
  const groups = await prisma.importRow.groupBy({ by: ["status"], where: { companyId, importJobId: jobId }, _count: { _all: true } });
  const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  await prisma.importJob.updateMany({ where: { id: jobId, companyId }, data: { processedRows: (counts.IMPORTED ?? 0) + (counts.DUPLICATE ?? 0) + (counts.SKIPPED ?? 0) + (counts.FAILED ?? 0), importedRows: counts.IMPORTED ?? 0, duplicateRows: counts.DUPLICATE ?? 0, skippedRows: counts.SKIPPED ?? 0, failedRows: counts.FAILED ?? 0 } });
}

function sanitizeMapped(mapped: ParsedImportRow["mapped_data"]) { return { ...mapped, property: { ...mapped.property, media_files: arrayRecords(mapped.property.media_files).map(({ content_base64: _, ...file }) => file) } }; }
function serializeJob(job: Record<string, unknown>) { return Object.fromEntries(Object.entries(job).map(([key, value]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), value])); }
function videoJson(value: Record<string, unknown>) { return arrayStrings(value.video_urls ?? value.video_url).concat(arrayStrings(value.tour_urls ?? value.tour_url)).map((url) => ({ url, external: true })); }
function json(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
function readString(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function readNumber(value: unknown) { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : null; }
function arrayStrings(value: unknown) { return Array.isArray(value) ? value.map(readString).filter((item): item is string => Boolean(item)) : readString(value) ? [readString(value)!] : []; }
function arrayRecords(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function errorCode(error: unknown) { return typeof error === "object" && error && "code" in error ? String(error.code) : "IMPORT_ROW_FAILED"; }
function httpError(statusCode: number, code: string, message: string) { return Object.assign(new Error(message), { statusCode, code }); }

export function assertFullImportConfirmed(mode: "test" | "full", confirmed: boolean) {
  if (mode === "full" && !confirmed) throw httpError(422, "FULL_IMPORT_CONFIRMATION_REQUIRED", "Importacao completa exige confirm_full_import=true.");
}

export function selectRowsForMode<T>(rows: T[], mode: "test" | "full") {
  return mode === "test" ? rows.slice(0, TEST_IMPORT_LIMIT) : rows;
}

export function clampImportBatchSize(value?: number) {
  return Math.min(MAX_IMPORT_BATCH_SIZE, Math.max(1, value ?? DEFAULT_IMPORT_BATCH_SIZE));
}

export function canClaimImportStatus(status: string) {
  return status === "PENDING" || status === "PARTIALLY_COMPLETED" || status === "FAILED";
}
