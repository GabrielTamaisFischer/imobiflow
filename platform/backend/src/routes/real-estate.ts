import { Router, type RequestHandler } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import {
  archiveMysqlOwner,
  archiveMysqlProperty,
  countMysqlPropertyMedia,
  createMysqlOwner,
  createMysqlProperty,
  createMysqlPropertyMedia,
  deleteMysqlPropertyMedia,
  DEFAULT_PROPERTY_PAGE_SIZE,
  getMysqlProperty,
  getMysqlPropertyByCode,
  getMysqlPropertyByExternalId,
  listMysqlOwners,
  listMysqlProperties,
  listMysqlPropertyContent,
  listMysqlPropertyMedia,
  MAX_PROPERTY_PAGE_SIZE,
  reorderMysqlPropertyMedia,
  setMysqlPropertyMediaCover,
  updateMysqlOwner,
  updateMysqlProperty,
} from "../services/mysql-real-estate.js";
import { validateUploadFile } from "../services/storage/file-policy.js";
import {
  buildStorageFolder,
  getStorageProvider,
  getStorageProviderForName,
  storagePurposeFromPropertyMedia,
} from "../services/storage/index.js";
import {
  createStoredFileRecord,
  deleteStoredFileRecordsForEntity,
  findStoredFileForEntity,
} from "../services/storage/stored-files.js";
import type { StorageProviderName, StorageResourceType } from "../services/storage/types.js";
import { isValidBrazilianDocument } from "../services/brazilian-document.js";
import {
  assertPropertyAccess,
  buildPropertyScopeFilter,
  resolveScope,
} from "../services/authorization.js";
import type { RequestWithAccess } from "../types/access.js";

export const realEstateRouter = Router();

realEstateRouter.use(requireAuth, requireCompany, requireActiveSubscription);

function invalidPropertyQuery() {
  return Object.assign(new Error("Parâmetros de consulta de imóveis inválidos."), {
    statusCode: 400,
    code: "INVALID_PROPERTY_QUERY",
  });
}

function parsePropertyReference(value: unknown, maxLength: number) {
  const parsed = z.string().trim().min(1).max(maxLength).safeParse(value);
  if (!parsed.success) throw invalidPropertyQuery();
  return parsed.data;
}

const ownerFields = {
  owner_type: z.enum(["individual", "company"]).default("individual"),
  client_type: z.enum(["comprador", "construtor", "investidor", "locatario", "proprietario"]).default("proprietario"),
  name: z.string().min(2),
  document: z.string().max(32).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(32).optional().or(z.literal("")),
  whatsapp: z.string().max(32).optional().or(z.literal("")),
  residential_phone: z.string().max(32).optional().or(z.literal("")),
  commercial_phone: z.string().max(32).optional().or(z.literal("")),
  address_json: z.record(z.unknown()).optional().default({}),
  notes: z.string().max(4000).optional().or(z.literal("")),
};
const validateOwnerDocument = (owner: { document?: string; owner_type: "individual" | "company" }, context: z.RefinementCtx) => {
  if (owner.document && !isValidBrazilianDocument(owner.document, owner.owner_type)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["document"], message: "CPF/CNPJ inválido para o tipo de pessoa." });
  }
};
export const ownerSchema = z.object(ownerFields).superRefine(validateOwnerDocument);
const ownerUpdateSchema = z.object(ownerFields).partial();

