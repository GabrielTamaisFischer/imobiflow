import { getPrisma } from "../../lib/website-builder-prisma.js";
import type { StoredFile } from "./types.js";
import { assertStoredFilePurposeAccess, inferStoredFilePurpose } from "./purposes.js";

export type StoredFileRecord = {
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
  purpose: string | null;
  createdAt: Date;
  uploadedBy: string | null;
  isTestData: boolean;
  testBatchId: string | null;
  sourceUrl: string | null;
  importJobId: string | null;
  importSource: string | null;
  metadataJson: unknown;
};

type StoredFileDelegate = {
  create(input: { data: Record<string, unknown> }): Promise<StoredFileRecord>;
  findFirst(input: Record<string, unknown>): Promise<StoredFileRecord | null>;
  findMany(input: Record<string, unknown>): Promise<StoredFileRecord[]>;
  deleteMany(input: Record<string, unknown>): Promise<{ count: number }>;
};

export async function createStoredFileReference(input: {
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
  sizeBytes?: number | null;
  uploadedBy?: string | null;
  metadata?: Record<string, unknown> | null;
  purpose?: string | null;
}) {
  return storedFileDelegate().create({
    data: {
      id: input.id,
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      provider: input.provider,
      publicId: input.publicId,
      resourceType: input.resourceType,
      secureUrl: input.secureUrl,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? null,
      uploadedBy: input.uploadedBy ?? null,
      metadataJson: input.metadata ?? undefined,
      purpose: input.purpose ?? inferStoredFilePurpose(input.entityType),
    },
  });
}

export async function createStoredFileRecord(input: {
  companyId: string;
  entityType: string;
  entityId: string;
  file: StoredFile;
  uploadedBy?: string | null;
  isTestData?: boolean;
  testBatchId?: string | null;
  sourceUrl?: string | null;
  importJobId?: string | null;
  importSource?: string | null;
  metadata?: Record<string, unknown> | null;
  purpose?: string | null;
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
      sourceUrl: input.sourceUrl ?? null,
      importJobId: input.importJobId ?? null,
      importSource: input.importSource ?? null,
      metadataJson: input.metadata ?? undefined,
      purpose: input.purpose ?? inferStoredFilePurpose(input.entityType),
    },
  });
}

/**
 * `requestingPermissions`: quando informado (rotas autenticadas normais),
 * aplica o controle mínimo de acesso por propósito (A6) — um usuário sem a
 * permissão do módulo dono do documento (ex.: sem `finance.view` para um
 * `financial_document`) recebe 403, mesmo sendo da empresa certa. Omitir o
 * parâmetro (ex.: chamadas internas de sistema) mantém o comportamento
 * anterior, apenas com isolamento por empresa.
 */
export async function findStoredFileForEntity(
  companyId: string,
  entityType: string,
  entityId: string,
  requestingPermissions?: string[],
) {
  const record = await storedFileDelegate().findFirst({
    where: { companyId, entityType, entityId },
    orderBy: { createdAt: "desc" },
  });
  if (record && requestingPermissions) assertStoredFilePurposeAccess(record.purpose, requestingPermissions);
  return record;
}

/**
 * Fase 4D: primeira função a listar *vários* StoredFile de uma mesma
 * entidade — até agora todo consumidor existente (property_media,
 * inspection_media, website_logo) modela "vários arquivos" através de uma
 * tabela própria (property_media, inspection_media no Supabase) e usa
 * StoredFile só como referência 1:1 de segurança por arquivo. Documentos do
 * proprietário não têm (e esta fase não cria) uma tabela própria — StoredFile
 * é a única fonte da lista, por isso `purpose` é obrigatório aqui: nunca
 * listamos "todo arquivo desta entidade" sem também travar por propósito
 * (evita que um StoredFile de outro uso futuro do mesmo entityType vaze para
 * cá). `requestingPermissions`, quando informado, aplica o mesmo controle de
 * acesso por propósito (A6) que os demais finders — se o propósito pedido
 * não é permitido para quem chama, nem tenta listar.
 */
export async function findStoredFilesForEntity(
  companyId: string,
  entityType: string,
  entityId: string,
  purpose: string,
  requestingPermissions?: string[],
) {
  if (requestingPermissions) assertStoredFilePurposeAccess(purpose, requestingPermissions);
  return storedFileDelegate().findMany({
    where: { companyId, entityType, entityId, purpose },
    orderBy: { createdAt: "desc" },
  });
}

export async function findStoredFileByIdForEntity(
  companyId: string,
  storedFileId: string,
  entityType: string,
  entityId: string,
  requestingPermissions?: string[],
) {
  const record = await storedFileDelegate().findFirst({
    where: { id: storedFileId, companyId, entityType, entityId },
  });
  if (record && requestingPermissions) assertStoredFilePurposeAccess(record.purpose, requestingPermissions);
  return record;
}

export async function deleteStoredFileRecordsForEntity(companyId: string, entityType: string, entityId: string) {
  return storedFileDelegate().deleteMany({
    where: { companyId, entityType, entityId },
  });
}

export async function deleteStoredFileByIdForEntity(
  companyId: string,
  storedFileId: string,
  entityType: string,
  entityId: string,
) {
  return storedFileDelegate().deleteMany({
    where: { id: storedFileId, companyId, entityType, entityId },
  });
}

function storedFileDelegate() {
  return (getPrisma() as unknown as { storedFile: StoredFileDelegate }).storedFile;
}
