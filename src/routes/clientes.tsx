import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/clientes")({
  head: () => ({
    meta: [
      { title: "Clientes ImobiFlow | ImobiFlow" },
      { name: "description", content: "Mais de 1.200 imobiliárias confiam no ImobiFlow para mover seus negócios todos os dias." },
    ],
  }),
  component: Page_clientes,
});

function Page_clientes() {
  return (
    <PageShell
      eyebrow="Casos de sucesso"
      title="Imobiliárias que crescem com a gente"
      subtitle="Mais de 1.200 imobiliárias confiam no ImobiFlow para mover seus negócios todos os dias."
      crumbs={[{ label: "Clientes ImobiFlow" }]}
    >
      <Section title="Histórias reais">
        <FeatureGrid items={[
          { title: "Imobiliária Vitra · SP", desc: "Triplicou o volume de vendas em 18 meses, de 22 para 67 contratos/mês." },
          { title: "Casa Nova · RJ", desc: "Reduziu o tempo médio de fechamento de 64 para 28 dias." },
          { title: "Lar Imóveis · MG", desc: "Aumentou em 89% a taxa de conversão de leads do Instagram." },
          { title: "Habitar · RS", desc: "Migrou 11 unidades para o ImobiFlow em 30 dias com zero downtime." }
        ]} />
      </Section>

      <Section title="Setores atendidos">
        <ul className="list-disc space-y-2 pl-5">
          <li>Imobiliárias residenciais (venda e locação).</li>
          <li>Construtoras e incorporadoras de pequeno e médio porte.</li>
          <li>Administradoras de condomínios.</li>
          <li>Corretores autônomos e equipes independentes.</li>
        </ul>
      </Section>

      <CTACard title="Quer ser o próximo case?" desc="Comece sua jornada com o ImobiFlow hoje." />
    </PageShell>
  );
}
