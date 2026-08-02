import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/produto")({
  head: () => ({
    meta: [
      { title: "Visão geral do produto | ImobiFlow" },
      { name: "description", content: "Do primeiro lead à entrega das chaves. ImobiFlow conecta CRM, vistoria, financeiro e inteligência artificial em um fluxo único — sem planilhas, sem retrabalho." },
    ],
  }),
  component: Page_produto,
});

function Page_produto() {
  return (
    <PageShell
      eyebrow="Produto"
      title="Tudo o que sua imobiliária precisa em uma única plataforma"
      subtitle="Do primeiro lead à entrega das chaves. ImobiFlow conecta CRM, vistoria, financeiro e inteligência artificial em um fluxo único — sem planilhas, sem retrabalho."
      crumbs={[{ label: "Visão geral do produto" }]}
    >
      <Section title="Uma plataforma, seis módulos integrados">
        <FeatureGrid items={[
          { title: "CRM Imobiliário", desc: "Gestão completa do funil de vendas e locação, com lead scoring por IA." },
          { title: "Gestão de imóveis", desc: "Cadastro inteligente, fotos profissionais e publicação automática nos portais." },
          { title: "Vistoria digital", desc: "Vistorias completas pelo celular com assinatura digital e laudo em PDF." },
          { title: "Financeiro", desc: "Boletos, repasses, comissões e conciliação bancária automatizados." },
          { title: "Inteligência IA", desc: "Matching automático lead-imóvel, recomendações e respostas em tempo real." },
          { title: "Relatórios", desc: "Dashboards executivos com indicadores de performance da equipe." }
        ]} />
      </Section>

      <Section title="Por que imobiliárias escolhem o ImobiFlow">
        <ul className="list-disc space-y-2 pl-5">
          <li>Aumento médio de 37% na conversão de leads nos primeiros 90 dias.</li>
          <li>Redução de 68% no tempo gasto em tarefas operacionais repetitivas.</li>
          <li>Integração nativa com WhatsApp, OLX, Viva Real, ZAP e Imovelweb.</li>
          <li>Dados criptografados, backup diário e conformidade total com a LGPD.</li>
          <li>Suporte humano em horário comercial e onboarding dedicado.</li>
        </ul>
      </Section>

      <CTACard title="Veja o ImobiFlow em ação" desc="Agende uma demonstração gratuita de 30 minutos com nosso time." />
    </PageShell>
  );
}
