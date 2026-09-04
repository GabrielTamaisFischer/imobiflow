import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bath,
  BedDouble,
  Building2,
  CalendarCheck,
  Camera,
  Car,
  CheckCircle2,
  ChevronRight,
  Expand,
  Home,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Play,
  Ruler,
  ShieldCheck,
  Sparkles,
  UserRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  createPublicSiteLead,
  getPublicSiteProperties,
  getPublicSiteProperty,
  type PublicPropertyResponse,
} from "@/product/sites";
import type { Property } from "@/product/real-estate";
import {
  createWhatsAppLink,
  formatArea,
  formatCurrencyFromCents,
  formatPropertyPrice,
  formatPublicAddress,
  getFeatureList,
  getPropertySlug,
  getPropertyImages,
  magnificentHeroImage,
  operationLabel,
  propertyTypeLabel,
} from "@/product/public-site-helpers";
import { resolveSafeEmbed } from "@/lib/embed-providers";

export const Route = createFileRoute("/site/$slug/imoveis/$propertySlug")({
  component: PublicPropertyPage,
});

export type PropertyMedia = {
  id?: string;
  media_type?: string | null;
  url?: string | null;
  caption?: string | null;
  position?: number | null;
  is_cover?: boolean | null;
};

type ExtendedProperty = Property & {
  latitude?: number | string | null;
  longitude?: number | string | null;
  furnished?: boolean | null;
  is_furnished?: boolean | null;
  accepts_financing?: boolean | null;
  accepts_exchange?: boolean | null;
  broker_name?: string | null;
  broker_phone?: string | null;
  broker_whatsapp?: string | null;
  broker_creci?: string | null;
  broker_photo_url?: string | null;
  agent_name?: string | null;
  agent_phone?: string | null;
  agent_whatsapp?: string | null;
  agent_creci?: string | null;
  agent_photo_url?: string | null;
  property_media?: PropertyMedia[];
};

