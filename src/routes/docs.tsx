import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Documentação | ImobiFlow" },
      { name: "description", content: "Guias técnicos completos para administradores, integradores e desenvolvedores." },
    ],
  }),
  component: Page_docs,
});

function Page_docs() {
  return (
    <PageShell
      eyebrow="Docs"
      title="Documentação técnica ImobiFlow"
      subtitle="Guias técnicos completos para administradores, integradores e desenvolvedores."
      crumbs={[{ label: "Documentação" }]}
    >
      <Section title="Por onde começar">
        <FeatureGrid items={[
          { title: "Guia do administrador", desc: "Configuração de equipes, permissões, integrações e personalização." },
          { title: "Importação de dados", desc: "Migre de Excel, Vista, Imobzi e outras plataformas em poucos cliques." },
          { title: "Integrações", desc: "WhatsApp Business, portais imobiliários, contadores e bancos." },
          { title: "Webhooks & automações", desc: "Conecte o ImobiFlow ao seu fluxo de trabalho com Zapier e Make." }
        ]} />
      </Section>

      <Section title="Recursos avançados">
        <ul className="list-disc space-y-2 pl-5">
          <li>SDKs oficiais: JavaScript, Python e PHP.</li>
          <li>Ambiente sandbox para testar integrações sem afetar dados reais.</li>
          <li>Logs detalhados de auditoria para times de TI e compliance.</li>
        </ul>
      </Section>

      <CTACard title="Vai integrar com a gente?" desc="Acesse nossa documentação completa da API." />
    </PageShell>
  );
}
