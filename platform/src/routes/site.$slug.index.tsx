import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Bath,
  BedDouble,
  Building2,
  Car,
  ChevronRight,
  Crown,
  Home,
  KeyRound,
  MapPin,
  MessageCircle,
  Moon,
  Ruler,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  createPublicSiteLead,
  getPublicSite,
  type PublicSiteResponse,
} from "@/product/sites";
import type { Property } from "@/product/real-estate";
import {
  createWhatsAppLink,
  formatArea,
  formatPropertyPrice,
  formatPublicAddress,
  getFeatureList,
  getPropertySlug,
  getPropertyCoverUrl,
  magnificentHeroImage,
  normalizeSearch,
  operationLabel,
  propertyTypeLabel,
} from "@/product/public-site-helpers";

export const Route = createFileRoute("/site/$slug/")({
  component: PublicCompanySite,
});

function PublicCompanySite() {
  const { slug } = Route.useParams();
  const [data, setData] = useState<PublicSiteResponse | null>(null);
  const [search, setSearch] = useState("");
  const [operationFilter, setOperationFilter] = useState<"all" | Property["operation"]>("all");
  const [form, setForm] = useState({ name: "", phone: "", email: "", message: "" });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setError(null);
    void getPublicSite(slug)
      .then(setData)
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar este site.");
      });
  }, [slug]);

  const properties = data?.properties?.length ? data.properties : data?.featured_properties ?? [];
  const availableProperties = properties.filter((property) => property.status === "available" || property.published_at);
  const catalogProperties = availableProperties.length ? availableProperties : properties;
  const featuredProperties = catalogProperties.filter((property) => property.site_featured === true);

  const filteredProperties = useMemo(() => {
    const term = normalizeSearch(search);

    return catalogProperties.filter((property) => {
      const haystack = normalizeSearch(
        [
          property.code,
          property.title,
          propertyTypeLabel(property.property_type),
          operationLabel(property.operation),
          property.neighborhood,
          property.city,
          property.state,
        ]
          .filter(Boolean)
          .join(" "),
      );
      const matchesSearch = !term || haystack.includes(term);
      const matchesOperation = operationFilter === "all" || property.operation === operationFilter;

      return matchesSearch && matchesOperation;
    });
  }, [catalogProperties, operationFilter, search]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-5 text-center text-white">
        <div className="max-w-md rounded-lg border border-white/10 bg-white/[0.04] p-8">
          <Home className="mx-auto size-10 text-[#c8a24b]" />
          <h1 className="mt-4 text-xl font-semibold">Site indisponível</h1>
          <p className="mt-2 text-sm text-white/65">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-sm text-white/65">
        Carregando site...
      </main>
    );
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    try {
      await createPublicSiteLead(slug, form);
      setForm({ name: "", phone: "", email: "", message: "" });
      setStatus("Interesse enviado. A equipe entrará em contato.");
    } catch (submitError) {
      setStatus(submitError instanceof Error ? submitError.message : "Não foi possível enviar seu interesse.");
    }
  }

  const site = data.site;
  const primary = site.primary_color || "#c8a24b";
  const heroImage = site.settings_json.hero_image_url || magnificentHeroImage;
  const showPrices = site.settings_json.show_prices !== false;
  const style = { "--site-primary": primary } as CSSProperties;
  const surfaceClass = isDark ? "bg-[#070707] text-white" : "bg-[#f7f2e8] text-neutral-950";
  const glassClass = isDark
    ? "border-white/10 bg-white/[0.07] text-white shadow-2xl shadow-black/25"
    : "border-black/10 bg-white/85 text-neutral-950 shadow-2xl shadow-black/10";
  const mutedClass = isDark ? "text-white/68" : "text-neutral-600";
  const saleProperties = filteredProperties.filter((property) => property.operation === "sale" || property.operation === "both");
  const rentProperties = filteredProperties.filter((property) => property.operation === "rent" || property.operation === "both");

  return (
    <main data-public-page="company" className={`min-h-screen ${surfaceClass}`} style={style}>
      <header
        className={
          isDark
            ? "fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-black/70 backdrop-blur-xl"
            : "fixed inset-x-0 top-0 z-30 border-b border-black/10 bg-white/80 backdrop-blur-xl"
        }
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
          <a href="#topo" className="flex items-center gap-3">
            {site.logo_url ? (
              <img className="h-11 w-auto object-contain" src={site.logo_url} alt={site.brand_name} />
            ) : (
              <span className="grid size-11 place-items-center rounded-full border border-[var(--site-primary)] text-lg font-semibold text-[var(--site-primary)]">
                {site.brand_name.slice(0, 1)}
              </span>
            )}
            <span className="hidden text-lg font-semibold tracking-wide sm:inline">{site.brand_name}</span>
          </a>

          <nav className={`hidden items-center gap-7 text-sm font-medium lg:flex ${mutedClass}`}>
            <a href="#imoveis" className="transition hover:text-[var(--site-primary)]">Imóveis</a>
            <a href="#venda" className="transition hover:text-[var(--site-primary)]">Venda</a>
            <a href="#locacao" className="transition hover:text-[var(--site-primary)]">Locação</a>
            <a href="#sobre" className="transition hover:text-[var(--site-primary)]">Sobre</a>
            <a href="#contato" className="transition hover:text-[var(--site-primary)]">Contato</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDark((current) => !current)}
              className="grid size-10 place-items-center rounded-full border border-current/15 transition hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]"
              aria-label="Alternar tema"
            >
              {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            {site.whatsapp ? (
              <a
                className="hidden h-10 items-center justify-center gap-2 rounded-full bg-[var(--site-primary)] px-5 text-sm font-semibold text-black shadow-[0_0_36px_rgba(200,162,75,0.28)] transition hover:scale-[1.02] sm:inline-flex"
                href={createWhatsAppLink(site.whatsapp, `Olá, vim pelo site ${site.brand_name}.`)}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <section id="topo" className="relative min-h-screen overflow-hidden bg-black text-white">
        <img className="absolute inset-0 h-full w-full object-cover opacity-60" src={heroImage} alt={site.brand_name} />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(200,162,75,0.25),transparent_32%),linear-gradient(90deg,rgba(0,0,0,0.88),rgba(0,0,0,0.52),rgba(0,0,0,0.22))]" />
        <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-end px-5 pb-16 pt-32">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/75 backdrop-blur">
              <Crown className="size-4 text-[var(--site-primary)]" />
              Imobiliária familiar de alto padrão
            </div>
            <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-tight md:text-7xl">
              {site.headline || "Imóveis que unem desejo, confiança e negociação segura."}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/78">
              {site.description || "Uma vitrine premium conectada ao ImobiFlow para apresentar imóveis reais, captar leads e transformar interesse em atendimento."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--site-primary)] px-6 text-sm font-semibold text-black transition hover:scale-[1.02] hover:brightness-110"
                href="#imoveis"
              >
                Ver imóveis
                <ChevronRight className="size-4" />
              </a>
              <a
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 bg-white/10 px-6 text-sm font-semibold text-white backdrop-blur transition hover:border-[var(--site-primary)] hover:text-[var(--site-primary)]"
                href="#contato"
              >
                Anunciar meu imóvel
              </a>
            </div>
          </div>

          <div className="mt-10 grid max-w-5xl gap-3 rounded-2xl border border-white/15 bg-white/95 p-3 text-neutral-950 shadow-2xl shadow-black/40 md:grid-cols-[1fr_190px_160px]">
            <label className="relative">
              <Search className="pointer-events-none absolute left-4 top-3.5 size-4 text-neutral-500" />
              <input
                className="h-12 w-full rounded-xl border border-black/10 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-[var(--site-primary)]"
                placeholder="Buscar por bairro, código, cidade ou tipo"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <select
              className="h-12 rounded-xl border border-black/10 bg-white px-4 text-sm outline-none transition focus:border-[var(--site-primary)]"
              value={operationFilter}
              onChange={(event) => setOperationFilter(event.target.value as typeof operationFilter)}
            >
              <option value="all">Todas</option>
              <option value="sale">Comprar</option>
              <option value="rent">Alugar</option>
              <option value="season">Temporada</option>
              <option value="both">Venda e locação</option>
            </select>
            <a className="inline-flex h-12 items-center justify-center rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-[var(--site-primary)] hover:text-black" href="#imoveis">
              Pesquisar
            </a>
          </div>

          <div className="mt-8 grid max-w-4xl gap-3 sm:grid-cols-3">
            <HeroStat value={catalogProperties.length} label="imóveis publicados" />
            <HeroStat value={saleProperties.length} label="opções para compra" />
            <HeroStat value={rentProperties.length} label="opções para locação" />
          </div>
        </div>
      </section>

      {featuredProperties.length ? (
        <PropertyCarouselSection
          id="destaques"
          eyebrow="Destaques"
          title="Imóveis destacados pela imobiliária"
          properties={featuredProperties}
          slug={slug}
          showPrices={showPrices}
          showFullAddress={Boolean(site.settings_json.show_full_address)}
          glassClass={glassClass}
          mutedClass={mutedClass}
        />
      ) : null}

      <section id="imoveis" className="mx-auto max-w-7xl px-5 py-20">
        <SectionHeading
          eyebrow="Vitrine de imóveis"
          title="Uma curadoria elegante para compra, locação e investimento."
          description="Os cards levam para a página completa do imóvel, com galeria, ficha técnica, descrição e formulário de interesse."
          mutedClass={mutedClass}
        />

        {filteredProperties.length ? (
          <div className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filteredProperties.map((property) => (
              <PublicPropertyCard
                key={property.id}
                property={property}
                slug={slug}
                showPrices={showPrices}
                showFullAddress={Boolean(site.settings_json.show_full_address)}
                glassClass={glassClass}
                mutedClass={mutedClass}
              />
            ))}
          </div>
        ) : (
          <EmptyPropertyState glassClass={glassClass} mutedClass={mutedClass} />
        )}
      </section>

      <PropertyCarouselSection
        id="venda"
        eyebrow="Comprar"
        title="Imóveis selecionados para venda"
        properties={saleProperties}
        slug={slug}
        showPrices={showPrices}
        showFullAddress={Boolean(site.settings_json.show_full_address)}
        glassClass={glassClass}
        mutedClass={mutedClass}
      />

      <PropertyCarouselSection
        id="locacao"
        eyebrow="Locação"
        title="Endereços prontos para uma nova rotina"
        properties={rentProperties}
        slug={slug}
        showPrices={showPrices}
        showFullAddress={Boolean(site.settings_json.show_full_address)}
        glassClass={glassClass}
        mutedClass={mutedClass}
      />

      <section id="sobre" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--site-primary)]">Sobre a imobiliária</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Atendimento próximo com apresentação de alto padrão.
          </h2>
        </div>
        <div className={`rounded-2xl border p-6 md:p-8 ${glassClass}`}>
          <p className={`text-lg leading-8 ${mutedClass}`}>
            A vitrine foi pensada para valorizar cada imóvel com clareza, fotografia, dados reais e contato direto. A
            experiência passa confiança para proprietários, compradores e locatários, mantendo o atendimento conectado
            ao ImobiFlow.
          </p>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <ProcessCard icon={Sparkles} title="Curadoria" text="Imóveis organizados por interesse, valor, localização e finalidade." mutedClass={mutedClass} />
            <ProcessCard icon={ShieldCheck} title="Confiança" text="Dados claros, contato direto e histórico conectado ao CRM." mutedClass={mutedClass} />
            <ProcessCard icon={KeyRound} title="Conversão" text="Lead do site entra no sistema para a equipe atender rápido." mutedClass={mutedClass} />
          </div>
        </div>
      </section>

      <section className={isDark ? "border-y border-white/10 bg-white/[0.035]" : "border-y border-black/10 bg-white/70"}>
        <div className="mx-auto max-w-7xl px-5 py-20">
          <SectionHeading
            eyebrow="Como trabalhamos"
            title="Jornada simples para cada tipo de cliente."
            description="A página pública comunica profissionalismo, enquanto o ImobiFlow guarda leads, imóveis e próximos passos."
            mutedClass={mutedClass}
          />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <WorkflowCard number="01" title="Proprietários" text="Avaliação, divulgação premium, captação de interessados, documentação, vistoria e administração." glassClass={glassClass} mutedClass={mutedClass} />
            <WorkflowCard number="02" title="Compradores" text="Busca qualificada, agendamento, negociação, proposta e segurança documental." glassClass={glassClass} mutedClass={mutedClass} />
            <WorkflowCard number="03" title="Locatários" text="Seleção do imóvel, ficha cadastral, contrato, vistoria e entrega de chaves." glassClass={glassClass} mutedClass={mutedClass} />
          </div>
        </div>
      </section>

      <section id="contato" className="mx-auto grid max-w-7xl gap-8 px-5 py-20 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--site-primary)]">Contato</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">Fale com a equipe e transforme interesse em atendimento.</h2>
          <div className={`mt-6 space-y-3 text-sm ${mutedClass}`}>
            {site.phone ? <p>Telefone: {site.phone}</p> : null}
            {site.email ? <p>E-mail: {site.email}</p> : null}
            {site.whatsapp ? (
              <a className="inline-flex items-center gap-2 text-[var(--site-primary)]" href={createWhatsAppLink(site.whatsapp, `Olá, vim pelo site ${site.brand_name}.`)} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" />
                Chamar no WhatsApp
              </a>
            ) : null}
          </div>
        </div>

        {site.settings_json.allow_lead_capture === false ? null : (
          <form onSubmit={submitLead} className={`rounded-2xl border p-5 md:p-7 ${glassClass}`}>
            <h3 className="text-xl font-semibold">Enviar mensagem</h3>
            <p className={`mt-2 text-sm ${mutedClass}`}>O envio vira lead dentro do ImobiFlow para acompanhamento comercial.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <input className="h-12 rounded-xl border border-current/10 bg-white/90 px-4 text-sm text-neutral-950 outline-none focus:border-[var(--site-primary)]" placeholder="Nome" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
              <input className="h-12 rounded-xl border border-current/10 bg-white/90 px-4 text-sm text-neutral-950 outline-none focus:border-[var(--site-primary)]" placeholder="WhatsApp" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              <input className="h-12 rounded-xl border border-current/10 bg-white/90 px-4 text-sm text-neutral-950 outline-none focus:border-[var(--site-primary)] sm:col-span-2" placeholder="E-mail" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              <textarea className="min-h-32 rounded-xl border border-current/10 bg-white/90 px-4 py-3 text-sm text-neutral-950 outline-none focus:border-[var(--site-primary)] sm:col-span-2" placeholder="Mensagem" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </div>
            <button className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--site-primary)] px-4 text-sm font-semibold text-black transition hover:brightness-110" type="submit">
              <MessageCircle className="size-4" />
              Enviar interesse
            </button>
            {status ? <p className={`mt-3 text-sm ${mutedClass}`}>{status}</p> : null}
          </form>
        )}
      </section>

      <footer className="border-t border-white/10 bg-black px-5 py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {site.logo_url ? <img className="h-12 w-auto object-contain" src={site.logo_url} alt={site.brand_name} /> : null}
            <div>
              <p className="text-lg font-semibold">{site.brand_name}</p>
              <p className="text-sm text-white/55">Site imobiliário conectado ao ImobiFlow.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-5 text-sm text-white/60">
            <a href="#imoveis" className="hover:text-[var(--site-primary)]">Imóveis</a>
            <a href="#sobre" className="hover:text-[var(--site-primary)]">Sobre</a>
            <a href="#contato" className="hover:text-[var(--site-primary)]">Contato</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

