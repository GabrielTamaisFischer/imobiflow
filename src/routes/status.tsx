import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/status")({
  head: () => ({
    meta: [
      { title: "Status da plataforma | ImobiFlow" },
      { name: "description", content: "Monitoramento em tempo real de todos os serviços do ImobiFlow. Transparência total sobre disponibilidade e incidentes." },
    ],
  }),
  component: Page_status,
});

function Page_status() {
  return (
    <PageShell
      eyebrow="Operacional"
      title="Todos os sistemas operando normalmente"
      subtitle="Monitoramento em tempo real de todos os serviços do ImobiFlow. Transparência total sobre disponibilidade e incidentes."
      crumbs={[{ label: "Status da plataforma" }]}
    >
      <Section title="Status atual dos serviços">
        <FeatureGrid items={[
          { title: "Aplicação Web", desc: "Operacional · Uptime últimos 90 dias: 99,98%" },
          { title: "App Mobile", desc: "Operacional · Uptime últimos 90 dias: 99,99%" },
          { title: "API REST", desc: "Operacional · Uptime últimos 90 dias: 99,97%" },
          { title: "Integrações WhatsApp", desc: "Operacional · Uptime últimos 90 dias: 99,92%" }
        ]} />
      </Section>

      <Section title="Compromissos de SLA">
        <ul className="list-disc space-y-2 pl-5">
          <li>SLA de 99,9% garantido contratualmente nos planos Pro e Enterprise.</li>
          <li>Notificações por e-mail e Slack ao primeiro sinal de incidente.</li>
          <li>Post-mortem público em até 72h após qualquer incidente relevante.</li>
          <li>Manutenções programadas comunicadas com 7 dias de antecedência.</li>
        </ul>
      </Section>

      <CTACard title="Inscreva-se em alertas" desc="Receba notificações sempre que houver atualizações de status." />
    </PageShell>
  );
}
