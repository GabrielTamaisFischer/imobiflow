import { getPrisma } from "../../lib/website-builder-prisma.js";
import type { StoredFile } from "./types.js";

type StoredFileRecord = {
  id: string;
  companyId: string;
  entityType: string;
  entityId: string;
  provider: string;
  publicId: string;
  resourceType: string;
  secureUrl: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  format: string | null;
  createdAt: Date;
  uploadedBy: string | null;
  isTestData: boolean;
  testBatchId: string | null;
};

type StoredFileDelegate = {
  create(input: { data: Record<string, unknown> }): Promise<StoredFileRecord>;
  findFirst(input: Record<string, unknown>): Promise<StoredFileRecord | null>;
  deleteMany(input: Record<string, unknown>): Promise<{ count: number }>;
};

export async function createStoredFileRecord(input: {
  companyId: string;
  entityType: string;
  entityId: string;
  file: StoredFile;
  uploadedBy?: string | null;
  isTestData?: boolean;
  testBatchId?: string | null;
}) {
  return storedFileDelegate().create({
    data: {
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      provider: input.file.provider,
      publicId: input.file.publicId,
      resourceType: input.file.resourceType,
      secureUrl: input.file.secureUrl,
      originalFilename: input.file.originalFilename,
      mimeType: input.file.mimeType,
      sizeBytes: input.file.sizeBytes,
      width: input.file.width,
      height: input.file.height,
      format: input.file.format,
      uploadedBy: input.uploadedBy ?? null,
      isTestData: Boolean(input.isTestData),
      testBatchId: input.testBatchId ?? null,
    },
  });
}

export async function findStoredFileForEntity(companyId: string, entityType: string, entityId: string) {
  return storedFileDelegate().findFirst({
    where: { companyId, entityType, entityId },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteStoredFileRecordsForEntity(companyId: string, entityType: string, entityId: string) {
  return storedFileDelegate().deleteMany({
    where: { companyId, entityType, entityId },
  });
}

function storedFileDelegate() {
  return (getPrisma() as unknown as { storedFile: StoredFileDelegate }).storedFile;
}