function PublicPropertyPage() {
  const { slug, propertySlug } = Route.useParams();
  const [data, setData] = useState<PublicPropertyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeImage, setActiveImage] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    setActiveImage(null);
    setLightboxImage(null);

    void Promise.all([
      getPublicSiteProperty(slug, propertySlug),
      getPublicSiteProperties(slug).catch(() => null),
    ])
      .then(([propertyResponse, listResponse]) => {
        if (!mounted) return;
        setData({
          ...propertyResponse,
          properties: listResponse?.properties ?? propertyResponse.properties ?? propertyResponse.featured_properties ?? [propertyResponse.property],
        });
      })
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Nao foi possivel carregar este imovel.");
      });

    return () => {
      mounted = false;
    };
  }, [propertySlug, slug]);

  const site = data?.site;
  const property = data?.property as ExtendedProperty | null;
  const properties = data?.properties?.length ? data.properties : data?.featured_properties ?? [];
  const media = useMemo(() => sortMedia(property?.property_media ?? []), [property?.property_media]);
  const photos = useMemo(() => getPhotoMedia(property, media), [media, property]);
  const videos = useMemo(() => {
    const uploaded = media.filter(isVideoMedia);
    const linked = (property?.videos_json ?? [])
      .map((item) => typeof item.url === "string" && /^https?:\/\//i.test(item.url) ? ({ media_type: "video", url: item.url, caption: "Vídeo externo" } as PropertyMedia) : null)
      .filter((item): item is PropertyMedia => Boolean(item));
    return [...uploaded, ...linked];
  }, [media, property?.videos_json]);
  const tours = useMemo(() => media.filter(isTourMedia), [media]);
  const currentImage = activeImage ?? photos[0]?.url ?? magnificentHeroImage;
  const primary = site?.primary_color || "#c8a24b";
  const showPrices = site?.settings_json.show_prices !== false;
  const showFullAddress = Boolean(site?.settings_json.show_full_address);
  const features = property ? getFeatureList(property, 40) : [];
  const related = property ? findRelatedProperties(property, properties).slice(0, 6) : [];
  const mapQuery = property ? buildMapQuery(property, showFullAddress) : null;
  const mapUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : null;
  const mapsExternalUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : null;
  const wazeUrl = property ? buildWazeUrl(property, mapQuery) : null;
  const contactPhone = getContactPhone(property, site);

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    if (!property) return;

    try {
      await createPublicSiteLead(slug, {
        ...form,
        property_id: property.id,
        message:
          form.message ||
          `Tenho interesse no imovel ${property.code ? `${property.code} - ` : ""}${property.title}.`,
      });
      setForm({ name: "", phone: "", email: "", message: "" });
      setStatus("Interesse enviado. A equipe entrara em contato.");
    } catch (submitError) {
      setStatus(submitError instanceof Error ? submitError.message : "Nao foi possivel enviar seu interesse.");
    }
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-5 text-center text-white">
        <div className="max-w-md rounded-[28px] border border-white/10 bg-white/[0.055] p-8">
          <Home className="mx-auto size-10 text-[#c8a24b]" />
          <h1 className="mt-4 text-xl font-semibold">Imovel indisponivel</h1>
          <p className="mt-2 text-sm text-white/65">{error}</p>
          <Link className="mt-5 inline-flex text-sm font-semibold text-[#c8a24b]" to="/site/$slug" params={{ slug }}>
            Voltar ao site
          </Link>
        </div>
      </main>
    );
  }

  if (!data || !site) {
    return <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-white/65">Carregando imovel...</main>;
  }

  if (!property) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-5 text-center text-white">
        <div className="max-w-md rounded-[28px] border border-white/10 bg-white/[0.055] p-8">
          <Building2 className="mx-auto size-10 text-[#c8a24b]" />
          <h1 className="mt-4 text-xl font-semibold">Imovel nao encontrado</h1>
          <p className="mt-2 text-sm text-white/65">Este imovel pode ter sido removido, despublicado ou alterado.</p>
          <Link className="mt-5 inline-flex text-sm font-semibold text-[#c8a24b]" to="/site/$slug" params={{ slug }}>
            Voltar ao site
          </Link>
        </div>
      </main>
    );
  }

  const title = property.title;
  const description = property.description?.trim();
  const whatsappMessage = `Ola, tenho interesse no imovel ${property.code ? `${property.code} - ` : ""}${property.title}.`;

  return (
    <main
      data-public-page="property"
      className="min-h-screen bg-[#070707] text-white"
      style={{ "--site-primary": primary } as CSSProperties}
    >
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/82 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <Link to="/site/$slug" params={{ slug }} className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-white/75 transition hover:border-[var(--site-primary)] hover:text-white">
            <ArrowLeft className="size-4" />
            Voltar ao site
          </Link>
          <div className="hidden items-center gap-3 text-sm text-white/60 md:flex">
            {site.logo_url ? <img src={site.logo_url} alt={site.brand_name} className="h-9 w-auto object-contain" /> : null}
            <span>{site.brand_name}</span>
          </div>
          {contactPhone ? (
            <a
              href={createWhatsAppLink(contactPhone, whatsappMessage)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--site-primary)] px-4 py-2 text-sm font-semibold text-black"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
          ) : null}
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(200,162,75,0.18),transparent_34%),radial-gradient(circle_at_90%_8%,rgba(255,255,255,0.08),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[minmax(0,1.36fr)_420px] lg:py-14">
          <div>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Badge>{operationLabel(property.operation)}</Badge>
              <Badge>{propertyTypeLabel(property.property_type)}</Badge>
              {property.code ? <Badge>Codigo {property.code}</Badge> : null}
              {property.status ? <Badge>{propertyStatusLabel(property.status)}</Badge> : null}
            </div>

            <h1 className="max-w-5xl text-4xl font-semibold leading-[0.98] tracking-tight md:text-6xl">{title}</h1>
            <p className="mt-5 flex items-center gap-2 text-base text-white/66 md:text-lg">
              <MapPin className="size-5 text-[var(--site-primary)]" />
              {formatPublicAddress(property, showFullAddress)}
            </p>

            <PropertyGallery
              photos={photos}
              currentImage={currentImage}
              onPickImage={setActiveImage}
              onOpenImage={setLightboxImage}
            />
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[32px] border border-white/12 bg-white/[0.06] p-6 shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--site-primary)]">Valor do imovel</p>
              <p className="mt-3 text-3xl font-semibold">{showPrices ? formatPropertyPrice(property) : "Valor sob consulta"}</p>
              <CostGrid property={property} showPrices={showPrices} />
              <FactStrip property={property} />

              <div className="mt-6 grid gap-3">
                {contactPhone ? (
                  <a
                    href={createWhatsAppLink(contactPhone, whatsappMessage)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--site-primary)] px-5 text-sm font-semibold text-black"
                  >
                    <MessageCircle className="size-4" />
                    Entrar em contato
                  </a>
                ) : null}
                <a href="#interesse" className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/14 bg-white/[0.06] px-5 text-sm font-semibold text-white">
                  <CalendarCheck className="size-4" />
                  Agendar visita
                </a>
              </div>

              <PublisherCard property={property} site={site} contactPhone={contactPhone} message={whatsappMessage} />
            </div>
          </aside>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-8">
          <DescriptionSection description={description} property={property} />
          <MediaSection videos={videos} tours={tours} />
          <DetailsSection property={property} features={features} />
          <LocationSection
            property={property}
            showFullAddress={showFullAddress}
            mapUrl={mapUrl}
            mapsExternalUrl={mapsExternalUrl}
            wazeUrl={wazeUrl}
          />
          <RelatedSection properties={related} slug={slug} showPrices={showPrices} />
        </div>

        <aside id="interesse" className="lg:sticky lg:top-24 lg:self-start">
          <form onSubmit={submitLead} className="rounded-[30px] border border-white/12 bg-white/[0.055] p-6 backdrop-blur-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--site-primary)]">Tenho interesse</p>
            <h2 className="mt-3 text-2xl font-semibold">Receba atendimento sobre este imovel.</h2>
            <div className="mt-5 grid gap-3">
              <input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome" className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm outline-none transition focus:border-[var(--site-primary)]" />
              <input required value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Telefone/WhatsApp" className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm outline-none transition focus:border-[var(--site-primary)]" />
              <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="E-mail" className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm outline-none transition focus:border-[var(--site-primary)]" />
              <textarea value={form.message} onChange={(event) => setForm((current) => ({ ...current, message: event.target.value }))} placeholder={`Tenho interesse no imovel ${property.code ?? property.title}.`} rows={4} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm outline-none transition focus:border-[var(--site-primary)]" />
              <button type="submit" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--site-primary)] px-5 text-sm font-semibold text-black">
                <CheckCircle2 className="size-4" />
                Enviar interesse
              </button>
            </div>
            {status ? <p className="mt-4 rounded-2xl border border-white/10 bg-black/24 p-3 text-sm text-white/68">{status}</p> : null}
            <p className="mt-4 text-xs leading-5 text-white/44">O lead sera vinculado automaticamente a este imovel no ImobiFlow.</p>
          </form>
        </aside>
      </section>

      {lightboxImage ? (
        <button
          type="button"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-black/92 p-4"
          aria-label="Fechar imagem ampliada"
        >
          <img src={lightboxImage} alt={property.title} className="max-h-[92vh] max-w-[94vw] rounded-3xl object-contain" />
        </button>
      ) : null}
    </main>
  );
}

