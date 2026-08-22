import crypto from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { supabaseAdmin } from "../lib/supabase.js";
import {
  requireActiveSubscription,
  requireAuth,
  requireCompany,
  requirePermission,
} from "../middleware/auth.js";
import { isSubscriptionAllowed } from "../services/access-context.js";
import { ensureDefaultCrmPipeline } from "../services/crm-bootstrap.js";
import {
  buildPortalFeedItem,
  buildPortalFeedXml,
  isPortalProvider,
  normalizePortalLeadPayload,
  portalProviders,
  type PortalFeedItem,
  type PortalFeedProperty,
  type PortalProvider,
  type PortalPublication,
} from "../services/portal-integrations.js";
import type { RequestWithAccess, SubscriptionStatus } from "../types/access.js";

export const portalIntegrationsRouter = Router();

type WebhookRequest = Request & { rawBody?: string };

const publicationSelect =
  "id, company_id, property_id, provider, status, external_listing_id, listing_url, last_synced_at, last_error, published_at, metadata, created_at, updated_at, properties(id, code, title, status, operation, city, state)";

const publicationSchema = z.object({
  property_id: z.string().uuid(),
  provider: z.enum(["zap_imoveis", "olx", "viva_real"]),
  status: z.enum(["draft", "queued", "published", "paused"]).default("queued"),
  external_listing_id: z.string().max(160).optional().or(z.literal("")),
  listing_url: z.string().url().optional().or(z.literal("")),
  metadata: z.record(z.unknown()).optional().default({}),
});

function cleanEmpty<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [key, value === "" ? null : value]),
  );
}

function toHeaderValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function validatePortalWebhook(req: Request) {
  const expected = env.PORTAL_INTEGRATIONS_WEBHOOK_SECRET;
  if (!expected) return false;

  const authorization = toHeaderValue(req.headers.authorization)?.replace(/^Bearer\s+/i, "");
  const received =
    toHeaderValue(req.headers["x-imobiflow-portal-secret"]) ??
    toHeaderValue(req.headers["x-webhook-secret"]) ??
    toHeaderValue(req.query.secret) ??
    toHeaderValue(req.query.token) ??
    authorization;

  return received ? timingSafeEqual(received, expected) : false;
}

function notFound(message = "Integração de portal não encontrada.") {
  return Object.assign(new Error(message), {
    statusCode: 404,
    code: "PORTAL_INTEGRATION_NOT_FOUND",
  });
}

async function ensurePropertyForPortal(propertyId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("id, company_id, code, title, status, operation, published_at")
    .eq("id", propertyId)
    .eq("company_id", companyId)
    .maybeSingle<{
      id: string;
      company_id: string;
      code: string | null;
      title: string;
      status: string;
      operation: string;
      published_at: string | null;
    }>();

  if (error) throw error;
  if (!data) throw notFound("Imóvel não encontrado para esta empresa.");

  if (!["available", "reserved"].includes(data.status)) {
    throw Object.assign(new Error("Somente imóveis disponíveis ou reservados podem ir para portais."), {
      statusCode: 422,
      code: "PROPERTY_NOT_PUBLISHABLE",
    });
  }

  return data;
}