const propertyFields = {
  owner_id: z.string().uuid().optional().or(z.literal("")),
  code: z.string().max(40).optional().or(z.literal("")),
  title: z.string().max(220).optional().or(z.literal("")),
  description: z.string().max(8000).optional().or(z.literal("")),
  property_type: z.enum(["apartment", "industrial_area", "garage_box", "house", "commercial_house", "condo_house", "village_house", "farm_house", "penthouse", "office", "farm", "flat", "warehouse", "haras", "hotel", "industry", "kitnet", "loft", "mall_store", "store", "land_condo", "motel", "inn", "building", "ranch", "townhouse", "studio", "land", "commercial", "rural", "other"]).default("apartment"),
  operation: z.enum(["sale", "rent", "season", "both"]).default("sale"),
  status: z.enum(["draft", "available", "reserved", "sold", "rented", "inactive", "archived"]).default("draft"),
  street: z.string().max(160).optional().or(z.literal("")),
  number: z.string().max(40).optional().or(z.literal("")),
  complement: z.string().max(120).optional().or(z.literal("")),
  neighborhood: z.string().max(120).optional().or(z.literal("")),
  city: z.string().max(120).optional().or(z.literal("")),
  state: z.string().max(40).optional().or(z.literal("")),
  country: z.string().max(80).optional().or(z.literal("")),
  zip_code: z.string().max(16).optional().or(z.literal("")),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  condominium_name: z.string().max(160).optional().or(z.literal("")),
  nearby_highways: z.array(z.string().max(120)).optional(),
  responsible_user_id: z.string().uuid().optional().or(z.literal("")),
  bedrooms: z.number().int().nonnegative().optional(),
  bathrooms: z.number().int().nonnegative().optional(),
  suites: z.number().int().nonnegative().optional(),
  parking_spaces: z.number().int().nonnegative().optional(),
  private_area: z.number().nonnegative().optional(),
  total_area: z.number().nonnegative().optional(),
  sale_price_cents: z.number().int().nonnegative().optional(),
  rent_price_cents: z.number().int().nonnegative().optional(),
  condominium_fee_cents: z.number().int().nonnegative().optional(),
  iptu_cents: z.number().int().nonnegative().optional(),
  features_json: z.record(z.boolean()).optional(),
  capture_json: z.record(z.unknown()).optional(),
  primary_details_json: z.record(z.unknown()).optional(),
  measurements_json: z.record(z.unknown()).optional(),
  commercial_terms_json: z.record(z.unknown()).optional(),
  amenity_groups_json: z.record(z.array(z.string())).optional(),
  videos_json: z.array(z.record(z.unknown())).optional(),
  publication_settings_json: z.record(z.unknown()).optional(),
  description_template_key: z.string().max(80).optional().or(z.literal("")),
};
const validateProperty = (property: { suites?: number; bedrooms?: number; state?: string; zip_code?: string }, context: z.RefinementCtx) => {
  if (property.suites !== undefined && property.bedrooms !== undefined && property.suites > property.bedrooms) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["suites"], message: "Suítes não podem exceder dormitórios." });
  }
  if (property.state && !/^[A-Za-z]{2}$/.test(property.state)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["state"], message: "UF deve conter duas letras." });
  }
  if (property.zip_code && property.zip_code.replace(/\D/g, "").length !== 8) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["zip_code"], message: "CEP deve conter oito dígitos." });
  }
};
export const propertySchema = z.object(propertyFields).superRefine(validateProperty);
const propertyUpdateSchema = z.object(propertyFields).partial().superRefine(validateProperty);

const mediaUploadSchema = z.object({
  file_name: z.string().min(1).max(180),
  mime_type: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif", "application/pdf", "video/mp4"]),
  size_bytes: z.number().int().positive().max(50 * 1024 * 1024),
  content_base64: z.string().min(1),
  media_type: z.enum(["photo", "video", "tour", "floor_plan"]).default("photo"),
  caption: z.string().max(240).optional().or(z.literal("")),
  position: z.number().int().nonnegative().optional(),
  is_cover: z.boolean().optional(),
});

const mediaOrderSchema = z.object({
  media: z.array(
    z.object({
      id: z.string().uuid(),
      position: z.number().int().nonnegative(),
    }),
  ),
});

const mediaCoverSchema = z.object({ media_id: z.string().uuid() });

