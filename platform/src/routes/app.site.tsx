import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import {
  ExternalLink,
  FolderUp,
  Globe2,
  Heart,
  Home,
  ImageIcon,
  Layers3,
  Loader2,
  MessageCircle,
  Power,
  PowerOff,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { Button } from "@/components/ui/button";
import { getModuleByKey } from "@/product/app-modules";
import { listAllProperties, type PropertySummary } from "@/product/real-estate";
import { defaultSiteTemplateKey, siteTemplates, type SiteTemplate, type SiteTemplateKey } from "@/product/site-templates";
import {
  getSiteSettings,
  listSiteLeads,
  publishSite,
  saveSiteSettings,
  unpublishSite,
  type CompanySite,
  type SiteLead,
} from "@/product/sites";
import { useSessionGuard } from "@/product/use-session-guard";
import { BUILDER_VISUAL_PREVIEW_SANDBOX } from "@/product/website-preview-security";
import {
  createBlankWebsite,
  createWebsiteBuilderWebsite,
  createWebsiteBuilderComponent,
  createWebsiteBuilderPage,
  createWebsiteBuilderSection,
  deleteWebsiteBuilderWebsite,
  listWebsiteBuilderWebsites,
  updateWebsiteBuilderWebsite,
  type WebsiteBuilderWebsite,
} from "@/product/website-builder";
import {
  importGithubProjectIntoBuilder,
  importLocalProjectIntoBuilder,
  importLiveWebsiteIntoBuilder,
} from "@/product/website-project-import";

export const Route = createFileRoute("/app/site")({
  component: SitePage,
});

function SitePage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("site");
  const [site, setSite] = useState<CompanySite | null>(null);
  const [builderSites, setBuilderSites] = useState<WebsiteBuilderWebsite[]>([]);
  const [showcaseTab, setShowcaseTab] = useState<"models" | "my-sites">("models");
  const [favoriteTemplateKeys, setFavoriteTemplateKeys] = useState<SiteTemplateKey[]>([]);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importForm, setImportForm] = useState({ source: "local", name: "", slug: "", reference: "", previewUrl: "", fileName: "", githubToken: "" });
  const [selectedImportFiles, setSelectedImportFiles] = useState<File[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [leads, setLeads] = useState<SiteLead[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    slug: "",
    brand_name: "",
    headline: "",
    description: "",
    phone: "",
    whatsapp: "",
    email: "",
    logo_url: "/site-templates/imoveis-logo.png",
    primary_color: "#2563eb",
    template_key: defaultSiteTemplateKey as SiteTemplateKey,
    show_full_address: false,
    show_prices: true,
    allow_lead_capture: true,
    auto_publish_properties: true,
  });

  async function refresh() {
    setError(null);
    try {
      const [siteResponse, propertyResponse, leadsResponse] = await Promise.all([
        getSiteSettings(),
        listAllProperties(),
        listSiteLeads(),
      ]);
      setSite(siteResponse.site);
      setProperties(propertyResponse.properties);
      setLeads(leadsResponse.leads);
      try {
        const builderResponse = await listWebsiteBuilderWebsites();
        setBuilderSites(builderResponse.websites);
      } catch {
        setBuilderSites([]);
      }

      if (siteResponse.site) {
        setForm({
          slug: siteResponse.site.slug,
          brand_name: siteResponse.site.brand_name,
          headline: siteResponse.site.headline ?? "",
          description: siteResponse.site.description ?? "",
          phone: siteResponse.site.phone ?? "",
          whatsapp: siteResponse.site.whatsapp ?? "",
          email: siteResponse.site.email ?? "",
          logo_url: siteResponse.site.logo_url ?? "/site-templates/imoveis-logo.png",
          primary_color: siteResponse.site.primary_color,
          template_key: siteResponse.site.settings_json?.template_key ?? defaultSiteTemplateKey,
          show_full_address: Boolean(siteResponse.site.settings_json?.show_full_address),
          show_prices: siteResponse.site.settings_json?.show_prices !== false,
          allow_lead_capture: siteResponse.site.settings_json?.allow_lead_capture !== false,
          auto_publish_properties: siteResponse.site.settings_json?.auto_publish_properties !== false,
        });
        setFavoriteTemplateKeys(siteResponse.site.settings_json?.favorite_template_keys ?? []);
      } else if (session?.access.company?.name) {
        setForm((current) => ({
          ...current,
          brand_name: session.access.company?.name ?? "",
          slug: slugify(session.access.company?.name ?? "imobiliaria"),
          headline: "Encontre o imóvel ideal com atendimento consultivo.",
          description: "Carteira atualizada de imóveis para venda e locação, com atendimento direto da equipe.",
          logo_url: "/site-templates/imoveis-logo.png",
          template_key: defaultSiteTemplateKey,
        }));
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Não foi possível carregar o site.");
    }
  }

  useEffect(() => {
    if (pathname === "/app/site" && !isLoading && session) void refresh();
  }, [isLoading, pathname, session]);

  // BUG-SITE-003 (correção, 2026-08-30): esta métrica usava o toggle
  // "Publicar automaticamente..." como filtro — quando ligado, contava TODOS
  // os imóveis como "visíveis no site", mesmo sem nenhum publicado de fato.
  // A publicação real é 100% controlada por published_at (ações explícitas
  // Salvar e publicar / Publicar no site / Despublicar — nunca automática),
  // então a métrica precisa refletir isso sempre, sem exceção.
  const visibleOnSiteProperties = useMemo(
    () => properties.filter((property) => Boolean(property.published_at)),
    [properties],
  );
  const activeTemplate = useMemo(() => siteTemplates.find((template) => template.key === form.template_key) ?? siteTemplates[0], [form.template_key]);
  const primaryBuilderSite = builderSites[0] ?? null;
  const previewSlug = form.slug || slugify(form.brand_name) || "imoveis-premium-gold";
  // BUG-SITE-002 (correção): o site público só resolve de fato quando existe
  // um CompanySite salvo E publicado (mesmo gate de site/:slug no backend —
  // ver getMysqlPublishedSite). Antes disso, "publicUrl" NUNCA deve apontar
  // para uma URL real/clicável — apenas um slug adivinhado que sempre
  // resultava em "Site não encontrado". Ver Bugs Resolvidos.md.
  const publicUrl = site?.slug && site.status === "published" ? `/site/${site.slug}` : null;
  const siteNotLiveReason = !site
    ? "Salve os dados do site abaixo para criar o seu site."
    : site.status !== "published"
      ? "Clique em “Ativar site” para publicar e gerar o link público."
      : null;
  const favoriteTemplates = siteTemplates.filter((template) => favoriteTemplateKeys.includes(template.key));

  if (pathname !== "/app/site") {
    return <Outlet />;
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  function buildSiteInput(nextForm = form, nextFavoriteTemplateKeys = favoriteTemplateKeys) {
    return {
      slug: nextForm.slug,
      brand_name: nextForm.brand_name,
      headline: nextForm.headline,
      description: nextForm.description,
      phone: nextForm.phone,
      whatsapp: nextForm.whatsapp,
      email: nextForm.email,
      logo_url: nextForm.logo_url,
      primary_color: nextForm.primary_color,
      settings_json: {
        show_full_address: nextForm.show_full_address,
        show_prices: nextForm.show_prices,
        allow_lead_capture: nextForm.allow_lead_capture,
        auto_publish_properties: nextForm.auto_publish_properties,
        template_key: nextForm.template_key,
        favorite_template_keys: nextFavoriteTemplateKeys,
      },
    };
  }

  async function saveCurrentSite(nextForm = form, nextFavoriteTemplateKeys = favoriteTemplateKeys) {
    setIsBusy(true);
    setError(null);

    try {
      const response = await saveSiteSettings(buildSiteInput(nextForm, nextFavoriteTemplateKeys));
      setSite(response.site);
      return response.site;
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar o site.");
      return null;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveCurrentSite();
  }

  async function toggleSitePublication() {
    if (!site) return;
    setIsBusy(true);
    setError(null);
    try {
      setSite((site.status === "published" ? await unpublishSite() : await publishSite()).site);
    } catch (publicationError) {
      setError(publicationError instanceof Error ? publicationError.message : "Não foi possível alterar publicação.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleUseTemplate(templateKey: SiteTemplateKey) {
    const template = siteTemplates.find((item) => item.key === templateKey) ?? siteTemplates[0];
    const nextForm = {
      ...form,
      template_key: template.key,
      primary_color: template.palette[2] ?? form.primary_color,
      logo_url: template.preview_image,
    };
    setForm(nextForm);
    await saveCurrentSite(nextForm);
  }

  async function toggleFavoriteTemplate(templateKey: SiteTemplateKey) {
    const nextFavorites = favoriteTemplateKeys.includes(templateKey)
      ? favoriteTemplateKeys.filter((key) => key !== templateKey)
      : [...favoriteTemplateKeys, templateKey];
    setFavoriteTemplateKeys(nextFavorites);

    if (site) {
      await saveCurrentSite(undefined, nextFavorites);
    }
  }

  async function handleEditBuilderSite() {
    if (primaryBuilderSite) {
      openBuilderEditor(primaryBuilderSite.id);
      return;
    }
    await handleCreateBlankBuilderSite(true);
  }

  async function handleCreateBlankBuilderSite(openAfterCreate = false) {
    setIsBusy(true);
    setError(null);
    try {
      const response = await createBlankWebsite({
        name: `${form.brand_name || "Site da imobiliária"} - site em branco`,
        slug: uniqueBuilderSlug(form.slug || form.brand_name || "site"),
        theme_json: {
          colors: {
            primary: form.primary_color,
            background: "#080806",
            foreground: "#ffffff",
          },
        },
      });
      setBuilderSites((current) => [response.website, ...current]);
      if (openAfterCreate) {
        openBuilderEditor(response.website.id);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Não foi possível criar o site em branco.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteBuilderSite(websiteId: string) {
    const confirmed =
      typeof window === "undefined" ||
      window.confirm("Apagar este site do builder? Esta ação remove o projeto da aba Meus sites.");
    if (!confirmed) return;

    setIsBusy(true);
    setError(null);
    setBuilderSites((current) => current.filter((website) => website.id !== websiteId));
    try {
      await deleteWebsiteBuilderWebsite(websiteId);
      const response = await listWebsiteBuilderWebsites();
      setBuilderSites(response.websites);
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Não foi possível apagar este site.";
      if (!message.toLowerCase().includes("nao encontrado") && !message.toLowerCase().includes("não encontrado")) {
        setError(message);
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImportWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setError(null);

    try {
      const name = importForm.name || `Site importado ${builderSites.length + 1}`;
      const response = await createWebsiteBuilderWebsite({
        name,
        slug: uniqueBuilderSlug(importForm.slug || name),
        theme_json: {
          colors: {
            primary: form.primary_color,
            background: "#080806",
            foreground: "#ffffff",
          },
        },
        settings_json: {
          import_source: importForm.source,
          import_reference: importForm.reference || importForm.fileName || null,
          import_mode: "project_package",
          imported_at: new Date().toISOString(),
        },
      });
      if (importForm.source === "url" && (importForm.reference.trim() || importForm.previewUrl.trim())) {
        await importLiveWebsiteIntoBuilder({
          websiteId: response.website.id,
          url: importForm.reference.trim() || importForm.previewUrl.trim(),
          accentColor: form.primary_color,
        });
      } else if (importForm.source === "github" && importForm.reference.trim()) {
        await importGithubProjectIntoBuilder({
          websiteId: response.website.id,
          repositoryUrl: importForm.reference.trim(),
          token: importForm.githubToken.trim() || undefined,
          accentColor: form.primary_color,
          previewUrl: importForm.previewUrl.trim() || undefined,
        });
      } else if (selectedImportFiles.length) {
        await importLocalProjectIntoBuilder({
          websiteId: response.website.id,
          files: selectedImportFiles,
          reference: importForm.reference || importForm.fileName,
          accentColor: form.primary_color,
          previewUrl: importForm.previewUrl.trim() || undefined,
        });
      }
      const builderResponse = await listWebsiteBuilderWebsites();
      setBuilderSites(builderResponse.websites);
      setShowImportPanel(false);
      setImportForm({ source: "local", name: "", slug: "", reference: "", previewUrl: "", fileName: "", githubToken: "" });
      setSelectedImportFiles([]);
      openBuilderEditor(response.website.id);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Não foi possível preparar a importação do site.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <ModulePage session={session} module={module}>
      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Modelo ativo</p>
            <h2 className="mt-2 text-xl font-semibold">{activeTemplate.name}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Este é o visual atualmente escolhido para o site público. Os imóveis cadastrados e liberados entram automaticamente na vitrine.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {publicUrl ? (
                <Button variant="outline" asChild>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" />
                    Visualizar site
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{siteNotLiveReason}</span>
              )}
              <Button type="button" onClick={() => void handleEditBuilderSite()} disabled={isBusy}>
                <Layers3 className="size-4" />
                Editar site
              </Button>
              <Button type="button" variant="outline" onClick={() => void handleCreateBlankBuilderSite(true)} disabled={isBusy}>
                <Sparkles className="size-4" />
                Criar site do zero
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowImportPanel((current) => !current)} disabled={isBusy}>
                <FolderUp className="size-4" />
                Importar site existente
              </Button>
              <Button type="button" variant={site?.status === "published" ? "outline" : "default"} onClick={toggleSitePublication} disabled={isBusy || !site}>
                {site?.status === "published" ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                {site?.status === "published" ? "Desativar site" : "Ativar site"}
              </Button>
            </div>
          </div>
          <SiteTemplateLivePreview url={publicUrl} template={activeTemplate} compact />
        </div>
      </section>

      {showImportPanel ? (
        <section className="mb-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Importar site existente</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Importe uma pasta completa do projeto ou um repositório GitHub. O ImobiFlow lê rotas, componentes, CSS, dados e mídias para transformar tudo em estrutura editável.
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowImportPanel(false)}>
              Fechar
            </Button>
          </div>
          <form onSubmit={handleImportWebsite} className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Origem</span>
              <select
                className="h-10 w-full rounded-md border border-input bg-background px-3"
                value={importForm.source}
                onChange={(event) => {
                  setSelectedImportFiles([]);
                  setImportForm({ ...importForm, source: event.target.value, fileName: "" });
                }}
              >
                <option value="url">URL do site publicado</option>
                <option value="local">Pasta completa do site</option>
                <option value="xml">XML</option>
                <option value="github">GitHub</option>
                <option value="html">HTML / ZIP</option>
                <option value="other">Outro formato</option>
              </select>
            </label>
            <TextField label="Nome do site importado" value={importForm.name} onChange={(name) => setImportForm({ ...importForm, name })} />
            <TextField label="Slug" value={importForm.slug} onChange={(slug) => setImportForm({ ...importForm, slug: slugify(slug) })} />
            <TextField
              label="Link do GitHub, URL ou observação"
              value={importForm.reference}
              onChange={(reference) => setImportForm({ ...importForm, reference })}
            />
            <TextField
              label="URL real para preview no editor"
              value={importForm.previewUrl}
              onChange={(previewUrl) => setImportForm({ ...importForm, previewUrl })}
            />
            {importForm.source === "github" ? (
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block font-medium">Token GitHub temporário para repositório privado</span>
                <input
                  className="h-10 w-full rounded-md border border-input bg-background px-3"
                  type="password"
                  value={importForm.githubToken}
                  placeholder="Opcional para repositórios públicos. Necessário para privados."
                  onChange={(event) => setImportForm({ ...importForm, githubToken: event.target.value })}
                />
                <span className="mt-1 block text-xs text-muted-foreground">
                  O token é usado apenas nesta importação e não fica salvo no site.
                </span>
              </label>
            ) : null}
            {importForm.source === "url" ? (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-100 md:col-span-2">
                Para ver o site real dentro do editor, cole acima a URL publicada do site. Exemplo: /site/magnificopaginainicial#topo
              </div>
            ) : null}
            {importForm.source !== "url" ? (
            <label className="text-sm md:col-span-2">
              <span className="mb-1 block font-medium">Pasta ou arquivos do site</span>
              <input
                className="w-full rounded-md border border-dashed border-input bg-background px-3 py-2 text-sm"
                type="file"
                multiple
                accept={importForm.source === "local" ? undefined : ".zip,.xml,.html,.htm,.json,.tsx,.jsx,.ts,.js,.css"}
                {...({ webkitdirectory: importForm.source === "local" ? "true" : undefined, directory: importForm.source === "local" ? "true" : undefined } as Record<string, string | undefined>)}
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  setSelectedImportFiles(files);
                  setImportForm({
                    ...importForm,
                    fileName: files.length === 1 ? files[0].name : files.length > 1 ? `${files.length} arquivo(s) selecionado(s)` : "",
                  });
                }}
              />
              {importForm.fileName ? <span className="mt-1 block text-xs text-muted-foreground">Selecionado: {importForm.fileName}</span> : null}
              <span className="mt-1 block text-xs text-muted-foreground">
                Para importar uma pasta inteira, escolha “Pasta completa do site” e selecione a pasta raiz do projeto.
              </span>
            </label>
            ) : null}
            <div className="md:col-span-2">
              <Button type="submit" disabled={isBusy}>
                {isBusy ? <Loader2 className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}
                Criar projeto importado
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        <Metric icon={Globe2} label="Status" value={site?.status === "published" ? "Publicado" : site ? "Rascunho" : "Não criado"} />
        <Metric icon={Home} label="Imóveis visíveis no site" value={visibleOnSiteProperties.length} />
        <Metric icon={ImageIcon} label="Imóveis cadastrados" value={properties.length} />
        <Metric icon={MessageCircle} label="Leads do site" value={leads.length} />
      </section>

      <section className="mb-6 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Vitrine de modelos de site</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha o visual que a imobiliária vai usar. Os imóveis publicados entram automaticamente no modelo ativo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={showcaseTab === "models" ? "default" : "outline"} onClick={() => setShowcaseTab("models")}>
              Modelos da vitrine
            </Button>
            <Button type="button" size="sm" variant={showcaseTab === "my-sites" ? "default" : "outline"} onClick={() => setShowcaseTab("my-sites")}>
              Meus sites
            </Button>
            <span className="text-xs text-muted-foreground">{siteTemplates.length} modelo(s) disponível(is)</span>
          </div>
        </div>

        {showcaseTab === "models" ? (
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {siteTemplates.map((template) => {
            const isSelected = form.template_key === template.key;
            const templatePreviewUrl = publicUrl;
            const isFavorite = favoriteTemplateKeys.includes(template.key);
            return (
              <article
                key={template.key}
                className={
                  isSelected
                    ? "group overflow-hidden rounded-lg border border-primary bg-primary/5 p-4 ring-2 ring-primary/20"
                    : "group overflow-hidden rounded-lg border border-border bg-background p-4 transition hover:border-primary"
                }
              >
                <SiteTemplateLivePreview url={templatePreviewUrl} template={template} />
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{template.name}</h3>
                    {isSelected ? <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">Selecionado</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{template.subtitle}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {template.recommended_for.map((label) => (
                      <span key={label} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {templatePreviewUrl ? (
                      <Button type="button" variant="outline" size="sm" asChild>
                        <a href={templatePreviewUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                          Preview
                        </a>
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => void toggleFavoriteTemplate(template.key)} disabled={isBusy}>
                      <Heart className={isFavorite ? "size-4 fill-primary text-primary" : "size-4"} />
                      {isFavorite ? "Favorito" : "Favoritar"}
                    </Button>
                    <Button type="button" size="sm" onClick={() => void handleUseTemplate(template.key)} disabled={isBusy}>
                      Usar modelo
                    </Button>
                  </div>
                </div>
              </article>
            );
            })}
          </div>
        ) : (
          <MySitesShowcase
            builderSites={builderSites}
            favoriteTemplates={favoriteTemplates}
            publicUrl={publicUrl}
            onEdit={openBuilderEditor}
            onPreview={(website) => `/app/site/builder/preview/${website.id}`}
            onUseTemplate={(templateKey) => void handleUseTemplate(templateKey)}
            onDelete={(websiteId) => void handleDeleteBuilderSite(websiteId)}
          />
        )}
      </section>

      <section className="mb-6 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Dados do site público</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O site usa imóveis reais publicados e formulário conectado ao CRM.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="mt-4 grid gap-3 md:grid-cols-2">
          <TextField label="Nome da imobiliária" value={form.brand_name} onChange={(brand_name) => setForm({ ...form, brand_name })} />
          <TextField label="Slug público" value={form.slug} onChange={(slug) => setForm({ ...form, slug: slugify(slug) })} />
          <TextField label="Headline" value={form.headline} onChange={(headline) => setForm({ ...form, headline })} />
          <TextField label="WhatsApp" value={form.whatsapp} onChange={(whatsapp) => setForm({ ...form, whatsapp })} />
          <TextField label="E-mail" value={form.email} onChange={(email) => setForm({ ...form, email })} />
          <TextField label="Logo do site" value={form.logo_url} onChange={(logo_url) => setForm({ ...form, logo_url })} />
          <label className="text-sm">
            <span className="mb-1 block font-medium">Cor principal</span>
            <input
              className="h-10 w-full rounded-md border border-input bg-background px-3"
              type="color"
              value={form.primary_color}
              onChange={(event) => setForm({ ...form, primary_color: event.target.value })}
            />
          </label>
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block font-medium">Descrição</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </label>
          <div className="flex flex-wrap gap-4 text-sm md:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.show_prices} onChange={(event) => setForm({ ...form, show_prices: event.target.checked })} />
              Exibir preços
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.show_full_address} onChange={(event) => setForm({ ...form, show_full_address: event.target.checked })} />
              Exibir endereço completo
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.allow_lead_capture} onChange={(event) => setForm({ ...form, allow_lead_capture: event.target.checked })} />
              Capturar leads
            </label>
          </div>
          {/* BUG-SITE-003 (correção): removido o toggle "Publicar
              automaticamente imóveis cadastrados" — nunca teve efeito real no
              backend (nenhuma rota de criação/edição de imóvel o lia); a
              publicação é sempre uma ação explícita (Salvar e publicar, ou
              Publicar no site / Despublicar na edição), nunca automática. */}
          <p className="md:col-span-2 text-xs text-muted-foreground">
            Imóveis só aparecem no site depois de publicados explicitamente (botão “Salvar e publicar” no cadastro, ou “Publicar no site” na edição do imóvel).
          </p>
          <div className="md:col-span-2">
            <Button type="submit" disabled={isBusy}>
              {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Globe2 className="size-4" />}
              Salvar site
            </Button>
          </div>
        </form>
      </section>

    </ModulePage>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Globe2; label: string; value: string | number }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <Icon className="size-5 text-primary" />
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </article>
  );
}

function MySitesShowcase({
  builderSites,
  favoriteTemplates,
  publicUrl,
  onEdit,
  onPreview,
  onUseTemplate,
  onDelete,
}: {
  builderSites: WebsiteBuilderWebsite[];
  favoriteTemplates: SiteTemplate[];
  publicUrl: string | null;
  onEdit: (websiteId: string) => void;
  onPreview: (website: WebsiteBuilderWebsite) => string;
  onUseTemplate: (templateKey: SiteTemplateKey) => void;
  onDelete: (websiteId: string) => void;
}) {
  if (!builderSites.length && !favoriteTemplates.length) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-border bg-background p-8 text-center">
        <h3 className="text-sm font-semibold">Nenhum site salvo ainda</h3>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
          Sites criados do zero, importados e modelos favoritados aparecerão aqui para a imobiliária voltar a editar quando quiser.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      {builderSites.map((website) => {
        const source = typeof website.settingsJson.import_source === "string" ? website.settingsJson.import_source : null;
        const previewUrl = resolveBuilderWebsitePreviewUrl(website, onPreview(website));
        return (
          <article key={website.id} className="overflow-hidden rounded-lg border border-border bg-background p-4">
            <SiteProjectPreview url={previewUrl} title={website.name} />
            <div className="mt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{website.name}</h3>
                {source ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">Importado</span> : null}
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{website.status}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">/{website.slug}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {website._count?.pages ?? 0} página(s)
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {website._count?.assets ?? 0} asset(s)
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {website._count?.versions ?? 0} versão(ões)
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={previewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" />
                    Preview
                  </a>
                </Button>
                <Button type="button" size="sm" onClick={() => onEdit(website.id)}>
                  <Layers3 className="size-4" />
                  Editar site
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onDelete(website.id)}>
                  <Trash2 className="size-4" />
                  Apagar
                </Button>
              </div>
            </div>
          </article>
        );
      })}

      {favoriteTemplates.map((template) => (
        <article key={template.key} className="overflow-hidden rounded-lg border border-border bg-background p-4">
          <SiteTemplateLivePreview url={publicUrl} template={template} compact />
          <div className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{template.name}</h3>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] text-primary">Favorito</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{template.subtitle}</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{template.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {publicUrl ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" />
                    Preview
                  </a>
                </Button>
              ) : null}
              <Button type="button" size="sm" onClick={() => onUseTemplate(template.key)}>
                Usar modelo
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function SiteProjectPreview({ url, title }: { url: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-neutral-950 shadow-sm">
      <div className="flex h-9 items-center gap-2 border-b border-white/10 bg-neutral-900 px-3">
        <span className="size-2.5 rounded-full bg-red-400" />
        <span className="size-2.5 rounded-full bg-amber-300" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/65">Projeto - {title}</span>
      </div>
      <div className="relative h-[320px] overflow-hidden bg-neutral-950 sm:h-[380px]">
        <iframe
          className="h-[760px] w-[200%] origin-top-left scale-50 border-0"
          sandbox={BUILDER_VISUAL_PREVIEW_SANDBOX}
          referrerPolicy="no-referrer"
          src={url}
          title={`Preview ${title}`}
          loading="lazy"
        />
        <a className="absolute inset-0" href={url} target="_blank" rel="noreferrer" aria-label={`Abrir preview ${title}`} />
      </div>
    </div>
  );
}

function SiteTemplateLivePreview({ url, template, compact = false }: { url: string | null; template: SiteTemplate; compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-neutral-950 shadow-sm">
      <div className="flex h-9 items-center gap-2 border-b border-white/10 bg-neutral-900 px-3">
        <span className="size-2.5 rounded-full bg-red-400" />
        <span className="size-2.5 rounded-full bg-amber-300" />
        <span className="size-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/65">
          {url ? `Preview real do site - ${template.name}` : `Preview indisponível - ${template.name}`}
        </span>
      </div>
      <div className={compact ? "relative h-[300px] overflow-hidden bg-neutral-950 sm:h-[340px]" : "relative h-[360px] overflow-hidden bg-neutral-950 sm:h-[420px]"}>
        {url ? (
          <>
            <iframe
              className={compact ? "h-[680px] w-[200%] origin-top-left scale-50 border-0 transition duration-300 group-hover:scale-[0.52]" : "h-[840px] w-[200%] origin-top-left scale-50 border-0 transition duration-300 group-hover:scale-[0.52]"}
              sandbox={BUILDER_VISUAL_PREVIEW_SANDBOX}
              referrerPolicy="no-referrer"
              src={url}
              title={`Preview ${template.name}`}
              loading="lazy"
            />
            <a
              className="absolute inset-0"
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Abrir preview do modelo ${template.name}`}
            />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Globe2 className="size-6 text-white/40" />
            <p className="text-xs text-white/55">
              O preview real aparece aqui depois que o site é salvo e publicado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TextField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm">
      <span className="mb-1 block font-medium">{props.label}</span>
      <input
        className="h-10 w-full rounded-md border border-input bg-background px-3"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

type GitHubTreeItem = {
  path: string;
  type: "blob" | "tree";
  size?: number;
};

type GitHubRepositoryImportInput = {
  websiteId: string;
  repositoryUrl: string;
  token?: string;
};

type ImportedRouteFile = {
  path: string;
  slug: string;
  title: string;
  pageType: "home" | "property" | "about" | "contact" | "landing" | "blog" | "custom" | "terms" | "privacy";
  code: string;
  texts: string[];
};

async function importGithubRepositoryIntoBuilder({ websiteId, repositoryUrl, token }: GitHubRepositoryImportInput) {
  const repository = parseGithubRepository(repositoryUrl);
  if (!repository) {
    throw new Error("Informe um link válido de repositório GitHub. Exemplo: https://github.com/usuario/repositorio");
  }

  const headers = githubHeaders(token);
  const repoResponse = await fetch(`https://api.github.com/repos/${repository.owner}/${repository.repo}`, { headers });
  if (!repoResponse.ok) {
    if (repoResponse.status === 404) {
      throw new Error("Repositório GitHub não encontrado ou privado. Para repositório privado, informe um token GitHub temporário.");
    }
    throw new Error("Não foi possível acessar este repositório GitHub.");
  }

  const repo = (await repoResponse.json()) as {
    default_branch?: string;
    html_url?: string;
    homepage?: string | null;
    description?: string | null;
  };
  const branch = repo.default_branch || "main";
  const treeResponse = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers },
  );
  if (!treeResponse.ok) throw new Error("Não foi possível ler os arquivos do repositório GitHub.");

  const treePayload = (await treeResponse.json()) as { tree?: GitHubTreeItem[] };
  const files = (treePayload.tree ?? []).filter((item) => item.type === "blob");
  const routeFiles = files
    .filter((item) => /^src\/routes\/.+\.(tsx|jsx|ts|js)$/.test(item.path))
    .filter((item) => !item.path.includes("routeTree") && !item.path.endsWith("__root.tsx"))
    .sort((left, right) => routeSortWeight(left.path) - routeSortWeight(right.path) || left.path.localeCompare(right.path))
    .slice(0, 14);

  if (routeFiles.length === 0) {
    throw new Error("Não encontrei páginas em src/routes neste repositório. Nesta fase o importador reconhece projetos React e TanStack.");
  }

  const styleFile = files.find((item) => item.path === "src/styles.css" || item.path === "src/index.css" || item.path === "src/App.css");
  const propertyFile = files.find((item) => item.path === "src/data/properties.ts" || item.path === "src/data/properties.tsx");
  const assetFiles = files
    .filter((item) => /^(src\/assets|public)\//.test(item.path))
    .filter((item) => /\.(png|jpe?g|webp|gif|svg|mp4|webm)$/i.test(item.path))
    .slice(0, 30);

  const [styleCode, propertyCode, ...routeCodes] = await Promise.all([
    styleFile ? fetchGithubTextFile(repository, branch, styleFile.path, headers) : Promise.resolve(""),
    propertyFile ? fetchGithubTextFile(repository, branch, propertyFile.path, headers) : Promise.resolve(""),
    ...routeFiles.map((file) => fetchGithubTextFile(repository, branch, file.path, headers)),
  ]);

  const importedRoutes: ImportedRouteFile[] = routeFiles.map((file, index) => {
    const code = routeCodes[index] ?? "";
    return {
      path: file.path,
      slug: slugFromRoutePath(file.path),
      title: titleFromRouteCode(file.path, code),
      pageType: pageTypeFromRoutePath(file.path),
      code,
      texts: extractVisibleTexts(code).slice(0, 10),
    };
  });

  const externalPreviewUrl = inferExternalPreviewUrl(repositoryUrl, repo.homepage);
  const rawAssetUrls = assetFiles.map((file) => ({
    path: file.path,
    url: rawGithubUrl(repository, branch, file.path),
  }));

  await updateWebsiteBuilderWebsite(websiteId, {
    theme_json: inferThemeFromCss(styleCode),
    settings_json: {
      import_source: "github",
      import_repository: repo.html_url ?? repositoryUrl,
      import_branch: branch,
      imported_at: new Date().toISOString(),
      external_preview_url: externalPreviewUrl,
      imported_assets: rawAssetUrls,
      imported_routes: importedRoutes.map((route) => ({ path: route.path, slug: route.slug, title: route.title })),
      imported_property_model_detected: Boolean(propertyCode),
    },
  });

  for (let index = 0; index < importedRoutes.length; index += 1) {
    const route = importedRoutes[index];
    const pageResponse = await createWebsiteBuilderPage(websiteId, {
      title: route.title,
      slug: route.slug,
      page_type: route.pageType,
      status: "draft",
      sort_order: index,
      seo_json: {
        sourceFile: route.path,
        importedFrom: repo.html_url ?? repositoryUrl,
      },
      settings_json: {
        sourceFile: route.path,
        routePath: route.slug === "home" ? "/" : `/${route.slug}`,
        externalPreviewUrl: externalPreviewUrl ? joinPreviewPath(externalPreviewUrl, route.slug) : null,
      },
    });

    const firstAsset = rawAssetUrls.find((asset) => route.code.includes(asset.path.split("/").pop() ?? "")) ?? rawAssetUrls[index % Math.max(rawAssetUrls.length, 1)];
    const sectionResponse = await createWebsiteBuilderSection(pageResponse.page.id, {
      name: route.title,
      section_type: route.pageType === "home" ? "imported_home" : `imported_${route.pageType}`,
      sort_order: 0,
      props_json: {
        title: route.title,
        sourceFile: route.path,
        repository: repo.html_url ?? repositoryUrl,
        externalPreviewUrl: externalPreviewUrl ? joinPreviewPath(externalPreviewUrl, route.slug) : null,
        backgroundUrl: firstAsset?.url,
      },
      style_json: {
        backgroundColor: route.pageType === "home" ? "#090806" : "#11100d",
        color: "#ffffff",
        paddingY: route.pageType === "home" ? 96 : 72,
        borderRadius: 0,
      },
    });

    await createWebsiteBuilderComponent(sectionResponse.section.id, {
      name: "Titulo importado",
      component_type: "heading",
      sort_order: 0,
      props_json: { text: route.title },
    });

    for (let textIndex = 0; textIndex < Math.min(route.texts.length, 6); textIndex += 1) {
      await createWebsiteBuilderComponent(sectionResponse.section.id, {
        name: `Texto importado ${textIndex + 1}`,
        component_type: textIndex === 0 ? "text" : "imported_text",
        sort_order: textIndex + 1,
        props_json: { text: route.texts[textIndex], sourceFile: route.path },
      });
    }

    if (firstAsset) {
      await createWebsiteBuilderComponent(sectionResponse.section.id, {
        name: "Imagem detectada",
        component_type: "image",
        sort_order: 20,
        props_json: { imageUrl: firstAsset.url, alt: route.title, sourcePath: firstAsset.path },
      });
    }
  }

  if (rawAssetUrls.length > 0) {
    const pageResponse = await createWebsiteBuilderPage(websiteId, {
      title: "Biblioteca importada",
      slug: "biblioteca-importada",
      page_type: "custom",
      status: "draft",
      sort_order: importedRoutes.length,
      settings_json: { source: "github_assets" },
    });
    const sectionResponse = await createWebsiteBuilderSection(pageResponse.page.id, {
      name: "Assets detectados no GitHub",
      section_type: "imported_assets",
      sort_order: 0,
      props_json: {
        title: "Assets detectados no GitHub",
        repository: repo.html_url ?? repositoryUrl,
      },
      style_json: { backgroundColor: "#0c0b08", color: "#ffffff", paddingY: 72 },
    });

    for (let index = 0; index < Math.min(rawAssetUrls.length, 10); index += 1) {
      const asset = rawAssetUrls[index];
      await createWebsiteBuilderComponent(sectionResponse.section.id, {
        name: asset.path.split("/").pop() ?? `Asset ${index + 1}`,
        component_type: asset.url.match(/\.(mp4|webm)$/i) ? "video" : "image",
        sort_order: index,
        props_json: { imageUrl: asset.url, videoUrl: asset.url, alt: asset.path, sourcePath: asset.path },
      });
    }
  }
}

function githubHeaders(token?: string) {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function parseGithubRepository(value: string) {
  const match = value.match(/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/i, "") };
}

async function fetchGithubTextFile(
  repository: { owner: string; repo: string },
  branch: string,
  filePath: string,
  headers: Record<string, string>,
) {
  const response = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/contents/${encodeURIComponentPath(filePath)}?ref=${encodeURIComponent(branch)}`,
    { headers },
  );
  if (!response.ok) return "";
  const payload = (await response.json()) as { content?: string; encoding?: string };
  if (payload.encoding === "base64" && payload.content) {
    return decodeURIComponent(
      Array.from(atob(payload.content.replace(/\s/g, "")))
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join(""),
    );
  }
  return "";
}

function encodeURIComponentPath(filePath: string) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function rawGithubUrl(repository: { owner: string; repo: string }, branch: string, filePath: string) {
  return `https://raw.githubusercontent.com/${repository.owner}/${repository.repo}/${encodeURIComponent(branch)}/${filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function inferExternalPreviewUrl(repositoryUrl: string, homepage?: string | null) {
  if (homepage && /^https?:\/\//i.test(homepage)) return homepage.replace(/\/+$/, "");
  void repositoryUrl;
  return null;
}

function routeSortWeight(filePath: string) {
  if (filePath.endsWith("index.tsx") || filePath.endsWith("index.jsx")) return 0;
  if (filePath.includes("imoveis.tsx")) return 1;
  if (filePath.includes("sobre")) return 2;
  if (filePath.includes("como-trabalhamos")) return 3;
  if (filePath.includes("contato")) return 4;
  return 10;
}

function slugFromRoutePath(filePath: string) {
  const fileName = filePath.split("/").pop() ?? "pagina";
  const clean = fileName
    .replace(/\.(tsx|jsx|ts|js)$/i, "")
    .replace(/^index$/i, "home")
    .replace(/^imoveis_\.\$slug$/i, "imoveis-detalhe")
    .replace(/\$/g, "")
    .replace(/_/g, "-");
  return slugify(clean) || "pagina";
}

function pageTypeFromRoutePath(filePath: string): ImportedRouteFile["pageType"] {
  const slug = slugFromRoutePath(filePath);
  if (slug === "home") return "home";
  if (slug.includes("imoveis-detalhe")) return "property";
  if (slug.includes("sobre")) return "about";
  if (slug.includes("contato")) return "contact";
  if (slug.includes("termos")) return "terms";
  if (slug.includes("politica")) return "privacy";
  if (slug.includes("blog")) return "blog";
  return "custom";
}

function titleFromRouteCode(filePath: string, code: string) {
  const metaTitle = code.match(/\{\s*title:\s*"([^"]+)"/)?.[1] || code.match(/\{\s*title:\s*'([^']+)'/)?.[1];
  if (metaTitle) return metaTitle.split("·")[0].trim();
  const h1 = code.match(/<h1[^>]*>([^\n<]+)/)?.[1]?.trim();
  if (h1) return stripJsxText(h1);
  const slug = slugFromRoutePath(filePath);
  return slug === "home" ? "Página inicial importada" : titleCase(slug.replace(/-/g, " "));
}

function extractVisibleTexts(code: string) {
  return Array.from(
    new Set(
      [...code.matchAll(/>([^<>{}][^<>{]{18,180})</g)]
        .map((match) => stripJsxText(match[1]))
        .filter((text) => text.length > 18)
        .filter((text) => !/^[\\s.;,()]+$/.test(text)),
    ),
  );
}

function stripJsxText(value: string) {
  return value.replace(/\s+/g, " ").replace(/&middot;/g, "·").trim();
}

function inferThemeFromCss(css: string) {
  const gold = css.match(/--gold:\s*([^;]+)/)?.[1]?.trim();
  return {
    colors: {
      primary: gold?.startsWith("#") ? gold : "#d4af37",
      secondary: "#1f1b13",
      background: "#090806",
      foreground: "#ffffff",
      muted: "#8f8677",
    },
    fonts: {
      heading: "Cormorant Garamond, Playfair Display, Georgia, serif",
      body: "Inter, system-ui, -apple-system, sans-serif",
    },
    radius: {
      cards: 24,
      buttons: 999,
    },
  };
}

function joinPreviewPath(baseUrl: string, slug: string) {
  if (slug === "home") return baseUrl;
  return `${baseUrl.replace(/\/+$/, "")}/${slug}`;
}

function resolveBuilderWebsitePreviewUrl(website: WebsiteBuilderWebsite, fallback: string) {
  const external = typeof website.settingsJson.external_preview_url === "string" ? website.settingsJson.external_preview_url : "";
  if (!external) return fallback;
  return external;
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function openBuilderEditor(websiteId: string) {
  if (typeof window !== "undefined") {
    window.location.assign(`/app/site/builder/editor/${websiteId}`);
  }
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function uniqueBuilderSlug(value: string) {
  const base = slugify(value) || "site";
  return `${base}-${Date.now().toString(36)}`;
}
