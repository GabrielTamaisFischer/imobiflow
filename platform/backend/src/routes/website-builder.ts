import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { env } from "../config/env.js";
import { getWebsiteBuilderPrisma } from "../lib/website-builder-prisma.js";
import { validateUploadFile } from "../services/storage/file-policy.js";
import { buildStorageFolder, getStorageProvider, getStorageProviderForName } from "../services/storage/index.js";
import {
  createStoredFileRecord,
  deleteStoredFileRecordsForEntity,
  findStoredFileForEntity,
} from "../services/storage/stored-files.js";
import type { StorageProviderName, StorageResourceType, StoragePurpose } from "../services/storage/types.js";
import {
  buildBlankHomePageTemplate,
  normalizeTemplateStructure,
  sanitizeWebsiteSlug,
  websitePageTypeSchema,
} from "../services/website-builder-foundation.js";
import {
  getWebsiteBuilderSectionBlock,
  listWebsiteBuilderSectionBlocks,
} from "../services/website-builder-block-library.js";
import {
  buildWebsiteDomainDnsChecklist,
  normalizeWebsiteDomain,
} from "../services/website-builder-domain.js";
import {
  createWebsiteBuilderAuditLog,
  type WebsiteBuilderAuditInput,
} from "../services/website-builder-audit.js";
import { buildWebsiteBuilderFoundationStatus } from "../services/website-builder-status.js";
import { ensureSystemWebsiteTemplates } from "../services/website-builder-system-templates.js";
import type { RequestWithAccess } from "../types/access.js";

export const websiteBuilderRouter = Router();

websiteBuilderRouter.use(requireAuth, requireCompany, requireActiveSubscription, requirePermission("site.manage"));

const jsonRecord = z.record(z.unknown()).default({});

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return (value ?? {}) as Prisma.InputJsonValue;
}

function toOptionalInputJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : ((value ?? {}) as Prisma.InputJsonValue);
}

type WebsiteAuditLogReader = {
  websiteAuditLog: {
    findMany: (input: {
      where: { companyId: string; websiteId: string };
      orderBy: { createdAt: "desc" };
      take: number;
    }) => Promise<unknown[]>;
  };
};

type WebsiteCodeFileDelegate = {
  findFirst: (input: Record<string, unknown>) => Promise<any>;
  findMany: (input: Record<string, unknown>) => Promise<any[]>;
  create: (input: Record<string, unknown>) => Promise<any>;
  update: (input: Record<string, unknown>) => Promise<any>;
};

function websiteCodeFileDelegate(prisma: unknown): WebsiteCodeFileDelegate {
  return (prisma as { websiteCodeFile: WebsiteCodeFileDelegate }).websiteCodeFile;
}

const websiteSchema = z.object({
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  settings_json: jsonRecord.optional(),
  theme_json: jsonRecord.optional(),
});

const pageSchema = z.object({
  title: z.string().min(2).max(160),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  page_type: websitePageTypeSchema.default("custom"),
  status: z.enum(["draft", "published", "hidden", "archived"]).default("draft"),
  sort_order: z.number().int().nonnegative().optional(),
  seo_json: jsonRecord.optional(),
  settings_json: jsonRecord.optional(),
});

const sectionSchema = z.object({
  name: z.string().min(2).max(160),
  section_type: z.string().min(2).max(80),
  sort_order: z.number().int().nonnegative().optional(),
  props_json: jsonRecord.optional(),
  style_json: jsonRecord.optional(),
  responsive_json: jsonRecord.optional(),
  animation_json: jsonRecord.optional(),
  is_visible: z.boolean().optional(),
});

const componentSchema = z.object({
  name: z.string().min(2).max(160),
  component_type: z.string().min(2).max(80),
  parent_component_id: z.string().uuid().optional().or(z.literal("")),
  sort_order: z.number().int().nonnegative().optional(),
  props_json: jsonRecord.optional(),
  style_json: jsonRecord.optional(),
  responsive_json: jsonRecord.optional(),
  animation_json: jsonRecord.optional(),
  interaction_json: jsonRecord.optional(),
  is_visible: z.boolean().optional(),
  is_locked: z.boolean().optional(),
});

const templateCloneSchema = z.object({
  template_id: z.string().uuid(),
  name: z.string().min(2).max(160),
  slug: z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
});

const assetUploadSchema = z.object({
  website_id: z.string().uuid().optional().or(z.literal("")),
  file_name: z.string().min(1).max(220),
  mime_type: z.string().min(3).max(120),
  file_size: z.number().int().nonnegative().optional(),
  content_base64: z.string().min(1),
  asset_type: z.enum(["image", "video", "document", "icon", "font", "other"]).default("other"),
  metadata_json: jsonRecord.optional(),
});

const createSectionFromBlockSchema = z.object({
  block_key: z.string().min(2).max(120),
  sort_order: z.number().int().nonnegative().optional(),
});

const domainSchema = z.object({
  domain: z.string().min(4).max(180),
  is_primary: z.boolean().optional(),
});

const seoSchema = z.object({
  page_id: z.string().uuid().optional().or(z.literal("")),
  title: z.string().max(180).optional().or(z.literal("")),
  description: z.string().max(320).optional().or(z.literal("")),
  canonical_url: z.string().max(500).optional().or(z.literal("")),
  og_image_asset_id: z.string().uuid().optional().or(z.literal("")),
  schema_json: jsonRecord.optional(),
});

const codeFileLanguageSchema = z.enum(["html", "css", "javascript", "json", "tsx", "ts", "markdown"]);

const codeFileSchema = z.object({
  page_id: z.string().uuid().optional().or(z.literal("")),
  file_path: z.string().min(1).max(500).regex(/^[a-zA-Z0-9_./-]+$/),
  file_type: z.string().min(2).max(80),
  language: codeFileLanguageSchema,
  content: z.string().max(2_000_000).default(""),
});

const codeFileUpdateSchema = codeFileSchema.partial().extend({
  content: z.string().max(2_000_000).optional(),
});

function companyId(req: RequestWithAccess) {
  return req.access!.company.id;
}

function userId(req: RequestWithAccess) {
  return req.access!.appUser.id;
}

function routeParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function notFound(message = "Registro não encontrado.") {
  return Object.assign(new Error(message), { statusCode: 404 });
}

