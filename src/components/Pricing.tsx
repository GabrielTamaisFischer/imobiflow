import { Check } from "lucide-react";
import { planCheckoutLinks } from "@/product/checkout-links";

const plans = [
  { name: "Start", price: "R$ 79", desc: "Para corretores autônomos e imobiliárias começando.",
    features: ["Cadastro de imóveis e clientes", "CRM básico + agenda", "Upload de fotos", "WhatsApp rápido", "Dashboard simples"],
    cta: "Começar", highlight: false, checkoutUrl: planCheckoutLinks.start },
  { name: "Pro", price: "R$ 197", desc: "Para imobiliárias que querem escalar com automação.",
    features: ["Tudo do Start", "Vistoria inteligente + PDF", "Kanban de vendas", "Automação WhatsApp", "Multiusuário + Analytics", "Integração com IA"],
    cta: "Quero o Pro", highlight: true, checkoutUrl: planCheckoutLinks.pro },
  { name: "Enterprise AI", price: "R$ 497", desc: "Para operações estruturadas e multi-filial.",
    features: ["Tudo do Pro", "ERP completo + financeiro avançado", "Repasse e reajuste automáticos", "IA avançada + API", "White Label + auditoria", "Suporte prioritário"],
    cta: "Assinar Enterprise", highlight: false, checkoutUrl: planCheckoutLinks.enterprise },
];

export function Pricing() {
  return (
    <section id="planos" className="relative py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Planos</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">
            Escolha o seu <span className="text-gradient-brand">fluxo</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Sem fidelidade. Cancele quando quiser. Comece com 14 dias grátis em qualquer plano.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {plans.map((p) => (
            <div key={p.name}
              className={`relative rounded-3xl border p-8 transition ${
                p.highlight ? "border-transparent bg-card shadow-glow" : "border-border bg-card hover:border-primary/40"
              }`}
            >
              {p.highlight && (
                <>
                  <div className="absolute inset-0 -z-10 rounded-3xl bg-gradient-brand opacity-[0.10] blur-xl" />
                  <div className="pointer-events-none absolute inset-0 rounded-3xl"
                    style={{ padding: 1, background: "var(--gradient-brand)",
                      WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
                      WebkitMaskComposite: "xor", maskComposite: "exclude" }} />
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-brand px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
                    Mais escolhido
                  </span>
                </>
              )}

              <h3 className="text-lg font-bold">{p.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>

              <div className="mt-6 flex items-end gap-1">
                <span className="text-4xl font-black">{p.price}</span>
                <span className="pb-1 text-sm text-muted-foreground">/mês</span>
              </div>

              <ul className="mt-8 space-y-3">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a href={p.checkoutUrl} target="_blank" rel="noreferrer" className={`mt-8 block w-full rounded-full py-3 text-center text-sm font-semibold transition ${
                p.highlight ? "bg-gradient-brand text-primary-foreground shadow-glow hover:brightness-110"
                  : "border border-border bg-background hover:bg-accent"
              }`}>
                {p.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
