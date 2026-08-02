import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade | ImobiFlow" },
      { name: "description", content: "Última atualização: 01 de março de 2026. Sua privacidade é prioridade absoluta para nós." },
    ],
  }),
  component: Page_privacidade,
});

function Page_privacidade() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Política de Privacidade ImobiFlow"
      subtitle="Última atualização: 01 de março de 2026. Sua privacidade é prioridade absoluta para nós."
      crumbs={[{ label: "Política de Privacidade" }]}
    >
      <Section title="Quais dados coletamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>Dados cadastrais: nome, e-mail, telefone, CNPJ e CPF dos responsáveis.</li>
          <li>Dados de uso: páginas visitadas, ações realizadas, dispositivo e localização aproximada.</li>
          <li>Dados inseridos por você: leads, imóveis, contratos e demais registros operacionais.</li>
        </ul>
      </Section>

      <Section title="Como usamos seus dados">
        <ul className="list-disc space-y-2 pl-5">
          <li>Para operar e melhorar a plataforma.</li>
          <li>Para fornecer suporte técnico e comercial.</li>
          <li>Para enviar comunicações relacionadas ao serviço (você pode descadastrar a qualquer momento).</li>
          <li>Nunca vendemos, alugamos ou compartilhamos seus dados com terceiros para fins de marketing.</li>
        </ul>
      </Section>

      <Section title="Segurança">
        <p>Adotamos criptografia AES-256 em repouso e TLS 1.3 em trânsito. Realizamos backups diários, testes de penetração trimestrais e auditorias anuais por empresas independentes.</p>
      </Section>

      <Section title="Seus direitos (LGPD)">
        <ul className="list-disc space-y-2 pl-5">
          <li>Acessar, corrigir e excluir seus dados a qualquer momento.</li>
          <li>Solicitar a portabilidade dos dados em formato estruturado.</li>
          <li>Revogar consentimentos previamente concedidos.</li>
          <li>Para exercer qualquer direito, escreva para dpo@imobiflow.app.</li>
        </ul>
      </Section>

      <CTACard title="Fale com nosso DPO" desc="Entre em contato com nosso Encarregado de Dados: dpo@imobiflow.app" />
    </PageShell>
  );
}
