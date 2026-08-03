import { apiRequest, getConfiguredApiUrl } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import type { Property } from "./real-estate";

const previewPortalPublicationsKey = "imobiflow.preview.portal_publications";
const previewPropertiesKey = "imobiflow.preview.properties";

export type PortalProvider = "zap_imoveis" | "olx" | "viva_real";

export type PortalPublicationStatus =
  | "draft"
  | "queued"
  | "published"
  | "rejected"
  | "paused"
  | "archived";

export type PortalPublication = {
  id: string;
  company_id: string;
  property_id: string;
  provider: PortalProvider;
  status: PortalPublicationStatus;
  external_listing_id: string | null;
  listing_url: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  properties?: {
    id: string;
    code: string | null;
    title: string;
    status: Property["status"];
    operation: Property["operation"];
    city: string | null;
    state: string | null;
  } | null;
};

export type PortalPublicationInput = {
  property_id: string;
  provider: PortalProvider;
  status?: Extract<PortalPublicationStatus, "draft" | "queued" | "published" | "paused">;
  external_listing_id?: string;
  listing_url?: string;
  metadata?: Record<string, unknown>;
};

export const portalProviderLabels: Record<PortalProvider, string> = {
  zap_imoveis: "ZAP Imóveis",
  olx: "OLX",
  viva_real: "Viva Real",
};

export const portalProviders = Object.keys(portalProviderLabels) as PortalProvider[];

function isPreviewPortals() {
  return isPreviewToken(getStoredToken());
}

export async function listPortalPublications(provider?: PortalProvider) {
  if (isPreviewPortals()) {
    const publications = readPreviewPortalPublications();
    return {
      publications: provider ? publications.filter((publication) => publication.provider === provider) : publications,
    };
  }

  const search = provider ? `?provider=${provider}` : "";
  return apiRequest<{ publications: PortalPublication[] }>(`/portal-integrations/publications${search}`, {
    token: getStoredToken() ?? undefined,
  });
}

export async function createPortalPublication(input: PortalPublicationInput) {
  if (isPreviewPortals()) {
    const publication = createPreviewPortalPublication(input);
    return { publication };
  }

  return apiRequest<{ publication: PortalPublication }>("/portal-integrations/publications", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export function buildPortalFeedUrl(provider: PortalProvider, companyId?: string, format: "json" | "xml" = "json") {
  const apiUrl = getConfiguredApiUrl();
  if (!apiUrl) return null;

  const resolvedCompanyId = companyId || "company_id";
  return `${apiUrl}/portal-integrations/${provider}/${resolvedCompanyId}/feed.${format}`;
}

function readPreviewPortalPublications() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewPortalPublicationsKey) ?? "[]") as PortalPublication[];
  } catch {
    return [];
  }
}

function writePreviewPortalPublications(publications: PortalPublication[]) {
  window.localStorage.setItem(previewPortalPublicationsKey, JSON.stringify(publications));
}

function readPreviewProperties() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewPropertiesKey) ?? "[]") as Property[];
  } catch {
    return [];
  }
}

function createPreviewPortalPublication(input: PortalPublicationInput): PortalPublication {
  const now = new Date().toISOString();
  const property = readPreviewProperties().find((item) => item.id === input.property_id);
  const existing = readPreviewPortalPublications().filter(
    (item) => !(item.property_id === input.property_id && item.provider === input.provider),
  );
  const publication: PortalPublication = {
    id: window.crypto.randomUUID(),
    company_id: property?.company_id ?? "preview-company",
    property_id: input.property_id,
    provider: input.provider,
    status: input.status ?? "queued",
    external_listing_id: input.external_listing_id || null,
    listing_url: input.listing_url || null,
    last_synced_at: now,
    last_error: null,
    published_at: input.status === "published" ? now : null,
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
    properties: property
      ? {
          id: property.id,
          code: property.code,
          title: property.title,
          status: property.status,
          operation: property.operation,
          city: property.city,
          state: property.state,
        }
      : null,
  };

  writePreviewPortalPublications([publication, ...existing]);
  return publication;
}