function PublicPropertyCard({
  property,
  slug,
  showPrices,
  showFullAddress,
  glassClass,
  mutedClass,
}: {
  property: Property;
  slug: string;
  showPrices: boolean;
  showFullAddress: boolean;
  glassClass: string;
  mutedClass: string;
}) {
  const cover = getPropertyCoverUrl(property);
  const features = getFeatureList(property, 3);
  return (
    <Link
      to="/site/$slug/imoveis/$propertySlug"
      params={{ slug, propertySlug: getPropertySlug(property) }}
      className={`group block cursor-pointer overflow-hidden rounded-2xl border text-left transition duration-300 hover:-translate-y-1 hover:border-[var(--site-primary)] hover:shadow-[0_24px_70px_rgba(200,162,75,0.18)] ${glassClass}`}
      aria-label={`Abrir página do imóvel ${property.title}`}
      data-property-card={property.id}
    >
      <div className="relative h-72 overflow-hidden bg-neutral-900">
        {cover ? (
          <img className="h-full w-full object-cover transition duration-700 group-hover:scale-110" src={cover} alt={property.title} />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_25%_20%,rgba(200,162,75,0.26),transparent_35%),linear-gradient(135deg,#171717,#050505)]">
            <Building2 className="size-12 text-[var(--site-primary)]" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/20 to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--site-primary)] px-3 py-1 text-xs font-semibold text-black">
            {operationLabel(property.operation)}
          </span>
          {property.code ? <span className="rounded-full border border-white/20 bg-black/35 px-3 py-1 text-xs text-white backdrop-blur">{property.code}</span> : null}
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/70">{propertyTypeLabel(property.property_type)}</p>
          <h3 className="mt-1 line-clamp-2 text-2xl font-semibold text-white">{property.title}</h3>
        </div>
      </div>
      <div className="p-5">
        <p className={`flex items-center gap-2 text-sm ${mutedClass}`}>
          <MapPin className="size-4 shrink-0 text-[var(--site-primary)]" />
          <span className="truncate">{formatPublicAddress(property, showFullAddress)}</span>
        </p>
        <p className="mt-4 text-2xl font-semibold">{showPrices ? formatPropertyPrice(property) : "Valor sob consulta"}</p>
        <PropertyFacts property={property} mutedClass={mutedClass} />
        {features.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {features.map((feature) => (
              <span key={feature} className="rounded-full border border-current/10 px-3 py-1 text-xs opacity-80">
                {feature}
              </span>
            ))}
          </div>
        ) : null}
        <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--site-primary)]">
          Ver detalhes do imóvel
          <ChevronRight className="size-4 transition group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

