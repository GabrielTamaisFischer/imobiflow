import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Monitor, Pencil, Redo2, Smartphone, Tablet, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import {
  formatPropertyPrice,
  formatPublicAddress,
  getBuilderPreviewPropertyDetailUrl,
  getPropertyCoverUrl,
  operationLabel,
  propertyTypeLabel,
} from "@/product/public-site-helpers";
import { listAllProperties, type Property, type PropertySummary } from "@/product/real-estate";
import {
  getWebsiteBuilderWebsite,
  listWebsiteBuilderDomains,
  listWebsiteBuilderSeo,
  type WebsiteBuilderComponent,
  type WebsiteBuilderDomain,
  type WebsiteBuilderPage as WebsiteBuilderPageRecord,
  type WebsiteBuilderSection,
  type WebsiteBuilderSeo,
  type WebsiteBuilderWebsite,
} from "@/product/website-builder";
import { useSessionGuard } from "@/product/use-session-guard";
import { BUILDER_VISUAL_PREVIEW_SANDBOX } from "@/product/website-preview-security";

export const Route = createFileRoute("/app/site/builder/preview/$websiteId")({
  component: WebsiteBuilderPreviewPage,
});

type PreviewViewport = "desktop" | "tablet" | "mobile";
const defaultPublicSitePreviewUrl = "/site/magnificopaginainicial#topo";

type PreviewSection = WebsiteBuilderSection & {
  components?: WebsiteBuilderComponent[];
};

type PreviewPage = WebsiteBuilderPageRecord & {
  sections?: PreviewSection[];
};

type PreviewWebsite = WebsiteBuilderWebsite & {
  pages?: PreviewPage[];
};

function WebsiteBuilderPreviewPage() {
  const { websiteId } = Route.useParams();
  const { isLoading, session } = useSessionGuard();
  const [website, setWebsite] = useState<PreviewWebsite | null>(null);
  const [seo, setSeo] = useState<WebsiteBuilderSeo[]>([]);
  const [domains, setDomains] = useState<WebsiteBuilderDomain[]>([]);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !session) return;

    setError(null);
    void Promise.all([
      getWebsiteBuilderWebsite(websiteId),
      listWebsiteBuilderSeo(websiteId),
      listWebsiteBuilderDomains(websiteId),
      listAllProperties(),
    ])
      .then(([websiteResponse, seoResponse, domainResponse, propertiesResponse]) => {
        const nextWebsite = websiteResponse.website as PreviewWebsite;
        setWebsite(nextWebsite);
        setSeo(seoResponse.seo);
        setDomains(domainResponse.domains);
        setProperties(
          propertiesResponse.properties
            .filter((property) => property.status !== "archived" && property.status !== "inactive")
            .slice(0, 12),
        );
        setSelectedPageId(nextWebsite.pages?.[0]?.id ?? "");
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar a prévia do site.");
      });
  }, [isLoading, session, websiteId]);

  const selectedPage = useMemo(
    () => website?.pages?.find((page) => page.id === selectedPageId) ?? website?.pages?.[0] ?? null,
    [selectedPageId, website],
  );

  const seoRecord = useMemo(() => {
    return seo.find((record) => record.pageId === selectedPage?.id) ?? seo.find((record) => !record.pageId) ?? null;
  }, [selectedPage?.id, seo]);

  useEffect(() => {
    if (seoRecord?.title) document.title = `${seoRecord.title} | Prévia ImobiFlow`;
    else if (website?.name) document.title = `${website.name} | Prévia ImobiFlow`;
  }, [seoRecord?.title, website?.name]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-white/70">
        Validando acesso...
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-center text-white">
        <section className="max-w-md rounded-lg border border-white/10 bg-white/[0.04] p-8">
          <h1 className="text-xl font-semibold">Prévia indisponível</h1>
          <p className="mt-2 text-sm text-white/65">{error}</p>
          <Button className="mt-5" variant="outline" asChild>
            <Link to="/app/site/builder">
              <ArrowLeft className="size-4" />
              Voltar ao builder
            </Link>
          </Button>
        </section>
      </main>
    );
  }

  if (!website) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-white/70">
        Carregando prévia...
      </main>
    );
  }

  const livePreviewUrl = resolveLivePreviewUrl(website, defaultPublicSitePreviewUrl);
  const CurrentViewportIcon = viewportIcon(viewport);

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-neutral-950 text-white">
      <header className="z-40 shrink-0 border-b border-white/10 bg-neutral-950/95 px-4 py-3 backdrop-blur">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
              <Link to="/app/site/builder">
                <ArrowLeft className="size-4" />
                Builder
              </Link>
            </Button>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-white/45">Prévia do site</p>
              <h1 className="text-lg font-semibold">{website.name}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 border-white/15 bg-white/10 text-white opacity-40"
              disabled
              title="Desfazer disponível no editor"
            >
              <Undo2 className="size-4" />
            </Button>
            <div className="inline-flex overflow-hidden rounded-md border border-white/15 bg-neutral-900 shadow-sm">
              <select
                className="h-9 min-w-[210px] border-0 bg-transparent px-3 text-sm font-medium text-white outline-none transition focus:bg-white/5"
                value={selectedPage?.id ?? ""}
                onChange={(event) => setSelectedPageId(event.target.value)}
              >
                {website.pages?.length ? null : <option value="">Sem páginas</option>}
                {website.pages?.map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.title}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                size="icon"
                className="h-9 w-10 rounded-none border-l border-white/15 bg-violet-600 text-white shadow-none hover:bg-violet-500 hover:text-white"
                onClick={() => setViewport(nextViewport(viewport))}
                title={`Visualização: ${viewportLabel(viewport)}`}
              >
                <CurrentViewportIcon className="size-4" />
              </Button>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-9 border-white/15 bg-white/10 text-white opacity-40"
              disabled
              title="Refazer disponível no editor"
            >
              <Redo2 className="size-4" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
              <Link to="/app/site/builder/editor/$websiteId" params={{ websiteId }}>
                <Pencil className="size-4" />
                Editar
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
              <a href={livePreviewUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Abrir site real
              </a>
            </Button>
          </div>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-auto bg-neutral-900 px-4 py-4">
        <div className={viewportFrameClass(viewport)} data-loaded-properties={properties.length}>
          <div className="h-[calc(100vh-96px)] overflow-hidden rounded-lg border border-white/10 bg-white shadow-2xl">
            <iframe
              className="h-full w-full border-0 bg-white"
              sandbox={BUILDER_VISUAL_PREVIEW_SANDBOX}
              referrerPolicy="no-referrer"
              src={livePreviewUrl}
              title="Prévia real do site"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function PreviewHeader({
  website,
  page,
  primary,
  domain,
}: {
  website: PreviewWebsite;
  page: PreviewPage | null;
  primary: string;
  domain?: string;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-white/10 px-6 py-5 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.22em]" style={{ color: primary }}>
          {domain ?? "site em preparação"}
        </p>
        <h2 className="mt-1 text-xl font-semibold">{website.name}</h2>
      </div>
      <nav className="flex flex-wrap gap-3 text-sm text-white/65">
        {website.pages?.slice(0, 5).map((item) => (
          <span key={item.id} className={item.id === page?.id ? "text-white" : undefined}>
            {item.title}
          </span>
        ))}
      </nav>
    </header>
  );
}

