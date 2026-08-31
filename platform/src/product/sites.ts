import { apiRequest, isUnavailableProductionApi } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import { createLead } from "./crm";
import { safeSetPreviewItem } from "./preview-storage";
import { matchesPropertySlug } from "./public-site-helpers";
import type { Property } from "./real-estate";
import { defaultSiteTemplateKey, type SiteTemplateKey } from "./site-templates";

const previewSiteKey = "imobiflow.preview.company_site";
const previewSiteLeadsKey = "imobiflow.preview.site_leads";
const previewPropertiesKey = "imobiflow.preview.properties";

export type CompanySite = {
  id: string;
  company_id: string;
  slug: string;
  custom_domain: string | null;
  status: "draft" | "published" | "offline" | "archived";
  brand_name: string;
  headline: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  logo_url: string | null;
  primary_color: string;
  settings_json: {
    show_full_address?: boolean;
    show_prices?: boolean;
    allow_lead_capture?: boolean;
    auto_publish_properties?: boolean;
    template_key?: SiteTemplateKey;
    featured_property_ids?: string[];
    favorite_template_keys?: SiteTemplateKey[];
    hero_image_url?: string;
  };
  seo_json: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SiteLead = {
  id: string;
  property_id: string | null;
  lead_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  message: string | null;
  source_url: string | null;
  created_at: string;
};

export type PublicSiteResponse = {
  site: Omit<CompanySite, "company_id" | "status" | "created_at" | "updated_at">;
  company: { id: string; name: string; status: string };
  featured_properties?: Property[];
  properties?: Property[];
};

export type PublicPropertyResponse = PublicSiteResponse & {
  property: Property;
};

export type CompanySiteInput = {
  slug: string;
  custom_domain?: string;
  brand_name: string;
  headline?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  logo_url?: string;
  primary_color?: string;
  settings_json?: CompanySite["settings_json"];
  seo_json?: Record<string, unknown>;
};

export async function getSiteSettings() {
  if (isPreviewSites()) return { site: readPreviewSite() };

  return apiRequest<{ site: CompanySite | null }>("/site/settings", {
    token: getStoredToken() ?? undefined,
  });
}

export async function saveSiteSettings(input: CompanySiteInput) {
  if (isPreviewSites()) {
    const site = upsertPreviewSite(input);
    return { site };
  }

  return apiRequest<{ site: CompanySite }>("/site/settings", {
    method: "PUT",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function publishSite() {
  if (isPreviewSites()) {
    const site = readPreviewSite();
    if (!site) throw new Error("Salve as configurações do site antes de publicar.");
    const updated = { ...site, status: "published" as const, published_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    writePreviewSite(updated);
    return { site: updated };
  }

  return apiRequest<{ site: CompanySite }>("/site/publish", {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

export async function unpublishSite() {
  if (isPreviewSites()) {
    const site = readPreviewSite();
    if (!site) throw new Error("Site não encontrado.");
    const updated = { ...site, status: "offline" as const, updated_at: new Date().toISOString() };
    writePreviewSite(updated);
    return { site: updated };
  }

  return apiRequest<{ site: CompanySite }>("/site/unpublish", {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

export async function publishSiteProperty(propertyId: string) {
  if (isPreviewSites()) {
    const property = updatePreviewPropertyPublication(propertyId, true);
    return { property: pickPublicationProperty(property) };
  }

  return apiRequest<{ property: Pick<Property, "id" | "code" | "title" | "status" | "published_at"> }>(
    `/site/properties/${propertyId}/publish`,
    {
      method: "POST",
      token: getStoredToken() ?? undefined,
    },
  );
}

// Diretriz Mestre do MVP, Seção 7: só CALCULA se um deeplink de WhatsApp pode
// ser oferecido (telefone do proprietário existe, site publicado, URL pública
// validada) e monta o texto/link prontos. Nunca envia nada pelo servidor —
// só o clique do usuário no botão que abre isto no navegador conta como
// "enviar", e mesmo assim só de fato se o usuário confirmar dentro do
// WhatsApp.
export type PropertyWhatsAppLink =
  | {
      eligible: true;
      provider: string;
      phone: string;
      ownerName: string | null;
      companyName: string;
      code: string;
      title: string;
      publicUrl: string;
      message: string;
      waUrl: string;
    }
  | { eligible: false; reason: string };

export async function getPropertyWhatsAppLink(propertyId: string) {
  return apiRequest<PropertyWhatsAppLink>(`/site/properties/${propertyId}/whatsapp-link`, {
    token: getStoredToken() ?? undefined,
  });
}

// Chamada no exato momento em que o link wa.me é aberto (após o clique do
// usuário) — só para deixar auditável que o link foi aberto. Não implica que
// a mensagem chegou ao proprietário.
export async function markPropertyWhatsAppLinkOpened(propertyId: string) {
  await apiRequest<void>(`/site/properties/${propertyId}/whatsapp-link-opened`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

export async function unpublishSiteProperty(propertyId: string) {
  if (isPreviewSites()) {
    const property = updatePreviewPropertyPublication(propertyId, false);
    return { property: pickPublicationProperty(property) };
  }

  return apiRequest<{ property: Pick<Property, "id" | "code" | "title" | "status" | "published_at"> }>(
    `/site/properties/${propertyId}/unpublish`,
    {
      method: "POST",
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function listSiteLeads() {
  if (isPreviewSites()) return { leads: readPreviewSiteLeads() };

  return apiRequest<{ leads: SiteLead[] }>("/site/leads", {
    token: getStoredToken() ?? undefined,
  });
}

export async function getPublicSite(slug: string) {
  if (hasPreviewPublicSite(slug)) return getPreviewPublicSite(slug);

  try {
    return await apiRequest<PublicSiteResponse>(`/public/sites/${slug}`);
  } catch (error) {
    if (isPreviewSites()) return getFallbackPublicSite(slug, error);
    throw error;
  }
}

export async function getPublicSiteProperties(slug: string) {
  if (hasPreviewPublicSite(slug)) {
    const response = getPreviewPublicSite(slug);
    return { site: response.site, company: response.company, properties: response.properties ?? [] };
  }

  try {
    return await apiRequest<Required<Pick<PublicSiteResponse, "site" | "company" | "properties">>>(
      `/public/sites/${slug}/properties`,
    );
  } catch (error) {
    if (!isPreviewSites()) throw error;
    const response = getFallbackPublicSite(slug, error);
    return { site: response.site, company: response.company, properties: response.properties ?? [] };
  }
}

export async function getPublicSiteProperty(slug: string, propertySlug: string) {
  const loadFromList = () => {
    const response = getFallbackPublicSite(slug);
    const properties = response.properties ?? response.featured_properties ?? [];
    const property = properties.find((item) => matchesPropertySlug(item, propertySlug));
    if (!property) throw new Error("Imóvel não encontrado.");
    return { ...response, properties, property };
  };

  if (hasPreviewPublicSite(slug)) return loadFromList();

  try {
    return await apiRequest<PublicPropertyResponse>(`/public/sites/${slug}/properties/${propertySlug}`);
  } catch (error) {
    if (!isPreviewSites()) throw error;
    return loadFromList();
  }
}

export async function createPublicSiteLead(
  slug: string,
  input: { name: string; email?: string; phone?: string; message?: string; property_id?: string },
) {
  if (hasPreviewPublicSite(slug)) {
    const lead = createPreviewSiteLead(slug, input);
    return { lead: { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone } };
  }

  try {
    return await apiRequest<{ lead: { id: string; name: string; email: string | null; phone: string | null } }>(
      `/public/sites/${slug}/leads`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  } catch (error) {
    if (!hasPreviewPublicSite(slug) && !isPreviewSites()) throw error;
    const lead = createPreviewSiteLead(slug, input);
    return { lead: { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone } };
  }
}

function isPreviewSites() {
  return isPreviewToken(getStoredToken()) && isUnavailableProductionApi();
}

function hasPreviewPublicSite(slug: string) {
  if (!isPreviewSites()) return false;
  const site = readPreviewSite();
  return Boolean(site && site.slug === slug);
}

function readPreviewSite() {
  if (typeof window === "undefined") return null;

  try {
    return JSON.parse(window.localStorage.getItem(previewSiteKey) ?? "null") as CompanySite | null;
  } catch {
    return null;
  }
}

function writePreviewSite(site: CompanySite) {
  safeSetPreviewItem(previewSiteKey, JSON.stringify(site));
}

function upsertPreviewSite(input: CompanySiteInput) {
  const now = new Date().toISOString();
  const current = readPreviewSite();
  const site: CompanySite = {
    id: current?.id ?? window.crypto.randomUUID(),
    company_id: "preview-company",
    slug: sanitizeSlug(input.slug || current?.slug || "imobiflow-preview"),
    custom_domain: input.custom_domain || current?.custom_domain || null,
    status: current?.status ?? "draft",
    brand_name: input.brand_name || current?.brand_name || "ImobiFlow Preview",
    headline: input.headline || null,
    description: input.description || null,
    phone: input.phone || null,
    whatsapp: input.whatsapp || null,
    email: input.email || null,
    logo_url: input.logo_url || current?.logo_url || null,
    primary_color: input.primary_color || current?.primary_color || "#2563eb",
    settings_json: {
      show_full_address: input.settings_json?.show_full_address ?? current?.settings_json?.show_full_address ?? false,
      show_prices: input.settings_json?.show_prices ?? current?.settings_json?.show_prices ?? true,
      allow_lead_capture: input.settings_json?.allow_lead_capture ?? current?.settings_json?.allow_lead_capture ?? true,
      auto_publish_properties:
        input.settings_json?.auto_publish_properties ?? current?.settings_json?.auto_publish_properties ?? true,
      template_key: input.settings_json?.template_key ?? current?.settings_json?.template_key ?? defaultSiteTemplateKey,
      featured_property_ids: input.settings_json?.featured_property_ids ?? current?.settings_json?.featured_property_ids ?? [],
      favorite_template_keys: input.settings_json?.favorite_template_keys ?? current?.settings_json?.favorite_template_keys ?? [],
    },
    seo_json: input.seo_json ?? current?.seo_json ?? {},
    published_at: current?.published_at ?? null,
    created_at: current?.created_at ?? now,
    updated_at: now,
  };

  writePreviewSite(site);
  return site;
}

function readPreviewProperties() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewPropertiesKey) ?? "[]") as Property[];
  } catch {
    return [];
  }
}

function writePreviewProperties(properties: Property[]) {
  safeSetPreviewItem(previewPropertiesKey, JSON.stringify(properties));
}

function updatePreviewPropertyPublication(propertyId: string, isPublished: boolean) {
  const properties = readPreviewProperties();
  const property = properties.find((item) => item.id === propertyId);
  if (!property) throw new Error("Imóvel não encontrado.");

  const now = new Date().toISOString();
  const updated: Property = {
    ...property,
    published_at: isPublished ? property.published_at ?? now : null,
    publication_settings_json: {
      ...property.publication_settings_json,
      site_enabled: isPublished,
    },
    updated_at: now,
  };

  writePreviewProperties(properties.map((item) => (item.id === propertyId ? updated : item)));
  return updated;
}

function pickPublicationProperty(property: Property) {
  return {
    id: property.id,
    code: property.code,
    title: property.title,
    status: property.status,
    published_at: property.published_at,
  };
}

function getPreviewPublicSite(slug: string): PublicSiteResponse {
  const site = readPreviewSite();
  if (!site || site.slug !== slug) throw new Error("Site não encontrado.");

  const autoPublish = site.settings_json.auto_publish_properties !== false;
  const properties = readPreviewProperties()
    .filter((property) => property.status !== "archived" && (autoPublish || Boolean(property.published_at)))
    .sort((a, b) => {
      const aFeatured = site.settings_json.featured_property_ids?.includes(a.id) ? 0 : 1;
      const bFeatured = site.settings_json.featured_property_ids?.includes(b.id) ? 0 : 1;
      if (aFeatured !== bFeatured) return aFeatured - bFeatured;
      return (b.published_at ?? "").localeCompare(a.published_at ?? "");
    });

  return {
    site: publicSiteView(site),
    company: { id: "preview-company", name: site.brand_name, status: "preview" },
    featured_properties: properties.slice(0, 6),
    properties,
  };
}

function getFallbackPublicSite(slug: string, error?: unknown): PublicSiteResponse {
  const existingSite = readPreviewSite();
  const site: CompanySite =
    existingSite && existingSite.slug === slug
      ? existingSite
      : {
          id: "public-preview-site",
          company_id: "preview-company",
          slug: sanitizeSlug(slug || "imobiflow-preview"),
          custom_domain: null,
          status: "published",
          brand_name: "Imóveis",
          headline: "Imóveis selecionados com atendimento familiar e alto padrão",
          description:
            "Uma vitrine imobiliária premium preparada para venda, locação, captação de proprietários e geração de leads pelo ImobiFlow.",
          phone: null,
          whatsapp: null,
          email: null,
          logo_url: "/site-templates/imoveis-logo.png",
          primary_color: "#c89b3c",
          settings_json: {
            show_full_address: false,
            show_prices: true,
            allow_lead_capture: true,
            auto_publish_properties: true,
            template_key: defaultSiteTemplateKey,
            featured_property_ids: [],
          },
          seo_json: {
            fallback_reason: error instanceof Error ? error.message : null,
          },
          published_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

  const properties = readPreviewProperties()
    .filter((property) => property.status !== "archived")
    .sort((a, b) => (b.published_at ?? b.updated_at ?? "").localeCompare(a.published_at ?? a.updated_at ?? ""));

  return {
    site: publicSiteView(site),
    company: { id: "preview-company", name: site.brand_name, status: "preview" },
    featured_properties: properties.slice(0, 6),
    properties,
  };
}

function publicSiteView(site: CompanySite): PublicSiteResponse["site"] {
  return {
    id: site.id,
    slug: site.slug,
    custom_domain: site.custom_domain,
    brand_name: site.brand_name,
    headline: site.headline,
    description: site.description,
    phone: site.phone,
    whatsapp: site.whatsapp,
    email: site.email,
    logo_url: site.logo_url,
    primary_color: site.primary_color,
    settings_json: site.settings_json,
    seo_json: site.seo_json,
    published_at: site.published_at,
  };
}

function readPreviewSiteLeads() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewSiteLeadsKey) ?? "[]") as SiteLead[];
  } catch {
    return [];
  }
}

function writePreviewSiteLeads(leads: SiteLead[]) {
  safeSetPreviewItem(previewSiteLeadsKey, JSON.stringify(leads.slice(0, 200)), () => JSON.stringify(leads.slice(0, 50)));
}

function createPreviewSiteLead(
  slug: string,
  input: { name: string; email?: string; phone?: string; message?: string; property_id?: string },
) {
  const now = new Date().toISOString();
  const site = readPreviewSite();
  const property = readPreviewProperties().find((item) => item.id === input.property_id);
  const crmLead = isPreviewSites()
    ? createLead({
        name: input.name,
        email: input.email,
        phone: input.phone,
        source: "site",
        interest_type: property?.operation === "sale" ? "sale" : property?.operation === "rent" ? "rent" : "both",
        property_reference: property?.code ?? property?.title ?? undefined,
        notes: [input.message, site?.brand_name ? `Site: ${site.brand_name}` : null, property?.title ? `Imóvel: ${property.title}` : null]
          .filter(Boolean)
          .join("\n"),
      })
    : null;

  const lead: SiteLead = {
    id: window.crypto.randomUUID(),
    property_id: input.property_id || null,
    lead_id: null,
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    message: input.message || null,
    source_url: `/site/${slug}`,
    created_at: now,
  };

  if (crmLead) {
    void crmLead.then((response) => {
      const current = readPreviewSiteLeads();
      writePreviewSiteLeads(current.map((item) => (item.id === lead.id ? { ...item, lead_id: response.lead.id } : item)));
    });
  }

  writePreviewSiteLeads([lead, ...readPreviewSiteLeads()]);
  return lead;
}

function sanitizeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "imobiflow-preview";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
