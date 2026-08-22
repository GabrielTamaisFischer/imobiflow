import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, ExternalLink, Globe2, Loader2, PlugZap, Plus, RotateCw, Send, XCircle } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import {
  checkIntegrationConnection,
  createIntegrationConnection,
  listIntegrationConnections,
  listIntegrationProviders,
  type IntegrationConnection,
  type IntegrationConnectionInput,
  type IntegrationProvider,
  type IntegrationProviderCatalogItem,
} from "@/product/integrations";
import {
  buildPortalFeedUrl,
  createPortalPublication,
  listPortalPublications,
  portalProviderLabels,
  portalProviders,
  type PortalProvider,
  type PortalPublication,
} from "@/product/portal-integrations";
import { listAllProperties, type Property, type PropertySummary } from "@/product/real-estate";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/integracoes")({
  component: IntegrationsPage,
});

const categoryLabels = {
  communication: "Comunicação",
  real_estate_portal: "Portais imobiliários",
  payment: "Pagamentos",
  identity: "Dados e identidade",
  productivity: "Produtividade",
  other: "Outros",
};

const stageLabels = {
  configurable: "Configurável",
  requires_credentials: "Aguardando credenciais",
  planned_adapter: "Adapter planejado",
};

function IntegrationsPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("integrations");
  const [providers, setProviders] = useState<IntegrationProviderCatalogItem[]>([]);
  const [connections, setConnections] = useState<IntegrationConnection[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [portalPublications, setPortalPublications] = useState<PortalPublication[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isBusy, setIsBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refreshIntegrations() {
    setIsBusy(true);
    setError(null);

    try {
      const [providerResponse, connectionResponse, propertyResponse, publicationResponse] = await Promise.all([
        listIntegrationProviders(),
        listIntegrationConnections(),
        listAllProperties(),
        listPortalPublications(),
      ]);
      setProviders(providerResponse.providers);
      setConnections(connectionResponse.connections);
      setProperties(propertyResponse.properties);
      setPortalPublications(publicationResponse.publications);
    } catch (integrationError) {
      setError(integrationError instanceof Error ? integrationError.message : "Não foi possível carregar integrações.");
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    if (!isLoading && session) void refreshIntegrations();
  }, [isLoading, session]);

  const providersByKey = useMemo(
    () => Object.fromEntries(providers.map((provider) => [provider.provider, provider])),
    [providers],
  ) as Partial<Record<IntegrationProvider, IntegrationProviderCatalogItem>>;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      <section className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Central de integrações</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte canais externos usando referências seguras de credenciais. Segredos ficam em variáveis de ambiente ou cofre externo.
          </p>
        </div>
        <Button type="button" onClick={() => setShowForm((current) => !current)} className="w-full md:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Nova integração
        </Button>
      </section>

      {session?.access.subscription?.plan_slug === "preview" ? (
        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Modo visualização ativo: conexões reais exigem backend publicado, credenciais e assinatura ativa.
        </div>
      ) : null}

      {showForm ? (
        <IntegrationConnectionForm
          providers={providers}
          onCancel={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            void refreshIntegrations();
          }}
        />
      ) : null}

      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {isBusy ? (
        <section className="flex min-h-[320px] items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando integrações...
        </section>
      ) : connections.length === 0 ? (
        <EmptyState
          icon={PlugZap}
          title="Nenhuma integração conectada"
          description="Configure uma conexão para WhatsApp, portais, pagamentos, Google ou Receita Federal."
          actionLabel="Configurar integração"
          onAction={() => setShowForm(true)}
        />
      ) : (
        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              provider={providersByKey[connection.provider]}
              onChanged={() => void refreshIntegrations()}
            />
          ))}
        </section>
      )}

      <PortalPublicationsPanel
        companyId={session?.access.company?.id}
        properties={properties}
        publications={portalPublications}
        onChanged={() => void refreshIntegrations()}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {providers.map((provider) => (
          <ProviderCard key={provider.provider} provider={provider} />
        ))}
      </section>
    </ModulePage>
  );
}

