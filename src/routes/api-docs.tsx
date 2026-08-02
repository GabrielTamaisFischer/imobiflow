import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/api-docs")({
  head: () => ({
    meta: [
      { title: "API ImobiFlow | ImobiFlow" },
      { name: "description", content: "API REST moderna, autenticação OAuth 2.0 e webhooks em tempo real. Tudo o que sua imobiliária precisa para construir integrações personalizadas." },
    ],
  }),
  component: Page_api_docs,
});

function Page_api_docs() {
  return (
    <PageShell
      eyebrow="Para desenvolvedores"
      title="Construa em cima do ImobiFlow"
      subtitle="API REST moderna, autenticação OAuth 2.0 e webhooks em tempo real. Tudo o que sua imobiliária precisa para construir integrações personalizadas."
      crumbs={[{ label: "API ImobiFlow" }]}
    >
      <Section title="Visão geral da API">
        <FeatureGrid items={[
          { title: "REST + JSON", desc: "Endpoints previsíveis, versionados (v1, v2) com SLA de 99,95%." },
          { title: "OAuth 2.0", desc: "Autenticação segura com refresh tokens e escopos granulares." },
          { title: "Webhooks", desc: "Receba eventos em tempo real: novo lead, contrato assinado, pagamento." },
          { title: "Rate limits generosos", desc: "1.000 req/min no plano gratuito, ilimitado no Enterprise." }
        ]} />
      </Section>

      <Section title="Recursos disponíveis">
        <ul className="list-disc space-y-2 pl-5">
          <li>Leads, imóveis, contratos, vistorias, financeiro e usuários.</li>
          <li>Bibliotecas oficiais em JavaScript, Python e PHP.</li>
          <li>Postman collection pronta para importar.</li>
          <li>Status público da API em status.imobiflow.app.</li>
        </ul>
      </Section>

      <CTACard title="Comece agora" desc="Crie suas chaves de API em segundos no painel." />
    </PageShell>
  );
}
