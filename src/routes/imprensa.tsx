import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/imprensa")({
  head: () => ({
    meta: [
      { title: "Imprensa & Mídia | ImobiFlow" },
      { name: "description", content: "Materiais oficiais, releases e contato direto com nossa assessoria." },
    ],
  }),
  component: Page_imprensa,
});

function Page_imprensa() {
  return (
    <PageShell
      eyebrow="Imprensa"
      title="Central de imprensa ImobiFlow"
      subtitle="Materiais oficiais, releases e contato direto com nossa assessoria."
      crumbs={[{ label: "Imprensa & Mídia" }]}
    >
      <Section title="Recursos para jornalistas">
        <FeatureGrid items={[
          { title: "Releases recentes", desc: "Comunicados oficiais sobre rodadas de investimento, produtos e parcerias." },
          { title: "Kit de marca", desc: "Logos, paleta de cores e fotos institucionais em alta resolução." },
          { title: "Fact sheet", desc: "Números atualizados da empresa: clientes, volume, equipe e investimento." },
          { title: "Porta-vozes", desc: "Disponibilizamos executivos para entrevistas em até 48h." }
        ]} />
      </Section>

      <Section title="Contato direto">
        <p>Para pautas, entrevistas e materiais sob demanda, fale com nossa assessoria de imprensa: imprensa@imobiflow.app · (11) 3000-0001 (segunda a sexta, 9h-18h).</p>
      </Section>

      <CTACard title="Cobertura recente" desc="Veja onde já fomos notícia — Exame, Valor, Folha, EXAME, InfoMoney e mais." />
    </PageShell>
  );
}
