import { Sparkles, TrendingUp, Home, MessageCircle } from "lucide-react";
import dashboard from "@/assets/dashboard-preview.jpg";

export function AIShowcase() {
  return (
    <section id="ia" className="relative overflow-hidden py-28">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-brand opacity-[0.10] blur-[160px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-16 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Inteligência aplicada</p>
            <h2 className="mt-3 text-4xl font-black leading-tight md:text-5xl">
              IA que entende o <span className="text-gradient-brand">mercado imobiliário</span>
            </h2>
            <p className="mt-5 text-muted-foreground">
              O ImobiFlow analisa cada conversa, cada visita e cada imóvel para sugerir o próximo passo certo. Da precificação ao contrato — sem perder nenhum detalhe.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                "Sugestão de preço baseada em região e mercado",
                "Match automático entre lead e imóveis",
                "Resumo inteligente de conversas no WhatsApp",
                "Detecção de risco de desistência",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-secondary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-brand-soft blur-3xl opacity-60" />
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-border">
              <img
                src={dashboard}
                alt="Dashboard ImobiFlow"
                loading="lazy"
                className="h-full w-full object-cover opacity-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
            </div>
            <FloatCard className="-left-4 top-8 md:-left-12" icon={<TrendingUp className="h-4 w-4 text-primary" />} title="Lead qualificado" sub="Score 9.2 · Investidor" />
            <FloatCard className="bottom-10 right-2 md:-right-10" icon={<Home className="h-4 w-4 text-secondary" />} title="Imóvel sugerido" sub="Cobertura · R$ 1.45M" delay="1.2s" />
            <FloatCard className="bottom-32 left-6" icon={<MessageCircle className="h-4 w-4 text-primary" />} title="Resposta enviada" sub="WhatsApp · 2s atrás" delay="2.4s" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatCard({ icon, title, sub, className = "", delay = "0s" }: { icon: React.ReactNode; title: string; sub: string; className?: string; delay?: string }) {
  return (
    <div className={`absolute glass animate-float rounded-2xl px-4 py-3 shadow-glow-cyan ${className}`} style={{ animationDelay: delay }}>
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand-soft ring-1 ring-border">
          {icon}
        </div>
        <div>
          <div className="text-[12px] font-semibold leading-tight">{title}</div>
          <div className="text-[10px] text-muted-foreground">{sub}</div>
        </div>
      </div>
    </div>
  );
}
