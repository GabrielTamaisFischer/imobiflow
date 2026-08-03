import { Check, Building2, Headset } from "lucide-react";

const data = [
  {
    icon: Building2,
    eyebrow: "Para Gestores",
    title: "Controle total do funil",
    desc: "Comande sua imobiliária com clareza e velocidade. Tudo visível, tudo automatizado.",
    bullets: ["Gestão de equipe e permissões", "Relatórios em tempo real", "Automação de documentos e contratos", "Multi-filial e auditoria"],
    cta: "Quero gerenciar melhor",
  },
  {
    icon: Headset,
    eyebrow: "Para Corretores",
    title: "Produtividade máxima",
    desc: "Receba leads quentes, feche mais rápido e nunca esqueça um follow-up.",
    bullets: ["Leads qualificados pela IA", "Lembretes inteligentes", "Integração com WhatsApp", "Kanban de negociação"],
    cta: "Quero vender mais",
  },
];

export function ProfileCards() {
  return (
    <section id="perfis" className="relative py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Para quem é</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">
            Um sistema, dois <span className="text-gradient-brand">superpoderes</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Escolha seu perfil. O ImobiFlow se molda ao seu jeito de trabalhar.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {data.map((c) => (
            <div
              key={c.title}
              className="group ring-gradient relative overflow-hidden rounded-3xl border border-border bg-card p-8 transition duration-300 hover:-translate-y-1"
            >
              <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-gradient-brand opacity-0 blur-3xl transition group-hover:opacity-25" />
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand-soft ring-1 ring-border">
                  <c.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {c.eyebrow}
                </span>
              </div>
              <h3 className="mt-6 text-2xl font-bold md:text-3xl">{c.title}</h3>
              <p className="mt-3 text-sm text-muted-foreground">{c.desc}</p>
              <ul className="mt-6 space-y-3">
                {c.bullets.map((b) => (
                  <li key={b} className="flex items-center gap-3 text-sm">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-brand-soft ring-1 ring-border">
                      <Check className="h-3 w-3 text-primary" />
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <button className="mt-8 w-full rounded-full border border-border bg-background py-3 text-sm font-semibold transition group-hover:border-transparent group-hover:bg-gradient-brand group-hover:text-primary-foreground">
                {c.cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
