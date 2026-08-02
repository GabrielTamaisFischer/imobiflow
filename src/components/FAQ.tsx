import { useState } from "react";
import { Plus, Minus } from "lucide-react";

const faqs = [
  { q: "Em quanto tempo eu vejo resultado?", a: "A maioria das imobiliárias percebe ganho de produtividade na 1ª semana. Conversão de leads em vendas costuma crescer entre 30 e 90 dias após implantação." },
  { q: "Preciso migrar todos os meus dados manualmente?", a: "Não. Importamos seus imóveis, leads e contratos a partir de planilhas, CRMs anteriores ou portais (OLX, ZAP, Viva Real) sem custo extra." },
  { q: "Funciona offline para vistoria?", a: "Sim. O app de vistoria funciona 100% offline e sincroniza automaticamente quando há conexão." },
  { q: "Posso cancelar quando quiser?", a: "Sim, sem multa nem fidelidade. Você só paga enquanto estiver usando." },
  { q: "Como funciona a IA de Lead Scoring?", a: "Analisamos intenção, ticket, urgência e histórico do lead. O sistema atribui uma nota e direciona automaticamente ao corretor com maior afinidade." },
  { q: "O ImobiFlow integra com WhatsApp oficial?", a: "Sim, somos parceiros oficiais do WhatsApp Business API com automação completa e número dedicado." },
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
