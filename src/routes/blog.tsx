import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Blog ImobiFlow | ImobiFlow" },
      { name: "description", content: "Estratégias, dados e insights para profissionais do mercado imobiliário brasileiro." },
    ],
  }),
  component: Page_blog,
});

function Page_blog() {
  return (
    <PageShell
      eyebrow="Conteúdo"
      title="Conhecimento que move o seu negócio"
      subtitle="Estratégias, dados e insights para profissionais do mercado imobiliário brasileiro."
      crumbs={[{ label: "Blog ImobiFlow" }]}
    >
      <Section title="Posts recentes">
        <FeatureGrid items={[
          { title: "Como usar IA para qualificar leads em 2026", desc: "Guia completo com 12 prompts prontos para corretores aplicarem hoje." },
          { title: "Funil imobiliário: 7 métricas que importam", desc: "Pare de medir o que não converte. Veja os KPIs essenciais." },
          { title: "LGPD na prática para imobiliárias", desc: "Checklist de adequação para evitar multas e proteger seus clientes." },
          { title: "Vistoria digital: o ROI em números", desc: "Quanto sua imobiliária economiza ao migrar do papel para o digital." }
        ]} />
      </Section>

      <Section title="Categorias">
        <ul className="list-disc space-y-2 pl-5">
          <li>Vendas e prospecção · Marketing imobiliário · Gestão e operação</li>
          <li>Tecnologia e IA · Jurídico e LGPD · Casos de sucesso</li>
        </ul>
      </Section>

      <CTACard title="Receba nossos artigos" desc="Inscreva-se na newsletter quinzenal — sem spam, só conteúdo útil." />
    </PageShell>
  );
}