function PreviewPageRenderer({ page, primary, websiteId, properties }: { page: PreviewPage; primary: string; websiteId: string; properties: Property[] }) {
  const visibleSections = (page.sections ?? []).filter((section) => section.isVisible);

  if (visibleSections.length === 0) {
    return (
      <section className="px-6 py-20 text-center text-sm text-white/65">
        Esta página ainda não possui seções visíveis.
      </section>
    );
  }

  return (
    <div>
      {visibleSections.map((section) => (
        <PreviewSectionRenderer key={section.id} section={section} primary={primary} websiteId={websiteId} properties={properties} />
      ))}
    </div>
  );
}

function PreviewSectionRenderer({
  section,
  primary,
  websiteId,
  properties,
}: {
  section: PreviewSection;
  primary: string;
  websiteId: string;
  properties: Property[];
}) {
  const components = (section.components ?? []).filter((component) => component.isVisible);
  const props = section.propsJson ?? {};

  if (section.sectionType === "hero") {
    const heading = findComponentText(components, "heading") || String(props.title ?? section.name);
    const text = findComponentText(components, "text") || String(props.eyebrow ?? "");
    const button = components.find((component) => component.componentType === "button");
    const buttonLabel = readComponentValue(button, "label") || "Saiba mais";

    return (
      <section className="px-6 py-20 md:px-10 md:py-28">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em]" style={{ color: primary }}>
            {String(props.eyebrow ?? "ImobiFlow")}
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-6xl">{heading}</h1>
          {text ? <p className="mt-5 max-w-2xl text-base leading-7 text-white/70">{text}</p> : null}
          <button className="mt-8 rounded-full px-5 py-3 text-sm font-semibold text-neutral-950" style={{ backgroundColor: primary }}>
            {buttonLabel}
          </button>
        </div>
      </section>
    );
  }

  if (section.sectionType.startsWith("imported_")) {
    const heading = findComponentText(components, "heading") || String(props.title ?? section.name);
    const texts = components
      .filter((component) => component.componentType.includes("text"))
      .map((component) => readComponentValue(component, "text"))
      .filter(Boolean)
      .slice(0, 3);
    const assets = readSectionAssets(section, components);
    const heroAsset = String(props.backgroundUrl ?? "") || assets.find((asset) => asset.url.match(/\.(png|jpe?g|webp|gif|svg|avif)$/i))?.url || "";

    return (
      <section className="relative overflow-hidden border-t border-white/10 px-6 py-16 md:px-10 md:py-24">
        {heroAsset ? <img className="absolute inset-0 h-full w-full object-cover opacity-35" src={heroAsset} alt="" /> : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/35" />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: primary }}>
              {String(props.sourceFile ?? "Projeto importado")}
            </p>
            <h2 className="mt-3 text-4xl font-semibold leading-tight md:text-6xl">{heading}</h2>
            <div className="mt-5 max-w-2xl space-y-3 text-sm leading-7 text-white/70">
              {texts.length ? texts.map((text) => <p key={text}>{text}</p>) : <p>Estrutura importada e preparada para edição visual no ImobiFlow.</p>}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {assets.slice(0, 4).map((asset) => (
              <article key={asset.path} className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.06]">
                {asset.url.match(/\.(png|jpe?g|webp|gif|svg|avif)$/i) ? (
                  <img className="h-36 w-full object-cover" src={asset.url} alt={asset.path} />
                ) : (
                  <div className="flex h-36 items-center justify-center text-xs text-white/45">Mídia</div>
                )}
                <p className="truncate px-3 py-2 text-[11px] text-white/55">{asset.path}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (section.sectionType === "property_carousel" || section.sectionType === "property_grid") {
    return (
      <section className="border-t border-white/10 px-6 py-12 md:px-10">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: primary }}>
              imóveis reais
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{String(props.title ?? section.name)}</h2>
          </div>
          <span className="text-sm text-white/55">Origem: {String(props.source ?? "dados reais")}</span>
        </div>
        {properties.length ? (
          <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {properties.slice(0, 6).map((property) => (
              <PreviewPropertyCard key={property.id} property={property} websiteId={websiteId} primary={primary} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-lg border border-dashed border-white/20 bg-white/[0.04] p-8 text-center text-sm text-white/60">
            {String(props.emptyState ?? "Nenhum imóvel publicado ainda.")}
          </div>
        )}
      </section>
    );
  }

  if (section.sectionType === "differentials") {
    return (
      <section className="border-t border-white/10 px-6 py-12 md:px-10">
        <h2 className="text-2xl font-semibold">{String(props.title ?? section.name)}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {components.map((component) => (
            <article key={component.id} className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
              <h3 className="font-semibold">{readComponentValue(component, "title") || component.name}</h3>
              <p className="mt-2 text-sm leading-6 text-white/65">{readComponentValue(component, "text")}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  if (section.sectionType === "owner_lead_form") {
    return (
      <section className="border-t border-white/10 px-6 py-12 md:px-10">
        <div className="grid gap-8 md:grid-cols-[1fr_420px] md:items-start">
          <div>
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: primary }}>
              captação
            </p>
            <h2 className="mt-2 text-2xl font-semibold">{findComponentText(components, "heading") || String(props.title ?? section.name)}</h2>
            <p className="mt-3 text-sm leading-6 text-white/65">{findComponentText(components, "text")}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.05] p-5">
            {["Nome", "Telefone", "E-mail", "Tipo do imóvel"].map((label) => (
              <div key={label} className="mb-3 rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/45">
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="border-t border-white/10 px-6 py-12 md:px-10">
      <h2 className="text-2xl font-semibold">{section.name}</h2>
      <p className="mt-1 text-sm text-white/55">{section.sectionType}</p>
      <div className="mt-5 grid gap-3">
        {components.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/20 p-6 text-sm text-white/55">Nenhum componente nesta seção.</p>
        ) : (
          components.map((component) => (
            <article key={component.id} className="rounded-lg border border-white/10 bg-white/[0.05] p-4">
              <p className="text-xs uppercase tracking-[0.16em]" style={{ color: primary }}>
                {component.componentType}
              </p>
              <p className="mt-2 text-sm leading-6 text-white/75">
                {readComponentValue(component, "text") || readComponentValue(component, "title") || readComponentValue(component, "label") || component.name}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function PreviewPropertyCard({
  property,
  websiteId,
  primary,
}: {
  property: Property;
  websiteId: string;
  primary: string;
}) {
  const cover = getPropertyCoverUrl(property);
  const detailUrl = getBuilderPreviewPropertyDetailUrl(websiteId, property);
  const address = formatPublicAddress(property, false);

  return (
    <a
      href={detailUrl}
      className="group block overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] text-left text-white shadow-2xl shadow-black/20 transition hover:-translate-y-1 hover:border-[var(--preview-primary)] hover:shadow-[0_24px_70px_rgba(212,175,55,0.18)]"
      style={{ "--preview-primary": primary } as CSSProperties}
      aria-label={`Abrir página do imóvel ${property.title}`}
    >
      <div className="relative h-56 overflow-hidden bg-black/30">
        {cover ? (
          <img className="h-full w-full object-cover transition duration-700 group-hover:scale-110" src={cover} alt={property.title} />
        ) : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_25%_20%,rgba(212,175,55,0.25),transparent_36%),linear-gradient(135deg,#171717,#050505)] text-sm text-white/60">
            Sem foto cadastrada
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/84 via-black/20 to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-semibold text-black" style={{ backgroundColor: primary }}>
            {operationLabel(property.operation)}
          </span>
          {property.code ? <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-xs text-white backdrop-blur">{property.code}</span> : null}
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{propertyTypeLabel(property.property_type)}</p>
          <h3 className="mt-1 line-clamp-2 text-xl font-semibold text-white">{property.title}</h3>
        </div>
      </div>
      <div className="grid gap-3 p-5">
        <strong className="text-2xl font-semibold" style={{ color: primary }}>
          {formatPropertyPrice(property)}
        </strong>
        {address ? <p className="text-sm text-white/65">{address}</p> : null}
        <div className="flex flex-wrap gap-2 text-xs text-white/65">
          {property.private_area || property.total_area ? <span className="rounded-full border border-white/10 px-3 py-1">{property.private_area ?? property.total_area} m²</span> : null}
          {property.bedrooms ? <span className="rounded-full border border-white/10 px-3 py-1">{property.bedrooms} dorm.</span> : null}
          {property.bathrooms ? <span className="rounded-full border border-white/10 px-3 py-1">{property.bathrooms} banh.</span> : null}
          {property.parking_spaces ? <span className="rounded-full border border-white/10 px-3 py-1">{property.parking_spaces} vagas</span> : null}
        </div>
        <span className="text-sm font-semibold" style={{ color: primary }}>
          Ver página do imóvel
        </span>
      </div>
    </a>
  );
}

function viewportFrameClass(viewport: PreviewViewport) {
  const base = "mx-auto transition-all";
  if (viewport === "mobile") return `${base} max-w-[390px]`;
  if (viewport === "tablet") return `${base} max-w-[820px]`;
  return `${base} max-w-7xl`;
}

function nextViewport(viewport: PreviewViewport): PreviewViewport {
  if (viewport === "desktop") return "tablet";
  if (viewport === "tablet") return "mobile";
  return "desktop";
}

function viewportLabel(viewport: PreviewViewport) {
  if (viewport === "desktop") return "Desktop";
  if (viewport === "tablet") return "Tablet";
  return "Mobile";
}

function viewportIcon(viewport: PreviewViewport) {
  if (viewport === "desktop") return Monitor;
  if (viewport === "tablet") return Tablet;
  return Smartphone;
}

function findComponentText(components: WebsiteBuilderComponent[], componentType: string) {
  const component = components.find((item) => item.componentType === componentType);
  return readComponentValue(component, "text") || readComponentValue(component, "title") || readComponentValue(component, "label");
}

function readComponentValue(component: WebsiteBuilderComponent | undefined, key: string) {
  const value = component?.propsJson?.[key];
  return typeof value === "string" ? value : "";
}

function readRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function resolveLivePreviewUrl(website: PreviewWebsite, fallbackUrl: string) {
  const storedLiveEditorUrl = readRecordString(website.settingsJson, "live_editor_url");
  const storedExternalPreviewUrl = readRecordString(website.settingsJson, "external_preview_url");

  return (
    (storedLiveEditorUrl.startsWith("/site/") ? storedLiveEditorUrl : "") ||
    fallbackUrl ||
    (storedExternalPreviewUrl.startsWith("/site/") ? storedExternalPreviewUrl : "") ||
    storedLiveEditorUrl ||
    storedExternalPreviewUrl ||
    fallbackUrl
  );
}

function readSectionAssets(section: PreviewSection, components: WebsiteBuilderComponent[]) {
  const assetsFromSection = Array.isArray(section.propsJson.referencedAssets)
    ? section.propsJson.referencedAssets.filter(isRecord).flatMap((asset) => {
        const path = typeof asset.path === "string" ? asset.path : "";
        const url = typeof asset.url === "string" ? asset.url : "";
        return path && url ? [{ path, url }] : [];
      })
    : [];
  const assetsFromComponents = components.flatMap((component) => {
    const imageUrl = readComponentValue(component, "imageUrl");
    const videoUrl = readComponentValue(component, "videoUrl");
    const url = imageUrl || videoUrl;
    const path = readComponentValue(component, "sourcePath") || component.name;
    return url ? [{ path, url }] : [];
  });

  return [...assetsFromSection, ...assetsFromComponents];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