function PropertyGallery({
  photos,
  currentImage,
  onPickImage,
  onOpenImage,
}: {
  photos: PropertyMedia[];
  currentImage: string;
  onPickImage: (url: string) => void;
  onOpenImage: (url: string) => void;
}) {
  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => onOpenImage(currentImage)}
        className="group relative block h-[360px] w-full overflow-hidden rounded-[32px] border border-white/10 bg-neutral-900 text-left md:h-[560px]"
      >
        <img src={currentImage} alt="Foto principal do imovel" className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]" />
        <span className="absolute bottom-5 right-5 inline-flex items-center gap-2 rounded-full bg-black/58 px-4 py-2 text-sm font-semibold backdrop-blur-xl">
          <Expand className="size-4" />
          Ampliar
        </span>
      </button>

      {photos.length > 1 ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
          {photos.map((photo, index) => (
            <button
              key={`${photo.url}-${index}`}
              type="button"
              onClick={() => photo.url && onPickImage(photo.url)}
              className={`h-24 w-32 shrink-0 overflow-hidden rounded-2xl border transition ${photo.url === currentImage ? "border-[var(--site-primary)]" : "border-white/10 opacity-72 hover:opacity-100"}`}
            >
              {photo.url ? <img src={photo.url} alt={photo.caption || `Foto ${index + 1}`} className="h-full w-full object-cover" /> : null}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/55">
          <ImageIcon className="size-4 text-[var(--site-primary)]" />
          Galeria com a imagem principal do imovel.
        </div>
      )}
    </div>
  );
}