function PropertyCarouselSection({
  id,
  eyebrow,
  title,
  properties,
  slug,
  showPrices,
  showFullAddress,
  glassClass,
  mutedClass,
}: {
  id: string;
  eyebrow: string;
  title: string;
  properties: Property[];
  slug: string;
  showPrices: boolean;
  showFullAddress: boolean;
  glassClass: string;
  mutedClass: string;
}) {
  if (!properties.length) return null;

  return (
    <section id={id} className="mx-auto max-w-7xl px-5 pb-20">
      <SectionHeading eyebrow={eyebrow} title={title} description="Seleção automática dos imóveis liberados para o site." mutedClass={mutedClass} />
      <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {properties.slice(0, 6).map((property) => (
          <PublicPropertyCard
            key={`${id}-${property.id}`}
            property={property}
            slug={slug}
            showPrices={showPrices}
            showFullAddress={showFullAddress}
            glassClass={glassClass}
            mutedClass={mutedClass}
          />
        ))}
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
  mutedClass,
}: {
  eyebrow: string;
  title: string;
  description: string;
  mutedClass: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[var(--site-primary)]">{eyebrow}</p>
      <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">{title}</h2>
      <p className={`mt-4 text-base leading-7 ${mutedClass}`}>{description}</p>
    </div>
  );
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
      <p className="text-3xl font-semibold text-[var(--site-primary)]">{value}</p>
      <p className="mt-1 text-sm text-white/68">{label}</p>
    </div>
  );
}

