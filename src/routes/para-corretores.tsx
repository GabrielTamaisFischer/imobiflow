import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/para-corretores")({
  head: () => ({
    meta: [
      { title: "Para corretores | ImobiFlow" },
      { name: "description", content: "Mais tempo vendendo, menos tempo administrando. Tudo no seu celular, integrado ao WhatsApp." },
    ],
  }),
  component: Page_para_corretores,
});

function Page_para_corretores() {
  return (
    <PageShell
      eyebrow="Para corretores"
      title="A ferramenta que faz você fechar mais negócios"
      subtitle="Mais tempo vendendo, menos tempo administrando. Tudo no seu celular, integrado ao WhatsApp."
      crumbs={[{ label: "Para corretores" }]}
    >
      <Section title="Pensado para o dia a dia do corretor">
        <FeatureGrid items={[
          { title: "App mobile completo", desc: "Acesse leads, agenda e imóveis em qualquer lugar, mesmo offline." },
          { title: "IA que sugere o imóvel certo", desc: "Receba 3 recomendações por lead com a maior probabilidade de conversão." },
          { title: "WhatsApp integrado", desc: "Responda leads do CRM direto pelo WhatsApp Business — sem trocar de aplicativo." },
          { title: "Comissões transparentes", desc: "Acompanhe em tempo real quanto você já ganhou no mês." }
        ]} />
      </Section>

      <Section title="Corretores que usam ImobiFlow">
        <ul className="list-disc space-y-2 pl-5">
          <li>Atendem em média 3,1× mais leads por dia.</li>
          <li>Fecham contratos 22 dias mais rápido.</li>
          <li>Aumentam a comissão mensal em 41% em média.</li>
        </ul>
      </Section>

      <CTACard title="Comece grátis hoje" desc="Crie sua conta de corretor e teste todos os recursos por 14 dias." />
    </PageShell>
  );
}