export const propertyListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(MAX_PROPERTY_PAGE_SIZE).default(DEFAULT_PROPERTY_PAGE_SIZE),
  status: z.string().trim().min(1).max(40).optional(),
  operation: z.string().trim().min(1).max(40).optional(),
  property_type: z.string().trim().min(1).max(40).optional(),
  code: z.string().trim().min(1).max(40).optional(),
  import_source: z.string().trim().min(1).max(80).optional(),
  import_external_id: z.string().trim().min(1).max(180).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

const propertyExternalIdQuerySchema = z.object({
  import_source: z.string().trim().min(1).max(80).optional(),
});

export function parsePropertyListQuery(query: unknown) {
  const parsed = propertyListQuerySchema.safeParse(query);
  if (!parsed.success) throw invalidPropertyQuery();
  return {
    page: parsed.data.page,
    pageSize: parsed.data.page_size,
    status: parsed.data.status,
    operation: parsed.data.operation,
    propertyType: parsed.data.property_type,
    code: parsed.data.code,
    importSource: parsed.data.import_source,
    importExternalId: parsed.data.import_external_id,
    search: parsed.data.search,
  };
}

export function createListPropertiesHandler(
  service: typeof listMysqlProperties = listMysqlProperties,
): RequestHandler {
  return async (request: RequestWithAccess, response, next) => {
    try {
      response.json(await service(
        request.access!.company.id,
        parsePropertyListQuery(request.query),
        undefined,
        buildPropertyScopeFilter(request.access!, "properties.view"),
      ));
    } catch (error) {
      next(error);
    }
  };
}

export function createGetPropertyHandler(service: typeof getMysqlProperty = getMysqlProperty): RequestHandler {
  return async (request: RequestWithAccess, response, next) => {
    try {
      response.json({ property: await service(
        request.access!.company.id,
        String(request.params.id),
        undefined,
        buildPropertyScopeFilter(request.access!, "properties.view"),
      ) });
    } catch (error) {
      next(error);
    }
  };
}

export function createGetPropertyByCodeHandler(
  service: typeof getMysqlPropertyByCode = getMysqlPropertyByCode,
): RequestHandler {
  return async (request: RequestWithAccess, response, next) => {
    try {
      const code = parsePropertyReference(request.params.code, 40);
      response.json({ property: await service(
        request.access!.company.id,
        code,
        undefined,
        buildPropertyScopeFilter(request.access!, "properties.view"),
      ) });
    } catch (error) {
      next(error);
    }
  };
}

export function createGetPropertyByExternalIdHandler(
  service: typeof getMysqlPropertyByExternalId = getMysqlPropertyByExternalId,
): RequestHandler {
  return async (request: RequestWithAccess, response, next) => {
    try {
      const externalId = parsePropertyReference(request.params.externalId, 180);
      const parsedQuery = propertyExternalIdQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) throw invalidPropertyQuery();
      response.json({
        property: await service(
          request.access!.company.id,
          externalId,
          parsedQuery.data.import_source,
          undefined,
          buildPropertyScopeFilter(request.access!, "properties.view"),
        ),
      });
    } catch (error) {
      next(error);
    }
  };
}

