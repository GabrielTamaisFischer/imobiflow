import { ArrowRight, Check, Home, ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import type { ContentPage } from "@/product/content-pages";

export function LongFormPage({ page }: { page: ContentPage }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <Navbar />
      <main>
        <section className="relative overflow-hidden py-20 md:py-28">
          <div className="absolute inset-0 grid-bg opacity-60" />
          <div className="pointer-events-none absolute -right-32 top-10 h-[520px] w-[520px] rounded-full bg-secondary opacity-[0.12] blur-[150px]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[1fr_0.95fr]">
            <div>
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
              >
                <Home className="h-3.5 w-3.5 text-primary" />
                Voltar para inicio
              </Link>
              <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {page.category}
              </p>
              <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight md:text-6xl">
                {page.title}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                {page.lead}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/cadastro"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
                >
                  Comecar agora
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/entrar"
                  className="inline-flex items-center justify-center rounded-full border border-border bg-card/60 px-6 py-3 text-sm font-semibold transition hover:bg-card"
                >
                  Entrar na plataforma
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 bg-gradient-brand-soft opacity-70 blur-3xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-border shadow-card">
                <img
                  src={page.image}
                  alt={page.imageAlt}
                  className="h-[360px] w-full object-cover md:h-[520px]"
                  width={1280}
                  height={1024}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/75 via-transparent to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-white/15 bg-black/45 p-4 text-white backdrop-blur-md">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] opacity-80">
                    <ShieldCheck className="h-4 w-4" />
                    Conteudo para decisao
                  </div>
                  <div className="mt-2 text-sm font-semibold">
                    Informacoes pensadas para avaliar confianca, operacao e retorno antes da contratacao.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-surface-1 py-10">
          <div className="mx-auto grid max-w-6xl gap-4 px-6 md:grid-cols-3">
            {page.highlights.map((metric) => (
              <div key={`${metric.value}-${metric.label}`} className="rounded-2xl border border-border bg-card p-6">
                <div className="text-2xl font-black text-gradient-brand">{metric.value}</div>
                <div className="mt-2 text-sm text-muted-foreground">{metric.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid gap-6 md:grid-cols-3">
              {page.sections.map((section) => (
                <article key={section.title} className="ring-gradient rounded-3xl border border-border bg-card p-7">
                  <h2 className="text-2xl font-bold">{section.title}</h2>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{section.body}</p>
                  <ul className="mt-6 space-y-3">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-3 text-sm">
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gradient-brand-soft ring-1 ring-border">
                          <Check className="h-3 w-3 text-primary" />
                        </span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-surface-1 py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
                Confianca
              </p>
              <h2 className="mt-3 text-3xl font-black md:text-4xl">
                O que uma imobiliaria deve avaliar antes de contratar
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                A escolha de um SaaS imobiliario precisa considerar mais que preco. A empresa deve avaliar seguranca, continuidade, clareza de implantacao, isolamento de dados, suporte, regras de acesso e capacidade de evolucao.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                "Dados separados por empresa e acessados apenas por usuarios autorizados.",
                "Assinatura ativa como requisito para uso da area interna.",
                "Estados vazios para iniciar com dados reais, sem simulacoes que confundem a operacao.",
                "Roadmap modular para evoluir CRM, imoveis, vistoria, contratos, financeiro, IA e API.",
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-card p-5 text-sm leading-relaxed">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-5xl px-6 text-center">
            <h2 className="text-3xl font-black md:text-5xl">
              Pronto para avaliar o ImobiFlow com seriedade?
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
              Crie sua conta para acompanhar a evolucao da plataforma SaaS e validar a estrutura de acesso, empresa, assinatura e permissoes conforme o produto avancar.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="/cadastro"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-brand px-7 py-4 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110"
              >
                Criar cadastro
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/planos"
                className="inline-flex items-center justify-center rounded-full border border-border bg-card px-7 py-4 text-sm font-semibold transition hover:bg-accent"
              >
                Ver planos
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