function CostGrid({ property, showPrices }: { property: ExtendedProperty; showPrices: boolean }) {
  if (!showPrices) return null;

  const costs = [
    property.sale_price_cents ? ["Venda", formatCurrencyFromCents(property.sale_price_cents)] : null,
    property.rent_price_cents ? ["Aluguel", `${formatCurrencyFromCents(property.rent_price_cents)}/mes`] : null,
    property.condominium_fee_cents ? ["Condominio", formatCurrencyFromCents(property.condominium_fee_cents)] : null,
    property.iptu_cents ? ["IPTU", formatCurrencyFromCents(property.iptu_cents)] : null,
  ].filter(Boolean) as [string, string][];

  if (!costs.length) return null;

  return (
    <div className="mt-5 grid grid-cols-2 gap-3">
      {costs.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-black/24 p-4">
          <p className="text-xs uppercase tracking-[0.16em] text-white/45">{label}</p>
          <p className="mt-1 text-sm font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  );
}

function FactStrip({ property }: { property: ExtendedProperty }) {
  const facts = [
    property.bedrooms ? { icon: BedDouble, value: property.bedrooms, label: "dorm." } : null,
    property.suites ? { icon: Home, value: property.suites, label: "suite(s)" } : null,
    property.bathrooms ? { icon: Bath, value: property.bathrooms, label: "banh." } : null,
    property.parking_spaces ? { icon: Car, value: property.parking_spaces, label: "vaga(s)" } : null,
    property.private_area ? { icon: Ruler, value: formatArea(property.private_area), label: "" } : null,
  ].filter(Boolean) as { icon: LucideIcon; value: string | number | null; label: string }[];

  if (!facts.length) return null;

  return (
    <div className="mt-5 flex flex-wrap gap-2">
      {facts.map(({ icon: Icon, value, label }) => (
        <span key={`${value}-${label}`} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/24 px-3 py-2 text-sm text-white/72">
          <Icon className="size-4 text-[var(--site-primary)]" />
          <span>{value}</span>
          {label ? <span>{label}</span> : null}
        </span>
      ))}
    </div>
  );
}

function DescriptionSection({ description, property }: { description?: string; property: ExtendedProperty }) {
  return (
    <article className="rounded-[30px] border border-white/10 bg-white/[0.045] p-6 md:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--site-primary)]">Descricao completa</p>
      <h2 className="mt-3 text-3xl font-semibold">Sobre este imovel</h2>
      {description ? (
        <div className="mt-5 whitespace-pre-line text-base leading-8 text-white/68">{description}</div>
      ) : (
        <p className="mt-5 text-base leading-8 text-white/58">
          A descricao completa ainda nao foi cadastrada. Use os detalhes tecnicos, galeria e contato para avaliar este imovel.
        </p>
      )}
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Highlight icon={Sparkles} title="Apresentacao premium" text="Pagina preparada para exibir as informacoes comerciais com clareza." />
        <Highlight icon={ShieldCheck} title="Dados vinculados" text={property.code ? `Codigo interno ${property.code}` : "Imovel vinculado ao cadastro real da imobiliaria."} />
        <Highlight icon={Building2} title="Perfil" text={`${propertyTypeLabel(property.property_type)} para ${operationLabel(property.operation).toLowerCase()}.`} />
      </div>
    </article>
  );
}

function MediaSection({ videos, tours }: { videos: PropertyMedia[]; tours: PropertyMedia[] }) {
  if (!videos.length && !tours.length) return null;

  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.045] p-6 md:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--site-primary)]">Midias imersivas</p>
      <h2 className="mt-3 text-3xl font-semibold">Video, tour 360 e experiencia do imovel</h2>
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {videos.map((video, index) => (
          <MediaFrame key={`video-${video.url}-${index}`} media={video} icon={Video} label="Video do imovel" />
        ))}
        {tours.map((tour, index) => (
          <MediaFrame key={`tour-${tour.url}-${index}`} media={tour} icon={Camera} label="Tour 360 / panoramico" />
        ))}
      </div>
    </section>
  );
}

// Fase 3D: função central e pura que decide como uma mídia deve ser
// renderizada — extraída para fora do componente especificamente para ser
// testável sem precisar renderizar React (convenção do projeto: testes de
// função pura, sem @testing-library/jsdom). Único ponto de decisão
// "panorama próprio vs. arquivo de vídeo próprio vs. iframe de provider
// externo vs. fallback seguro" — nada disso é decidido em nenhum outro
// lugar do arquivo.
export type MediaFrameKind =
  | { kind: "panorama-photo" }
  | { kind: "video-file" }
  | { kind: "iframe"; embedUrl: string; provider: string }
  | { kind: "fallback" };

