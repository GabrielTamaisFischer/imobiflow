import { Router, type Request } from "express";
import { z } from "zod";
import {
  createMysqlPublicLead,
  getMysqlPublishedSite,
  loadMysqlPublicProperties,
  loadMysqlPublicPropertyByReference,
  publicSiteView,
} from "../services/mysql-real-estate.js";

export const publicSitesRouter = Router();

const leadSchema = z.object({
  name: z.string().min(2).max(160),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().min(3).max(40).optional().or(z.literal("")),
  message: z.string().max(2000).optional().or(z.literal("")),
  property_id: z.string().uuid().optional().or(z.literal("")),
});

function clientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return req.socket.remoteAddress ?? null;
}

publicSitesRouter.get("/:slug", async (req, res, next) => {
  try {
    const { site, company } = await getMysqlPublishedSite(String(req.params.slug));
    const properties = await loadMysqlPublicProperties(site, 6);

    res.json({
      site: publicSiteView(site),
      company: { id: company.id, name: company.name, status: company.status },
      featured_properties: properties,
    });
  } catch (error) {
    next(error);
  }
});

publicSitesRouter.get("/:slug/properties", async (req, res, next) => {
  try {
    const { site, company } = await getMysqlPublishedSite(String(req.params.slug));
    const properties = await loadMysqlPublicProperties(site, 240);

    res.json({
      site: publicSiteView(site),
      company: { id: company.id, name: company.name, status: company.status },
      properties,
    });
  } catch (error) {
    next(error);
  }
});

publicSitesRouter.get("/:slug/properties/:propertyId", async (req, res, next) => {
  try {
    const { site, company } = await getMysqlPublishedSite(String(req.params.slug));
    const property = await loadMysqlPublicPropertyByReference(site, String(req.params.propertyId));

    res.json({
      site: publicSiteView(site),
      company: { id: company.id, name: company.name, status: company.status },
      property,
    });
  } catch (error) {
    next(error);
  }
});

publicSitesRouter.post("/:slug/leads", async (req, res, next) => {
  try {
    const { site } = await getMysqlPublishedSite(String(req.params.slug));
    const settings = isRecord(site.settingsJson) ? site.settingsJson : {};
    if (settings.allow_lead_capture === false) {
      return res.status(403).json({
        error: "LEAD_CAPTURE_DISABLED",
        message: "Captura de leads desativada para este site.",
      });
    }

    const input = leadSchema.parse(req.body);
    const lead = await createMysqlPublicLead({
      site: { id: site.id, companyId: site.companyId, slug: site.slug },
      propertyId: input.property_id || null,
      input,
      sourceUrl: req.headers.referer ?? null,
      ipAddress: clientIp(req),
      userAgent: req.headers["user-agent"] ?? null,
    });

    res.status(201).json({ lead });
  } catch (error) {
    next(error);
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
