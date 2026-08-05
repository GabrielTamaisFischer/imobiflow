import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bath, BedDouble, CalendarDays, Car, ExternalLink, Mail, MapPin, MessageCircle, Phone, Ruler, type LucideIcon } from "lucide-react";
import { type CSSProperties, FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createWhatsAppLink,
  formatArea,
  formatPropertyPrice,
  formatPublicAddress,
  getFeatureList,
  getPropertyImages,
  matchesPropertySlug,
  operationLabel,
  propertyTypeLabel,
} from "@/product/public-site-helpers";
import { getProperty, listAllProperties, type Property, type PropertyMedia, type PropertySummary } from "@/product/real-estate";
import { createPublicSiteLead } from "@/product/sites";
import { getWebsiteBuilderWebsite, type WebsiteBuilderWebsite } from "@/product/website-builder";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/site/builder/preview/$websiteId/imovel/$propertySlug")({
  component: BuilderPreviewPropertyPage,
});

function BuilderPreviewPropertyPage() {
  const { websiteId, propertySlug } = Route.useParams();
  const { isLoading, session } = useSessionGuard();
  const [website, setWebsite] = useState<WebsiteBuilderWebsite | null>(null);
  const [properties, setProperties] = useState<PropertySummary[]>([]);
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [leadForm, setLeadForm] = useState({
    name: "",
    phone: "",
    email: "",
    message: "Tenho interesse neste imóvel e gostaria de mais informações.",
  });
  const [leadStatus, setLeadStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isLoading || !session) return;

    setError(null);
    void Promise.all([getWebsiteBuilderWebsite(websiteId), listAllProperties()])
      .then(([websiteResponse, propertiesResponse]) => {
        setWebsite(websiteResponse.website);
        setProperties(
          propertiesResponse.properties
            .filter((property) => property.status !== "archived" && property.status !== "inactive")
            .sort((a, b) => (b.published_at ?? b.updated_at ?? "").localeCompare(a.published_at ?? a.updated_at ?? "")),
        );
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o imóvel.");
      });
  }, [isLoading, session, websiteId]);

  const propertySummary = useMemo(
    () => properties.find((item) => matchesPropertySlug(item, propertySlug)) ?? null,
    [properties, propertySlug],
  );
  useEffect(() => {
    if (!propertySummary) return;
    let canceled = false;
    void getProperty(propertySummary.id)
      .then((response) => {
        if (!canceled) setProperty(response.property);
      })
      .catch((loadError) => {
        if (!canceled) setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar o imóvel.");
      });
    return () => {
      canceled = true;
    };
  }, [propertySummary]);
  const relatedProperties = useMemo(() => {
    if (!property) return [];
    return properties
      .filter((item) => item.id !== property.id)
      .filter(
        (item) =>
          item.property_type === property.property_type ||
          item.operation === property.operation ||
          Boolean(property.city && item.city === property.city) ||
          Boolean(property.neighborhood && item.neighborhood === property.neighborhood),
      )
      .slice(0, 3);
  }, [properties, property]);

  useEffect(() => {
    if (property?.title) document.title = `${property.title} | ${website?.name ?? "ImobiFlow"}`;
  }, [property?.title, website?.name]);

  if (isLoading) {
    return <main className="grid min-h-screen place-items-center bg-[#080806] text-sm text-white/65">Validando acesso...</main>;
  }

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#080806] px-4 text-center text-white">
        <section className="max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8">
          <h1 className="text-xl font-semibold">Imóvel indisponível</h1>
          <p className="mt-2 text-sm text-white/65">{error}</p>
          <Button className="mt-5" variant="outline" asChild>
            <Link to="/app/site/builder/preview/$websiteId" params={{ websiteId }}>
              <ArrowLeft className="size-4" />
              Voltar para a prévia
            </Link>
          </Button>
        </section>
      </main>
    );
  }

  if (!property) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#080806] px-4 text-center text-white">
        <section className="max-w-md rounded-2xl border border-white/10 bg-white/[0.06] p-8">
          <h1 className="text-xl font-semibold">Imóvel não encontrado</h1>
          <p className="mt-2 text-sm text-white/65">O card clicado não encontrou um imóvel real correspondente neste preview.</p>
          <Button className="mt-5" variant="outline" asChild>
            <Link to="/app/site/builder/preview/$websiteId" params={{ websiteId }}>
              <ArrowLeft className="size-4" />
              Voltar para a prévia
            </Link>
          </Button>
        </section>
      </main>
    );
  }

  const primary = readThemeColor(website?.themeJson, "#c8a24b");
  const style = { "--property-primary": primary } as CSSProperties;
  const images = getPropertyImages(property);
  const media = property.property_media ?? [];
  const videos = getVideos(property, media);
  const tours = media.filter((item) => item.media_type === "tour");
  const features = getFeatureList(property, 24);
  const owner = property.property_owners;
  const phone = owner?.phone || readContactValue(website?.settingsJson, "whatsapp") || readContactValue(website?.settingsJson, "phone");
  const address = formatPublicAddress(property, true) || formatPublicAddress(property, false);
  const mapUrl = property.latitude && property.longitude ? `https://www.google.com/maps?q=${property.latitude},${property.longitude}` : "";
  const mapEmbed = property.latitude && property.longitude ? `https://maps.google.com/maps?q=${property.latitude},${property.longitude}&z=15&output=embed` : "";
  const leadProperty = property;

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLeadStatus("Enviando interesse...");
    try {
      await createPublicSiteLead(website?.slug ?? websiteId, {
        ...leadForm,
        property_id: leadProperty.id,
        message: `${leadForm.message}\n\nImóvel: ${leadProperty.title}${leadProperty.code ? ` (${leadProperty.code})` : ""}`,
      });
      setLeadStatus("Interesse registrado e vinculado ao imóvel.");
    } catch (submitError) {
      setLeadStatus(submitError instanceof Error ? submitError.message : "Não foi possível registrar o interesse.");
    }
  }

  return (
    <main className="min-h-screen bg-[#080806] text-white" style={style}>
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/75 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
          <Button variant="outline" className="border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white" asChild>
            <Link to="/app/site/builder/preview/$websiteId" params={{ websiteId }}>
              <ArrowLeft className="size-4" />
              Voltar ao site
            </Link>
          </Button>
          <strong className="text-sm uppercase tracking-[0.18em] text-white/60">{website?.name ?? "Site da imobiliária"}</strong>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04]">
            {images.length ? (
              <button className="block h-[520px] w-full cursor-zoom-in bg-black" type="button" onClick={() => setActiveImage((activeImage + 1) % images.length)}>
                <img className="h-full w-full object-cover" src={images[activeImage]} alt={property.title} />
              </button>
            ) : (
              <div className="grid h-[520px] place-items-center bg-[radial-gradient(circle_at_25%_20%,rgba(200,162,75,0.26),transparent_35%),linear-gradient(135deg,#171717,#050505)] text-white/60">
                Galeria sem fotos cadastradas
              </div>
            )}
          </div>
          {images.length > 1 ? (
            <div className="mt-4 grid grid-cols-4 gap-3 md:grid-cols-6">
              {images.slice(0, 12).map((image, index) => (
                <button
                  key={image}
                  className={`h-24 overflow-hidden rounded-2xl border ${index === activeImage ? "border-[var(--property-primary)]" : "border-white/10"}`}
                  type="button"
                  onClick={() => setActiveImage(index)}
                >
                  <img className="h-full w-full object-cover" src={image} alt={`${property.title} ${index + 1}`} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="rounded-[28px] border border-white/10 bg-white/[0.06] p-6 shadow-2xl shadow-black/25 lg:sticky lg:top-28 lg:self-start">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--property-primary)] px-3 py-1 text-xs font-semibold text-black">{operationLabel(property.operation)}</span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white">{propertyTypeLabel(property.property_type)}</span>
            {property.code ? <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs text-white">{property.code}</span> : null}
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-tight md:text-5xl">{property.title}</h1>
          {address ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-white/65">
              <MapPin className="size-4 text-[var(--property-primary)]" />
              {address}
            </p>
          ) : null}
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/25 p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Valores</p>
            <strong className="mt-2 block text-3xl text-[var(--property-primary)]">{formatPropertyPrice(property)}</strong>
            <div className="mt-4 grid gap-2 text-sm text-white/65">
              {property.condominium_fee_cents ? <span>Condomínio: {formatCurrency(property.condominium_fee_cents)}</span> : null}
              {property.iptu_cents ? <span>IPTU: {formatCurrency(property.iptu_cents)}</span> : null}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Fact icon={BedDouble} label="Dormitórios" value={property.bedrooms} />
            <Fact icon={Bath} label="Banheiros" value={property.bathrooms} />
            <Fact icon={Car} label="Vagas" value={property.parking_spaces} />
            <Fact icon={Ruler} label="Área útil" value={formatArea(property.private_area)} />
          </div>
          <div className="mt-6 flex flex-col gap-3">
            {phone ? (
              <a className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--property-primary)] px-5 text-sm font-semibold text-black" href={createWhatsAppLink(phone, `Tenho interesse no imóvel ${property.title}.`)} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            ) : null}
            <a className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 text-sm font-semibold text-white" href="#interesse">
              <CalendarDays className="size-4" />
              Agendar visita
            </a>
          </div>
        </aside>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-16 lg:grid-cols-[1fr_420px]">
        <div className="space-y-8">
          {property.description ? (
            <Panel title="Descrição completa">
              <p className="whitespace-pre-line text-base leading-8 text-white/72">{property.description}</p>
            </Panel>
          ) : null}

          <Panel title="Detalhes do imóvel">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Status" value={property.status} />
              <Detail label="Finalidade" value={operationLabel(property.operation)} />
              <Detail label="Tipo" value={propertyTypeLabel(property.property_type)} />
              <Detail label="Suítes" value={property.suites} />
              <Detail label="Área total" value={formatArea(property.total_area)} />
              <Detail label="Condomínio" value={property.condominium_name} />
            </div>
            {features.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {features.map((feature) => (
                  <span key={feature} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm text-white/72">
                    {feature}
                  </span>
                ))}
              </div>
            ) : null}
          </Panel>

          {videos.length ? (
            <Panel title="Vídeo">
              <div className="grid gap-4">
                {videos.map((video) => (
                  <VideoEmbed key={video.url} url={video.url} />
                ))}
              </div>
            </Panel>
          ) : null}

          {tours.length ? (
            <Panel title="Tour 360 / panorâmico">
              <div className="grid gap-4">
                {tours.map((tour) => (
                  <iframe key={tour.id} className="h-[420px] w-full rounded-2xl border border-white/10 bg-black" src={tour.url} title={tour.caption ?? "Tour 360"} />
                ))}
              </div>
            </Panel>
          ) : null}

          {(mapEmbed || address) ? (
            <Panel title="Localização">
              {mapEmbed ? <iframe className="h-[420px] w-full rounded-2xl border border-white/10 bg-black" src={mapEmbed} title={`Mapa ${property.title}`} /> : null}
              {address ? <p className="mt-4 text-sm text-white/65">{address}</p> : null}
              {mapUrl ? (
                <a className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--property-primary)]" href={mapUrl} target="_blank" rel="noreferrer">
                  Abrir rota
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Panel title="Publicado por">
            <div className="flex items-center gap-4">
              <div className="grid size-14 place-items-center rounded-2xl bg-[var(--property-primary)] text-xl font-semibold text-black">
                {(owner?.name ?? website?.name ?? "I").slice(0, 1)}
              </div>
              <div>
                <h3 className="font-semibold">{owner?.name ?? website?.name ?? "Imobiliária"}</h3>
                {owner?.phone ? <p className="text-sm text-white/60">{owner.phone}</p> : null}
                {owner?.email ? <p className="text-sm text-white/60">{owner.email}</p> : null}
              </div>
            </div>
            {phone ? (
              <a className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--property-primary)] text-sm font-semibold text-black" href={createWhatsAppLink(phone, `Olá, quero falar sobre ${property.title}.`)} target="_blank" rel="noreferrer">
                <Phone className="size-4" />
                Falar com responsável
              </a>
            ) : null}
          </Panel>

          <Panel title="Tenho interesse">
            <form id="interesse" className="grid gap-3" onSubmit={submitLead}>
              <input className="h-12 rounded-xl border border-white/10 bg-white/90 px-4 text-sm text-neutral-950 outline-none" placeholder="Nome" value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} required />
              <input className="h-12 rounded-xl border border-white/10 bg-white/90 px-4 text-sm text-neutral-950 outline-none" placeholder="Telefone / WhatsApp" value={leadForm.phone} onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })} />
              <input className="h-12 rounded-xl border border-white/10 bg-white/90 px-4 text-sm text-neutral-950 outline-none" placeholder="E-mail" value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} />
              <textarea className="min-h-28 rounded-xl border border-white/10 bg-white/90 px-4 py-3 text-sm text-neutral-950 outline-none" placeholder="Mensagem" value={leadForm.message} onChange={(event) => setLeadForm({ ...leadForm, message: event.target.value })} />
              <button className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--property-primary)] px-4 text-sm font-semibold text-black" type="submit">
                <Mail className="size-4" />
                Enviar interesse
              </button>
              {leadStatus ? <p className="text-sm text-white/65">{leadStatus}</p> : null}
            </form>
          </Panel>
        </aside>
      </section>

      {relatedProperties.length ? (
        <section className="mx-auto max-w-7xl px-5 pb-20">
          <h2 className="text-3xl font-semibold">Imóveis semelhantes</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {relatedProperties.map((item) => (
              <Link
                key={item.id}
                to="/app/site/builder/preview/$websiteId/imovel/$propertySlug"
                params={{ websiteId, propertySlug: item.id }}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] text-white transition hover:-translate-y-1 hover:border-[var(--property-primary)]"
              >
                <div className="h-44 bg-black/30">
                  {getPropertyImages(item)[0] ? <img className="h-full w-full object-cover" src={getPropertyImages(item)[0]} alt={item.title} /> : null}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm text-white/60">{formatPropertyPrice(item)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 shadow-2xl shadow-black/20">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <Icon className="size-5 text-[var(--property-primary)]" />
      <p className="mt-2 text-xs text-white/45">{label}</p>
      <strong className="mt-1 block text-lg">{value}</strong>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-white/40">{label}</p>
      <strong className="mt-2 block text-white">{value}</strong>
    </div>
  );
}

function VideoEmbed({ url }: { url: string }) {
  if (url.includes("youtube.com") || url.includes("youtu.be") || url.includes("vimeo.com")) {
    return <iframe className="h-[420px] w-full rounded-2xl border border-white/10 bg-black" src={normalizeVideoEmbed(url)} title="Vídeo do imóvel" allowFullScreen />;
  }

  return <video className="max-h-[520px] w-full rounded-2xl border border-white/10 bg-black" src={url} controls playsInline />;
}

function getVideos(property: Property, media: PropertyMedia[]) {
  const mediaVideos = media.filter((item) => item.media_type === "video").map((item) => ({ url: item.url }));
  const jsonVideos = property.videos_json
    .map((item) => {
      const url = typeof item.url === "string" ? item.url : typeof item.src === "string" ? item.src : "";
      return url ? { url } : null;
    })
    .filter((item): item is { url: string } => Boolean(item));

  return [...mediaVideos, ...jsonVideos];
}

function normalizeVideoEmbed(url: string) {
  if (url.includes("youtube.com/watch")) return url.replace("watch?v=", "embed/");
  if (url.includes("youtu.be/")) return url.replace("youtu.be/", "www.youtube.com/embed/");
  if (url.includes("vimeo.com/")) return url.replace("vimeo.com/", "player.vimeo.com/video/");
  return url;
}

function formatCurrency(value: number | null | undefined) {
  if (!value) return "";
  return (value / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function readThemeColor(theme: WebsiteBuilderWebsite["themeJson"] | undefined, fallback: string) {
  const colors = theme && typeof theme === "object" && !Array.isArray(theme) ? theme.colors : null;
  if (colors && typeof colors === "object" && !Array.isArray(colors) && typeof colors.primary === "string") return colors.primary;
  return fallback;
}

function readContactValue(settings: WebsiteBuilderWebsite["settingsJson"] | undefined, key: string) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return "";
  const value = settings[key];
  return typeof value === "string" ? value : "";
}