realEstateRouter.get("/owners", requirePermission("owners.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const status = typeof req.query.status === "string" ? req.query.status : "active";
    const search = typeof req.query.search === "string" ? req.query.search.slice(0, 120) : undefined;
    res.json({ owners: await listMysqlOwners(companyId, status, search) });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.post("/owners", requirePermission("owners.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const owner = await createMysqlOwner(req.access!.company.id, req.access!.appUser.id, ownerSchema.parse(req.body));
    res.status(201).json({ owner });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.patch("/owners/:id", requirePermission("owners.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const owner = await updateMysqlOwner(req.access!.company.id, String(req.params.id), ownerUpdateSchema.parse(req.body));
    res.json({ owner });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.delete("/owners/:id", requirePermission("owners.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const owner = await archiveMysqlOwner(req.access!.company.id, String(req.params.id));
    res.json({ owner });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.get("/properties", requirePermission("properties.view"), createListPropertiesHandler());

realEstateRouter.get("/properties/content", requirePermission("properties.view"), async (req: RequestWithAccess, res, next) => {
  try {
    res.json(await listMysqlPropertyContent(
      req.access!.company.id,
      parsePropertyListQuery(req.query),
      undefined,
      buildPropertyScopeFilter(req.access!, "properties.view"),
    ));
  } catch (error) {
    next(error);
  }
});

realEstateRouter.get("/properties/by-code/:code", requirePermission("properties.view"), createGetPropertyByCodeHandler());

realEstateRouter.get(
  "/properties/by-external-id/:externalId",
  requirePermission("properties.view"),
  createGetPropertyByExternalIdHandler(),
);

realEstateRouter.get("/properties/:id", requirePermission("properties.view"), createGetPropertyHandler());

realEstateRouter.post("/properties", requirePermission("properties.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = propertySchema.parse(req.body);
    const property = await createMysqlProperty(
      req.access!.company.id,
      req.access!.appUser.id,
      resolveScope(req.access!, "properties.manage") === "company"
        ? input
        : { ...input, responsible_user_id: req.access!.appUser.id },
    );
    res.status(201).json({ property });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.patch("/properties/:id", requirePermission("properties.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    await assertPropertyAccess(req.access!, String(req.params.id), "properties.manage", "EDIT");
    const property = await updateMysqlProperty(
      req.access!.company.id,
      String(req.params.id),
      propertyUpdateSchema.parse(req.body),
    );
    res.json({ property });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.delete("/properties/:id", requirePermission("properties.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    await assertPropertyAccess(req.access!, String(req.params.id), "properties.manage", "EDIT");
    const property = await archiveMysqlProperty(req.access!.company.id, String(req.params.id));
    res.json({ property });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.get("/properties/:id/media", requirePermission("properties.view"), async (req: RequestWithAccess, res, next) => {
  try {
    await assertPropertyAccess(req.access!, String(req.params.id), "properties.view");
    res.json({ media: await listMysqlPropertyMedia(req.access!.company.id, String(req.params.id)) });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.post("/properties/:id/media", requirePermission("properties.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const input = mediaUploadSchema.parse(req.body);
    const propertyId = String(req.params.id);
    await assertPropertyAccess(req.access!, propertyId, "properties.manage", "EDIT");
    const body = decodeBase64File(input.content_base64);
    const purpose = storagePurposeFromPropertyMedia(input.media_type);
    const policy = validateUploadFile({
      purpose,
      fileName: input.file_name,
      mimeType: input.mime_type,
      declaredSizeBytes: input.size_bytes,
      body,
    });
    await enforcePropertyMediaLimit(companyId, propertyId, input.media_type);

    const storage = getStorageProvider();
    const uploaded = await storage.uploadFile({
      companyId,
      entityType: "property_media",
      entityId: null,
      purpose,
      fileName: input.file_name,
      mimeType: policy.normalizedMimeType,
      sizeBytes: policy.measuredSizeBytes,
      body,
      folder: buildStorageFolder({ companyId, propertyId, purpose }),
    });
    const media = await createMysqlPropertyMedia(companyId, propertyId, {
      media_type: input.media_type,
      url: uploaded.secureUrl,
      caption: input.caption || null,
      position: input.position ?? 0,
      storage_bucket: uploaded.provider,
      storage_path: uploaded.publicId,
      mime_type: policy.normalizedMimeType,
      file_size: policy.measuredSizeBytes,
      is_cover: input.is_cover,
    });

    await createStoredFileRecord({
      companyId,
      entityType: "property_media",
      entityId: media.id,
      file: uploaded,
      uploadedBy: req.access!.appUser.id,
    });
    await auditPropertyMediaStorageAction(req, "asset_uploaded", media.id, propertyId, `Midia enviada: ${input.file_name}`, {
      mediaType: input.media_type,
      provider: uploaded.provider,
      publicId: uploaded.publicId,
      mimeType: policy.normalizedMimeType,
      sizeBytes: policy.measuredSizeBytes,
    });

    res.status(201).json({ media });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.patch("/properties/:id/media-order", requirePermission("properties.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    await assertPropertyAccess(req.access!, String(req.params.id), "properties.manage", "EDIT");
    const input = mediaOrderSchema.parse(req.body);
    const media = await reorderMysqlPropertyMedia(req.access!.company.id, String(req.params.id), input.media);
    res.json({ media });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.patch("/properties/:id/media-cover", requirePermission("properties.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    await assertPropertyAccess(req.access!, String(req.params.id), "properties.manage", "EDIT");
    const input = mediaCoverSchema.parse(req.body);
    const media = await setMysqlPropertyMediaCover(req.access!.company.id, String(req.params.id), input.media_id);
    res.json({ media });
  } catch (error) {
    next(error);
  }
});

realEstateRouter.delete("/properties/:id/media/:mediaId", requirePermission("properties.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const propertyId = String(req.params.id);
    const mediaId = String(req.params.mediaId);
    await assertPropertyAccess(req.access!, propertyId, "properties.manage", "EDIT");
    const storedFile = await deleteRemoteFileForEntity(companyId, "property_media", mediaId);
    await deleteMysqlPropertyMedia(companyId, propertyId, mediaId);
    await deleteStoredFileRecordsForEntity(companyId, "property_media", mediaId);
    await auditPropertyMediaStorageAction(req, "asset_deleted", mediaId, propertyId, "Midia removida do imovel", {
      provider: storedFile?.provider ?? null,
      publicId: storedFile?.publicId ?? null,
      resourceType: storedFile?.resourceType ?? null,
    });
    res.json({ ok: true, media_id: mediaId });
  } catch (error) {
    next(error);
  }
});

function decodeBase64File(content: string) {
  const base64 = content.includes(",") ? content.split(",").at(-1) : content;
  return Buffer.from(base64 ?? "", "base64");
}

async function enforcePropertyMediaLimit(companyId: string, propertyId: string, mediaType: string) {
  const total = await countMysqlPropertyMedia(companyId, propertyId);
  if (total >= 60) {
    throw Object.assign(new Error("Limite de 60 arquivos por imovel atingido."), { statusCode: 413 });
  }

  const perType = await countMysqlPropertyMedia(companyId, propertyId, mediaType);
  const limitByType: Record<string, number> = {
    photo: 40,
    video: 3,
    tour: 3,
    floor_plan: 10,
  };
  const limit = limitByType[mediaType] ?? 20;
  if (perType >= limit) {
    throw Object.assign(new Error(`Limite de ${limit} arquivos do tipo ${mediaType} por imovel atingido.`), {
      statusCode: 413,
    });
  }
}

async function deleteRemoteFileForEntity(companyId: string, entityType: string, entityId: string) {
  const storedFile = await findStoredFileForEntity(companyId, entityType, entityId);
  if (!storedFile) return null;

  await getStorageProviderForName(storedFile.provider as StorageProviderName).deleteFile({
    publicId: storedFile.publicId,
    resourceType: storedFile.resourceType as StorageResourceType,
  });
  return storedFile;
}

async function auditPropertyMediaStorageAction(
  req: RequestWithAccess,
  action: "asset_uploaded" | "asset_deleted",
  mediaId: string,
  propertyId: string,
  summary: string,
  metadata: Record<string, unknown>,
) {
  await getPrisma().websiteAuditLog.create({
    data: {
      companyId: req.access!.company.id,
      actorUserId: req.access!.appUser.id,
      action,
      entityType: "property_media",
      entityId: mediaId,
      summary,
      metadataJson: {
        propertyId,
        ...metadata,
      },
      ipAddress: req.ip?.slice(0, 80) ?? null,
      userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
    },
  });
}