async function getCompanyWithAllowedSubscription(companyId: string) {
  const [{ data: company, error: companyError }, { data: subscription, error: subscriptionError }] =
    await Promise.all([
      supabaseAdmin
        .from("companies")
        .select("id, name, status, email, phone")
        .eq("id", companyId)
        .maybeSingle<{ id: string; name: string; status: string; email: string | null; phone: string | null }>(),
      supabaseAdmin
        .from("subscriptions")
        .select("status, expires_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ status: SubscriptionStatus; expires_at: string | null }>(),
    ]);

  if (companyError) throw companyError;
  if (subscriptionError) throw subscriptionError;
  if (!company || company.status !== "active") throw notFound();
  if (!isSubscriptionAllowed(subscription?.status, subscription?.expires_at)) throw notFound();

  return company;
}

async function loadPortalConnection(companyId: string, provider: PortalProvider) {
  const { data, error } = await supabaseAdmin
    .from("integration_connections")
    .select("id, provider, status, settings")
    .eq("company_id", companyId)
    .eq("provider", provider)
    .in("status", ["active", "testing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; provider: string; status: string; settings: Record<string, unknown> }>();

  if (error) throw error;
  if (!data) throw notFound();
  if (data.settings?.feed_enabled === false) throw notFound();

  return data;
}

async function loadPortalFeed(companyId: string, provider: PortalProvider) {
  const company = await getCompanyWithAllowedSubscription(companyId);
  const connection = await loadPortalConnection(companyId, provider);

  const { data, error } = await supabaseAdmin
    .from("portal_property_publications")
    .select(
      "id, provider, external_listing_id, listing_url, published_at, metadata, properties(id, code, title, description, property_type, operation, status, neighborhood, city, state, bedrooms, bathrooms, suites, parking_spaces, private_area, total_area, sale_price_cents, rent_price_cents, condominium_fee_cents, iptu_cents, features_json, published_at, property_media(id, media_type, url, caption, position, is_cover))",
    )
    .eq("company_id", companyId)
    .eq("provider", provider)
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  const listings: PortalFeedItem[] = [];
  for (const row of data ?? []) {
    const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
    if (!property || !["available", "reserved"].includes(property.status)) continue;
    if (!property.published_at) continue;
    listings.push(
      buildPortalFeedItem({
        publication: row as PortalPublication,
        property: property as PortalFeedProperty,
      }),
    );
  }

  return {
    provider,
    provider_label: portalProviders[provider].label,
    company,
    connection_id: connection.id,
    generated_at: new Date().toISOString(),
    total: listings.length,
    listings,
  };
}

portalIntegrationsRouter.get(
  "/publications",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("integrations.view"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const provider = typeof req.query.provider === "string" ? req.query.provider : undefined;

      let query = supabaseAdmin
        .from("portal_property_publications")
        .select(publicationSelect)
        .eq("company_id", companyId)
        .neq("status", "archived")
        .order("updated_at", { ascending: false });

      if (provider && isPortalProvider(provider)) query = query.eq("provider", provider);

      const { data, error } = await query;
      if (error) throw error;

      res.json({ publications: data ?? [] });
    } catch (error) {
      next(error);
    }
  },
);

portalIntegrationsRouter.post(
  "/publications",
  requireAuth,
  requireCompany,
  requireActiveSubscription,
  requirePermission("integrations.manage"),
  async (req: RequestWithAccess, res, next) => {
    try {
      const companyId = req.access!.company.id;
      const userId = req.access!.appUser.id;
      const input = publicationSchema.parse(req.body);
      const property = await ensurePropertyForPortal(input.property_id, companyId);

      const { data: publication, error } = await supabaseAdmin
        .from("portal_property_publications")
        .upsert(
          {
            ...cleanEmpty(input),
            company_id: companyId,
            status: input.status,
            published_at: input.status === "published" ? new Date().toISOString() : null,
            metadata: {
              ...input.metadata,
              property_code: property.code,
              property_title: property.title,
              property_operation: property.operation,
            },
            created_by: userId,
            updated_by: userId,
          },
          { onConflict: "company_id,property_id,provider" },
        )
        .select(publicationSelect)
        .single();

      if (error) throw error;

      await supabaseAdmin.from("audit_logs").insert({
        company_id: companyId,
        user_id: userId,
        action: "portal.publication_saved",
        entity_type: "portal_property_publications",
        entity_id: publication.id,
        metadata: {
          provider: input.provider,
          property_id: input.property_id,
          status: input.status,
        },
      });

      res.status(201).json({ publication });
    } catch (error) {
      next(error);
    }
  },
);

portalIntegrationsRouter.get("/:provider/:companyId/feed.json", async (req, res, next) => {
  try {
    const provider = String(req.params.provider ?? "");
    if (!isPortalProvider(provider)) throw notFound();

    const companyId = String(req.params.companyId ?? "");
    res.json(await loadPortalFeed(companyId, provider));
  } catch (error) {
    next(error);
  }
});

portalIntegrationsRouter.get("/:provider/:companyId/feed.xml", async (req, res, next) => {
  try {
    const provider = String(req.params.provider ?? "");
    if (!isPortalProvider(provider)) throw notFound();

    const companyId = String(req.params.companyId ?? "");
    const feed = await loadPortalFeed(companyId, provider);
    res.type("application/xml").send(
      buildPortalFeedXml({
        provider,
        providerLabel: feed.provider_label,
        company: feed.company,
        generatedAt: feed.generated_at,
        listings: feed.listings,
      }),
    );
  } catch (error) {
    next(error);
  }
});

portalIntegrationsRouter.post("/:provider/leads", async (req: WebhookRequest, res, next) => {
  try {
    if (!validatePortalWebhook(req)) {
      return res.status(401).json({
        error: "INVALID_PORTAL_WEBHOOK",
        message: "Webhook de portal recusado por validação inválida.",
      });
    }

    const provider = String(req.params.provider ?? "");
    if (!isPortalProvider(provider)) throw notFound();

    const normalized = normalizePortalLeadPayload(provider, req.body as Record<string, unknown>);
    if (!normalized.companyId) {
      return res.status(422).json({
        error: "PORTAL_LEAD_COMPANY_NOT_IDENTIFIED",
        message: "Lead de portal sem company_id.",
      });
    }

    await getCompanyWithAllowedSubscription(normalized.companyId);
    await loadPortalConnection(normalized.companyId, provider);

    let propertyId = normalized.propertyId;
    let publicationId: string | null = null;
    let propertyReference = normalized.propertyReference ?? normalized.externalListingId;

    if (!propertyId && normalized.externalListingId) {
      const { data: publication, error } = await supabaseAdmin
        .from("portal_property_publications")
        .select("id, property_id, external_listing_id, properties(id, code, title)")
        .eq("company_id", normalized.companyId)
        .eq("provider", provider)
        .eq("external_listing_id", normalized.externalListingId)
        .maybeSingle<{
          id: string;
          property_id: string;
          external_listing_id: string | null;
          properties?: { id: string; code: string | null; title: string } | null;
        }>();

      if (error) throw error;
      if (publication) {
        publicationId = publication.id;
        propertyId = publication.property_id;
        propertyReference =
          publication.properties?.code ?? publication.properties?.title ?? normalized.externalListingId;
      }
    }

    if (propertyId) {
      const { data: publication, error } = await supabaseAdmin
        .from("portal_property_publications")
        .select("id, properties(id, code, title)")
        .eq("company_id", normalized.companyId)
        .eq("provider", provider)
        .eq("property_id", propertyId)
        .maybeSingle<{
          id: string;
          properties?: { id: string; code: string | null; title: string } | null;
        }>();

      if (error) throw error;
      publicationId = publication?.id ?? publicationId;
      propertyReference =
        publication?.properties?.code ?? publication?.properties?.title ?? propertyReference;
    }

    const pipeline = await ensureDefaultCrmPipeline(normalized.companyId, null);
    const defaultStage = pipeline.stages[0]?.id ?? null;
    const { data: lead, error: leadError } = await supabaseAdmin
      .from("leads")
      .insert({
        company_id: normalized.companyId,
        stage_id: defaultStage,
        name: normalized.name,
        email: normalized.email,
        phone: normalized.phone,
        source: portalProviders[provider].source,
        interest_type: "not_defined",
        property_reference: propertyReference,
        notes: normalized.message,
      })
      .select("id, name, email, phone, source, created_at")
      .single<{ id: string; name: string; email: string | null; phone: string | null; source: string; created_at: string }>();

    if (leadError) throw leadError;

    const { error: portalLeadError } = await supabaseAdmin.from("portal_leads").insert({
      company_id: normalized.companyId,
      publication_id: publicationId,
      property_id: propertyId,
      lead_id: lead.id,
      provider,
      external_lead_id: normalized.externalLeadId,
      external_listing_id: normalized.externalListingId,
      name: normalized.name,
      email: normalized.email,
      phone: normalized.phone,
      message: normalized.message,
      raw_payload: normalized.raw,
      ip_address: clientIp(req),
      user_agent: req.headers["user-agent"] ?? null,
    });

    if (portalLeadError?.code !== "23505" && portalLeadError) throw portalLeadError;

    await supabaseAdmin.from("lead_events").insert({
      company_id: normalized.companyId,
      lead_id: lead.id,
      user_id: null,
      event_type: "lead.created_from_portal",
      payload: {
        provider,
        property_id: propertyId,
        publication_id: publicationId,
        external_lead_id: normalized.externalLeadId,
      },
    });

    res.status(201).json({ lead, provider, property_id: propertyId, publication_id: publicationId });
  } catch (error) {
    next(error);
  }
});

function clientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim() ?? null;
  return req.socket.remoteAddress ?? null;
}
