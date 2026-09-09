import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  applyCompanySiteTemplate,
  getSiteSettings,
  listCompanySiteTemplates,
  publishSite,
  saveSiteSettings,
  type CompanySite,
  type CompanySiteTemplate,
} from "@/product/sites";
import { useSessionGuard } from "@/product/use-session-guard";
import { listAllProperties, type PropertySummary } from "@/product/real-estate";
import {
  duplicateSection as duplicateSectionModel,
  removeSection,
  reorderSections,
  type BuilderSection,
} from "@/product/company-site-builder-model";

type BuilderConfig = {
  template_key?: string;
  active_template_key?: string;
  theme?: Record<string, unknown>;
  sections?: BuilderSection[];
  [key: string]: unknown;
};

const sectionTypes = [
  "HEADER",
  "HERO",
  "SEARCH",
  "FEATURED_PROPERTIES",
  "PROPERTY_LIST",
  "ABOUT",
  "SERVICES",
  "BROKERS",
  "TESTIMONIALS",
  "CONTACT",
  "MAP",
  "CTA",
  "FORM",
  "FOOTER",
];

const friendlyNames: Record<string, string> = {
  HEADER: "Cabeçalho",
  HERO: "Hero",
  SEARCH: "Busca",
  FEATURED_PROPERTIES: "Imóveis em destaque",
  PROPERTY_LIST: "Lista de imóveis",
  ABOUT: "Sobre",
  SERVICES: "Serviços",
  BROKERS: "Corretores",
  TESTIMONIALS: "Depoimentos",
  CONTACT: "Contato",
  MAP: "Mapa",
  CTA: "Chamada",
  FORM: "Formulário",
  FOOTER: "Rodapé",
};

const defaultTheme: Record<string, unknown> = {
  primary: "#2563eb",
  secondary: "#0f172a",
  accent: "#93c5fd",
  background: "#f8fafc",
  text: "#0f172a",
  typography: "Inter",
  spacing: 20,
  radius: 16,
};

function normalizeConfig(site: CompanySite): BuilderConfig {
  const raw = (site.settings_json ?? {}) as Record<string, unknown>;
  const sections = Array.isArray(raw.sections) ? (raw.sections as BuilderSection[]) : [];
  const templateKey =
    site.template_key ?? (typeof raw.template_key === "string" ? raw.template_key : "classic");
  return {
    ...raw,
    template_key: templateKey,
    active_template_key: templateKey,
    theme: { ...defaultTheme, ...(raw.theme as Record<string, unknown> | undefined) },
    sections: [...sections].sort((a, b) => a.order - b.order),
  };
}

function idFor(type: string) {
  return `${type.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`;
}

