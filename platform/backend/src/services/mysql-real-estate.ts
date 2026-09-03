import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { ingestLead } from "./lead-intake.js";
import { isValidBrazilianDocument, normalizeBrazilianDocument } from "./brazilian-document.js";

type PropertyInput = Record<string, any>;

const propertyInclude = {
  owner: true,
  // B4 (Fase B): expõe o corretor/responsável só para consumo interno
  // (admin). Nome apenas — telefone/e-mail do AppUser não entram aqui;
  // exposição pública exigiria uma decisão de produto explícita, que esta
  // fase não toma (ver publicPropertySelect, que não inclui responsibleUser).
  responsibleUser: { select: { id: true, name: true } },
  media: {
    orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
  },
};

const publicPropertySelect = {
  id: true,
  code: true,
  title: true,
  description: true,
  propertyType: true,
  operation: true,
  status: true,
  street: true,
  number: true,
  complement: true,
  neighborhood: true,
  city: true,
  state: true,
  country: true,
  zipCode: true,
  latitude: true,
  longitude: true,
  condominiumName: true,
  bedrooms: true,
  bathrooms: true,
  suites: true,
  parkingSpaces: true,
  privateArea: true,
  totalArea: true,
  salePriceCents: true,
  rentPriceCents: true,
  condominiumFeeCents: true,
  iptuCents: true,
  featuresJson: true,
  amenityGroupsJson: true,
  videosJson: true,
  siteFeatured: true,
  publishedAt: true,
  // Item 6 do escopo (2026-08-30): decisão de produto explícita, que a Fase
  // B tinha propositalmente deixado em aberto (ver comentário em
  // propertyInclude acima) — o site público mostra o NOME do corretor
  // responsável apenas. Nunca telefone/e-mail do AppUser aqui: só "name" é
  // selecionado, então não há como esses campos vazarem por engano nesta
  // consulta mesmo que o serializer mude no futuro.
  responsibleUser: { select: { name: true } },
  media: {
    orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      mediaType: true,
      url: true,
      caption: true,
      position: true,
      isCover: true,
    },
  },
} satisfies Prisma.PropertySelect;

export const DEFAULT_PROPERTY_PAGE_SIZE = 25;
export const MAX_PROPERTY_PAGE_SIZE = 100;

export type PropertyListInput = {
  page: number;
  pageSize: number;
  status?: string;
  operation?: string;
  propertyType?: string;
  code?: string;
  importSource?: string;
  importExternalId?: string;
  search?: string;
};

const propertyListSelect = {
  id: true,
  ownerId: true,
  code: true,
  title: true,
  propertyType: true,
  operation: true,
  status: true,
  street: true,
  number: true,
  complement: true,
  neighborhood: true,
  city: true,
  state: true,
  country: true,
  zipCode: true,
  condominiumName: true,
  bedrooms: true,
  bathrooms: true,
  suites: true,
  parkingSpaces: true,
  privateArea: true,
  totalArea: true,
  salePriceCents: true,
  rentPriceCents: true,
  condominiumFeeCents: true,
  iptuCents: true,
  publishedAt: true,
  importSource: true,
  importExternalId: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      name: true,
    },
  },
  media: {
    orderBy: [{ isCover: "desc" as const }, { position: "asc" as const }, { createdAt: "asc" as const }],
    take: 1,
    select: {
      id: true,
      mediaType: true,
      url: true,
      caption: true,
      position: true,
      isCover: true,
      createdAt: true,
    },
  },
} satisfies Prisma.PropertySelect;

export function prisma() {
  return getPrisma();
}

export async function ensurePropertyBelongsToCompany(propertyId: string, companyId: string) {
  const property = await prisma().property.findFirst({
    where: { id: propertyId, companyId },
    select: { id: true },
  });

  if (!property) {
    throw Object.assign(new Error("Imóvel inválido para esta empresa."), {
      statusCode: 404,
      code: "PROPERTY_NOT_FOUND",
    });
  }

  return property.id;
}

async function ensureOwnerBelongsToCompany(ownerId: string, companyId: string) {
  const owner = await prisma().propertyOwner.findFirst({
    where: { id: ownerId, companyId },
    select: { id: true },
  });

  if (!owner) {
    throw Object.assign(new Error("Proprietário inválido para esta empresa."), {
      statusCode: 404,
      code: "OWNER_NOT_FOUND",
    });
  }

  return owner.id;
}

