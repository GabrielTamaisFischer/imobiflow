import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/contrato")({
  head: () => ({
    meta: [
      { title: "Contrato SaaS | ImobiFlow" },
      { name: "description", content: "Modelo de contrato de prestação de serviços de Software como Serviço (SaaS) entre ImobiFlow e contratante." },
    ],
  }),
  component: Page_contrato,
});

function Page_contrato() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Contrato SaaS ImobiFlow"
      subtitle="Modelo de contrato de prestação de serviços de Software como Serviço (SaaS) entre ImobiFlow e contratante."
      crumbs={[{ label: "Contrato SaaS" }]}
    >
      <Section title="Cláusulas principais">
        <ul className="list-disc space-y-2 pl-5">
          <li>Objeto: licença de uso não exclusiva da plataforma ImobiFlow.</li>
          <li>Vigência: contratos mensais ou anuais, com renovação automática.</li>
          <li>SLA: 99,9% de disponibilidade nos planos Pro e Enterprise.</li>
          <li>Suporte: canais e horários conforme plano contratado.</li>
          <li>Confidencialidade: NDA mútuo válido por 5 anos após término.</li>
          <li>Rescisão: sem multa após o período mínimo contratado (30 ou 365 dias).</li>
        </ul>
      </Section>

      <Section title="Anexos disponíveis">
        <FeatureGrid items={[
          { title: "Anexo I — Planos e preços", desc: "Detalhamento dos módulos, limites e valores vigentes." },
          { title: "Anexo II — Tratamento de dados", desc: "Contrato de operador conforme art. 39 da LGPD." },
          { title: "Anexo III — SLA", desc: "Métricas, créditos e procedimentos em caso de descumprimento." },
          { title: "Anexo IV — Política de uso aceitável", desc: "Comportamentos permitidos e vedados na plataforma." }
        ]} />
      </Section>

      <CTACard title="Quer receber o contrato?" desc="Solicite o modelo completo em vendas@imobiflow.app" />
    </PageShell>
  );
}
