import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/lgpd")({
  head: () => ({
    meta: [
      { title: "Conformidade com a LGPD | ImobiFlow" },
      { name: "description", content: "A ImobiFlow está 100% adequada à Lei Geral de Proteção de Dados (Lei 13.709/2018)." },
    ],
  }),
  component: Page_lgpd,
});

function Page_lgpd() {
  return (
    <PageShell
      eyebrow="Legal"
      title="LGPD: tratamento de dados com responsabilidade"
      subtitle="A ImobiFlow está 100% adequada à Lei Geral de Proteção de Dados (Lei 13.709/2018)."
      crumbs={[{ label: "Conformidade com a LGPD" }]}
    >
      <Section title="Como atendemos a LGPD">
        <FeatureGrid items={[
          { title: "Encarregado (DPO)", desc: "Profissional certificado dedicado, com canal direto de comunicação com titulares." },
          { title: "Bases legais claras", desc: "Cada tratamento de dado tem base legal documentada e auditável." },
          { title: "Direitos dos titulares", desc: "Painel para que titulares acessem, corrijam, excluam e portem seus dados." },
          { title: "Resposta a incidentes", desc: "Plano de comunicação à ANPD em até 48h, conforme exige a lei." }
        ]} />
      </Section>

      <Section title="Para nossos clientes (controladores)">
        <ul className="list-disc space-y-2 pl-5">
          <li>Disponibilizamos contrato de operador de dados padrão ANPD.</li>
          <li>Relatório de Impacto à Proteção de Dados (RIPD) sob demanda.</li>
          <li>Treinamento gratuito sobre LGPD para a equipe da imobiliária.</li>
          <li>Modelos de termo de consentimento para uso com seus leads.</li>
        </ul>
      </Section>

      <CTACard title="Solicite documentação" desc="Pedimos contratos, relatórios e adequação completa em dpo@imobiflow.app" />
    </PageShell>
  );
}