export async function listMysqlOwners(companyId: string, status = "active", search?: string) {
  const normalizedSearch = search?.trim();
  const owners = await prisma().propertyOwner.findMany({
    where: {
      companyId,
      status,
      ...(normalizedSearch ? {
        OR: [
          { name: { contains: normalizedSearch } },
          { document: { contains: normalizeBrazilianDocument(normalizedSearch) || normalizedSearch } },
          { email: { contains: normalizedSearch } },
          { phone: { contains: normalizedSearch } },
          { whatsapp: { contains: normalizedSearch } },
        ],
      } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return owners.map(serializeOwner);
}

export async function createMysqlOwner(companyId: string, userId: string, input: PropertyInput) {
  const document = await ensureOwnerDocumentAvailable(companyId, input.document);
  const owner = await prisma().propertyOwner.create({
    data: {
      companyId,
      createdBy: uuidOrNull(userId),
      ownerType: input.owner_type ?? "individual",
      clientType: input.client_type ?? "proprietario",
      name: input.name,
      document,
      email: emptyToNull(input.email),
      phone: emptyToNull(input.phone),
      whatsapp: emptyToNull(input.whatsapp),
      residentialPhone: emptyToNull(input.residential_phone),
      commercialPhone: emptyToNull(input.commercial_phone),
      addressJson: input.address_json ?? {},
      notes: emptyToNull(input.notes),
      status: "active",
      portalToken: randomUUID(),
      portalEnabled: true,
    },
  });

  return serializeOwner(owner);
}

export async function updateMysqlOwner(companyId: string, ownerId: string, input: PropertyInput) {
  await ensureOwnerBelongsToCompany(ownerId, companyId);
  const current = await prisma().propertyOwner.findFirstOrThrow({ where: { id: ownerId, companyId } });
  const ownerType = (input.owner_type ?? current.ownerType) as "individual" | "company";
  const document = "document" in input
    ? await ensureOwnerDocumentAvailable(companyId, input.document, ownerId)
    : current.document;
  if (document && !isValidBrazilianDocument(document, ownerType)) {
    throw Object.assign(new Error("CPF/CNPJ inválido para o tipo de pessoa."), { statusCode: 422, code: "INVALID_OWNER_DOCUMENT" });
  }
  const owner = await prisma().propertyOwner.update({
    where: { id: ownerId },
    data: { ...cleanOwnerUpdate(input), ...(document !== undefined ? { document } : {}) },
  });

  return serializeOwner(owner);
}

export async function archiveMysqlOwner(companyId: string, ownerId: string) {
  await ensureOwnerBelongsToCompany(ownerId, companyId);
  const owner = await prisma().propertyOwner.update({
    where: { id: ownerId },
    data: { status: "archived" },
  });

  return serializeOwner(owner);
}

export async function listMysqlProperties(
  companyId: string,
  input: PropertyListInput,
  database: PrismaClient = prisma(),
  resourceScope?: Prisma.PropertyWhereInput,
) {
  const where = buildPropertyListWhere(companyId, input, resourceScope);
  const [total, properties] = await database.$transaction([
    database.property.count({ where }),
    database.property.findMany({
      where,
      select: propertyListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);

  return {
    items: properties.map(serializePropertySummary),
    pagination: {
      page: input.page,
      page_size: input.pageSize,
      total,
      total_pages: totalPages,
      has_next: input.page < totalPages,
      has_previous: input.page > 1 && total > 0,
    },
  };
}

export async function ensureOwnerDocumentAvailable(companyId: string, rawDocument: unknown, exceptOwnerId?: string) {
  const document = normalizeBrazilianDocument(typeof rawDocument === "string" ? rawDocument : "");
  if (!document) return null;
  const duplicate = await prisma().propertyOwner.findFirst({
    where: { companyId, document, ...(exceptOwnerId ? { id: { not: exceptOwnerId } } : {}) },
    select: { id: true },
  });
  if (duplicate) {
    throw Object.assign(new Error("Já existe um proprietário com este CPF/CNPJ nesta empresa."), {
      statusCode: 409,
      code: "DUPLICATE_OWNER_DOCUMENT",
    });
  }
  return document;
}

export async function listMysqlPropertyContent(
  companyId: string,
  input: PropertyListInput,
  database: PrismaClient = prisma(),
  resourceScope?: Prisma.PropertyWhereInput,
) {
  const where = buildPropertyListWhere(companyId, input, resourceScope);
  const [total, properties] = await database.$transaction([
    database.property.count({ where }),
    database.property.findMany({
      where,
      include: propertyInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);
  const totalPages = total === 0 ? 0 : Math.ceil(total / input.pageSize);
  return {
    items: properties.map(serializeProperty),
    pagination: {
      page: input.page,
      page_size: input.pageSize,
      total,
      total_pages: totalPages,
      has_next: input.page < totalPages,
      has_previous: input.page > 1 && total > 0,
    },
  };
}

export function buildPropertyListWhere(
  companyId: string,
  input: PropertyListInput,
  resourceScope?: Prisma.PropertyWhereInput,
): Prisma.PropertyWhereInput {
  const statusFilter = input.status && input.status !== "all"
    ? input.status === "not_archived" ? { not: "archived" } : input.status
    : undefined;
  const search = input.search?.trim();

  return {
    companyId,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(input.operation ? { operation: input.operation } : {}),
    ...(input.propertyType ? { propertyType: input.propertyType } : {}),
    ...(input.code ? { code: input.code } : {}),
    ...(input.importSource ? { importSource: input.importSource } : {}),
    ...(input.importExternalId ? { importExternalId: input.importExternalId } : {}),
    ...((resourceScope || search)
      ? {
          AND: [
            ...(resourceScope ? [resourceScope] : []),
            ...(search ? [{
          // Item 1 do escopo: busca central multi-tenant precisa cobrir
          // código, título, endereço, bairro, cidade E proprietário — antes
          // faltavam endereço (street) e proprietário (owner.name), o que
          // deixava a busca por "906164"/"taboão" incompleta caso o usuário
          // buscasse pela rua ou pelo nome do dono em vez do código exato.
              OR: [
            { code: { contains: search } },
            { title: { contains: search } },
            { street: { contains: search } },
            { city: { contains: search } },
            { neighborhood: { contains: search } },
            { owner: { name: { contains: search } } },
              ],
            }] : []),
          ],
        }
      : {}),
  };
}

export async function getMysqlProperty(
  companyId: string,
  propertyId: string,
  database: PrismaClient = prisma(),
  resourceScope?: Prisma.PropertyWhereInput,
) {
  const property = await database.property.findFirst({
    where: { id: propertyId, companyId, ...(resourceScope ? { AND: [resourceScope] } : {}) },
    include: propertyInclude,
  });
  if (!property) throw propertyNotFound();
  return serializeProperty(property);
}

export async function getMysqlPropertyByCode(
  companyId: string,
  code: string,
  database: PrismaClient = prisma(),
  resourceScope?: Prisma.PropertyWhereInput,
) {
  const property = await database.property.findFirst({
    where: { companyId, code, ...(resourceScope ? { AND: [resourceScope] } : {}) },
    include: propertyInclude,
  });
  if (!property) throw propertyNotFound();
  return serializeProperty(property);
}

// Serviço central de busca multi-tenant de Property (item 1 do escopo).
//
// Property (Prisma/MySQL) é a entidade canônica única do sistema — Vistoria,
// Agendamento, Contratos, Financeiro, Site e CRM devem SEMPRE resolver um
// imóvel através destas duas funções (nunca duplicar a entidade, nunca
// consultar `code` sozinho sem companyId). Ambas já existiam como
// getMysqlProperty/getMysqlPropertyByCode/listMysqlProperties — os nomes
// abaixo são o ponto de entrada estável e documentado que os módulos
// futuros devem importar; não duplicam a lógica de query, apenas nomeiam a
// intenção "isto é o serviço central" de forma explícita.
//
// Regra dura, sempre respeitada aqui: toda query é escopada por
// companyId. Nunca existe um caminho que aceite só `code` ou só `id` sem
// companyId — reforçado pelo teste cross-tenant em
// tests/property-central-search-multitenant.test.ts.
export async function findPropertyForCompany(
  companyId: string,
  reference: { id?: string; code?: string },
  database: PrismaClient = prisma(),
) {
  if (reference.id) return getMysqlProperty(companyId, reference.id, database);
  if (reference.code) return getMysqlPropertyByCode(companyId, reference.code, database);
  throw propertyNotFound();
}

export async function searchPropertiesForCompany(
  companyId: string,
  input: PropertyListInput,
  database: PrismaClient = prisma(),
) {
  return listMysqlProperties(companyId, input, database);
}

export async function getMysqlPropertyByExternalId(
  companyId: string,
  externalId: string,
  importSource?: string,
  database: PrismaClient = prisma(),
  resourceScope?: Prisma.PropertyWhereInput,
) {
  const properties = await database.property.findMany({
    where: {
      companyId,
      importExternalId: externalId,
      ...(importSource ? { importSource } : {}),
      ...(resourceScope ? { AND: [resourceScope] } : {}),
    },
    include: propertyInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: importSource ? 1 : 2,
  });
  if (properties.length === 0) throw propertyNotFound();
  if (!importSource && properties.length > 1) {
    throw Object.assign(new Error("Informe import_source para desambiguar o identificador externo."), {
      statusCode: 400,
      code: "IMPORT_SOURCE_REQUIRED",
    });
  }
  return serializeProperty(properties[0]);
}

export async function createMysqlProperty(companyId: string, userId: string, input: PropertyInput) {
  const ownerId = await ensureMysqlOwner(companyId, input.owner_id || null);
  const code = input.code || (await generateMysqlPropertyCode(companyId));

  await ensureMysqlPropertyCodeAvailable(companyId, code);

  const property = await prisma().property.create({
    data: {
      ...(propertyDataFromInput(input) as any),
      title: input.title?.trim() || "Rascunho sem título",
      companyId,
      ownerId,
      createdBy: uuidOrNull(userId),
      responsibleUserId: uuidOrNull(input.responsible_user_id || userId),
      code,
    },
    include: propertyInclude,
  });

  if (ownerId) await upsertOwnerLink(prisma(), companyId, property.id, ownerId);
  await syncMysqlPropertyPublication(companyId, property.id);
  return getMysqlProperty(companyId, property.id);
}

export async function updateMysqlProperty(companyId: string, propertyId: string, input: PropertyInput) {
  await ensurePropertyBelongsToCompany(propertyId, companyId);
  if (input.code !== undefined) await ensureMysqlPropertyCodeAvailable(companyId, input.code, propertyId);

  const before = await prisma().property.findFirst({
    where: { id: propertyId, companyId },
    select: { publishedAt: true },
  });
  const readinessFields = ["owner_id", "title", "description", "property_type", "operation", "status", "zip_code", "city", "state"];
  const commercialOnly = Boolean(before?.publishedAt)
    && !Object.keys(input).some((key) => readinessFields.includes(key));

  const ownerId = input.owner_id !== undefined ? await ensureMysqlOwner(companyId, input.owner_id || null) : undefined;
  const property = await prisma().property.update({
    where: { id: propertyId },
    data: {
      ...(propertyDataFromInput(input, true) as any),
      ...(input.owner_id !== undefined ? { ownerId } : {}),
    },
    include: propertyInclude,
  });

  if (input.owner_id !== undefined && ownerId) await upsertOwnerLink(prisma(), companyId, property.id, ownerId);
  await syncMysqlPropertyPublication(companyId, property.id, { preserveExistingOnIncomplete: commercialOnly });
  return getMysqlProperty(companyId, property.id);
}

export async function archiveMysqlProperty(companyId: string, propertyId: string) {
  await ensurePropertyBelongsToCompany(propertyId, companyId);
  const property = await prisma().property.update({
    where: { id: propertyId },
    data: { status: "archived", publishedAt: null },
    include: propertyInclude,
  });

  return serializeProperty(property);
}

export async function listMysqlPropertyMedia(companyId: string, propertyId: string) {
  await ensurePropertyBelongsToCompany(propertyId, companyId);
  const media = await prisma().propertyMedia.findMany({
    where: { companyId, propertyId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return media.map(serializeMedia);
}

export async function countMysqlPropertyMedia(companyId: string, propertyId: string, mediaType?: string) {
  await ensurePropertyBelongsToCompany(propertyId, companyId);
  return prisma().propertyMedia.count({
    where: {
      companyId,
      propertyId,
      ...(mediaType ? { mediaType } : {}),
    },
  });
}

export async function createMysqlPropertyMedia(
  companyId: string,
  propertyId: string,
  input: {
    media_type?: string;
    url: string;
    caption?: string | null;
    position?: number;
    storage_bucket?: string | null;
    storage_path?: string | null;
    mime_type?: string | null;
    file_size?: number | null;
    is_cover?: boolean;
  },
) {
  await ensurePropertyBelongsToCompany(propertyId, companyId);
  if (input.is_cover) {
    await prisma().propertyMedia.updateMany({
      where: { companyId, propertyId },
      data: { isCover: false },
    });
  }

  const media = await prisma().propertyMedia.create({
    data: {
      companyId,
      propertyId,
      mediaType: input.media_type ?? "photo",
      url: input.url,
      caption: input.caption ?? null,
      position: input.position ?? 0,
      storageBucket: input.storage_bucket ?? null,
      storagePath: input.storage_path ?? null,
      mimeType: input.mime_type ?? null,
      fileSize: input.file_size ?? null,
      isCover: Boolean(input.is_cover),
    },
  });
  await syncMysqlPropertyPublication(companyId, propertyId);
  return serializeMedia(media);
}

export async function setMysqlPropertyMediaCover(companyId: string, propertyId: string, mediaId: string) {
  await ensurePropertyBelongsToCompany(propertyId, companyId);
  const target = await prisma().propertyMedia.findFirst({ where: { id: mediaId, companyId, propertyId, mediaType: "photo" } });
  if (!target) throw propertyNotFound();
  await prisma().$transaction([
    prisma().propertyMedia.updateMany({ where: { companyId, propertyId }, data: { isCover: false } }),
    prisma().propertyMedia.update({ where: { id: mediaId }, data: { isCover: true } }),
  ]);
  await syncMysqlPropertyPublication(companyId, propertyId);
  return listMysqlPropertyMedia(companyId, propertyId);
}

export async function reorderMysqlPropertyMedia(
  companyId: string,
  propertyId: string,
  media: Array<{ id: string; position: number }>,
) {
  await ensurePropertyBelongsToCompany(propertyId, companyId);
  for (const item of media) {
    await prisma().propertyMedia.updateMany({
      where: { id: item.id, companyId, propertyId },
      data: { position: item.position },
    });
  }
  return listMysqlPropertyMedia(companyId, propertyId);
}

export async function deleteMysqlPropertyMedia(companyId: string, propertyId: string, mediaId: string) {
  await ensurePropertyBelongsToCompany(propertyId, companyId);
  await prisma().propertyMedia.deleteMany({ where: { id: mediaId, companyId, propertyId } });
  await syncMysqlPropertyPublication(companyId, propertyId);
}

export async function syncMysqlPropertyPublication(
  companyId: string,
  propertyId: string,
  options: { preserveExistingOnIncomplete?: boolean } = {},
) {
  const property = await prisma().property.findFirst({
    where: { id: propertyId, companyId },
    include: { media: { where: { mediaType: "photo", isCover: true }, select: { id: true }, take: 1 } },
  });
  if (!property) throw propertyNotFound();
  const publication: Record<string, unknown> = isRecord(property.publicationSettingsJson)
    ? property.publicationSettingsJson as Record<string, unknown>
    : {};
  const commercial: Record<string, unknown> = isRecord(property.commercialTermsJson)
    ? property.commercialTermsJson as Record<string, unknown>
    : {};
  const seasonPrice = Number(commercial.season_price_cents ?? 0);
  const hasPrice = property.operation === "sale"
    ? Boolean(property.salePriceCents)
    : property.operation === "rent"
      ? Boolean(property.rentPriceCents)
      : property.operation === "season"
        ? seasonPrice > 0
        : Boolean(property.salePriceCents || property.rentPriceCents);
  const ready = Boolean(
    property.ownerId && property.title && property.title !== "Rascunho sem título" && property.description?.trim()
    && property.zipCode && property.city && property.state && hasPrice && property.media.length
    && ["available", "reserved"].includes(property.status),
  );
  const shouldPublish = publication.site_enabled === true && ready;
  // Uma edição comercial (preço/comissão) não deve retirar do ar um imóvel
  // que já estava publicado. A publicação só é criada quando o imóvel fica
  // pronto; depois de publicada, ela permanece até uma ação explícita de
  // despublicação ou exclusão.
  const preserveExistingPublication = Boolean(
    options.preserveExistingOnIncomplete && property.publishedAt && publication.site_enabled !== false,
  );
  const publishedAt = preserveExistingPublication ? property.publishedAt : (shouldPublish ? new Date() : null);
  const siteFeatured = preserveExistingPublication
    ? publication.site_featured === true
    : shouldPublish && publication.site_featured === true;
  if ((property.publishedAt?.getTime() ?? null) !== (publishedAt?.getTime() ?? null) || property.siteFeatured !== siteFeatured) {
    await prisma().property.update({ where: { id: propertyId }, data: { publishedAt, siteFeatured } });
  }
  return { ready, published: Boolean(publishedAt) };
}

export async function ensureMysqlCompanySite(companyId: string, userId: string, batchId?: string) {
  const existing = await prisma().companySite.findFirst({ where: { companyId } });
  if (existing) return { siteId: existing.id, site: serializeCompanySite(existing), created: false };

  const site = await prisma().companySite.create({
    data: {
      companyId,
      createdBy: uuidOrNull(userId),
      slug: `qa-site-${companyId.slice(0, 8).toLowerCase()}`,
      status: "published",
      brandName: "ImobiFlow QA",
      headline: "Vitrine de testes ImobiFlow",
      description: "Site estrutural criado para validar imóveis reais de QA da empresa.",
      phone: "(11) 4000-0000",
      whatsapp: "5511999990000",
      email: "qa@imobiflow.test",
      logoUrl: "/site-templates/imoveis-logo.png",
      primaryColor: "#c8a24b",
      settingsJson: {
        show_full_address: false,
        show_prices: true,
        allow_lead_capture: true,
        auto_publish_properties: true,
        template_key: "premium-gold",
        test_lab: batchId ? { is_test_data: true, test_batch_id: batchId } : undefined,
      },
      seoJson: batchId ? { test_lab: { is_test_data: true, test_batch_id: batchId } } : {},
      publishedAt: new Date(),
    },
  });

  return { siteId: site.id, site: serializeCompanySite(site), created: true };
}

export async function getMysqlPublishedSite(slug: string) {
  const site = await prisma().companySite.findFirst({
    where: { slug, status: "published" },
    include: { company: true },
  });
  if (!site || site.company.status !== "active") throw publicSiteNotFound();

  const subscription = await prisma().subscription.findFirst({
    where: { companyId: site.companyId },
    orderBy: { createdAt: "desc" },
  });
  if (!subscription || !["ACTIVE", "TRIAL"].includes(subscription.status.toUpperCase())) throw publicSiteNotFound();

  return { site, company: site.company };
}

// P0 multiempresa: o slug precisa ser único GLOBALMENTE (não só por
// empresa), pois a rota pública (GET /public/sites/:slug) resolve um único
// site pelo slug, sem saber a qual empresa o visitante se referia. Sem esta
// checagem, duas empresas podiam publicar o mesmo slug — a rota pública
// sempre resolvia para a mesma (arbitrária), inclusive desviando leads
// (nome/telefone/e-mail/mensagem) de visitantes da outra empresa. Ver
// company_sites @@unique([slug]) (migração 202608300003) para o backstop
// no banco; esta função é a checagem de aplicação que devolve um erro
// amigável antes de depender só da constraint.
export async function isSiteSlugTakenByAnotherCompany(companyId: string, slug: string) {
  const existing = await prisma().companySite.findFirst({
    where: { slug, companyId: { not: companyId } },
    select: { id: true },
  });
  return Boolean(existing);
}

export async function loadMysqlPublicProperties(site: { companyId: string; settingsJson: unknown }, limit: number) {
  const properties = await prisma().property.findMany({
    where: {
      companyId: site.companyId,
      status: { in: ["available", "reserved"] },
      publishedAt: { not: null },
    },
    select: publicPropertySelect,
    orderBy: [{ siteFeatured: "desc" }, { publishedAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  return properties.map((property) => serializePublicProperty(property, site));
}

export async function loadMysqlPublicPropertyByReference(
  site: { companyId: string; settingsJson: unknown },
  reference: string,
) {
  if (isUuid(reference)) {
    const property = await prisma().property.findFirst({
      where: {
        id: reference,
        companyId: site.companyId,
        status: { in: ["available", "reserved"] },
        publishedAt: { not: null },
      },
      select: publicPropertySelect,
    });
    if (!property) throw publicPropertyNotFound();
    return serializePublicProperty(property, site);
  }

  // B2 (Fase B): o sufixo de 8 caracteres hex do id já identifica o imóvel de
  // forma praticamente única dentro da empresa (escopo companyId + status +
  // publishedAt). Antes desta correção, um segundo passo (matchesPropertySlug
  // contra o texto completo do slug) invalidava esse casamento sempre que
  // código OU título mudavam depois que o link já tinha sido publicado/
  // compartilhado — ou seja, qualquer edição de imóvel quebrava a própria
  // página pública que a Fase B pede para continuar funcionando após editar
  // (ver B2: "atualiza após edição"). Um link antigo (ex.: já indexado,
  // salvo pelo cliente, enviado por WhatsApp) deve continuar resolvendo o
  // mesmo imóvel mesmo que o texto do slug tenha ficado desatualizado — o
  // texto é só uma âncora de legibilidade, o id é a chave real.
  const shortId = reference.match(/-([a-f0-9]{8})$/i)?.[1];
  const property = await prisma().property.findFirst({
    where: {
      companyId: site.companyId,
      status: { in: ["available", "reserved"] },
      publishedAt: { not: null },
      OR: [
        { code: reference },
        ...(shortId ? [{ id: { startsWith: shortId } }] : []),
      ],
    },
    select: publicPropertySelect,
  });
  if (!property) throw publicPropertyNotFound();
  return serializePublicProperty(property, site);
}

export async function createMysqlPublicLead(params: {
  site: { id: string; companyId: string; slug: string };
  propertyId: string | null;
  input: { name: string; email?: string; phone?: string; message?: string };
  sourceUrl?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const result = await ingestLead({
    companyId: params.site.companyId,
    siteId: params.site.id,
    propertyId: params.propertyId,
    source: "site",
    name: params.input.name,
    email: emptyToNull(params.input.email),
    phone: emptyToNull(params.input.phone),
    message: emptyToNull(params.input.message),
    sourceUrl: params.sourceUrl ?? null,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    provider: "company_site",
    metadata: { channel: "site", site_slug: params.site.slug, page_type: "property" },
  });

  return {
    id: result.lead.id,
    name: result.lead.name,
    email: result.lead.email,
    phone: result.lead.phone,
    source: result.lead.source,
    created_at: result.lead.createdAt.toISOString(),
    matched_existing: result.matchedExisting,
  };
}

export function serializeCompanySite(site: any) {
  return {
    id: site.id,
    company_id: site.companyId,
    slug: site.slug,
    custom_domain: site.customDomain,
    status: site.status,
    brand_name: site.brandName,
    headline: site.headline,
    description: site.description,
    phone: site.phone,
    whatsapp: site.whatsapp,
    email: site.email,
    logo_url: site.logoUrl,
    primary_color: site.primaryColor,
    settings_json: site.settingsJson ?? {},
    seo_json: site.seoJson ?? {},
    published_at: toIso(site.publishedAt),
    created_at: toIso(site.createdAt),
    updated_at: toIso(site.updatedAt),
  };
}

export function publicSiteView(site: any) {
  const serialized = serializeCompanySite(site);
  return {
    id: serialized.id,
    slug: serialized.slug,
    custom_domain: serialized.custom_domain,
    brand_name: serialized.brand_name,
    headline: serialized.headline,
    description: serialized.description,
    phone: serialized.phone,
    whatsapp: serialized.whatsapp,
    email: serialized.email,
    logo_url: serialized.logo_url,
    primary_color: serialized.primary_color,
    settings_json: serialized.settings_json,
    seo_json: serialized.seo_json,
    published_at: serialized.published_at,
  };
}

export function serializeOwner(owner: any) {
  return {
    id: owner.id,
    company_id: owner.companyId,
    owner_type: owner.ownerType,
    client_type: owner.clientType,
    name: owner.name,
    document: owner.document,
    email: owner.email,
    phone: owner.phone,
    whatsapp: owner.whatsapp,
    residential_phone: owner.residentialPhone,
    commercial_phone: owner.commercialPhone,
    address_json: owner.addressJson ?? {},
    notes: owner.notes,
    status: owner.status,
    portal_token: owner.portalToken,
    portal_enabled: owner.portalEnabled,
    portal_last_access_at: toIso(owner.portalLastAccessAt),
    created_at: toIso(owner.createdAt),
    updated_at: toIso(owner.updatedAt),
  };
}

export function serializeProperty(property: any) {
  return {
    id: property.id,
    company_id: property.companyId,
    owner_id: property.ownerId,
    code: property.code,
    title: property.title,
    description: property.description,
    property_type: property.propertyType,
    operation: property.operation,
    status: property.status,
    street: property.street,
    number: property.number,
    complement: property.complement,
    neighborhood: property.neighborhood,
    city: property.city,
    state: property.state,
    country: property.country,
    zip_code: property.zipCode,
    latitude: property.latitude,
    longitude: property.longitude,
    condominium_name: property.condominiumName,
    nearby_highways: Array.isArray(property.nearbyHighways) ? property.nearbyHighways : [],
    responsible_user_id: property.responsibleUserId,
    capture_json: property.captureJson ?? {},
    primary_details_json: property.primaryDetailsJson ?? {},
    measurements_json: property.measurementsJson ?? {},
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    suites: property.suites,
    parking_spaces: property.parkingSpaces,
    private_area: property.privateArea,
    total_area: property.totalArea,
    sale_price_cents: property.salePriceCents,
    rent_price_cents: property.rentPriceCents,
    condominium_fee_cents: property.condominiumFeeCents,
    iptu_cents: property.iptuCents,
    commercial_terms_json: property.commercialTermsJson ?? {},
    features_json: property.featuresJson ?? {},
    amenity_groups_json: property.amenityGroupsJson ?? {},
    videos_json: Array.isArray(property.videosJson) ? property.videosJson : [],
    publication_settings_json: property.publicationSettingsJson ?? {},
    description_template_key: property.descriptionTemplateKey,
    published_at: toIso(property.publishedAt),
    created_at: toIso(property.createdAt),
    updated_at: toIso(property.updatedAt),
    property_owners: property.owner
      ? {
          id: property.owner.id,
          name: property.owner.name,
          phone: property.owner.phone,
          whatsapp: property.owner.whatsapp,
          email: property.owner.email,
        }
      : null,
    // B4 (Fase B): apenas nome (uso interno/admin). Nunca telefone/e-mail
    // aqui — ver nota em propertyInclude.
    responsible_user: property.responsibleUser
      ? { id: property.responsibleUser.id, name: property.responsibleUser.name }
      : null,
    property_media: (property.media ?? property.property_media ?? []).map(serializeMedia),
  };
}

export function serializePropertySummary(property: any) {
  return {
    id: property.id,
    owner_id: property.ownerId,
    code: property.code,
    title: property.title,
    property_type: property.propertyType,
    operation: property.operation,
    status: property.status,
    street: property.street,
    number: property.number,
    complement: property.complement,
    neighborhood: property.neighborhood,
    city: property.city,
    state: property.state,
    country: property.country,
    zip_code: property.zipCode,
    condominium_name: property.condominiumName,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    suites: property.suites,
    parking_spaces: property.parkingSpaces,
    private_area: property.privateArea,
    total_area: property.totalArea,
    sale_price_cents: property.salePriceCents,
    rent_price_cents: property.rentPriceCents,
    condominium_fee_cents: property.condominiumFeeCents,
    iptu_cents: property.iptuCents,
    published_at: toIso(property.publishedAt),
    site_featured: property.siteFeatured === true,
    import_source: property.importSource,
    import_external_id: property.importExternalId,
    created_at: toIso(property.createdAt),
    updated_at: toIso(property.updatedAt),
    property_owners: property.owner
      ? {
          id: property.owner.id,
          name: property.owner.name,
        }
      : null,
    responsible_user: property.responsibleUser
      ? { id: property.responsibleUser.id, name: property.responsibleUser.name }
      : null,
    property_media: (property.media ?? []).map(serializeMediaSummary),
  };
}

function serializeMediaSummary(media: any) {
  return {
    id: media.id,
    media_type: media.mediaType,
    url: media.url,
    caption: media.caption,
    position: media.position,
    is_cover: media.isCover,
    created_at: toIso(media.createdAt),
  };
}

export function serializeMedia(media: any) {
  return {
    id: media.id,
    company_id: media.companyId,
    property_id: media.propertyId,
    media_type: media.mediaType,
    url: media.url,
    caption: media.caption,
    position: media.position,
    storage_bucket: media.storageBucket,
    storage_path: media.storagePath,
    mime_type: media.mimeType,
    file_size: media.fileSize,
    is_cover: media.isCover,
    created_at: toIso(media.createdAt),
  };
}

function propertyNotFound() {
  return Object.assign(new Error("Imóvel não encontrado."), {
    statusCode: 404,
    code: "PROPERTY_NOT_FOUND",
  });
}

export function getPropertySlug(property: { id: string; code?: string | null; title: string }) {
  const base = [property.code, property.title].filter(Boolean).join("-");
  return `${slugify(base || property.id)}-${property.id.slice(0, 8)}`;
}

export function matchesPropertySlug(property: { id: string; code?: string | null; title: string }, reference: string) {
  const lowerReference = reference.toLowerCase();
  return (
    reference === property.id ||
    lowerReference === (property.code ?? "").toLowerCase() ||
    lowerReference === getPropertySlug(property).toLowerCase()
  );
}

function serializePublicProperty(property: any, site: { settingsJson: unknown }) {
  const settings = isRecord(site.settingsJson) ? site.settingsJson : {};
  const showFullAddress = settings.show_full_address === true;
  const showPrices = settings.show_prices !== false;

  return {
    id: property.id,
    code: property.code,
    title: property.title,
    description: property.description,
    property_type: property.propertyType,
    operation: property.operation,
    status: property.status,
    street: showFullAddress ? property.street : null,
    number: showFullAddress ? property.number : null,
    complement: showFullAddress ? property.complement : null,
    neighborhood: property.neighborhood,
    city: property.city,
    state: property.state,
    country: property.country,
    zip_code: showFullAddress ? property.zipCode : null,
    latitude: showFullAddress ? property.latitude : null,
    longitude: showFullAddress ? property.longitude : null,
    condominium_name: showFullAddress ? property.condominiumName : null,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    suites: property.suites,
    parking_spaces: property.parkingSpaces,
    private_area: property.privateArea,
    total_area: property.totalArea,
    sale_price_cents: showPrices ? property.salePriceCents : null,
    rent_price_cents: showPrices ? property.rentPriceCents : null,
    condominium_fee_cents: showPrices ? property.condominiumFeeCents : null,
    iptu_cents: showPrices ? property.iptuCents : null,
    features_json: property.featuresJson ?? {},
    amenity_groups_json: property.amenityGroupsJson ?? {},
    videos_json: Array.isArray(property.videosJson) ? property.videosJson : [],
    site_featured: property.siteFeatured === true,
    published_at: toIso(property.publishedAt),
    // Nome apenas (nunca telefone/e-mail) — ver comentário em
    // publicPropertySelect.responsibleUser.
    responsible_user_name: property.responsibleUser?.name ?? null,
    property_media: (property.media ?? []).map((media: any) => ({
      media_type: media.mediaType,
      url: media.url,
      caption: media.caption,
      position: media.position,
      is_cover: media.isCover,
    })),
  };
}

function propertyDataFromInput(input: PropertyInput, partial = false) {
  const map: Array<[string, string, (value: any) => any]> = [
    ["code", "code", emptyToNull],
    ["title", "title", String],
    ["description", "description", emptyToNull],
    ["property_type", "propertyType", String],
    ["operation", "operation", String],
    ["status", "status", String],
    ["street", "street", emptyToNull],
    ["number", "number", emptyToNull],
    ["complement", "complement", emptyToNull],
    ["neighborhood", "neighborhood", emptyToNull],
    ["city", "city", emptyToNull],
    ["state", "state", emptyToNull],
    ["country", "country", emptyToNull],
    ["zip_code", "zipCode", emptyToNull],
    ["latitude", "latitude", Number],
    ["longitude", "longitude", Number],
    ["condominium_name", "condominiumName", emptyToNull],
    ["responsible_user_id", "responsibleUserId", uuidOrNull],
    ["bedrooms", "bedrooms", numberOrNull],
    ["bathrooms", "bathrooms", numberOrNull],
    ["suites", "suites", numberOrNull],
    ["parking_spaces", "parkingSpaces", numberOrNull],
    ["private_area", "privateArea", numberOrNull],
    ["total_area", "totalArea", numberOrNull],
    ["sale_price_cents", "salePriceCents", numberOrNull],
    ["rent_price_cents", "rentPriceCents", numberOrNull],
    ["condominium_fee_cents", "condominiumFeeCents", numberOrNull],
    ["iptu_cents", "iptuCents", numberOrNull],
    ["description_template_key", "descriptionTemplateKey", emptyToNull],
  ];

  const data: Record<string, any> = {};
  for (const [source, target, transform] of map) {
    if (source in input) data[target] = transform(input[source]);
  }

  const jsonFields: Array<[string, string, unknown]> = [
    ["nearby_highways", "nearbyHighways", []],
    ["capture_json", "captureJson", {}],
    ["primary_details_json", "primaryDetailsJson", {}],
    ["measurements_json", "measurementsJson", {}],
    ["commercial_terms_json", "commercialTermsJson", {}],
    ["features_json", "featuresJson", {}],
    ["amenity_groups_json", "amenityGroupsJson", {}],
    ["videos_json", "videosJson", []],
    ["publication_settings_json", "publicationSettingsJson", {}],
  ];
  for (const [source, target, fallback] of jsonFields) {
    if (source in input) data[target] = input[source] ?? fallback;
    else if (!partial) data[target] = fallback;
  }

  return data;
}

function cleanOwnerUpdate(input: PropertyInput) {
  const data: Record<string, any> = {};
  const map: Array<[string, string, (value: any) => any]> = [
    ["owner_type", "ownerType", String],
    ["client_type", "clientType", String],
    ["name", "name", String],
    ["document", "document", emptyToNull],
    ["email", "email", emptyToNull],
    ["phone", "phone", emptyToNull],
    ["whatsapp", "whatsapp", emptyToNull],
    ["residential_phone", "residentialPhone", emptyToNull],
    ["commercial_phone", "commercialPhone", emptyToNull],
    ["notes", "notes", emptyToNull],
  ];
  for (const [source, target, transform] of map) {
    if (source in input) data[target] = transform(input[source]);
  }
  if ("address_json" in input) data.addressJson = input.address_json ?? {};
  return data;
}

async function ensureMysqlOwner(companyId: string, ownerId: string | null) {
  if (!ownerId) return null;
  const owner = await prisma().propertyOwner.findFirst({ where: { id: ownerId, companyId }, select: { id: true } });
  if (!owner) {
    throw Object.assign(new Error("Proprietário inválido para esta empresa."), {
      statusCode: 422,
      code: "INVALID_OWNER",
    });
  }
  return owner.id;
}

async function generateMysqlPropertyCode(companyId: string) {
  const year = new Date().getFullYear();
  const count = await prisma().property.count({ where: { companyId } });
  return `IMB-${year}-${String(count + 1).padStart(5, "0")}`;
}

async function ensureMysqlPropertyCodeAvailable(companyId: string, code: string | null | undefined, exceptPropertyId?: string) {
  const normalizedCode = code?.trim();
  if (!normalizedCode) return;
  const duplicate = await prisma().property.findFirst({
    where: {
      companyId,
      code: normalizedCode,
      ...(exceptPropertyId ? { id: { not: exceptPropertyId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) {
    throw Object.assign(new Error("Já existe um imóvel cadastrado com este código nesta empresa."), {
      statusCode: 409,
      code: "DUPLICATE_PROPERTY_CODE",
    });
  }
}

async function upsertOwnerLink(client: PrismaClient, companyId: string, propertyId: string, ownerId: string) {
  await client.propertyOwnerLink.upsert({
    where: {
      companyId_propertyId_ownerId: { companyId, propertyId, ownerId },
    },
    create: { companyId, propertyId, ownerId, isMainOwner: true },
    update: { isMainOwner: true },
  });
}

function publicSiteNotFound() {
  return Object.assign(new Error("Site não encontrado."), {
    statusCode: 404,
    code: "PUBLIC_SITE_NOT_FOUND",
  });
}

// Achado real em QA (2026-08-30): loadMysqlPublicPropertyByReference usava
// publicSiteNotFound() também quando o SITE existe e está publicado, mas o
// IMÓVEL específico não foi encontrado, não está publicado, ou foi
// despublicado — fazendo a página pública de um imóvel despublicado exibir
// "Site não encontrado", confundindo o usuário (o site continua no ar; só
// aquele anúncio não está mais visível). Mensagem e código dedicados,
// mesmo status HTTP 404, sem afetar nenhum outro chamador (só usado aqui).
function publicPropertyNotFound() {
  return Object.assign(new Error("Imóvel não encontrado ou não está mais disponível."), {
    statusCode: 404,
    code: "PUBLIC_PROPERTY_NOT_FOUND",
  });
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "imovel"
  );
}

function emptyToNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function numberOrNull(value: unknown) {
  return value === undefined || value === null || value === "" ? null : Number(value);
}

function uuidOrNull(value: unknown) {
  return typeof value === "string" && isUuid(value) ? value : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

// ---------------------------------------------------------------------------
// Fase 2.2B — Compartilhamento explícito de Property (PropertyAccess)
//
// Diretriz Mestre, Seções 9.1/9.2/9.3: um Property tem um responsável
// principal (responsibleUserId) que pode compartilhar explicitamente o
// imóvel com outro usuário da mesma empresa via PropertyAccess (VIEW/EDIT/
// VISIT/INSPECT/NEGOTIATE), sem trocar o responsável. A tabela já existia
// desde a Fase 2.1 (migration 202609010001) — este bloco só adiciona as
// operações de escrita (grant/replace/revoke) e leitura que faltavam.
// Nenhuma migration nova é necessária.
// ---------------------------------------------------------------------------

const propertyAccessInclude = {
  user: { select: { id: true, name: true } },
  grantedByUser: { select: { id: true, name: true } },
} satisfies Prisma.PropertyAccessInclude;

function serializePropertyAccess(row: any) {
  return {
    id: row.id,
    property_id: row.propertyId,
    user_id: row.userId,
    user_name: row.user?.name ?? null,
    permission: row.permission,
    granted_by: row.grantedBy,
    granted_by_name: row.grantedByUser?.name ?? null,
    created_at: toIso(row.createdAt),
  };
}

export async function listMysqlPropertyAccess(
  companyId: string,
  propertyId: string,
  database: PrismaClient = prisma(),
) {
  const rows = await database.propertyAccess.findMany({
    where: { companyId, propertyId },
    include: propertyAccessInclude,
    orderBy: [{ createdAt: "asc" as const }],
  });
  return rows.map(serializePropertyAccess);
}

// Item 8/9 do escopo 2.2B: alvo do compartilhamento precisa ser um AppUser
// ativo da MESMA empresa (nunca confiar em company_id vindo do cliente — o
// companyId aqui vem sempre de req.access!.company.id, nunca do body), com
// papel que já enxergue Property (properties.view ou properties.manage) —
// evita conceder acesso "inútil" a um usuário sem nenhuma visão de Imóveis
// (C2). Auto-compartilhamento é bloqueado (não faz sentido conceder a si
// mesmo o que o usuário já possui por ser o ator da operação).
export async function resolvePropertyShareTarget(
  companyId: string,
  targetUserId: string,
  actorUserId: string,
  database: PrismaClient = prisma(),
) {
  if (targetUserId === actorUserId) {
    throw invalidShareTarget("Não é possível compartilhar um imóvel com você mesmo.");
  }
  const user = await database.appUser.findFirst({
    where: {
      id: targetUserId,
      companyId,
      status: "active",
      roleRecord: {
        permissions: { some: { permission: { key: { in: ["properties.view", "properties.manage"] } } } },
      },
    },
    select: { id: true, name: true },
  });
  if (!user) {
    throw invalidShareTarget("Usuário inválido para compartilhamento nesta empresa.");
  }
  return user;
}

function invalidShareTarget(message: string) {
  return Object.assign(new Error(message), { statusCode: 422, code: "INVALID_SHARE_TARGET" });
}

// GRANT — aditivo e idempotente por permissão (Seção 7 do escopo): concede
// cada permissão pedida sem remover nenhuma permissão existente do usuário
// que não tenha sido mencionada. Reconceder uma permissão já existente é
// um no-op seguro (upsert com update:{} sobre a chave composta
// propertyId_userId_permission já criada na Fase 2.1). Uma única transação
// garante que, se uma permissão for inválida (rejeitada antes da chamada
// pelo Zod na rota), nenhum grant parcial fica persistido.
export async function grantMysqlPropertyAccess(
  companyId: string,
  propertyId: string,
  targetUserId: string,
  permissions: string[],
  grantedBy: string,
) {
  const client = prisma();
  await client.$transaction(
    permissions.map((permission) =>
      client.propertyAccess.upsert({
        where: { propertyId_userId_permission: { propertyId, userId: targetUserId, permission } },
        create: { companyId, propertyId, userId: targetUserId, permission, grantedBy },
        update: {},
      }),
    ),
  );
  return listMysqlPropertyAccess(companyId, propertyId, client);
}

// ATUALIZAÇÃO (replace) — Seção 9 do escopo: resultado final = exatamente o
// conjunto de permissões pedido para aquele (property, user), sem
// duplicatas/órfãos/estado parcial. Remove (na mesma transação) qualquer
// permissão existente fora do conjunto pedido e garante (upsert) as
// permissões do conjunto pedido. Chamar com permissions:[] revoga todas as
// permissões daquele usuário sobre aquele imóvel.
export async function replaceMysqlPropertyAccess(
  companyId: string,
  propertyId: string,
  targetUserId: string,
  permissions: string[],
  grantedBy: string,
) {
  const client = prisma();
  await client.$transaction([
    client.propertyAccess.deleteMany({
      where: {
        companyId,
        propertyId,
        userId: targetUserId,
        ...(permissions.length ? { permission: { notIn: permissions } } : {}),
      },
    }),
    ...permissions.map((permission) =>
      client.propertyAccess.upsert({
        where: { propertyId_userId_permission: { propertyId, userId: targetUserId, permission } },
        create: { companyId, propertyId, userId: targetUserId, permission, grantedBy },
        update: {},
      }),
    ),
  ]);
  return listMysqlPropertyAccess(companyId, propertyId, client);
}

// REVOGAÇÃO (Seção 11 do escopo) — remove exatamente um PropertyAccess por
// id, escopado por company+property (nunca confia em accessId isolado:
// IDOR de outra empresa/imóvel sempre retorna count 0 → rota mapeia para
// 404 tenant-safe). own/company continuam intactos porque não dependem de
// PropertyAccess; revogar um VIEW explícito não quebra um VIEW derivado por
// implicação de EDIT porque grantPermissions("VIEW") em
// buildPropertyScopeFilter olha para QUALQUER permissão remanescente do
// usuário (inclusive EDIT), não apenas para a linha VIEW.
export async function revokeMysqlPropertyAccess(companyId: string, propertyId: string, accessId: string) {
  return prisma().$transaction(async (tx) => {
    const existing = await tx.propertyAccess.findFirst({
      where: { id: accessId, companyId, propertyId },
      select: { id: true, userId: true, permission: true },
    });
    if (!existing) return null;
    await tx.propertyAccess.deleteMany({ where: { id: accessId, companyId, propertyId } });
    return existing;
  });
}
