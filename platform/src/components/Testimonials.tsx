import agentImg from "@/assets/agent-handover.jpg";
import { Quote, Star } from "lucide-react";

const items = [
  {
    quote: "Em 60 dias dobramos a conversão de leads. O Lead Scoring entrega o cliente certo para o corretor certo. Mudou nossa operação.",
    name: "Carla Mendes",
    role: "Diretora · Mendes Imóveis (SP)",
  },
  {
    quote: "A vistoria por IA economiza 8 horas por semana de cada vistoriador. O laudo sai pronto, profissional, sem retrabalho.",
    name: "Rafael Souza",
    role: "Gestor · Atria Locação (RJ)",
  },
  {
    quote: "O financeiro era nosso gargalo. Hoje os repasses, comissões e cobranças rodam sozinhos. Lucro líquido subiu 31%.",
    name: "Ana Beatriz",
    role: "CEO · AB Premium (BH)",
  },
];

export function Testimonials() {
  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 md:grid-cols-[1.1fr_1fr]">
          <div className="grid gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Clientes felizes</p>
              <h2 className="mt-3 text-4xl font-black md:text-5xl">
                Imobiliárias que <span className="text-gradient-brand">cresceram com a gente</span>
              </h2>
            </div>
            {items.map((t) => (
              <figure key={t.name} className="ring-gradient relative rounded-2xl border border-border bg-card p-6">
                <Quote className="h-5 w-5 text-primary" />
                <blockquote className="mt-3 text-base leading-relaxed">{t.quote}</blockquote>
                <figcaption className="mt-4 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                  <div className="flex gap-0.5">
                    {[0,1,2,3,4].map(i => <Star key={i} className="h-3.5 w-3.5 fill-secondary text-secondary" />)}
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="relative">
            <div className="absolute -inset-8 bg-gradient-brand-soft blur-3xl opacity-60" />
            <div className="relative overflow-hidden rounded-[28px] border border-border shadow-card">
              <img
                src={agentImg}
                alt="Corretora entregando as chaves a um casal feliz"
                loading="lazy"
                width={1024}
                height={1024}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/85 via-background/30 to-transparent p-6">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Histórias reais</div>
                <div className="mt-1 text-lg font-bold">+12.400 famílias na casa nova este ano</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
