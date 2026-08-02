import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre a ImobiFlow | ImobiFlow" },
      { name: "description", content: "Nascemos em 2021 da união entre engenheiros de IA e profissionais com mais de 20 anos no mercado imobiliário brasileiro." },
    ],
  }),
  component: Page_sobre,
});

function Page_sobre() {
  return (
    <PageShell
      eyebrow="Empresa"
      title="Movemos imóveis com tecnologia e propósito"
      subtitle="Nascemos em 2021 da união entre engenheiros de IA e profissionais com mais de 20 anos no mercado imobiliário brasileiro."
      crumbs={[{ label: "Sobre a ImobiFlow" }]}
    >
      <Section title="Nossa missão">
        <p>Democratizar o acesso à tecnologia de ponta para imobiliárias de todos os portes — da boutique de bairro à rede nacional. Acreditamos que cada negócio fechado é uma família realizando um sonho, e nosso papel é remover toda a fricção entre essas duas pontas.</p>
      </Section>

      <Section title="Nossos números">
        <FeatureGrid items={[
          { title: "+1.200", desc: "Imobiliárias ativas em todo o Brasil." },
          { title: "+R$ 14 bi", desc: "Em volume transacionado pela plataforma desde 2021." },
          { title: "+85.000", desc: "Corretores usando o app diariamente." },
          { title: "98%", desc: "Taxa de retenção anual dos clientes." }
        ]} />
      </Section>

      <Section title="Valores">
        <ul className="list-disc space-y-2 pl-5">
          <li>Cliente no centro: cada decisão de produto começa ouvindo quem usa.</li>
          <li>Transparência radical: nossos contratos e preços são públicos.</li>
          <li>Tecnologia com propósito: IA que ajuda pessoas, não que as substitui.</li>
        </ul>
      </Section>

      <CTACard title="Faça parte do movimento" desc="Conheça a plataforma que está transformando o mercado." />
    </PageShell>
  );
}
