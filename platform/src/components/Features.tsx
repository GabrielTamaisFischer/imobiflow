import { Brain, MessageSquare, FileSignature, Camera, BarChart3, Wallet } from "lucide-react";

const items = [
  { icon: Brain, title: "Lead Scoring com IA", desc: "Cada lead recebe uma nota automática por intenção, ticket e urgência." },
  { icon: MessageSquare, title: "WhatsApp Automático", desc: "Respostas, follow-ups e disparo de imóveis em segundos, no número do corretor." },
  { icon: Camera, title: "Vistoria Inteligente", desc: "Comparação entrada/saída e laudo PDF profissional gerado por IA (funcionamento offline em desenvolvimento)." },
  { icon: FileSignature, title: "Contratos & Assinatura", desc: "Geração automática, assinatura digital e renovação programada de locação." },
  { icon: BarChart3, title: "Funil & Pipeline", desc: "Kanban visual, etapa por etapa, com previsão de fechamento por corretor." },
  { icon: Wallet, title: "Financeiro Completo", desc: "Repasses, comissões, inadimplência e fluxo de caixa em tempo real." },
];

export function Features() {
  return (
    <section id="produto" className="relative py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Plataforma</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">
            Tudo o que sua imobiliária precisa,{" "}
            <span className="text-gradient-brand">em um só lugar</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Um ecossistema completo, do primeiro contato até a entrega das chaves.
          </p>
        </div>

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.title}
              className="ring-gradient group relative rounded-2xl border border-border bg-card p-6 transition hover:-translate-y-1"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-brand-soft ring-1 ring-border">
                <it.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-5 text-lg font-bold">{it.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
