import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/indique")({
  head: () => ({
    meta: [
      { title: "Indique e ganhe | ImobiFlow" },
      { name: "description", content: "Ganhe até R$ 2.400 por imobiliária indicada que assinar um plano anual. Sem teto, sem complicação." },
    ],
  }),
  component: Page_indique,
});

function Page_indique() {
  return (
    <PageShell
      eyebrow="Programa de indicações"
      title="Compartilhe o que dá certo. Seja recompensado."
      subtitle="Ganhe até R$ 2.400 por imobiliária indicada que assinar um plano anual. Sem teto, sem complicação."
      crumbs={[{ label: "Indique e ganhe" }]}
    >
      <Section title="Como funciona">
        <FeatureGrid items={[
          { title: "1. Indique", desc: "Compartilhe seu link único com gestores e corretores que você conhece." },
          { title: "2. Eles experimentam", desc: "Quem chega pela sua indicação ganha 30 dias grátis (em vez de 14)." },
          { title: "3. Você ganha", desc: "Receba R$ 600 por mês ativo, até 4 meses, por cada nova assinatura." },
          { title: "4. Sem limites", desc: "Indique quantas imobiliárias quiser; não há teto de comissionamento." }
        ]} />
      </Section>

      <Section title="Regras claras">
        <ul className="list-disc space-y-2 pl-5">
          <li>Pagamento via PIX no 5º dia útil de cada mês.</li>
          <li>Comissão paga durante 4 meses consecutivos a partir do início do contrato.</li>
          <li>Empresas precisam ser novas clientes (sem cadastro anterior na plataforma).</li>
          <li>Programa válido para indicações no Brasil, plano anual ou superior.</li>
        </ul>
      </Section>

      <CTACard title="Pegar meu link de indicação" desc="Acesse o painel e comece a ganhar agora." />
    </PageShell>
  );
}
