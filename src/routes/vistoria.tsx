import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/vistoria")({
  head: () => ({
    meta: [
      { title: "Vistoria Digital | ImobiFlow" },
      { name: "description", content: "Vistorias profissionais pelo celular, com fotos georreferenciadas, assinatura digital e laudo PDF entregue em minutos." },
    ],
  }),
  component: Page_vistoria,
});

function Page_vistoria() {
  return (
    <PageShell
      eyebrow="Módulo Vistoria"
      title="Vistorias completas em até 70% menos tempo"
      subtitle="Vistorias profissionais pelo celular, com fotos georreferenciadas, assinatura digital e laudo PDF entregue em minutos."
      crumbs={[{ label: "Vistoria Digital" }]}
    >
      <Section title="O que está incluído">
        <FeatureGrid items={[
          { title: "App offline", desc: "Realize vistorias mesmo sem internet; sincroniza ao reconectar." },
          { title: "Checklist inteligente", desc: "Modelos por tipo de imóvel: residencial, comercial, mobiliado." },
          { title: "Assinatura digital ICP-Brasil", desc: "Validade jurídica plena, integrada à plataforma D4Sign." },
          { title: "Laudo profissional", desc: "PDF com identidade visual da sua imobiliária e fotos de alta resolução." }
        ]} />
      </Section>

      <Section title="Reduza disputas e perdas">
        <ul className="list-disc space-y-2 pl-5">
          <li>Comparação automática entre vistoria de entrada e saída.</li>
          <li>Histórico inalterável armazenado por 10 anos.</li>
          <li>Aceito pelos principais cartórios e tribunais do país.</li>
        </ul>
      </Section>

      <CTACard title="Modernize suas vistorias" desc="Solicite uma demonstração do módulo Vistoria." />
    </PageShell>
  );
}
