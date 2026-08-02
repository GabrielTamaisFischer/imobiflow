import { ArrowRight, Sparkles, ShieldCheck, Star } from "lucide-react";
import familyKeys from "@/assets/family-keys.jpg";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-20 pb-24 md:pt-28">
      <div className="pointer-events-none absolute -top-32 -left-32 h-[480px] w-[480px] rounded-full bg-primary opacity-[0.18] blur-[140px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 h-[520px] w-[520px] rounded-full bg-secondary opacity-[0.15] blur-[160px]" />
      <div className="absolute inset-0 grid-bg opacity-60" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 md:grid-cols-2">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur-md animate-fade-up">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Nova IA generativa para imobiliárias
          </div>

          <h1 className="mt-6 text-5xl font-black leading-[1.05] tracking-tight md:text-6xl animate-fade-up" style={{ animationDelay: "80ms" }}>
            Mais leads. Mais vendas. <br />
            <span className="text-gradient-brand">Mais lucro</span> para sua imobiliária.
          </h1>

          <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg animate-fade-up" style={{ animationDelay: "180ms" }}>
            Do primeiro contato à entrega das chaves: o ImobiFlow automatiza CRM, vistoria,
            contratos e financeiro com Inteligência Artificial — para sua equipe fechar
            <span className="font-semibold text-foreground"> até 3x mais negócios</span>.
          </p>

          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row animate-fade-up" style={{ animationDelay: "260ms" }}>
            <a
              id="cta"
              href="#planos"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-brand px-7 py-4 text-base font-semibold text-primary-foreground shadow-glow animate-glow-pulse transition hover:brightness-110"
            >
              Começar 14 dias grátis
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <a
              href="#produto"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card/40 px-7 py-4 text-base font-medium text-foreground transition hover:bg-card"
            >
              Ver demonstração
            </a>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6 text-xs text-muted-foreground animate-fade-up" style={{ animationDelay: "340ms" }}>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Sem cartão · Cancele quando quiser
            </div>
            <div className="flex items-center gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-3.5 w-3.5 fill-secondary text-secondary" />
              ))}
              <span className="ml-1.5">4.9/5 · +1.200 imobiliárias</span>
            </div>
          </div>
        </div>

        <div className="relative animate-fade-up" style={{ animationDelay: "200ms" }}>
          <div className="absolute -inset-6 bg-gradient-brand-soft blur-3xl opacity-70" />
          <div className="relative overflow-hidden rounded-[28px] border border-border shadow-card">
            <img
              src={familyKeys}
              alt="Família feliz recebendo as chaves do novo imóvel"
              width={1920}
              height={1080}
              className="h-[420px] w-full object-cover md:h-[520px]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
            <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-white backdrop-blur-md">
              <div>
                <div className="text-xs opacity-80">Negócio fechado</div>
                <div className="text-sm font-semibold">Casa Jardim das Flores · R$ 780k</div>
              </div>
              <span className="rounded-full bg-gradient-brand px-3 py-1 text-[11px] font-bold text-primary-foreground">
                +24% comissão
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