function conflict(message: string) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function badRequest(message: string, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function validateCodeFileSafety(input: { file_path?: string; language?: string; content?: string }) {
  const content = input.content ?? "";
  const dangerousPatterns = [
    { pattern: /document\.cookie/i, label: "document.cookie" },
    { pattern: /\blocalStorage\b/i, label: "localStorage" },
    { pattern: /\bsessionStorage\b/i, label: "sessionStorage" },
    { pattern: /\bindexedDB\b/i, label: "indexedDB" },
    { pattern: /\beval\s*\(/i, label: "eval()" },
    { pattern: /new\s+Function\s*\(/i, label: "new Function()" },
    { pattern: /\bimportScripts\s*\(/i, label: "importScripts()" },
  ];

  const match = dangerousPatterns.find((rule) => rule.pattern.test(content));
  if (match) {
    throw badRequest(`Código bloqueado por segurança: uso de ${match.label}.`);
  }

  if (input.language === "json" || input.file_path?.endsWith(".json")) {
    try {
      JSON.parse(content || "{}");
    } catch {
      throw badRequest("JSON inválido. Corrija a sintaxe antes de salvar.");
    }
  }
}

function handlePrismaError(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    throw conflict("Já existe um registro com esses dados nesta empresa.");
  }

  throw error;
}

async function getWebsiteOrThrow(company: string, websiteId: string) {
  const prisma = getWebsiteBuilderPrisma();
  const website = await prisma.website.findFirst({
    where: { id: websiteId, companyId: company, deletedAt: null },
  });

  if (!website) throw notFound("Site não encontrado para esta empresa.");
  return website;
}

async function getPageOrThrow(company: string, pageId: string) {
  const prisma = getWebsiteBuilderPrisma();
  const page = await prisma.websitePage.findFirst({
    where: { id: pageId, companyId: company, deletedAt: null },
  });

  if (!page) throw notFound("Página não encontrada para esta empresa.");
  return page;
}

async function getSectionOrThrow(company: string, sectionId: string) {
  const prisma = getWebsiteBuilderPrisma();
  const section = await prisma.websiteSection.findFirst({
    where: { id: sectionId, companyId: company, deletedAt: null },
  });

  if (!section) throw notFound("Seção não encontrada para esta empresa.");
  return section;
}

async function getAssetOrThrow(company: string, assetId: string) {
  const prisma = getWebsiteBuilderPrisma();
  const asset = await prisma.websiteAsset.findFirst({
    where: { id: assetId, companyId: company, deletedAt: null },
  });

  if (!asset) throw notFound("Asset não encontrado para esta empresa.");
  return asset;
}

async function getDomainOrThrow(company: string, domainId: string) {
  const prisma = getWebsiteBuilderPrisma();
  const domain = await prisma.websiteDomain.findFirst({
    where: { id: domainId, companyId: company, status: { not: "disabled" } },
  });

  if (!domain) throw notFound("Domínio não encontrado para esta empresa.");
  return domain;
}

async function getCodeFileOrThrow(company: string, codeFileId: string) {
  const prisma = getWebsiteBuilderPrisma();
  const codeFile = await websiteCodeFileDelegate(prisma).findFirst({
    where: { id: codeFileId, companyId: company, deletedAt: null },
  });

  if (!codeFile) throw notFound("Arquivo de código não encontrado para esta empresa.");
  return codeFile;
}

async function nextVersionNumber(company: string, websiteId: string) {
  const prisma = getWebsiteBuilderPrisma();
  const last = await prisma.websiteVersion.findFirst({
    where: { companyId: company, websiteId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  return (last?.versionNumber ?? 0) + 1;
}

async function createWebsiteVersion(company: string, websiteId: string, actorId: string, label: string) {
  const prisma = getWebsiteBuilderPrisma();
  const snapshot = await prisma.website.findFirst({
    where: { id: websiteId, companyId: company, deletedAt: null },
    include: {
      pages: {
        where: { deletedAt: null },
        orderBy: { sortOrder: "asc" },
        include: {
          sections: {
            where: { deletedAt: null },
            orderBy: { sortOrder: "asc" },
            include: {
              components: {
                where: { deletedAt: null },
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!snapshot) return;

  await prisma.websiteVersion.create({
    data: {
      companyId: company,
      websiteId,
      versionNumber: await nextVersionNumber(company, websiteId),
      label,
      snapshotJson: JSON.parse(JSON.stringify(snapshot)),
      createdById: actorId,
    },
  });
}

async function auditWebsiteBuilderAction(req: RequestWithAccess, input: WebsiteBuilderAuditInput) {
  const prisma = getWebsiteBuilderPrisma();
  await createWebsiteBuilderAuditLog(prisma as never, req, input);
}

websiteBuilderRouter.get("/status", async (_req: RequestWithAccess, res, next) => {
  try {
    res.json({
      status: buildWebsiteBuilderFoundationStatus(env),
    });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    const websites = await prisma.website.findMany({
      where: { companyId: companyId(req), deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { pages: true, assets: true, versions: true } },
      },
    });

    res.json({ websites });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/websites", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    const input = websiteSchema.parse(req.body);
    const company = companyId(req);
    const actorId = userId(req);
    const website = await prisma.website.create({
      data: {
        companyId: company,
        name: input.name,
        slug: input.slug ?? sanitizeWebsiteSlug(input.name),
        settingsJson: toInputJson(input.settings_json),
        themeJson: toInputJson(input.theme_json),
        createdById: actorId,
        updatedById: actorId,
      },
    });

    await createWebsiteVersion(company, website.id, actorId, "Site criado");
    await auditWebsiteBuilderAction(req, {
      action: "website_created",
      entityType: "website",
      entityId: website.id,
      websiteId: website.id,
      summary: `Site criado: ${website.name}`,
      metadata: { slug: website.slug },
    });
    res.status(201).json({ website });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.post("/websites/blank", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    const input = websiteSchema.parse(req.body);
    const company = companyId(req);
    const actorId = userId(req);
    const homePage = buildBlankHomePageTemplate();

    const website = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.website.create({
        data: {
          companyId: company,
          name: input.name,
          slug: input.slug ?? sanitizeWebsiteSlug(input.name),
          settingsJson: toInputJson(input.settings_json),
          themeJson: toInputJson(input.theme_json),
          createdById: actorId,
          updatedById: actorId,
        },
      });

      await tx.websitePage.create({
        data: {
          companyId: company,
          websiteId: created.id,
          title: homePage.title,
          slug: homePage.slug,
          pageType: homePage.pageType,
          sortOrder: 0,
          seoJson: {},
          settingsJson: toInputJson(undefined),
          createdById: actorId,
          updatedById: actorId,
        },
      });

      return created;
    });

    await createWebsiteVersion(company, website.id, actorId, "Site em branco criado");
    await auditWebsiteBuilderAction(req, {
      action: "website_created",
      entityType: "website",
      entityId: website.id,
      websiteId: website.id,
      summary: `Site em branco criado: ${website.name}`,
      metadata: { slug: website.slug, source: "blank" },
    });
    res.status(201).json({ website });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.post("/websites/from-template", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    await ensureSystemWebsiteTemplates(prisma);
    const input = templateCloneSchema.parse(req.body);
    const company = companyId(req);
    const actorId = userId(req);
    const template = await prisma.websiteTemplate.findFirst({
      where: {
        id: input.template_id,
        isActive: true,
        OR: [{ companyId: company }, { companyId: "system", isSystem: true }],
      },
    });

    if (!template) throw notFound("Template não encontrado.");

    const structure = normalizeTemplateStructure(template.structureJson);

    const website = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.website.create({
        data: {
          companyId: company,
          templateId: template.id,
          name: input.name,
          slug: input.slug ?? sanitizeWebsiteSlug(input.name),
          settingsJson: toInputJson(undefined),
          themeJson: toInputJson(template.themeJson),
          createdById: actorId,
          updatedById: actorId,
        },
      });

      for (const [pageIndex, page] of structure.pages.entries()) {
        const createdPage = await tx.websitePage.create({
          data: {
            companyId: company,
            websiteId: created.id,
            title: page.title,
            slug: sanitizeWebsiteSlug(page.slug),
            pageType: page.pageType,
            sortOrder: pageIndex,
            seoJson: {},
            settingsJson: {},
            createdById: actorId,
            updatedById: actorId,
          },
        });

        for (const [sectionIndex, section] of page.sections.entries()) {
          const createdSection = await tx.websiteSection.create({
            data: {
              companyId: company,
              websiteId: created.id,
              pageId: createdPage.id,
              name: section.name,
              sectionType: section.sectionType,
              sortOrder: sectionIndex,
              propsJson: toInputJson(section.propsJson),
              styleJson: toInputJson(section.styleJson),
              responsiveJson: toInputJson(section.responsiveJson),
              animationJson: toInputJson(section.animationJson),
            },
          });

          for (const [componentIndex, component] of section.components.entries()) {
            await tx.websiteComponent.create({
              data: {
                companyId: company,
                websiteId: created.id,
                pageId: createdPage.id,
                sectionId: createdSection.id,
                name: component.name,
                componentType: component.componentType,
                sortOrder: componentIndex,
                propsJson: toInputJson(component.propsJson),
                styleJson: toInputJson(component.styleJson),
                responsiveJson: toInputJson(component.responsiveJson),
                animationJson: toInputJson(component.animationJson),
                interactionJson: toInputJson(component.interactionJson),
              },
            });
          }
        }
      }

      return created;
    });

    await createWebsiteVersion(company, website.id, actorId, `Template clonado: ${template.name}`);
    await auditWebsiteBuilderAction(req, {
      action: "website_cloned",
      entityType: "website",
      entityId: website.id,
      websiteId: website.id,
      summary: `Template clonado: ${template.name}`,
      metadata: { slug: website.slug, templateId: template.id, templateSlug: template.slug },
    });
    res.status(201).json({ website });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.get("/templates", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    await ensureSystemWebsiteTemplates(prisma);
    const company = companyId(req);
    const templates = await prisma.websiteTemplate.findMany({
      where: {
        isActive: true,
        OR: [{ companyId: company }, { companyId: "system", isSystem: true }],
      },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });

    res.json({ templates });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/section-blocks", async (req: RequestWithAccess, res, next) => {
  try {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    res.json({ blocks: listWebsiteBuilderSectionBlocks(category) });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/pages/:pageId/section-blocks", async (req: RequestWithAccess, res, next) => {
  try {
    const page = await getPageOrThrow(companyId(req), routeParam(req.params.pageId));
    const input = createSectionFromBlockSchema.parse(req.body);
    const block = getWebsiteBuilderSectionBlock(input.block_key);
    if (!block) throw notFound("Bloco de seção não encontrado.");

    const prisma = getWebsiteBuilderPrisma();
    const section = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const createdSection = await tx.websiteSection.create({
        data: {
          companyId: companyId(req),
          websiteId: page.websiteId,
          pageId: page.id,
          name: block.name,
          sectionType: block.sectionType,
          sortOrder: input.sort_order ?? 0,
          propsJson: toInputJson(block.propsJson),
          styleJson: toInputJson(block.styleJson),
          responsiveJson: toInputJson(block.responsiveJson),
          animationJson: toInputJson(block.animationJson),
          isVisible: true,
        },
      });

      for (const [componentIndex, component] of block.components.entries()) {
        await tx.websiteComponent.create({
          data: {
            companyId: companyId(req),
            websiteId: page.websiteId,
            pageId: page.id,
            sectionId: createdSection.id,
            name: component.name,
            componentType: component.componentType,
            sortOrder: componentIndex,
            propsJson: toInputJson(component.propsJson),
            styleJson: toInputJson(component.styleJson),
            responsiveJson: toInputJson(component.responsiveJson),
            animationJson: toInputJson(component.animationJson),
            interactionJson: toInputJson(component.interactionJson),
            isVisible: true,
            isLocked: false,
          },
        });
      }

      return createdSection;
    });

    await createWebsiteVersion(companyId(req), page.websiteId, userId(req), `Bloco criado: ${block.name}`);
    await auditWebsiteBuilderAction(req, {
      action: "section_created",
      entityType: "website_section",
      entityId: section.id,
      websiteId: page.websiteId,
      pageId: page.id,
      sectionId: section.id,
      summary: `Bloco estrutural criado: ${block.name}`,
      metadata: { blockKey: input.block_key, sectionType: section.sectionType },
    });
    res.status(201).json({ section });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id/versions", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const versions = await prisma.websiteVersion.findMany({
      where: { companyId: companyId(req), websiteId: website.id },
      orderBy: { versionNumber: "desc" },
      take: 50,
      select: {
        id: true,
        companyId: true,
        websiteId: true,
        versionNumber: true,
        label: true,
        createdById: true,
        createdAt: true,
      },
    });

    res.json({ versions });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/websites/:id/versions/:versionId/restore", async (req: RequestWithAccess, res, next) => {
  try {
    const company = companyId(req);
    const website = await getWebsiteOrThrow(company, routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const version = await prisma.websiteVersion.findFirst({
      where: { id: routeParam(req.params.versionId), companyId: company, websiteId: website.id },
    });

    if (!version) throw notFound("Versão não encontrada para este site.");

    const snapshot = version.snapshotJson as Record<string, any>;
    const pages = Array.isArray(snapshot.pages) ? snapshot.pages : [];

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.websiteComponent.deleteMany({ where: { companyId: company, websiteId: website.id } });
      await tx.websiteSection.deleteMany({ where: { companyId: company, websiteId: website.id } });
      await tx.websitePage.deleteMany({ where: { companyId: company, websiteId: website.id } });

      await tx.website.update({
        where: { id: website.id },
        data: {
          name: String(snapshot.name ?? website.name),
          slug: String(snapshot.slug ?? website.slug),
          status: snapshot.status ?? website.status,
          settingsJson: toInputJson(snapshot.settingsJson),
          themeJson: toInputJson(snapshot.themeJson),
          updatedById: userId(req),
          deletedAt: null,
        },
      });

      for (const page of pages) {
        await tx.websitePage.create({
          data: {
            id: page.id,
            companyId: company,
            websiteId: website.id,
            title: String(page.title ?? "Página"),
            slug: String(page.slug ?? "pagina"),
            pageType: page.pageType ?? "custom",
            status: page.status ?? "draft",
            sortOrder: Number(page.sortOrder ?? 0),
            seoJson: toInputJson(page.seoJson),
            settingsJson: toInputJson(page.settingsJson),
            createdById: page.createdById ?? userId(req),
            updatedById: userId(req),
            deletedAt: null,
          },
        });

        const sections = Array.isArray(page.sections) ? page.sections : [];
        for (const section of sections) {
          await tx.websiteSection.create({
            data: {
              id: section.id,
              companyId: company,
              websiteId: website.id,
              pageId: page.id,
              name: String(section.name ?? "Seção"),
              sectionType: String(section.sectionType ?? "section"),
              sortOrder: Number(section.sortOrder ?? 0),
              propsJson: toInputJson(section.propsJson),
              styleJson: toInputJson(section.styleJson),
              responsiveJson: toInputJson(section.responsiveJson),
              animationJson: toInputJson(section.animationJson),
              isVisible: section.isVisible !== false,
              deletedAt: null,
            },
          });

          const components = Array.isArray(section.components) ? section.components : [];
          for (const component of components) {
            await tx.websiteComponent.create({
              data: {
                id: component.id,
                companyId: company,
                websiteId: website.id,
                pageId: page.id,
                sectionId: section.id,
                parentComponentId: component.parentComponentId ?? null,
                name: String(component.name ?? "Componente"),
                componentType: String(component.componentType ?? "component"),
                sortOrder: Number(component.sortOrder ?? 0),
                propsJson: toInputJson(component.propsJson),
                styleJson: toInputJson(component.styleJson),
                responsiveJson: toInputJson(component.responsiveJson),
                animationJson: toInputJson(component.animationJson),
                interactionJson: toInputJson(component.interactionJson),
                isVisible: component.isVisible !== false,
                isLocked: component.isLocked === true,
                deletedAt: null,
              },
            });
          }
        }
      }
    });

    await createWebsiteVersion(company, website.id, userId(req), `Versão ${version.versionNumber} restaurada`);
    await auditWebsiteBuilderAction(req, {
      action: "website_updated",
      entityType: "website",
      entityId: website.id,
      websiteId: website.id,
      summary: `Versão ${version.versionNumber} restaurada`,
      metadata: { restored_version_id: version.id, restored_version_number: version.versionNumber },
    });

    res.json({ restored: true });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id/publish-logs", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const publishLogs = await prisma.websitePublishLog.findMany({
      where: { companyId: companyId(req), websiteId: website.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ publish_logs: publishLogs });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id/audit-logs", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const auditLogs = await (prisma as unknown as WebsiteAuditLogReader).websiteAuditLog.findMany({
      where: { companyId: companyId(req), websiteId: website.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ audit_logs: auditLogs });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id/domains", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const domains = await prisma.websiteDomain.findMany({
      where: { companyId: companyId(req), websiteId: website.id, status: { not: "disabled" } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });

    res.json({ domains });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/websites/:id/domains", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const input = domainSchema.parse(req.body);
    const prisma = getWebsiteBuilderPrisma();
    const domainName = normalizeWebsiteDomain(input.domain);

    const domain = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.is_primary) {
        await tx.websiteDomain.updateMany({
          where: { companyId: companyId(req), websiteId: website.id },
          data: { isPrimary: false },
        });
      }

      return tx.websiteDomain.create({
        data: {
          companyId: companyId(req),
          websiteId: website.id,
          domain: domainName,
          status: "pending",
          isPrimary: input.is_primary ?? false,
          dnsJson: buildWebsiteDomainDnsChecklist(domainName, website.slug),
        },
      });
    });

    await createWebsiteVersion(companyId(req), website.id, userId(req), `Domínio adicionado: ${domain.domain}`);
    await auditWebsiteBuilderAction(req, {
      action: "domain_created",
      entityType: "website_domain",
      entityId: domain.id,
      websiteId: website.id,
      summary: `Domínio adicionado: ${domain.domain}`,
      metadata: { domain: domain.domain, isPrimary: domain.isPrimary },
    });
    res.status(201).json({ domain });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.put("/domains/:domainId", async (req: RequestWithAccess, res, next) => {
  try {
    const current = await getDomainOrThrow(companyId(req), routeParam(req.params.domainId));
    const website = await getWebsiteOrThrow(companyId(req), current.websiteId);
    const input = domainSchema.partial().parse(req.body);
    const prisma = getWebsiteBuilderPrisma();
    const domainName = input.domain ? normalizeWebsiteDomain(input.domain) : current.domain;

    const domain = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (input.is_primary) {
        await tx.websiteDomain.updateMany({
          where: { companyId: companyId(req), websiteId: current.websiteId },
          data: { isPrimary: false },
        });
      }

      return tx.websiteDomain.update({
        where: { id: current.id },
        data: {
          domain: domainName,
          isPrimary: input.is_primary,
          dnsJson: toOptionalInputJson(input.domain ? buildWebsiteDomainDnsChecklist(domainName, website.slug) : undefined),
        },
      });
    });

    await createWebsiteVersion(companyId(req), domain.websiteId, userId(req), `Domínio atualizado: ${domain.domain}`);
    await auditWebsiteBuilderAction(req, {
      action: "domain_updated",
      entityType: "website_domain",
      entityId: domain.id,
      websiteId: domain.websiteId,
      summary: `Domínio atualizado: ${domain.domain}`,
      metadata: { domain: domain.domain, isPrimary: domain.isPrimary },
    });
    res.json({ domain });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.delete("/domains/:domainId", async (req: RequestWithAccess, res, next) => {
  try {
    const current = await getDomainOrThrow(companyId(req), routeParam(req.params.domainId));
    const prisma = getWebsiteBuilderPrisma();
    const domain = await prisma.websiteDomain.update({
      where: { id: current.id },
      data: { status: "disabled", isPrimary: false },
    });

    await createWebsiteVersion(companyId(req), domain.websiteId, userId(req), `Domínio desativado: ${domain.domain}`);
    await auditWebsiteBuilderAction(req, {
      action: "domain_deleted",
      entityType: "website_domain",
      entityId: domain.id,
      websiteId: domain.websiteId,
      summary: `Domínio desativado: ${domain.domain}`,
      metadata: { domain: domain.domain },
    });
    res.json({ domain });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id/seo", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const seo = await prisma.websiteSeo.findMany({
      where: { companyId: companyId(req), websiteId: website.id },
      orderBy: [{ pageId: "asc" }, { updatedAt: "desc" }],
    });

    res.json({ seo });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.put("/websites/:id/seo", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const input = seoSchema.parse(req.body);
    const prisma = getWebsiteBuilderPrisma();
    const pageId = input.page_id || null;

    if (pageId) {
      const page = await getPageOrThrow(companyId(req), pageId);
      if (page.websiteId !== website.id) throw notFound("Página não pertence a este site.");
    }

    if (input.og_image_asset_id) await getAssetOrThrow(companyId(req), input.og_image_asset_id);

    const current = await prisma.websiteSeo.findFirst({
      where: { companyId: companyId(req), websiteId: website.id, pageId },
      orderBy: { updatedAt: "desc" },
    });

    const data = {
      title: input.title || null,
      description: input.description || null,
      canonicalUrl: input.canonical_url || null,
      ogImageAssetId: input.og_image_asset_id || null,
      schemaJson: toInputJson(input.schema_json),
    };

    const seo = current
      ? await prisma.websiteSeo.update({
          where: { id: current.id },
          data,
        })
      : await prisma.websiteSeo.create({
          data: {
            companyId: companyId(req),
            websiteId: website.id,
            pageId,
            ...data,
          },
        });

    await createWebsiteVersion(companyId(req), website.id, userId(req), pageId ? "SEO da página atualizado" : "SEO global atualizado");
    await auditWebsiteBuilderAction(req, {
      action: "seo_updated",
      entityType: "website_seo",
      entityId: seo.id,
      websiteId: website.id,
      pageId,
      summary: pageId ? "SEO da página atualizado" : "SEO global atualizado",
      metadata: { title: seo.title, canonicalUrl: seo.canonicalUrl, hasOgImage: Boolean(seo.ogImageAssetId) },
    });
    res.json({ seo });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id/code-files", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const codeFiles = await websiteCodeFileDelegate(prisma).findMany({
      where: { companyId: companyId(req), websiteId: website.id, deletedAt: null },
      orderBy: { filePath: "asc" },
    });

    await auditWebsiteBuilderAction(req, {
      action: "code_editor_opened",
      entityType: "website_code_editor",
      websiteId: website.id,
      summary: `Editor de código aberto: ${website.name}`,
      metadata: { files: codeFiles.length },
    });

    res.json({ code_files: codeFiles });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id/code-files/:fileId", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const codeFile = await getCodeFileOrThrow(companyId(req), routeParam(req.params.fileId));
    if (codeFile.websiteId !== website.id) throw notFound("Arquivo de código não pertence a este site.");

    await auditWebsiteBuilderAction(req, {
      action: "code_file_selected",
      entityType: "website_code_file",
      entityId: codeFile.id,
      websiteId: website.id,
      pageId: codeFile.pageId,
      summary: `Arquivo de código selecionado: ${codeFile.filePath}`,
      metadata: { filePath: codeFile.filePath, language: codeFile.language },
    });

    res.json({ code_file: codeFile });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/websites/:id/code-files", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const input = codeFileSchema.parse(req.body);
    validateCodeFileSafety(input);

    const pageId = input.page_id || null;
    if (pageId) {
      const page = await getPageOrThrow(companyId(req), pageId);
      if (page.websiteId !== website.id) throw notFound("Página não pertence a este site.");
    }

    const prisma = getWebsiteBuilderPrisma();
    const codeFile = await websiteCodeFileDelegate(prisma).create({
      data: {
        companyId: companyId(req),
        websiteId: website.id,
        pageId,
        filePath: input.file_path,
        fileType: input.file_type,
        language: input.language,
        content: input.content,
        createdById: userId(req),
        updatedById: userId(req),
      },
    });

    await createWebsiteVersion(companyId(req), website.id, userId(req), `Arquivo de código criado: ${codeFile.filePath}`);
    await auditWebsiteBuilderAction(req, {
      action: "code_file_created",
      entityType: "website_code_file",
      entityId: codeFile.id,
      websiteId: website.id,
      pageId: codeFile.pageId,
      summary: `Arquivo de código criado: ${codeFile.filePath}`,
      metadata: { filePath: codeFile.filePath, language: codeFile.language, fileType: codeFile.fileType },
    });

    res.status(201).json({ code_file: codeFile });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.put("/websites/:id/code-files/:fileId", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const current = await getCodeFileOrThrow(companyId(req), routeParam(req.params.fileId));
    if (current.websiteId !== website.id) throw notFound("Arquivo de código não pertence a este site.");

    const input = codeFileUpdateSchema.parse(req.body);
    const nextPageId = input.page_id === "" ? null : input.page_id ?? current.pageId;
    if (nextPageId) {
      const page = await getPageOrThrow(companyId(req), nextPageId);
      if (page.websiteId !== website.id) throw notFound("Página não pertence a este site.");
    }

    validateCodeFileSafety({
      file_path: input.file_path ?? current.filePath,
      language: input.language ?? current.language,
      content: input.content ?? current.content,
    });

    const prisma = getWebsiteBuilderPrisma();
    const codeFile = await websiteCodeFileDelegate(prisma).update({
      where: { id: current.id },
      data: {
        pageId: nextPageId,
        filePath: input.file_path,
        fileType: input.file_type,
        language: input.language,
        content: input.content,
        updatedById: userId(req),
      },
    });

    await createWebsiteVersion(companyId(req), website.id, userId(req), `Arquivo de código salvo: ${codeFile.filePath}`);
    await auditWebsiteBuilderAction(req, {
      action: "code_file_updated",
      entityType: "website_code_file",
      entityId: codeFile.id,
      websiteId: website.id,
      pageId: codeFile.pageId,
      summary: `Arquivo de código atualizado: ${codeFile.filePath}`,
      metadata: { filePath: codeFile.filePath, language: codeFile.language, fileType: codeFile.fileType },
    });
    await auditWebsiteBuilderAction(req, {
      action: "code_editor_saved",
      entityType: "website_code_editor",
      entityId: codeFile.id,
      websiteId: website.id,
      pageId: codeFile.pageId,
      summary: `Editor de código salvo: ${codeFile.filePath}`,
      metadata: { filePath: codeFile.filePath },
    });

    res.json({ code_file: codeFile });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.delete("/websites/:id/code-files/:fileId", async (req: RequestWithAccess, res, next) => {
  try {
    const website = await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const current = await getCodeFileOrThrow(companyId(req), routeParam(req.params.fileId));
    if (current.websiteId !== website.id) throw notFound("Arquivo de código não pertence a este site.");

    const prisma = getWebsiteBuilderPrisma();
    const codeFile = await websiteCodeFileDelegate(prisma).update({
      where: { id: current.id },
      data: {
        deletedAt: new Date(),
        updatedById: userId(req),
      },
    });

    await createWebsiteVersion(companyId(req), website.id, userId(req), `Arquivo de código removido: ${codeFile.filePath}`);
    await auditWebsiteBuilderAction(req, {
      action: "code_file_deleted",
      entityType: "website_code_file",
      entityId: codeFile.id,
      websiteId: website.id,
      pageId: codeFile.pageId,
      summary: `Arquivo de código removido: ${codeFile.filePath}`,
      metadata: { filePath: codeFile.filePath, language: codeFile.language, fileType: codeFile.fileType },
    });

    res.json({ code_file: codeFile });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    const website = await prisma.website.findFirst({
      where: { id: routeParam(req.params.id), companyId: companyId(req), deletedAt: null },
      include: {
        pages: {
          where: { deletedAt: null },
          orderBy: { sortOrder: "asc" },
          include: {
            sections: {
              where: { deletedAt: null },
              orderBy: { sortOrder: "asc" },
              include: {
                components: {
                  where: { deletedAt: null },
                  orderBy: { sortOrder: "asc" },
                },
              },
            },
          },
        },
      },
    });

    if (!website) throw notFound("Site não encontrado.");
    res.json({ website });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.put("/websites/:id", async (req: RequestWithAccess, res, next) => {
  try {
    await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const input = websiteSchema.partial().parse(req.body);
    const website = await prisma.website.update({
      where: { id: routeParam(req.params.id) },
      data: {
        name: input.name,
        slug: input.slug,
        settingsJson: toOptionalInputJson(input.settings_json),
        themeJson: toOptionalInputJson(input.theme_json),
        updatedById: userId(req),
      },
    });

    await createWebsiteVersion(companyId(req), website.id, userId(req), "Site atualizado");
    await auditWebsiteBuilderAction(req, {
      action: "website_updated",
      entityType: "website",
      entityId: website.id,
      websiteId: website.id,
      summary: `Site atualizado: ${website.name}`,
      metadata: { slug: website.slug, status: website.status },
    });
    res.json({ website });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.delete("/websites/:id", async (req: RequestWithAccess, res, next) => {
  try {
    await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const website = await prisma.website.update({
      where: { id: routeParam(req.params.id) },
      data: {
        status: "archived",
        deletedAt: new Date(),
        updatedById: userId(req),
      },
    });

    await auditWebsiteBuilderAction(req, {
      action: "website_deleted",
      entityType: "website",
      entityId: website.id,
      websiteId: website.id,
      summary: `Site arquivado: ${website.name}`,
      metadata: { slug: website.slug, status: website.status },
    });
    res.json({ website });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/websites/:id/pages", async (req: RequestWithAccess, res, next) => {
  try {
    await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const pages = await prisma.websitePage.findMany({
      where: { companyId: companyId(req), websiteId: routeParam(req.params.id), deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { sections: true } },
      },
    });

    res.json({ pages });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/websites/:id/pages", async (req: RequestWithAccess, res, next) => {
  try {
    await getWebsiteOrThrow(companyId(req), routeParam(req.params.id));
    const prisma = getWebsiteBuilderPrisma();
    const input = pageSchema.parse(req.body);
    const page = await prisma.websitePage.create({
      data: {
        companyId: companyId(req),
        websiteId: routeParam(req.params.id),
        title: input.title,
        slug: input.slug,
        pageType: input.page_type,
        status: input.status,
        sortOrder: input.sort_order ?? 0,
        seoJson: toInputJson(input.seo_json),
        settingsJson: toInputJson(input.settings_json),
        createdById: userId(req),
        updatedById: userId(req),
      },
    });

    await createWebsiteVersion(companyId(req), routeParam(req.params.id), userId(req), "Página criada");
    await auditWebsiteBuilderAction(req, {
      action: "page_created",
      entityType: "website_page",
      entityId: page.id,
      websiteId: page.websiteId,
      pageId: page.id,
      summary: `Página criada: ${page.title}`,
      metadata: { slug: page.slug, pageType: page.pageType, status: page.status },
    });
    res.status(201).json({ page });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.put("/pages/:pageId", async (req: RequestWithAccess, res, next) => {
  try {
    const current = await getPageOrThrow(companyId(req), routeParam(req.params.pageId));
    const prisma = getWebsiteBuilderPrisma();
    const input = pageSchema.partial().parse(req.body);
    const page = await prisma.websitePage.update({
      where: { id: routeParam(req.params.pageId) },
      data: {
        title: input.title,
        slug: input.slug,
        pageType: input.page_type,
        status: input.status,
        sortOrder: input.sort_order,
        seoJson: toOptionalInputJson(input.seo_json),
        settingsJson: toOptionalInputJson(input.settings_json),
        updatedById: userId(req),
      },
    });

    await createWebsiteVersion(companyId(req), current.websiteId, userId(req), "Página atualizada");
    await auditWebsiteBuilderAction(req, {
      action: "page_updated",
      entityType: "website_page",
      entityId: page.id,
      websiteId: page.websiteId,
      pageId: page.id,
      summary: `Página atualizada: ${page.title}`,
      metadata: { slug: page.slug, pageType: page.pageType, status: page.status },
    });
    res.json({ page });
  } catch (error) {
    try {
      handlePrismaError(error);
    } catch (handled) {
      next(handled);
    }
  }
});

websiteBuilderRouter.delete("/pages/:pageId", async (req: RequestWithAccess, res, next) => {
  try {
    const current = await getPageOrThrow(companyId(req), routeParam(req.params.pageId));
    const prisma = getWebsiteBuilderPrisma();
    const page = await prisma.websitePage.update({
      where: { id: routeParam(req.params.pageId) },
      data: {
        status: "archived",
        deletedAt: new Date(),
        updatedById: userId(req),
      },
    });

    await createWebsiteVersion(companyId(req), current.websiteId, userId(req), "Página arquivada");
    await auditWebsiteBuilderAction(req, {
      action: "page_deleted",
      entityType: "website_page",
      entityId: page.id,
      websiteId: page.websiteId,
      pageId: page.id,
      summary: `Página arquivada: ${page.title}`,
      metadata: { slug: page.slug },
    });
    res.json({ page });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/pages/:pageId/sections", async (req: RequestWithAccess, res, next) => {
  try {
    const page = await getPageOrThrow(companyId(req), routeParam(req.params.pageId));
    const prisma = getWebsiteBuilderPrisma();
    const sections = await prisma.websiteSection.findMany({
      where: { companyId: companyId(req), pageId: page.id, deletedAt: null },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { components: true } },
      },
    });

    res.json({ sections });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/pages/:pageId/sections", async (req: RequestWithAccess, res, next) => {
  try {
    const page = await getPageOrThrow(companyId(req), routeParam(req.params.pageId));
    const prisma = getWebsiteBuilderPrisma();
    const input = sectionSchema.parse(req.body);
    const section = await prisma.websiteSection.create({
      data: {
        companyId: companyId(req),
        websiteId: page.websiteId,
        pageId: page.id,
        name: input.name,
        sectionType: input.section_type,
        sortOrder: input.sort_order ?? 0,
        propsJson: toInputJson(input.props_json),
        styleJson: toInputJson(input.style_json),
        responsiveJson: toInputJson(input.responsive_json),
        animationJson: toInputJson(input.animation_json),
        isVisible: input.is_visible ?? true,
      },
    });

    await createWebsiteVersion(companyId(req), page.websiteId, userId(req), "Seção criada");
    await auditWebsiteBuilderAction(req, {
      action: "section_created",
      entityType: "website_section",
      entityId: section.id,
      websiteId: section.websiteId,
      pageId: section.pageId,
      sectionId: section.id,
      summary: `Seção criada: ${section.name}`,
      metadata: { sectionType: section.sectionType, sortOrder: section.sortOrder },
    });
    res.status(201).json({ section });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.put("/sections/:sectionId", async (req: RequestWithAccess, res, next) => {
  try {
    const current = await getSectionOrThrow(companyId(req), routeParam(req.params.sectionId));
    const prisma = getWebsiteBuilderPrisma();
    const input = sectionSchema.partial().parse(req.body);
    const section = await prisma.websiteSection.update({
      where: { id: current.id },
      data: {
        name: input.name,
        sectionType: input.section_type,
        sortOrder: input.sort_order,
        propsJson: toOptionalInputJson(input.props_json),
        styleJson: toOptionalInputJson(input.style_json),
        responsiveJson: toOptionalInputJson(input.responsive_json),
        animationJson: toOptionalInputJson(input.animation_json),
        isVisible: input.is_visible,
      },
    });

    await createWebsiteVersion(companyId(req), current.websiteId, userId(req), "Seção atualizada");
    await auditWebsiteBuilderAction(req, {
      action: "section_updated",
      entityType: "website_section",
      entityId: section.id,
      websiteId: section.websiteId,
      pageId: section.pageId,
      sectionId: section.id,
      summary: `Seção atualizada: ${section.name}`,
      metadata: { sectionType: section.sectionType, sortOrder: section.sortOrder, isVisible: section.isVisible },
    });
    res.json({ section });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.delete("/sections/:sectionId", async (req: RequestWithAccess, res, next) => {
  try {
    const current = await getSectionOrThrow(companyId(req), routeParam(req.params.sectionId));
    const prisma = getWebsiteBuilderPrisma();
    const section = await prisma.websiteSection.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });

    await createWebsiteVersion(companyId(req), current.websiteId, userId(req), "Seção arquivada");
    await auditWebsiteBuilderAction(req, {
      action: "section_deleted",
      entityType: "website_section",
      entityId: section.id,
      websiteId: section.websiteId,
      pageId: section.pageId,
      sectionId: section.id,
      summary: `Seção arquivada: ${section.name}`,
      metadata: { sectionType: section.sectionType },
    });
    res.json({ section });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/sections/:sectionId/components", async (req: RequestWithAccess, res, next) => {
  try {
    const section = await getSectionOrThrow(companyId(req), routeParam(req.params.sectionId));
    const prisma = getWebsiteBuilderPrisma();
    const components = await prisma.websiteComponent.findMany({
      where: { companyId: companyId(req), sectionId: section.id, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });

    res.json({ components });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/sections/:sectionId/components", async (req: RequestWithAccess, res, next) => {
  try {
    const section = await getSectionOrThrow(companyId(req), routeParam(req.params.sectionId));
    const prisma = getWebsiteBuilderPrisma();
    const input = componentSchema.parse(req.body);
    const component = await prisma.websiteComponent.create({
      data: {
        companyId: companyId(req),
        websiteId: section.websiteId,
        pageId: section.pageId,
        sectionId: section.id,
        parentComponentId: input.parent_component_id || null,
        name: input.name,
        componentType: input.component_type,
        sortOrder: input.sort_order ?? 0,
        propsJson: toInputJson(input.props_json),
        styleJson: toInputJson(input.style_json),
        responsiveJson: toInputJson(input.responsive_json),
        animationJson: toInputJson(input.animation_json),
        interactionJson: toInputJson(input.interaction_json),
        isVisible: input.is_visible ?? true,
        isLocked: input.is_locked ?? false,
      },
    });

    await createWebsiteVersion(companyId(req), section.websiteId, userId(req), "Componente criado");
    await auditWebsiteBuilderAction(req, {
      action: "component_created",
      entityType: "website_component",
      entityId: component.id,
      websiteId: component.websiteId,
      pageId: component.pageId,
      sectionId: component.sectionId,
      componentId: component.id,
      summary: `Componente criado: ${component.name}`,
      metadata: { componentType: component.componentType, sortOrder: component.sortOrder },
    });
    res.status(201).json({ component });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.put("/components/:componentId", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    const current = await prisma.websiteComponent.findFirst({
      where: { id: routeParam(req.params.componentId), companyId: companyId(req), deletedAt: null },
    });
    if (!current) throw notFound("Componente não encontrado para esta empresa.");

    const input = componentSchema.partial().parse(req.body);
    const component = await prisma.websiteComponent.update({
      where: { id: current.id },
      data: {
        parentComponentId: input.parent_component_id === "" ? null : input.parent_component_id,
        name: input.name,
        componentType: input.component_type,
        sortOrder: input.sort_order,
        propsJson: toOptionalInputJson(input.props_json),
        styleJson: toOptionalInputJson(input.style_json),
        responsiveJson: toOptionalInputJson(input.responsive_json),
        animationJson: toOptionalInputJson(input.animation_json),
        interactionJson: toOptionalInputJson(input.interaction_json),
        isVisible: input.is_visible,
        isLocked: input.is_locked,
      },
    });

    await createWebsiteVersion(companyId(req), current.websiteId, userId(req), "Componente atualizado");
    await auditWebsiteBuilderAction(req, {
      action: "component_updated",
      entityType: "website_component",
      entityId: component.id,
      websiteId: component.websiteId,
      pageId: component.pageId,
      sectionId: component.sectionId,
      componentId: component.id,
      summary: `Componente atualizado: ${component.name}`,
      metadata: { componentType: component.componentType, sortOrder: component.sortOrder, isVisible: component.isVisible },
    });
    res.json({ component });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.delete("/components/:componentId", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    const current = await prisma.websiteComponent.findFirst({
      where: { id: routeParam(req.params.componentId), companyId: companyId(req), deletedAt: null },
    });
    if (!current) throw notFound("Componente não encontrado para esta empresa.");

    const component = await prisma.websiteComponent.update({
      where: { id: current.id },
      data: { deletedAt: new Date() },
    });

    await createWebsiteVersion(companyId(req), current.websiteId, userId(req), "Componente arquivado");
    await auditWebsiteBuilderAction(req, {
      action: "component_deleted",
      entityType: "website_component",
      entityId: component.id,
      websiteId: component.websiteId,
      pageId: component.pageId,
      sectionId: component.sectionId,
      componentId: component.id,
      summary: `Componente arquivado: ${component.name}`,
      metadata: { componentType: component.componentType },
    });
    res.json({ component });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.get("/assets", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    const websiteId = typeof req.query.website_id === "string" ? req.query.website_id : undefined;
    if (websiteId) await getWebsiteOrThrow(companyId(req), websiteId);

    const assets = await prisma.websiteAsset.findMany({
      where: {
        companyId: companyId(req),
        websiteId,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ assets });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.delete("/assets/:assetId", async (req: RequestWithAccess, res, next) => {
  try {
    const current = await getAssetOrThrow(companyId(req), routeParam(req.params.assetId));
    const prisma = getWebsiteBuilderPrisma();
    if (current.status === "uploaded") {
      await deleteRemoteFileForEntity(companyId(req), "website_asset", current.id);
    }

    const asset = await prisma.websiteAsset.update({
      where: { id: current.id },
      data: {
        status: "deleted",
        deletedAt: new Date(),
      },
    });
    await deleteStoredFileRecordsForEntity(companyId(req), "website_asset", asset.id);

    if (asset.websiteId) {
      await createWebsiteVersion(companyId(req), asset.websiteId, userId(req), `Asset removido: ${asset.fileName}`);
    }

    await auditWebsiteBuilderAction(req, {
      action: "asset_deleted",
      entityType: "website_asset",
      entityId: asset.id,
      websiteId: asset.websiteId,
      assetId: asset.id,
      summary: `Asset removido: ${asset.fileName}`,
      metadata: { assetType: asset.assetType, mimeType: asset.mimeType, status: asset.status },
    });
    res.json({ asset });
  } catch (error) {
    next(error);
  }
});

websiteBuilderRouter.post("/assets/upload", async (req: RequestWithAccess, res, next) => {
  try {
    const prisma = getWebsiteBuilderPrisma();
    const input = assetUploadSchema.parse(req.body);
    const company = companyId(req);
    const websiteId = input.website_id || null;

    if (websiteId) await getWebsiteOrThrow(company, websiteId);
    await enforceWebsiteAssetLimit(company, websiteId);

    const body = decodeBase64File(input.content_base64);
    const purpose = storagePurposeFromWebsiteAsset(input.asset_type);
    const policy = validateUploadFile({
      purpose,
      fileName: input.file_name,
      mimeType: input.mime_type,
      declaredSizeBytes: input.file_size,
      body,
    });

    const uploaded = await getStorageProvider().uploadFile({
      companyId: company,
      entityType: "website_asset",
      entityId: null,
      purpose,
      fileName: input.file_name,
      mimeType: policy.normalizedMimeType,
      sizeBytes: policy.measuredSizeBytes,
      body,
      folder: buildStorageFolder({ companyId: company, websiteId, purpose }),
      metadata: {
        asset_type: input.asset_type,
      },
    });

    const asset = await prisma.websiteAsset.create({
      data: {
        companyId: company,
        websiteId,
        assetType: input.asset_type,
        status: "uploaded",
        fileName: input.file_name,
        mimeType: policy.normalizedMimeType,
        fileSize: policy.measuredSizeBytes,
        storageProvider: uploaded.provider,
        storageBucket: uploaded.provider,
        storageKey: uploaded.publicId,
        publicUrl: uploaded.secureUrl,
        metadataJson: toInputJson(input.metadata_json),
        createdById: userId(req),
      },
    });

    await createStoredFileRecord({
      companyId: company,
      entityType: "website_asset",
      entityId: asset.id,
      file: uploaded,
      uploadedBy: userId(req),
    });

    if (asset.websiteId) {
      await createWebsiteVersion(company, asset.websiteId, userId(req), `Asset enviado: ${asset.fileName}`);
    }

    await auditWebsiteBuilderAction(req, {
      action: "asset_uploaded",
      entityType: "website_asset",
      entityId: asset.id,
      websiteId: asset.websiteId,
      assetId: asset.id,
      summary: `Upload concluido: ${asset.fileName}`,
      metadata: {
        assetType: asset.assetType,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        storageProvider: asset.storageProvider,
      },
    });
    res.status(201).json({
      asset,
      upload: {
        storageProvider: uploaded.provider,
        storageBucket: uploaded.provider,
        storageKey: uploaded.publicId,
        publicUrl: uploaded.secureUrl,
        expiresInSeconds: 0,
      },
      method: "POST",
    });
  } catch (error) {
    next(error);
  }
});

function decodeBase64File(content: string) {
  const base64 = content.includes(",") ? content.split(",").at(-1) : content;
  return Buffer.from(base64 ?? "", "base64");
}

async function enforceWebsiteAssetLimit(company: string, websiteId: string | null) {
  const prisma = getWebsiteBuilderPrisma();
  const count = await prisma.websiteAsset.count({
    where: {
      companyId: company,
      websiteId,
      deletedAt: null,
    },
  });
  if (count >= 100) {
    throw badRequest("Limite de 100 assets por biblioteca atingido.", 413);
  }
}

function storagePurposeFromWebsiteAsset(assetType: z.infer<typeof assetUploadSchema>["asset_type"]): StoragePurpose {
  if (assetType === "document") return "document";
  if (assetType === "icon") return "website_logo";
  return "website_asset";
}

async function deleteRemoteFileForEntity(company: string, entityType: string, entityId: string) {
  const storedFile = await findStoredFileForEntity(company, entityType, entityId);
  if (!storedFile) return;

  await getStorageProviderForName(storedFile.provider as StorageProviderName).deleteFile({
    publicId: storedFile.publicId,
    resourceType: storedFile.resourceType as StorageResourceType,
  });
}
