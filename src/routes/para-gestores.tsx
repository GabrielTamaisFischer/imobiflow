import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/para-gestores")({
  head: () => ({
    meta: [
      { title: "Para gestores e diretores | ImobiFlow" },
      { name: "description", content: "Visão 360° da operação, previsibilidade de receita e inteligência para tomar decisões que aumentam o lucro da sua imobiliária." },
    ],
  }),
  component: Page_para_gestores,
});

function Page_para_gestores() {
  return (
    <PageShell
      eyebrow="Para gestores"
      title="Comande sua imobiliária com dados, não com achismos"
      subtitle="Visão 360° da operação, previsibilidade de receita e inteligência para tomar decisões que aumentam o lucro da sua imobiliária."
      crumbs={[{ label: "Para gestores e diretores" }]}
    >
      <Section title="O que você ganha como gestor">
        <FeatureGrid items={[
          { title: "Dashboard executivo", desc: "Receita projetada, funil em tempo real e ranking de corretores em uma única tela." },
          { title: "Previsibilidade financeira", desc: "Forecast de comissões e repasses para os próximos 90 dias." },
          { title: "Auditoria de processos", desc: "Histórico completo de cada negociação, contrato e atendimento." },
          { title: "Metas inteligentes", desc: "Defina metas individuais e por equipe; a IA sugere ajustes em tempo real." }
        ]} />
      </Section>

      <Section title="Resultados comprovados">
        <ul className="list-disc space-y-2 pl-5">
          <li>Imobiliárias parceiras crescem em média 2,4× a receita anual após 12 meses.</li>
          <li>Redução de 45% nos custos operacionais com automação.</li>
          <li>NPS médio dos clientes finais sobe de 42 para 71 pontos.</li>
        </ul>
      </Section>

      <CTACard title="Quer ver o ROI para sua imobiliária?" desc="Receba uma análise personalizada do potencial de crescimento da sua operação." />
    </PageShell>
  );
}
