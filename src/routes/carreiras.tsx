import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/carreiras")({
  head: () => ({
    meta: [
      { title: "Carreiras na ImobiFlow | ImobiFlow" },
      { name: "description", content: "Estamos construindo o sistema operacional do mercado imobiliário brasileiro. Vem com a gente?" },
    ],
  }),
  component: Page_carreiras,
});

function Page_carreiras() {
  return (
    <PageShell
      eyebrow="Junte-se a nós"
      title="Construa o futuro do mercado imobiliário"
      subtitle="Estamos construindo o sistema operacional do mercado imobiliário brasileiro. Vem com a gente?"
      crumbs={[{ label: "Carreiras na ImobiFlow" }]}
    >
      <Section title="Por que ImobiFlow">
        <FeatureGrid items={[
          { title: "Trabalho remoto", desc: "Equipe distribuída em 14 estados; encontros presenciais trimestrais." },
          { title: "Equity para todos", desc: "Plano de stock options desde o primeiro dia." },
          { title: "Saúde integral", desc: "Plano de saúde, dental, terapia e auxílio bem-estar." },
          { title: "Educação continuada", desc: "R$ 5.000/ano para cursos, livros e conferências." }
        ]} />
      </Section>

      <Section title="Vagas abertas">
        <ul className="list-disc space-y-2 pl-5">
          <li>Engenheiro(a) de Software Sênior — Backend (Remoto)</li>
          <li>Product Designer — Mobile (Remoto)</li>
          <li>Customer Success Manager — Sudeste</li>
          <li>Cientista de Dados — IA Generativa (Remoto)</li>
          <li>Account Executive — Inside Sales (Remoto)</li>
        </ul>
      </Section>

      <CTACard title="Não encontrou sua vaga?" desc="Mande seu currículo para talentos@imobiflow.app — adoramos conhecer gente boa." />
    </PageShell>
  );
}