export function CompanySiteBuilder() {
  const { session, isLoading: sessionLoading } = useSessionGuard();
  const [site, setSite] = useState<CompanySite | null>(null);
  const [config, setConfig] = useState<BuilderConfig>({ theme: defaultTheme, sections: [] });
  const [templates, setTemplates] = useState<CompanySiteTemplate[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(() => config.sections ?? [], [config.sections]);
  const selected = useMemo(
    () => sections.find((section) => section.id === selectedId) ?? null,
    [sections, selectedId],
  );

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [siteResponse, templateResponse, propertyResponse] = await Promise.all([
        getSiteSettings(),
        listCompanySiteTemplates(),
        listAllProperties(),
      ]);
      setSite(siteResponse.site);
      setTemplates(templateResponse.templates);
      setProperties(propertyResponse.properties);
      if (siteResponse.site) {
        const next = normalizeConfig(siteResponse.site);
        setConfig(next);
        setSelectedId(next.sections?.[0]?.id ?? "");
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Não foi possível carregar o site.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!sessionLoading && session) void load();
  }, [sessionLoading, session]);

  function patchConfig(patch: Partial<BuilderConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
    setMessage(null);
  }

  function updateSection(id: string, patch: Partial<BuilderSection>) {
    patchConfig({
      sections: sections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    });
  }

  function updateProps(id: string, patch: Record<string, unknown>) {
    const section = sections.find((item) => item.id === id);
    if (!section) return;
    updateSection(id, { props: { ...section.props, ...patch } });
  }

  function addSection(type: string) {
    const next = { id: idFor(type), type, enabled: true, order: sections.length, props: {} };
    patchConfig({ sections: [...sections, next] });
    setSelectedId(next.id);
  }

  function duplicateSection(section: BuilderSection) {
    const next = duplicateSectionModel(section, idFor(section.type), sections.length);
    patchConfig({ sections: [...sections, next] });
    setSelectedId(next.id);
  }

  function moveSection(index: number, direction: -1 | 1) {
    patchConfig({ sections: reorderSections(sections, index, direction) });
  }

  async function saveDraft(nextConfig = config): Promise<CompanySite | null> {
    if (!site) return null;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await saveSiteSettings({
        expected_version: site.version,
        slug: site.slug,
        brand_name: site.brand_name,
        headline: site.headline ?? "",
        description: site.description ?? "",
        phone: site.phone ?? "",
        whatsapp: site.whatsapp ?? "",
        email: site.email ?? "",
        logo_url: site.logo_url ?? undefined,
        primary_color: String(
          (nextConfig.theme as Record<string, unknown> | undefined)?.primary ?? site.primary_color,
        ),
        settings_json: nextConfig as CompanySite["settings_json"],
      });
      setSite(response.site);
      setConfig(normalizeConfig(response.site));
      setMessage("Rascunho salvo.");
      return response.site;
    } catch (saveError) {
      const text = saveError instanceof Error ? saveError.message : "Não foi possível salvar.";
      setError(
        text.includes("409") || text.toLowerCase().includes("alterado")
          ? "Conflito de versão: recarregue antes de salvar."
          : text,
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function applyTemplate(template: CompanySiteTemplate) {
    if (!site || !window.confirm(`Aplicar o template ${template.name} ao rascunho atual?`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await applyCompanySiteTemplate(template.key, site.version);
      setSite(response.site);
      const nextConfig = normalizeConfig(response.site);
      setConfig(nextConfig);
      setSelectedId(nextConfig.sections?.[0]?.id ?? "");
      setMessage("Template aplicado ao rascunho.");
    } catch (templateError) {
      setError(
        templateError instanceof Error
          ? templateError.message
          : "Não foi possível aplicar o template.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!site) return;
    const savedSite = await saveDraft(config);
    if (!savedSite) return;
    setBusy(true);
    setError(null);
    try {
      const response = await publishSite(savedSite.version);
      setSite(response.site);
      setMessage("Site publicado. O público usa o snapshot publicado.");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Não foi possível publicar.");
    } finally {
      setBusy(false);
    }
  }

  if (sessionLoading || (busy && !site))
    return (
      <div className="p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline size-4 animate-spin" />
        Carregando builder...
      </div>
    );
  if (!session) return null;

  return (
    <main className="min-h-screen bg-background p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Website Builder
          </p>
          <h1 className="text-2xl font-semibold">Editor visual do site</h1>
          <p className="text-sm text-muted-foreground">Rascunho separado da publicação pública.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void saveDraft()} disabled={busy || !site}>
            <Save className="size-4" />
            Salvar rascunho
          </Button>
          <Button onClick={() => void publish()} disabled={busy || !site}>
            Publicar site
          </Button>
        </div>
      </header>
      {error ? (
        <div
          role="alert"
          className="mb-4 rounded border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}
      {message ? (
        <div
          role="status"
          className="mb-4 rounded border border-primary/30 bg-primary/10 p-3 text-sm"
        >
          {message}
        </div>
      ) : null}
      {!site ? (
        <div className="rounded border p-6">
          Nenhum CompanySite configurado. Configure o site em{" "}
          <a className="underline" href="/app/site">
            Sites
          </a>{" "}
          antes de abrir o builder.
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="rounded border bg-card p-3">
            <h2 className="mb-2 font-semibold">Seções</h2>
            <div className="space-y-2">
              {sections.map((section, index) => (
                <div
                  key={section.id}
                  className={`rounded border p-2 ${selectedId === section.id ? "border-primary" : ""}`}
                >
                  <button
                    className="w-full text-left text-sm"
                    onClick={() => setSelectedId(section.id)}
                  >
                    {friendlyNames[section.type] ?? section.type}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {section.enabled ? "visível" : "oculta"}
                    </span>
                  </button>
                  <div className="mt-2 flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Mover para cima"
                      disabled={!index}
                      onClick={() => moveSection(index, -1)}
                    >
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Mover para baixo"
                      disabled={index === sections.length - 1}
                      onClick={() => moveSection(index, 1)}
                    >
                      <ArrowDown className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Duplicar seção"
                      onClick={() => duplicateSection(section)}
                    >
                      <Copy className="size-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Alternar visibilidade"
                      onClick={() => updateSection(section.id, { enabled: !section.enabled })}
                    >
                      {section.enabled ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Remover seção"
                      onClick={() => {
                        patchConfig({ sections: removeSection(sections, section.id) });
                        setSelectedId("");
                      }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <select
              className="mt-3 w-full rounded border bg-background p-2 text-sm"
              aria-label="Adicionar seção"
              onChange={(event) => {
                if (event.target.value) addSection(event.target.value);
                event.target.value = "";
              }}
              defaultValue=""
            >
              <option value="">Adicionar seção...</option>
              {sectionTypes.map((type) => (
                <option key={type} value={type}>
                  {friendlyNames[type]}
                </option>
              ))}
            </select>
          </aside>
          <section className="rounded border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Preview do rascunho</h2>
              <div className="flex gap-1">
                {(["desktop", "tablet", "mobile"] as const).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={previewMode === mode ? "default" : "outline"}
                    onClick={() => setPreviewMode(mode)}
                  >
                    {mode}
                  </Button>
                ))}
              </div>
            </div>
            <div
              className={`mx-auto min-h-[420px] rounded border p-4 transition-all ${previewMode === "mobile" ? "max-w-[360px]" : previewMode === "tablet" ? "max-w-[720px]" : "max-w-full"}`}
              style={{
                background: String(config.theme?.background ?? "#fff"),
                color: String(config.theme?.text ?? "#111"),
              }}
            >
              {sections
                .filter((section) => section.enabled)
                .map((section) => (
                  <article
                    key={section.id}
                    className="mb-3 rounded border p-4"
                    style={{
                      borderRadius: Number(config.theme?.radius ?? 12),
                      borderColor: String(config.theme?.primary ?? "#2563eb"),
                    }}
                  >
                    <p className="text-xs font-semibold uppercase opacity-60">
                      {friendlyNames[section.type] ?? section.type}
                    </p>
                    <h3 className="mt-1 text-lg font-semibold">
                      {String(
                        section.props.title ??
                          section.props.headline ??
                          friendlyNames[section.type] ??
                          section.type,
                      )}
                    </h3>
                    <p className="mt-1 text-sm opacity-75">
                      {String(
                        section.props.subtitle ??
                          section.props.text ??
                          "Conteúdo configurável da sua empresa",
                      )}
                    </p>
                  </article>
                ))}
            </div>
          </section>
          <aside className="space-y-4">
            <section className="rounded border bg-card p-4">
              <h2 className="mb-3 font-semibold">Propriedades</h2>
              {selected ? (
                <div className="space-y-3">
                  <label className="block text-sm">
                    Título
                    <input
                      className="mt-1 w-full rounded border bg-background p-2"
                      value={String(selected.props.title ?? selected.props.headline ?? "")}
                      onChange={(event) =>
                        updateProps(selected.id, {
                          title: event.target.value,
                          headline: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    Texto
                    <input
                      className="mt-1 w-full rounded border bg-background p-2"
                      value={String(selected.props.text ?? selected.props.subtitle ?? "")}
                      onChange={(event) =>
                        updateProps(selected.id, {
                          text: event.target.value,
                          subtitle: event.target.value,
                        })
                      }
                    />
                  </label>
                  {["HERO", "ABOUT", "HEADER"].includes(selected.type) ? (
                    <label className="block text-sm">
                      Imagem (URL segura)
                      <input
                        className="mt-1 w-full rounded border bg-background p-2"
                        value={String(selected.props.image_url ?? "")}
                        placeholder="https://... ou caminho do asset"
                        onChange={(event) =>
                          updateProps(selected.id, { image_url: event.target.value })
                        }
                      />
                    </label>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.enabled}
                      onChange={(event) =>
                        updateSection(selected.id, { enabled: event.target.checked })
                      }
                    />{" "}
                    Seção visível
                  </label>
                  {selected.type === "FEATURED_PROPERTIES" ? (
                    <label className="block text-sm">
                      Imóveis em destaque
                      <select
                        multiple
                        className="mt-1 min-h-24 w-full rounded border bg-background p-2"
                        value={(
                          (config.featured_property_ids as string[] | undefined) ?? []
                        ).filter((id) => properties.some((property) => property.id === id))}
                        onChange={(event) =>
                          patchConfig({
                            featured_property_ids: Array.from(event.target.selectedOptions).map(
                              (option) => option.value,
                            ),
                          })
                        }
                      >
                        {properties.map((property) => (
                          <option key={property.id} value={property.id}>
                            {property.code} — {property.title}
                          </option>
                        ))}
                      </select>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Somente imóveis da empresa atual são carregados.
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Selecione uma seção.</p>
              )}
            </section>
            <section className="rounded border bg-card p-4">
              <h2 className="mb-3 font-semibold">Tema</h2>
              <div className="grid grid-cols-2 gap-2">
                {["primary", "secondary", "accent", "background", "text"].map((key) => (
                  <label key={key} className="text-xs">
                    {key}
                    <input
                      type="color"
                      className="mt-1 h-9 w-full"
                      value={String(config.theme?.[key] ?? defaultTheme[key])}
                      onChange={(event) =>
                        patchConfig({ theme: { ...config.theme, [key]: event.target.value } })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="mt-3 block text-sm">
                Tipografia
                <select
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={String(config.theme?.typography ?? "Inter")}
                  onChange={(event) =>
                    patchConfig({ theme: { ...config.theme, typography: event.target.value } })
                  }
                >
                  <option>Inter</option>
                  <option>Arial</option>
                  <option>Georgia</option>
                  <option>system-ui</option>
                </select>
              </label>
              <label className="mt-3 block text-sm">
                Espaçamento
                <select
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={String(config.theme?.spacing ?? 20)}
                  onChange={(event) =>
                    patchConfig({ theme: { ...config.theme, spacing: Number(event.target.value) } })
                  }
                >
                  <option value="12">small</option>
                  <option value="20">medium</option>
                  <option value="32">large</option>
                </select>
              </label>
            </section>
            <section className="rounded border bg-card p-4">
              <h2 className="mb-3 font-semibold">Templates</h2>
              <div className="space-y-2">
                {templates.map((template) => (
                  <Button
                    key={template.key}
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => void applyTemplate(template)}
                  >
                    {template.name}
                    <Plus className="size-4" />
                  </Button>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Status: {site.status}. Versão {site.version ?? 1}. Alterações só ficam públicas após
                publicar.
              </p>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
