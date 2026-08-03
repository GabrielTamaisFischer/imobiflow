import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { prisma, serializeCompanySite } from "../services/mysql-real-estate.js";
import type { RequestWithAccess } from "../types/access.js";

export const sitesRouter = Router();

sitesRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const siteSchema = z.object({
  slug: z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  custom_domain: z.string().max(180).optional().or(z.literal("")),
  brand_name: z.string().min(2).max(160),
  headline: z.string().max(180).optional().or(z.literal("")),
  description: z.string().max(1200).optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  whatsapp: z.string().max(40).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  logo_url: z.string().url().optional().or(z.literal("")),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#111827"),
  settings_json: z
    .object({
      show_full_address: z.boolean().optional().default(false),
      show_prices: z.boolean().optional().default(true),
      allow_lead_capture: z.boolean().optional().default(true),
      auto_publish_properties: z.boolean().optional().default(true),
      template_key: z.string().optional(),
      active_template_key: z.string().optional(),
      favorite_template_keys: z.array(z.string()).optional().default([]),
      featured_property_ids: z.array(z.string()).optional().default([]),
    })
    .catchall(z.unknown())
    .default({}),
  seo_json: z.record(z.unknown()).optional().default({}),
});

sitesRouter.get("/settings", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const site = await prisma().companySite.findFirst({ where: { companyId } });

    res.json({ site: site ? serializeCompanySite(site) : null });
  } catch (error) {
    next(error);
  }
});

sitesRouter.put("/settings", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    const input = siteSchema.parse(req.body);
    const existing = await prisma().companySite.findFirst({ where: { companyId } });
    const data = {
      companyId,
      createdBy: uuidOrNull(userId),
      slug: input.slug,
      customDomain: emptyToNull(input.custom_domain),
      brandName: input.brand_name,
      headline: emptyToNull(input.headline),
      description: emptyToNull(input.description),
      phone: emptyToNull(input.phone),
      whatsapp: emptyToNull(input.whatsapp),
      email: emptyToNull(input.email),
      logoUrl: emptyToNull(input.logo_url),
      primaryColor: input.primary_color,
      settingsJson: input.settings_json as Prisma.InputJsonValue,
      seoJson: input.seo_json as Prisma.InputJsonValue,
    };

    const site = existing
      ? await prisma().companySite.update({ where: { id: existing.id }, data })
      : await prisma().companySite.create({ data: { ...data, status: "draft" } });

    await prisma().websiteAuditLog.create({
      data: {
        companyId,
        actorUserId: uuidOrNull(userId),
        action: "site_settings_saved",
        entityType: "company_sites",
        entityId: site.id,
        metadataJson: { slug: site.slug, status: site.status },
      },
    });

    res.json({ site: serializeCompanySite(site) });
  } catch (error) {
    next(error);
  }
});

sitesRouter.post("/publish", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    const existing = await prisma().companySite.findFirst({ where: { companyId } });
    if (!existing) throw siteNotFound();

    const site = await prisma().companySite.update({
      where: { id: existing.id },
      data: { status: "published", publishedAt: new Date() },
    });

    await prisma().websiteAuditLog.create({
      data: {
        companyId,
        actorUserId: uuidOrNull(userId),
        action: "site_published",
        entityType: "company_sites",
        entityId: site.id,
        metadataJson: { slug: site.slug },
      },
    });

    res.json({ site: serializeCompanySite(site) });
  } catch (error) {
    next(error);
  }
});

sitesRouter.post("/unpublish", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const userId = req.access!.appUser.id;
    const existing = await prisma().companySite.findFirst({ where: { companyId } });
    if (!existing) throw siteNotFound();

    const site = await prisma().companySite.update({
      where: { id: existing.id },
      data: { status: "offline" },
    });

    await prisma().websiteAuditLog.create({
      data: {
        companyId,
        actorUserId: uuidOrNull(userId),
        action: "site_unpublished",
        entityType: "company_sites",
        entityId: site.id,
        metadataJson: { slug: site.slug },
      },
    });

    res.json({ site: serializeCompanySite(site) });
  } catch (error) {
    next(error);
  }
});

sitesRouter.get("/leads", requirePermission("site.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const companyId = req.access!.company.id;
    const leads = await prisma().siteLead.findMany({
      where: { companyId },
      include: {
        property: { select: { id: true, code: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({
      leads: leads.map((lead) => ({
        id: lead.id,
        site_id: lead.siteId,
        property_id: lead.propertyId,
        lead_id: lead.leadId,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        message: lead.message,
        source_url: lead.sourceUrl,
        metadata: lead.metadata,
        created_at: lead.createdAt.toISOString(),
        properties: lead.property
          ? { id: lead.property.id, code: lead.property.code, title: lead.property.title }
          : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

sitesRouter.post(
  "/properties/:id/publish",
  requirePermission("site.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const propertyId = String(req.params.id);
      const existing = await prisma().property.findFirst({ where: { id: propertyId, companyId } });
      if (!existing) throw propertyNotFound();

      const property = await prisma().property.update({
        where: { id: existing.id },
        data: {
          status: "available",
          publishedAt: new Date(),
          publicationSettingsJson: {
            ...asRecord(existing.publicationSettingsJson),
            site_enabled: true,
          } as Prisma.InputJsonValue,
        },
        select: { id: true, code: true, title: true, status: true, publishedAt: true },
      });

      await prisma().websiteAuditLog.create({
        data: {
          companyId,
          actorUserId: uuidOrNull(userId),
          action: "site_property_published",
          entityType: "properties",
          entityId: property.id,
          metadataJson: { code: property.code, title: property.title },
        },
      });

      res.json({ property: serializeSiteProperty(property) });
    } catch (error) {
      next(error);
    }
  },
);

sitesRouter.post(
  "/properties/:id/unpublish",
  requirePermission("site.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const propertyId = String(req.params.id);
      const existing = await prisma().property.findFirst({ where: { id: propertyId, companyId } });
      if (!existing) throw propertyNotFound();

      const property = await prisma().property.update({
        where: { id: existing.id },
        data: {
          publishedAt: null,
          publicationSettingsJson: {
            ...asRecord(existing.publicationSettingsJson),
            site_enabled: false,
          } as Prisma.InputJsonValue,
        },
        select: { id: true, code: true, title: true, status: true, publishedAt: true },
      });

      await prisma().websiteAuditLog.create({
        data: {
          companyId,
          actorUserId: uuidOrNull(userId),
          action: "site_property_unpublished",
          entityType: "properties",
          entityId: property.id,
          metadataJson: { code: property.code, title: property.title },
        },
      });

      res.json({ property: serializeSiteProperty(property) });
    } catch (error) {
      next(error);
    }
  },
);

function serializeSiteProperty(property: {
  id: string;
  code: string | null;
  title: string;
  status: string;
  publishedAt: Date | null;
}) {
  return {
    id: property.id,
    code: property.code,
    title: property.title,
    status: property.status,
    published_at: property.publishedAt?.toISOString() ?? null,
  };
}

function emptyToNull(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function uuidOrNull(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function siteNotFound() {
  return Object.assign(new Error("Site não encontrado para esta empresa."), {
    statusCode: 404,
    code: "SITE_NOT_FOUND",
  });
}

function propertyNotFound() {
  return Object.assign(new Error("Imóvel não encontrado para esta empresa."), {
    statusCode: 404,
    code: "PROPERTY_NOT_FOUND",
  });
}