function PortalPublicationsPanel({
  companyId,
  properties,
  publications,
  onChanged,
}: {
  companyId?: string;
  properties: PropertySummary[];
  publications: PortalPublication[];
  onChanged: () => void;
}) {
  const [propertyId, setPropertyId] = useState("");
  const [provider, setProvider] = useState<PortalProvider>("zap_imoveis");
  const [status, setStatus] = useState<"queued" | "published" | "paused" | "draft">("queued");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const publishableProperties = properties.filter((property) =>
    ["available", "reserved", "draft"].includes(property.status),
  );

  useEffect(() => {
    if (!propertyId && publishableProperties[0]) setPropertyId(publishableProperties[0].id);
  }, [propertyId, publishableProperties]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyId) return;

    setIsSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      await createPortalPublication({
        property_id: propertyId,
        provider,
        status,
        external_listing_id: String(form.get("external_listing_id") ?? ""),
        listing_url: String(form.get("listing_url") ?? ""),
      });
      onChanged();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível publicar o imóvel.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center text-base font-semibold">
            <Globe2 className="mr-2 h-4 w-4" />
            Publicação em portais
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Prepare imóveis reais para ZAP Imóveis, OLX e Viva Real. O feed público só entrega imóveis publicados e vinculados à empresa.
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          {publications.length} {publications.length === 1 ? "publicação" : "publicações"}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {portalProviders.map((portalProvider) => (
          <div
            key={portalProvider}
            className="rounded-lg border border-border bg-background p-3 text-sm transition hover:border-primary/50"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{portalProviderLabels[portalProvider]}</span>
              <Globe2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 grid gap-2">
              <PortalFeedLink label="JSON" url={buildPortalFeedUrl(portalProvider, companyId, "json")} />
              <PortalFeedLink label="XML" url={buildPortalFeedUrl(portalProvider, companyId, "xml")} />
            </div>
          </div>
        ))}
      </div>
      {!buildPortalFeedUrl("zap_imoveis", companyId, "json") ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Os feeds reais dependem da API publicada. Em produção, a implantação Vercel usa /api por padrão; em desenvolvimento, configure a URL da API para evitar localhost.
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded-lg border border-border bg-background p-3 lg:grid-cols-5">
        <label className="text-sm lg:col-span-2">
          <span className="font-medium">Imóvel</span>
          <select
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
            disabled={publishableProperties.length === 0}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {publishableProperties.length === 0 ? <option value="">Nenhum imóvel disponível</option> : null}
            {publishableProperties.map((property) => (
              <option key={property.id} value={property.id}>
                {property.code ? `${property.code} - ` : ""}
                {property.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">Portal</span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as PortalProvider)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {portalProviders.map((portalProvider) => (
              <option key={portalProvider} value={portalProvider}>
                {portalProviderLabels[portalProvider]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="queued">Na fila</option>
            <option value="published">Publicado</option>
            <option value="draft">Rascunho</option>
            <option value="paused">Pausado</option>
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={isSubmitting || !propertyId} className="w-full">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Publicar
          </Button>
        </div>
        <Field name="external_listing_id" label="ID externo" placeholder="Opcional" />
        <label className="text-sm lg:col-span-4">
          <span className="font-medium">URL do anúncio</span>
          <input
            name="listing_url"
            placeholder="Opcional após publicação no portal"
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </label>
      </form>

      {publishableProperties.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Cadastre imóveis reais em status disponível, reservado ou rascunho para habilitar publicação nos portais.
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      {publications.length === 0 ? (
        <p className="mt-4 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          Nenhum imóvel publicado em portais ainda. As publicações aparecerão aqui sem criar dados fictícios.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {publications.map((publication) => (
            <article key={publication.id} className="rounded-lg border border-border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">
                    {publication.properties?.title ?? "Imóvel não encontrado"}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {portalProviderLabels[publication.provider]} · {formatPortalStatus(publication.status)}
                    {publication.properties?.city ? ` · ${publication.properties.city}/${publication.properties.state ?? ""}` : ""}
                  </p>
                </div>
                <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
                  {publication.properties?.code || publication.properties?.operation || "portal"}
                </span>
              </div>
              {publication.last_error ? (
                <p className="mt-2 text-xs text-destructive">{publication.last_error}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {publication.external_listing_id ? <span>ID externo: {publication.external_listing_id}</span> : null}
                {publication.last_synced_at ? <span>Sincronizado em {formatDate(publication.last_synced_at)}</span> : null}
                {publication.listing_url ? (
                  <a href={publication.listing_url} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                    Abrir anúncio
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function PortalFeedLink({ label, url }: { label: string; url: string | null }) {
  if (!url) {
    return (
      <div className="rounded-md border border-dashed border-border px-2 py-1.5">
        <span className="flex items-center justify-between gap-2 text-xs font-medium">
          Feed {label}
          <XCircle className="h-3.5 w-3.5 text-amber-600" />
        </span>
        <span className="mt-1 block text-[11px] text-muted-foreground">Aguardando API publicada</span>
      </div>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="rounded-md border border-border px-2 py-1.5 hover:border-primary/50">
      <span className="flex items-center justify-between gap-2 text-xs font-medium">
        Feed {label}
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
      </span>
      <span className="mt-1 block break-all text-[11px] text-muted-foreground">{url}</span>
    </a>
  );
}

function IntegrationConnectionForm({
  providers,
  onCancel,
  onCreated,
}: {
  providers: IntegrationProviderCatalogItem[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [provider, setProvider] = useState<IntegrationProvider>("whatsapp_business");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedProvider = providers.find((item) => item.provider === provider);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const settings = parseSettings(String(form.get("settings") ?? "{}"));
    if (settings instanceof Error) {
      setError(settings.message);
      setIsSubmitting(false);
      return;
    }

    const input: IntegrationConnectionInput = {
      provider,
      name: String(form.get("name") ?? ""),
      status: String(form.get("status") ?? "testing") as IntegrationConnectionInput["status"],
      environment: String(form.get("environment") ?? "sandbox") as IntegrationConnectionInput["environment"],
      credentials_ref: String(form.get("credentials_ref") ?? ""),
      webhook_secret_ref: String(form.get("webhook_secret_ref") ?? ""),
      settings,
    };

    try {
      await createIntegrationConnection(input);
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível criar a integração.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Nova integração</h2>
          <p className="text-sm text-muted-foreground">
            Informe referências de credenciais, não cole chaves secretas diretamente aqui.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm">
          <span className="font-medium">Provedor</span>
          <select
            value={provider}
            onChange={(event) => setProvider(event.target.value as IntegrationProvider)}
            className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {providers.map((item) => (
              <option key={item.provider} value={item.provider}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <Field name="name" label="Nome da conexão" defaultValue={selectedProvider?.label ?? ""} required />
        <label className="text-sm">
          <span className="font-medium">Ambiente</span>
          <select name="environment" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="sandbox">Sandbox</option>
            <option value="production">Produção</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="font-medium">Status</span>
          <select name="status" className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="testing">Teste</option>
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
          </select>
        </label>
        <Field name="credentials_ref" label="Referência de credencial" placeholder="Ex: ASAAS_API_KEY" />
        <Field name="webhook_secret_ref" label="Referência de webhook" placeholder="Ex: ASAAS_WEBHOOK_SECRET" />
      </div>

      <label className="mt-3 block text-sm">
        <span className="font-medium">Configurações JSON</span>
        <textarea
          name="settings"
          rows={5}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          defaultValue={JSON.stringify(buildDefaultSettings(selectedProvider), null, 2)}
        />
      </label>

      {selectedProvider ? (
        <div className="mt-3 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
          Credenciais esperadas: {selectedProvider.requiredCredentialRefs.join(", ") || "nenhuma"}. Eventos:
          {" "}
          {selectedProvider.webhookEvents.join(", ") || "sem webhook nesta etapa"}.
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}
          Salvar integração
        </Button>
      </div>
    </form>
  );
}

function ConnectionCard({
  connection,
  provider,
  onChanged,
}: {
  connection: IntegrationConnection;
  provider?: IntegrationProviderCatalogItem;
  onChanged: () => void;
}) {
  const [isChecking, setIsChecking] = useState(false);
  const readiness = connection.settings?.readiness as { ready?: boolean; missing?: string[] } | undefined;

  async function handleCheck() {
    setIsChecking(true);
    try {
      await checkIntegrationConnection(connection.id);
      onChanged();
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{connection.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {provider?.label ?? connection.provider} · {categoryLabels[connection.category]} · {connection.environment}
          </p>
        </div>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {connection.status}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm">
        {readiness?.ready ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <XCircle className="h-4 w-4 text-amber-600" />
        )}
        <span className="text-muted-foreground">
          {readiness?.ready ? "Configuração pronta" : `Pendente: ${readiness?.missing?.join(", ") || connection.last_error || "verificação"}`}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {connection.capabilities.map((capability) => (
          <span key={capability} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {capability}
          </span>
        ))}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={handleCheck} disabled={isChecking} className="mt-4">
        {isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
        Verificar
      </Button>
    </article>
  );
}

function ProviderCard({ provider }: { provider: IntegrationProviderCatalogItem }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{provider.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{categoryLabels[provider.category]}</p>
        </div>
        <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
          {stageLabels[provider.stage]}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{provider.notes}</p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {provider.env_ready ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-amber-600" />}
        <span className="text-muted-foreground">{provider.env_ready ? "Variáveis configuradas" : "Aguardando variáveis"}</span>
      </div>
    </article>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm">
      <span className="font-medium">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}

function parseSettings(value: string) {
  try {
    const parsed = JSON.parse(value || "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : new Error("Configurações precisam ser um objeto JSON.");
  } catch {
    return new Error("JSON de configurações inválido.");
  }
}

function buildDefaultSettings(provider?: IntegrationProviderCatalogItem) {
  if (!provider) return {};
  return Object.fromEntries(provider.requiredSettings.map((setting) => [setting, ""]));
}

function formatPortalStatus(status: PortalPublication["status"]) {
  const labels: Record<PortalPublication["status"], string> = {
    draft: "Rascunho",
    queued: "Na fila",
    published: "Publicado",
    rejected: "Rejeitado",
    paused: "Pausado",
    archived: "Arquivado",
  };

  return labels[status];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
