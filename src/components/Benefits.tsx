import { TrendingUp, Clock, Users, DollarSign } from "lucide-react";
import broker from "@/assets/broker-success.jpg";
import { AnimatedNumber } from "./AnimatedNumber";

const points = [
  { icon: TrendingUp, title: "Receita até +40%", desc: "Imobiliárias parceiras aumentam o faturamento mensal já no 3º mês de uso." },
  { icon: Clock, title: "20h economizadas / semana", desc: "Automação de WhatsApp, contratos e vistorias libera sua equipe para vender." },
  { icon: Users, title: "Equipe motivada", desc: "Cada corretor recebe leads quentes, ranking de performance e bônus automatizados." },
  { icon: DollarSign, title: "ROI em 30 dias", desc: "O ImobiFlow se paga sozinho com 1 negócio extra por mês." },
];

export function Benefits() {
  return (
    <section id="resultados" className="relative bg-surface-1 py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-14 md:grid-cols-2">
          <div className="relative order-2 md:order-1">
            <div className="absolute -inset-6 bg-gradient-brand-soft blur-3xl opacity-60" />
            <div className="relative overflow-hidden rounded-[28px] border border-border shadow-card">
              <img
                src={broker}
                alt="Corretora celebrando resultados de vendas com ImobiFlow"
                loading="lazy"
                width={1280}
                height={1024}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -right-4 hidden rounded-2xl border border-border bg-card px-5 py-4 shadow-card md:block">
              <div className="text-xs text-muted-foreground">Faturamento mensal</div>
              <div className="mt-1 text-2xl font-black text-gradient-brand">
                <AnimatedNumber target={187000} prefix="+ R$ " compact="thousand" />
              </div>
              <div className="text-[11px] text-muted-foreground">comparado ao trimestre anterior</div>
            </div>
          </div>

          <div className="order-1 md:order-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Resultados reais</p>
            <h2 className="mt-3 text-4xl font-black md:text-5xl">
              Sua imobiliária <span className="text-gradient-brand">vai lucrar muito mais</span>
            </h2>
            <p className="mt-4 text-muted-foreground">
              ImobiFlow não é só um sistema — é um motor de crescimento. Veja o impacto direto no seu caixa.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {points.map((p) => (
                <div key={p.title} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand-soft ring-1 ring-border">
                    <p.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-4 font-bold">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
