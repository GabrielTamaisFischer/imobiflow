import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

export type IntegrationProvider =
  | "whatsapp_business"
  | "zap_imoveis"
  | "olx"
  | "viva_real"
  | "stripe"
  | "google"
  | "asaas"
  | "receita_federal";

export type IntegrationCategory =
  | "communication"
  | "real_estate_portal"
  | "payment"
  | "identity"
  | "productivity"
  | "other";

export type IntegrationProviderCatalogItem = {
  provider: IntegrationProvider;
  label: string;
  category: IntegrationCategory;
  stage: "configurable" | "requires_credentials" | "planned_adapter";
  capabilities: string[];
  requiredCredentialRefs: string[];
  requiredSettings: string[];
  webhookEvents: string[];
  notes: string;
  env_ready: boolean;
};

export type IntegrationConnection = {
  id: string;
  company_id: string;
  provider: IntegrationProvider;
  category: IntegrationCategory;
  name: string;
  status: "draft" | "testing" | "active" | "paused" | "error" | "archived";
  environment: "sandbox" | "production";
  credentials_ref: string | null;
  webhook_secret_ref: string | null;
  settings: Record<string, unknown>;
  capabilities: string[];
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationConnectionInput = {
  provider: IntegrationProvider;
  name: string;
  status: "draft" | "testing" | "active" | "paused";
  environment: "sandbox" | "production";
  credentials_ref?: string;
  webhook_secret_ref?: string;
  settings?: Record<string, unknown>;
};

function isPreviewIntegrations() {
  return isPreviewToken(getStoredToken());
}

export async function listIntegrationProviders() {
  if (isPreviewIntegrations()) {
    return { providers: previewProviders };
  }

  return apiRequest<{ providers: IntegrationProviderCatalogItem[] }>("/integrations/providers", {
    token: getStoredToken() ?? undefined,
  });
}

export async function listIntegrationConnections() {
  if (isPreviewIntegrations()) return { connections: [] as IntegrationConnection[] };

  return apiRequest<{ connections: IntegrationConnection[] }>("/integrations/connections", {
    token: getStoredToken() ?? undefined,
  });
}

export async function createIntegrationConnection(input: IntegrationConnectionInput) {
  if (isPreviewIntegrations()) {
    throw new Error("A configuração real de integrações exige backend publicado e sessão autenticada.");
  }

  return apiRequest<{ connection: IntegrationConnection }>("/integrations/connections", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function checkIntegrationConnection(connectionId: string) {
  if (isPreviewIntegrations()) {
    throw new Error("A verificação real de integrações exige backend publicado e sessão autenticada.");
  }

  return apiRequest<{
    connection: IntegrationConnection;
    readiness: { ready: boolean; missing: string[]; checked_at: string; stage: string };
  }>(`/integrations/connections/${connectionId}/check`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

const previewProviders: IntegrationProviderCatalogItem[] = [
  {
    provider: "whatsapp_business",
    label: "WhatsApp Business API",
    category: "communication",
    stage: "requires_credentials",
    capabilities: ["send_messages", "templates", "webhooks", "lead_history"],
    requiredCredentialRefs: ["WHATSAPP_PROVIDER_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
    requiredSettings: ["business_account_id", "phone_number_id"],
    webhookEvents: ["message.received", "message.delivered"],
    notes: "Preparado para ativar quando a situação real da API for definida.",
    env_ready: false,
  },
  {
    provider: "zap_imoveis",
    label: "ZAP Imóveis",
    category: "real_estate_portal",
    stage: "planned_adapter",
    capabilities: ["property_feed", "lead_capture"],
    requiredCredentialRefs: ["ZAP_IMOVEIS_CLIENT_ID", "ZAP_IMOVEIS_CLIENT_SECRET"],
    requiredSettings: ["agency_id", "feed_url"],
    webhookEvents: ["lead.created"],
    notes: "Preparado para publicação e leads.",
    env_ready: false,
  },
  {
    provider: "olx",
    label: "OLX",
    category: "real_estate_portal",
    stage: "planned_adapter",
    capabilities: ["property_feed", "lead_capture"],
    requiredCredentialRefs: ["OLX_CLIENT_ID", "OLX_CLIENT_SECRET"],
    requiredSettings: ["account_id", "feed_url"],
    webhookEvents: ["lead.created"],
    notes: "Preparado para origem OLX no CRM.",
    env_ready: false,
  },
  {
    provider: "viva_real",
    label: "Viva Real",
    category: "real_estate_portal",
    stage: "planned_adapter",
    capabilities: ["property_feed", "lead_capture"],
    requiredCredentialRefs: ["VIVA_REAL_CLIENT_ID", "VIVA_REAL_CLIENT_SECRET"],
    requiredSettings: ["agency_id", "feed_url"],
    webhookEvents: ["lead.created"],
    notes: "Preparado para portal Viva Real.",
    env_ready: false,
  },
  {
    provider: "stripe",
    label: "Stripe",
    category: "payment",
    stage: "configurable",
    capabilities: ["checkout", "subscription_status", "webhooks"],
    requiredCredentialRefs: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    requiredSettings: ["account_id", "default_currency"],
    webhookEvents: ["checkout.session.completed", "invoice.payment_failed"],
    notes: "Preparado para assinatura e pagamentos.",
    env_ready: false,
  },
  {
    provider: "google",
    label: "Google",
    category: "productivity",
    stage: "requires_credentials",
    capabilities: ["maps", "calendar", "oauth"],
    requiredCredentialRefs: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_MAPS_API_KEY"],
    requiredSettings: ["oauth_redirect_uri"],
    webhookEvents: ["calendar.event_changed"],
    notes: "Preparado para Maps, Calendar e OAuth.",
    env_ready: false,
  },
  {
    provider: "asaas",
    label: "Asaas",
    category: "payment",
    stage: "configurable",
    capabilities: ["pix", "boleto", "customers", "webhooks"],
    requiredCredentialRefs: ["ASAAS_API_KEY", "ASAAS_WEBHOOK_SECRET"],
    requiredSettings: ["wallet_id", "environment"],
    webhookEvents: ["payment.received", "payment.overdue"],
    notes: "Preparado para PIX e boleto.",
    env_ready: false,
  },
  {
    provider: "receita_federal",
    label: "Receita Federal",
    category: "identity",
    stage: "requires_credentials",
    capabilities: ["cnpj_lookup", "company_enrichment"],
    requiredCredentialRefs: ["RECEITA_FEDERAL_API_KEY"],
    requiredSettings: ["provider_base_url", "cache_days"],
    webhookEvents: [],
    notes: "Preparado para consulta de CNPJ via provedor autorizado.",
    env_ready: false,
  },
];