export function classifyMediaFrame(media: PropertyMedia): MediaFrameKind {
  const url = media.url ?? "";
  // Um "tour" cujo arquivo é de fato uma IMAGEM (upload real via
  // LocalStorageProvider/Cloudinary/R2) é uma foto panorâmica
  // (equirretangular) enviada pelo próprio usuário — precisa do
  // visualizador interativo real, não um iframe/link estático. Checado
  // ANTES do allowlist de embed de propósito: um arquivo hospedado por nós
  // pode ter um nome de arquivo com palavras como "panorama"/"360"
  // (ex.: "foto-panorama.jpg") sem ser um link externo — nesse caso a
  // foto própria sempre vence.
  if (isTourMedia(media) && isLikelyImageUrl(url)) return { kind: "panorama-photo" };

  // Fase 3D — SEGURANÇA DE EMBEDS: uma URL só vira `<iframe src>` quando
  // `resolveSafeEmbed` (allowlist explícita de protocolo+hostname+formato,
  // ver src/lib/embed-providers.ts) a reconhece como um provider
  // realmente suportado. Qualquer outra URL (fora do allowlist, malformada,
  // http inseguro, javascript:/data:/file:, subdomínio falso, ou contendo
  // "matterport"/"kuula"/"360"/"panorama" só na querystring/path sem ser
  // um dos hosts reais) cai no fallback seguro — nunca em iframe.
  const safeEmbed = resolveSafeEmbed(url);

  // Achado real em QA de video (2026-08-30): um arquivo de video PRÓPRIO
  // (upload real via LocalStorageProvider/Cloudinary/R2, ou um link direto
  // para um .mp4/.webm) caía no ramo genérico de iframe — pensado para
  // players de terceiros (YouTube/Vimeo, que têm sua própria UI dentro do
  // iframe). Um arquivo de vídeo cru dentro de um <iframe> não mostra
  // nenhum controle visível (confirmado via screenshot real: caixa preta
  // vazia, sem play, sem barra de progresso) — o elemento HTML correto
  // para isso é <video controls>, nunca um iframe. Fase 3D: a decisão
  // "isto é um arquivo de vídeo cru vs. um link de provedor externo" usa a
  // mesma allowlist central de hostname (`resolveSafeEmbed`) em vez de
  // substring solta — evita que uma URL maliciosa como
  // "https://evil.com/?youtube.com=1" seja tratada como vídeo cru (o que a
  // levaria ao <video src> em vez do fallback seguro).
  if (isVideoMedia(media) && !safeEmbed) return { kind: "video-file" };

  if (safeEmbed) return { kind: "iframe", embedUrl: safeEmbed.embedUrl, provider: safeEmbed.provider };

  return { kind: "fallback" };
}

function MediaFrame({ media, icon: Icon, label }: { media: PropertyMedia; icon: LucideIcon; label: string }) {
  if (!media.url) return null;
  const frame = classifyMediaFrame(media);

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-black/24">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Icon className="size-4 text-[var(--site-primary)]" />
          {label}
        </span>
        <a href={media.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-[var(--site-primary)]">
          Abrir
        </a>
      </div>
      {frame.kind === "panorama-photo" ? (
        <PanoramaViewer url={media.url} caption={media.caption} />
      ) : frame.kind === "video-file" ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- legenda em portugues indisponivel nesta fase
        <video src={media.url} controls preload="metadata" className="h-72 w-full bg-black" />
      ) : frame.kind === "iframe" ? (
        // Fase 3D: `sandbox` NÃO é aplicado aqui de propósito — o projeto
        // já tem um padrão de sandbox restritivo (BUILDER_VISUAL_PREVIEW_SANDBOX
        // etc.), mas ele foi desenhado para o preview do site builder
        // (conteúdo `srcdoc` próprio, contexto de segurança diferente); um
        // sandbox mal calibrado para players de terceiros (YouTube/Vimeo)
        // arrisca quebrar a reprodução homologada (regressão explicitamente
        // proibida nesta tarefa) sem homologação em staging disponível
        // para validar visualmente. `referrerPolicy` é adicionado por ser
        // estritamente aditivo em segurança (reduz vazamento do Referer)
        // e não tem risco conhecido de quebrar YouTube/Vimeo.
        <iframe
          src={frame.embedUrl}
          title={media.caption || label}
          className="h-72 w-full"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="autoplay; fullscreen; picture-in-picture; xr-spatial-tracking"
          allowFullScreen
        />
      ) : (
        <a href={media.url} target="_blank" rel="noreferrer" className="grid h-72 place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(200,162,75,0.22),transparent_42%),#090909] text-center">
          <span className="inline-flex flex-col items-center gap-3">
            <span className="grid size-16 place-items-center rounded-full bg-[var(--site-primary)] text-black">
              <Play className="size-7" />
            </span>
            <span className="text-sm text-white/68">Abrir midia cadastrada</span>
          </span>
        </a>
      )}
    </div>
  );
}

// Interface ambiente mínima para a lib Pannellum (MIT, R$0, sem pacote de
// tipos publicado). Carregada dinamicamente (código + CSS) só quando existe
// de fato uma foto panorâmica própria na página — nunca no bundle inicial.
interface PannellumViewerInstance {
  destroy: () => void;
}
interface PannellumGlobal {
  viewer: (
    container: HTMLElement,
    config: { type: "equirectangular"; panorama: string; autoLoad?: boolean; compass?: boolean; showControls?: boolean; title?: string },
  ) => PannellumViewerInstance;
}
declare global {
  interface Window {
    pannellum?: PannellumGlobal;
  }
}

