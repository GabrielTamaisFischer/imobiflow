import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/inteligencia-ia")({
  head: () => ({
    meta: [
      { title: "Inteligência Artificial ImobiFlow | ImobiFlow" },
      { name: "description", content: "Modelos treinados com mais de 12 milhões de transações imobiliárias brasileiras. Decisões mais rápidas, recomendações mais precisas." },
    ],
  }),
  component: Page_inteligencia_ia,
});

function Page_inteligencia_ia() {
  return (
    <PageShell
      eyebrow="IA"
      title="A IA que entende do mercado imobiliário brasileiro"
      subtitle="Modelos treinados com mais de 12 milhões de transações imobiliárias brasileiras. Decisões mais rápidas, recomendações mais precisas."
      crumbs={[{ label: "Inteligência Artificial ImobiFlow" }]}
    >
      <Section title="Capacidades da IA">
        <FeatureGrid items={[
          { title: "Lead Scoring", desc: "Pontuação de 0 a 10 da probabilidade de conversão, atualizada a cada interação." },
          { title: "Matching Lead × Imóvel", desc: "Cruzamento semântico entre desejos do cliente e portfólio disponível." },
          { title: "Precificação dinâmica", desc: "Sugestão de preço de venda e locação com base em dados regionais." },
          { title: "Atendimento automatizado", desc: "Bot conversacional que qualifica leads 24/7 antes do corretor entrar." }
        ]} />
      </Section>

      <Section title="Privacidade e ética em IA">
        <ul className="list-disc space-y-2 pl-5">
          <li>Seus dados nunca são usados para treinar modelos de terceiros.</li>
          <li>Modelos auditáveis: você vê por que cada recomendação foi feita.</li>
          <li>Operação 100% em data centers brasileiros, conforme a LGPD.</li>
        </ul>
      </Section>

      <CTACard title="Veja a IA em ação" desc="Solicite uma demonstração com seus próprios dados." />
    </PageShell>
  );
}
