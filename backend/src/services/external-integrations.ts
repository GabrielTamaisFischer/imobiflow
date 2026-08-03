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
};

export const integrationProviderCatalog: IntegrationProviderCatalogItem[] = [
  {
    provider: "whatsapp_business",
    label: "WhatsApp Business API",
    category: "communication",
    stage: "requires_credentials",
    capabilities: ["send_messages", "templates", "webhooks", "lead_history"],
    requiredCredentialRefs: ["WHATSAPP_PROVIDER_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
    requiredSettings: ["business_account_id", "phone_number_id", "default_country_code"],
    webhookEvents: ["message.received", "message.delivered", "message.failed", "template.status_changed"],
    notes: "Mantem a configuracao preparada; o adapter real sera ativado quando a situacao da API for definida.",
  },
  {
    provider: "zap_imoveis",
    label: "ZAP Imóveis",
    category: "real_estate_portal",
    stage: "planned_adapter",
    capabilities: ["property_feed", "lead_capture", "publication_status"],
    requiredCredentialRefs: ["ZAP_IMOVEIS_CLIENT_ID", "ZAP_IMOVEIS_CLIENT_SECRET"],
    requiredSettings: ["agency_id", "feed_url", "publication_profile"],
    webhookEvents: ["lead.created", "listing.published", "listing.rejected"],
    notes: "Preparado para publicacao/sincronizacao de imoveis e captura de leads quando credenciais comerciais estiverem disponiveis.",
  },
  {
    provider: "olx",
    label: "OLX",
    category: "real_estate_portal",
    stage: "planned_adapter",
    capabilities: ["property_feed", "lead_capture", "publication_status"],
    requiredCredentialRefs: ["OLX_CLIENT_ID", "OLX_CLIENT_SECRET"],
    requiredSettings: ["account_id", "feed_url", "publication_profile"],
    webhookEvents: ["lead.created", "listing.published", "listing.rejected"],
    notes: "Preparado para publicar imoveis e registrar leads externos no CRM com origem OLX.",
  },
  {
    provider: "viva_real",
    label: "Viva Real",
    category: "real_estate_portal",
    stage: "planned_adapter",
    capabilities: ["property_feed", "lead_capture", "publication_status"],
    requiredCredentialRefs: ["VIVA_REAL_CLIENT_ID", "VIVA_REAL_CLIENT_SECRET"],
    requiredSettings: ["agency_id", "feed_url", "publication_profile"],
    webhookEvents: ["lead.created", "listing.published", "listing.rejected"],
    notes: "Preparado para integracao com vitrine, publicacao e captura de leads do portal.",
  },
  {
    provider: "stripe",
    label: "Stripe",
    category: "payment",
    stage: "configurable",
    capabilities: ["checkout", "subscription_status", "webhooks", "payment_links"],
    requiredCredentialRefs: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    requiredSettings: ["account_id", "default_currency"],
    webhookEvents: ["checkout.session.completed", "customer.subscription.updated", "invoice.payment_failed"],
    notes: "Pode ser usado para assinatura SaaS ou cobrancas avulsas, mantendo webhook auditavel.",
  },
  {
    provider: "google",
    label: "Google",
    category: "productivity",
    stage: "requires_credentials",
    capabilities: ["maps", "calendar", "oauth", "address_autocomplete"],
    requiredCredentialRefs: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_MAPS_API_KEY"],
    requiredSettings: ["oauth_redirect_uri", "maps_enabled", "calendar_enabled"],
    webhookEvents: ["calendar.event_changed", "oauth.revoked"],
    notes: "Preparado para mapas, agenda e login/OAuth conforme escopo autorizado pela empresa.",
  },
  {
    provider: "asaas",
    label: "Asaas",
    category: "payment",
    stage: "configurable",
    capabilities: ["pix", "boleto", "customers", "webhooks", "charge_status"],
    requiredCredentialRefs: ["ASAAS_API_KEY", "ASAAS_WEBHOOK_SECRET"],
    requiredSettings: ["wallet_id", "environment", "default_payment_method"],
    webhookEvents: ["payment.created", "payment.received", "payment.overdue", "payment.refunded"],
    notes: "Complementa a base financeira ja existente e sera usado para cobrancas PIX/boleto quando habilitado.",
  },
  {
    provider: "receita_federal",
    label: "Receita Federal",
    category: "identity",
    stage: "requires_credentials",
    capabilities: ["cnpj_lookup", "company_enrichment", "document_validation"],
    requiredCredentialRefs: ["RECEITA_FEDERAL_API_KEY"],
    requiredSettings: ["provider_base_url", "cache_days"],
    webhookEvents: [],
    notes: "Preparado para consulta/validacao de CNPJ via provedor autorizado ou API contratada.",
  },
];

export function getIntegrationProvider(provider: string) {
  return integrationProviderCatalog.find((item) => item.provider === provider);
}
