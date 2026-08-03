import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  { q: "O ImobiFlow é só um CRM?", a: "Não. A proposta é centralizar CRM, imóveis, vistorias, contratos, financeiro, locação, permissões, assinatura SaaS e automações em um ecossistema operacional." },
  { q: "Como a plataforma evita bagunça operacional?", a: "Cada módulo conversa com o outro: lead vira visita, visita vira proposta, proposta vira contrato, contrato gera financeiro e financeiro organiza repasse." },
  { q: "A área interna já usa dados reais?", a: "A base foi preparada para iniciar vazia, sem dados fictícios. Enquanto o backend final é conectado, o modo de visualização permite navegar pelas telas com estados vazios." },
  { q: "Como funciona o bloqueio por assinatura?", a: "O sistema considera login, empresa vinculada, assinatura ativa e permissão. Se a assinatura estiver inativa, cancelada ou inadimplente, o acesso é bloqueado." },
  { q: "O ImobiFlow atende gestores e corretores?", a: "Sim. Gestores ganham visão de operação, equipe, financeiro e conversão. Corretores ganham agenda, follow-up, histórico, imóveis prontos para envio e automações." },
  { q: "A IA é apenas um detalhe visual?", a: "Não. A IA entra na rotina: geração de anúncios, respostas, resumo de vistoria, análise de leads, sugestão de preço e padronização de comunicação." },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative bg-surface-1 py-28">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Perguntas frequentes</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">Ficou com <span className="text-gradient-brand">dúvida?</span></h2>
        </div>
        <div className="mt-12 space-y-3">
          {faqs.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className="overflow-hidden rounded-2xl border border-border bg-card">
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-semibold">{f.q}</span>
                  {isOpen ? <Minus className="h-4 w-4 text-primary" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                </button>
                {isOpen && <div className="px-6 pb-5 text-sm text-muted-foreground">{f.a}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
