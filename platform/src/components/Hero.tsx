import {
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";

const pipeline = [
  ["Lead novo", "R$ 820k", "IA 91%"],
  ["Visita marcada", "R$ 1.2M", "Hoje"],
  ["Proposta", "R$ 640k", "Alta"],
];

const modules = ["Lead", "Visita", "Contrato", "Financeiro", "Repasse"];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-20 pb-24 md:pt-28">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-70" />
      <div className="pointer-events-none absolute -left-32 top-0 h-[520px] w-[520px] rounded-full bg-primary opacity-[0.16] blur-[150px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[620px] w-[620px] rounded-full bg-secondary opacity-[0.14] blur-[170px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-md animate-fade-up">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            A nova geração de software imobiliário
          </div>

          <h1
            className="mt-6 max-w-4xl text-5xl font-black leading-[1.02] tracking-tight md:text-7xl animate-fade-up"
            style={{ animationDelay: "80ms" }}
          >
            O sistema imobiliário que elimina planilhas, acelera negociações e automatiza sua operação.
          </h1>

          <p
            className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg animate-fade-up"
            style={{ animationDelay: "180ms" }}
          >
            Hoje sua equipe perde tempo alternando entre WhatsApp, planilhas, contratos,
            vistorias e sistemas desconectados. O ImobiFlow centraliza CRM, imóveis,
            locação, financeiro, vistoria e automações com Inteligência Artificial para sua
            imobiliária operar com velocidade, controle e escala.
          </p>

          <div
            className="mt-8 flex flex-col items-start gap-3 sm:flex-row animate-fade-up"
            style={{ animationDelay: "260ms" }}
          >
            <a
              id="cta"
              href="/cadastro"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-brand px-7 py-4 text-base font-semibold text-primary-foreground shadow-glow animate-glow-pulse transition hover:brightness-110"
            >
              Solicitar demonstração
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="/app"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-7 py-4 text-base font-semibold text-foreground backdrop-blur-md transition hover:bg-card"
            >
              Ver plataforma funcionando
            </a>
          </div>

          <div
            className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3 animate-fade-up"
            style={{ animationDelay: "340ms" }}
          >
            {[
              ["Menos retrabalho", "Processos conectados"],
              ["Mais fechamento", "Follow-up inteligente"],
              ["Controle real", "Gestão por dados"],
            ].map(([title, label]) => (
              <div key={title} className="rounded-2xl border border-border bg-card/45 p-4 backdrop-blur-md">
                <div className="text-sm font-bold">{title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative animate-fade-up" style={{ animationDelay: "180ms" }}>
          <div className="absolute -inset-6 bg-gradient-brand-soft opacity-80 blur-3xl" />
          <div className="relative overflow-hidden rounded-[30px] border border-border bg-card shadow-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-red-400" />
                <span className="h-3 w-3 rounded-full bg-yellow-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Operação ImobiFlow
              </span>
            </div>

            <div className="grid gap-4 p-5 lg:grid-cols-[1fr_0.9fr]">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    [BarChart3, "Conversão", "34.8%"],
                    [WalletCards, "Receita", "R$ 187k"],
                    [Users, "Leads", "248"],
                  ].map(([Icon, label, value]) => (
                    <div key={String(label)} className="rounded-2xl border border-border bg-background/65 p-4">
                      <Icon className="h-4 w-4 text-primary" />
                      <div className="mt-3 text-xs text-muted-foreground">{String(label)}</div>
                      <div className="text-xl font-black">{String(value)}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-border bg-background/65 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold">Kanban CRM</div>
                      <div className="text-xs text-muted-foreground">Pipeline com IA e WhatsApp</div>
                    </div>
                    <span className="rounded-full bg-gradient-brand-soft px-3 py-1 text-xs font-semibold text-primary">
                      Tempo real
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {pipeline.map(([name, price, score]) => (
                      <div key={name} className="rounded-xl border border-border bg-card p-3">
                        <div className="text-xs font-semibold">{name}</div>
                        <div className="mt-2 text-sm font-black">{price}</div>
                        <div className="mt-3 h-1.5 rounded-full bg-muted">
                          <div className="h-full rounded-full bg-gradient-brand" style={{ width: name === "Lead novo" ? "92%" : name === "Visita marcada" ? "70%" : "55%" }} />
                        </div>
                        <div className="mt-2 text-[11px] text-muted-foreground">{score}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background/65 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Bot className="h-4 w-4 text-primary" />
                    IA gerando anúncio premium
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                    "Apartamento com vista livre, acabamento contemporâneo e planta inteligente,
                    ideal para famílias que buscam conforto, segurança e localização estratégica."
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-background/65 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Building2 className="h-4 w-4 text-secondary" />
                    Ranking de corretores
                  </div>
                  <div className="mt-4 space-y-3">
                    {["Marina", "Eduardo", "Camila"].map((name, index) => (
                      <div key={name} className="flex items-center justify-between rounded-xl bg-card px-3 py-2">
                        <span className="text-sm">{index + 1}. {name}</span>
                        <span className="text-xs text-primary">{[18, 14, 11][index]} negócios</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background/65 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <FileText className="h-4 w-4 text-primary" />
                    Vistoria inteligente
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-gradient-brand-soft p-3">
                      <div className="text-xs text-muted-foreground">Entrada</div>
                      <div className="mt-5 text-sm font-bold">Parede íntegra</div>
                    </div>
                    <div className="rounded-xl border border-primary/30 bg-card p-3">
                      <div className="text-xs text-muted-foreground">Saída</div>
                      <div className="mt-5 text-sm font-bold">Dano detectado</div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    PDF e assinatura prontos
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-background/65 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Acesso SaaS seguro
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    {["company_id", "permissões", "assinatura ativa", "auditoria"].map((item) => (
                      <span key={item} className="rounded-full border border-border bg-card px-2.5 py-1">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute -bottom-6 left-6 right-6 hidden rounded-2xl border border-border bg-card/80 p-4 shadow-card backdrop-blur-md md:block">
            <div className="flex items-center justify-between gap-3">
              {modules.map((module, index) => (
                <div key={module} className="flex flex-1 items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-brand-soft text-primary">
                    {index + 1}
                  </span>
                  {module}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