let pannellumLoadPromise: Promise<void> | null = null;
function loadPannellum(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.pannellum) return Promise.resolve();
  if (!pannellumLoadPromise) {
    pannellumLoadPromise = Promise.all([import("pannellum/build/pannellum.css"), import("pannellum/build/pannellum.js")]).then(() => undefined);
  }
  return pannellumLoadPromise;
}

function PanoramaViewer({ url, caption }: { url: string; caption?: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let viewer: PannellumViewerInstance | null = null;
    setStatus("loading");

    loadPannellum()
      .then(() => {
        if (cancelled || !containerRef.current || !window.pannellum) return;
        // A chave "title" só entra no config quando há legenda real: o
        // Pannellum renderiza a string literal "undefined" na barra de
        // titulo quando a chave existe com valor undefined (bug real
        // observado visualmente em QA — a legenda é opcional no upload,
        // então este é o caso comum, não a exceção).
        viewer = window.pannellum.viewer(containerRef.current, {
          type: "equirectangular",
          panorama: url,
          autoLoad: true,
          compass: false,
          showControls: true,
          ...(caption ? { title: caption } : {}),
        });
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      viewer?.destroy();
    };
  }, [url, caption]);

  if (status === "error") {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="grid h-72 place-items-center bg-[radial-gradient(circle_at_50%_30%,rgba(200,162,75,0.22),transparent_42%),#090909] text-center">
        <span className="inline-flex flex-col items-center gap-3">
          <span className="grid size-16 place-items-center rounded-full bg-[var(--site-primary)] text-black">
            <Play className="size-7" />
          </span>
          <span className="text-sm text-white/68">Nao foi possivel carregar o tour 360. Abrir a foto panoramica.</span>
        </span>
      </a>
    );
  }

  return (
    <div className="relative h-72 w-full bg-black">
      {status === "loading" ? (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/60 text-sm text-white/68">Carregando tour 360...</div>
      ) : null}
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

function isLikelyImageUrl(url: string) {
  return /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(url) || url.includes("/uploads/") || url.includes("cloudinary.com") || url.includes("r2.dev") || url.includes("r2.cloudflarestorage.com");
}

function DetailsSection({ property, features }: { property: ExtendedProperty; features: string[] }) {
  const details = [
    ["Dormitorios", property.bedrooms],
    ["Suites", property.suites],
    ["Banheiros", property.bathrooms],
    ["Vagas", property.parking_spaces],
    ["Area util", formatArea(property.private_area)],
    ["Area total", formatArea(property.total_area)],
    ["Tipo", propertyTypeLabel(property.property_type)],
    ["Finalidade", operationLabel(property.operation)],
    ["Status", propertyStatusLabel(property.status)],
    ["Mobiliado", truthyLabel(property.furnished ?? property.is_furnished)],
    ["Aceita financiamento", truthyLabel(property.accepts_financing)],
    ["Aceita permuta", truthyLabel(property.accepts_exchange)],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");

  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.045] p-6 md:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--site-primary)]">Detalhes do imovel</p>
      <h2 className="mt-3 text-3xl font-semibold">Ficha tecnica completa</h2>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {details.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/24 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-white/42">{label}</p>
            <p className="mt-2 font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
      {features.length ? (
        <div className="mt-7">
          <h3 className="text-lg font-semibold">Diferenciais</h3>
          <div className="mt-4 flex flex-wrap gap-2">
            {features.map((feature) => (
              <span key={feature} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.055] px-3 py-2 text-sm text-white/72">
                <CheckCircle2 className="size-4 text-[var(--site-primary)]" />
                {humanizeFeature(feature)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function LocationSection({
  property,
  showFullAddress,
  mapUrl,
  mapsExternalUrl,
  wazeUrl,
}: {
  property: ExtendedProperty;
  showFullAddress: boolean;
  mapUrl: string | null;
  mapsExternalUrl: string | null;
  wazeUrl: string | null;
}) {
  return (
    <section className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.045]">
      <div className="p-6 md:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--site-primary)]">Localizacao</p>
        <h2 className="mt-3 text-3xl font-semibold">Mapa e regiao do imovel</h2>
        <p className="mt-3 text-white/62">{formatPublicAddress(property, showFullAddress)}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {mapsExternalUrl ? (
            <a href={mapsExternalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-[var(--site-primary)] px-4 py-2 text-sm font-semibold text-black">
              <Navigation className="size-4" />
              Abrir no Google Maps
            </a>
          ) : null}
          {wazeUrl ? (
            <a href={wazeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white">
              Abrir no Waze
            </a>
          ) : null}
        </div>
      </div>
      {mapUrl ? (
        <iframe src={mapUrl} title="Mapa do imovel" className="h-[360px] w-full border-0 grayscale-[0.15]" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      ) : (
        <div className="grid h-72 place-items-center border-t border-white/10 bg-black/24 p-8 text-center text-white/58">
          Localizacao ainda nao cadastrada para exibicao em mapa.
        </div>
      )}
    </section>
  );
}

function PublisherCard({
  property,
  site,
  contactPhone,
  message,
}: {
  property: ExtendedProperty;
  site: PublicPropertyResponse["site"];
  contactPhone: string | null;
  message: string;
}) {
  const publisher = getPublisher(property, site);

  return (
    <div className="mt-6 rounded-3xl border border-white/10 bg-black/24 p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-white/44">Publicado por</p>
      <div className="mt-4 flex items-center gap-4">
        {publisher.photo ? (
          <img src={publisher.photo} alt={publisher.name} className="size-14 rounded-2xl object-cover" />
        ) : (
          <span className="grid size-14 place-items-center rounded-2xl bg-[var(--site-primary)]/18 text-[var(--site-primary)]">
            <UserRound className="size-6" />
          </span>
        )}
        <div>
          <p className="font-semibold">{publisher.name}</p>
          {publisher.creci ? <p className="text-sm text-white/55">CRECI {publisher.creci}</p> : null}
          {publisher.phone ? <p className="text-sm text-white/55">{publisher.phone}</p> : null}
        </div>
      </div>
      {contactPhone ? (
        <a href={createWhatsAppLink(contactPhone, message)} target="_blank" rel="noreferrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/12 px-4 py-3 text-sm font-semibold text-white">
          <Phone className="size-4" />
          Falar com responsavel
        </a>
      ) : null}
    </div>
  );
}

function RelatedSection({ properties, slug, showPrices }: { properties: Property[]; slug: string; showPrices: boolean }) {
  if (!properties.length) return null;

  return (
    <section className="rounded-[30px] border border-white/10 bg-white/[0.045] p-6 md:p-8">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--site-primary)]">Imoveis semelhantes</p>
      <h2 className="mt-3 text-3xl font-semibold">Outras oportunidades na mesma linha.</h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {properties.map((property) => (
          <RelatedCard key={property.id} property={property} slug={slug} showPrices={showPrices} />
        ))}
      </div>
    </section>
  );
}

function RelatedCard({ property, slug, showPrices }: { property: Property; slug: string; showPrices: boolean }) {
  const images = getPropertyImages(property);
  const cover = images[0] ?? magnificentHeroImage;
  return (
    <Link
      to="/site/$slug/imoveis/$propertySlug"
      params={{ slug, propertySlug: getPropertySlug(property) }}
      className="group block overflow-hidden rounded-3xl border border-white/10 bg-black/24 transition hover:-translate-y-1 hover:border-[var(--site-primary)]"
    >
      <img src={cover} alt={property.title} className="h-44 w-full object-cover transition duration-700 group-hover:scale-105" />
      <div className="p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--site-primary)]">{operationLabel(property.operation)}</p>
        <h3 className="mt-2 line-clamp-2 font-semibold">{property.title}</h3>
        <p className="mt-2 text-sm text-white/55">{formatPublicAddress(property)}</p>
        <p className="mt-3 font-semibold">{showPrices ? formatPropertyPrice(property) : "Valor sob consulta"}</p>
      </div>
    </Link>
  );
}

function Highlight({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/24 p-5">
      <Icon className="size-6 text-[var(--site-primary)]" />
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-white/58">{text}</p>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-sm text-white/72 backdrop-blur-xl">{children}</span>;
}

export function sortMedia(media: PropertyMedia[]) {
  return [...media].filter((item) => Boolean(item.url)).sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || Number(a.position ?? 0) - Number(b.position ?? 0));
}

function getPhotoMedia(property: ExtendedProperty | null, media: PropertyMedia[]) {
  const photos = media.filter((item) => isPhotoMedia(item));
  if (photos.length) return photos;

  return (property ? getPropertyImages(property).map((url, index) => ({ id: `image-${index}`, url, media_type: "photo", position: index })) : []).filter((item) => item.url);
}

export function isPhotoMedia(media: PropertyMedia) {
  const type = String(media.media_type ?? "").toLowerCase();
  const url = String(media.url ?? "").toLowerCase();
  return type === "photo" || type === "image" || /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/.test(url);
}

// Fase 3D: removida a correspondência de substring solta para provedor de
// vídeo (`url.includes("youtube.com")` etc.) — a classificação "isto é um
// vídeo externo de provider reconhecido" agora usa a mesma allowlist
// central (`resolveSafeEmbed`) usada para decidir se algo vira iframe,
// eliminando uma segunda fonte de verdade que podia divergir da allowlist
// real (ex.: uma URL "https://evil.com/youtube.com" batia no substring
// antigo mas nunca seria um embed seguro de fato).
export function isVideoMedia(media: PropertyMedia) {
  const type = String(media.media_type ?? "").toLowerCase();
  const url = String(media.url ?? "");
  if (type === "video") return true;
  if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) return true;
  const embed = resolveSafeEmbed(url);
  return embed?.provider === "youtube" || embed?.provider === "vimeo";
}

// Fase 3D: removida a correspondência de substring solta em cima da URL
// ("matterport"/"kuula"/"360"/"panorama" em qualquer parte da URL). Um
// "tour" agora só é reconhecido pelo `media_type` gravado no upload real
// (`PropertyMedia`, controlado pelo backend/enum — nunca por texto livre
// do usuário). "360"/"panorama" como valor de `media_type` são mantidos
// por compatibilidade com dados legados; o schema atual de upload só usa
// "tour", mas o backend nunca aceitou esses dois como conteúdo de URL.
export function isTourMedia(media: PropertyMedia) {
  const type = String(media.media_type ?? "").toLowerCase();
  return type === "tour" || type === "360" || type === "panorama";
}

function buildMapQuery(property: ExtendedProperty, showFullAddress: boolean) {
  const coordinates = getCoordinates(property);
  if (coordinates) return `${coordinates.lat},${coordinates.lng}`;

  const address = formatPublicAddress(property, showFullAddress);
  return address && address !== "Localizacao sob consulta" ? address : null;
}

function buildWazeUrl(property: ExtendedProperty, mapQuery: string | null) {
  const coordinates = getCoordinates(property);
  if (coordinates) return `https://waze.com/ul?ll=${coordinates.lat},${coordinates.lng}&navigate=yes`;
  return mapQuery ? `https://waze.com/ul?q=${encodeURIComponent(mapQuery)}&navigate=yes` : null;
}

function getCoordinates(property: ExtendedProperty) {
  const rawLatitude = property.latitude as unknown;
  const rawLongitude = property.longitude as unknown;
  if (rawLatitude === null || rawLatitude === undefined || rawLatitude === "") return null;
  if (rawLongitude === null || rawLongitude === undefined || rawLongitude === "") return null;

  const lat = Number(rawLatitude);
  const lng = Number(rawLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function getContactPhone(property: ExtendedProperty | null, site: PublicPropertyResponse["site"] | undefined) {
  return property?.broker_whatsapp || property?.agent_whatsapp || property?.broker_phone || property?.agent_phone || site?.whatsapp || site?.phone || null;
}

function getPublisher(property: ExtendedProperty, site: PublicPropertyResponse["site"]) {
  return {
    // Item 6 do escopo: corretor responsavel selecionado no cadastro, exposto
    // no site publico so pelo NOME (responsible_user_name, backend
    // ja garante nunca incluir telefone/e-mail do AppUser nessa consulta).
    // O telefone exibido aqui e SEMPRE o contato oficial da imobiliaria
    // (site.phone/whatsapp) - nunca um telefone pessoal do corretor.
    name: property.responsible_user_name || property.broker_name || property.agent_name || site.brand_name || "Imobiliaria",
    phone: property.broker_phone || property.agent_phone || site.phone || site.whatsapp || null,
    creci: property.broker_creci || property.agent_creci || null,
    photo: property.broker_photo_url || property.agent_photo_url || site.logo_url || null,
  };
}

function findRelatedProperties(property: ExtendedProperty, properties: Property[]) {
  const basePrice = property.sale_price_cents || property.rent_price_cents || 0;

  return properties
    .filter((item) => item.id !== property.id)
    .map((item) => {
      let score = 0;
      if (item.property_type === property.property_type) score += 4;
      if (item.operation === property.operation) score += 4;
      if (item.city && item.city === property.city) score += 3;
      if (item.neighborhood && item.neighborhood === property.neighborhood) score += 3;
      const itemPrice = item.sale_price_cents || item.rent_price_cents || 0;
      if (basePrice && itemPrice && Math.abs(itemPrice - basePrice) / basePrice <= 0.35) score += 2;
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

function propertyStatusLabel(status: Property["status"] | string) {
  const labels: Record<string, string> = {
    available: "Disponivel",
    reserved: "Reservado",
    sold: "Vendido",
    rented: "Alugado",
    archived: "Arquivado",
  };

  return labels[String(status)] ?? String(status);
}

function truthyLabel(value: unknown) {
  if (value === null || value === undefined) return null;
  return value ? "Sim" : "Nao";
}

function humanizeFeature(feature: string) {
  return feature
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}