function PropertyFacts({ property, mutedClass }: { property: Property; mutedClass: string }) {
  const privateArea = formatArea(property.private_area);
  const totalArea = formatArea(property.total_area);

  return (
    <div className={`mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 ${mutedClass}`}>
      {property.bedrooms ? <Fact icon={BedDouble} value={property.bedrooms} label="dorm." /> : null}
      {property.bathrooms ? <Fact icon={Bath} value={property.bathrooms} label="banh." /> : null}
      {property.parking_spaces ? <Fact icon={Car} value={property.parking_spaces} label="vagas" /> : null}
      {privateArea || totalArea ? <Fact icon={Ruler} value={privateArea ?? totalArea ?? ""} label="área" /> : null}
    </div>
  );
}

function Fact({ icon: Icon, value, label }: { icon: LucideIcon; value: string | number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-4 text-[var(--site-primary)]" />
      <span>{value}</span>
      <span>{label}</span>
    </span>
  );
}

function ProcessCard({ icon: Icon, title, text, mutedClass }: { icon: LucideIcon; title: string; text: string; mutedClass: string }) {
  return (
    <article className="rounded-2xl border border-current/10 p-4">
      <Icon className="size-6 text-[var(--site-primary)]" />
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className={`mt-2 text-sm leading-6 ${mutedClass}`}>{text}</p>
    </article>
  );
}

function WorkflowCard({
  number,
  title,
  text,
  glassClass,
  mutedClass,
}: {
  number: string;
  title: string;
  text: string;
  glassClass: string;
  mutedClass: string;
}) {
  return (
    <article className={`rounded-2xl border p-6 ${glassClass}`}>
      <p className="text-sm font-semibold text-[var(--site-primary)]">{number}</p>
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className={`mt-3 leading-7 ${mutedClass}`}>{text}</p>
    </article>
  );
}

function EmptyPropertyState({ glassClass, mutedClass }: { glassClass: string; mutedClass: string }) {
  return (
    <div className={`mt-10 rounded-2xl border border-dashed p-10 text-center ${glassClass}`}>
      <Building2 className="mx-auto size-10 text-[var(--site-primary)]" />
      <h3 className="mt-4 text-xl font-semibold">Nenhum imóvel publicado ainda</h3>
      <p className={`mx-auto mt-2 max-w-lg text-sm leading-6 ${mutedClass}`}>
        Quando a imobiliária liberar imóveis no ImobiFlow, eles aparecerão aqui automaticamente sem criar dados fictícios.
      </p>
    </div>
  );
}
