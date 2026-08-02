import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso | ImobiFlow" },
      { name: "description", content: "Última atualização: 01 de março de 2026. Leia com atenção: estes termos regem o uso da plataforma ImobiFlow." },
    ],
  }),
  component: Page_termos,
});

function Page_termos() {
  return (
    <PageShell
      eyebrow="Legal"
      title="Termos de Uso da plataforma ImobiFlow"
      subtitle="Última atualização: 01 de março de 2026. Leia com atenção: estes termos regem o uso da plataforma ImobiFlow."
      crumbs={[{ label: "Termos de Uso" }]}
    >
      <Section title="1. Aceitação dos termos">
        <p>Ao acessar ou usar a plataforma ImobiFlow (ImobiFlow Tecnologia LTDA, CNPJ 00.000.000/0001-00), você concorda integralmente com estes Termos de Uso. Se você não concorda, não utilize a plataforma.</p>
      </Section>

      <Section title="2. Cadastro e conta">
        <p>O cadastro exige informações verdadeiras, completas e atualizadas. Você é responsável pela confidencialidade de suas credenciais e por todas as atividades realizadas em sua conta.</p>
      </Section>

      <Section title="3. Uso permitido">
        <ul className="list-disc space-y-2 pl-5">
          <li>Utilizar a plataforma exclusivamente para fins lícitos relacionados à atividade imobiliária.</li>
          <li>Não realizar engenharia reversa, scraping ou tentativas de comprometer a segurança da plataforma.</li>
          <li>Não usar a plataforma para enviar spam ou comunicações não solicitadas.</li>
        </ul>
      </Section>

      <Section title="4. Planos e pagamentos">
        <p>Os planos vigentes estão descritos em imobiflow.app/planos. Pagamentos são processados mensalmente ou anualmente. Atrasos superiores a 10 dias podem resultar em suspensão temporária do acesso.</p>
      </Section>

      <Section title="5. Propriedade intelectual">
        <p>Todo o software, marcas, design e conteúdo da plataforma são de propriedade exclusiva da ImobiFlow. Os dados inseridos por você permanecem de sua propriedade.</p>
      </Section>

      <Section title="6. Limitação de responsabilidade">
        <p>A ImobiFlow oferece a plataforma "no estado em que se encontra" e não se responsabiliza por decisões comerciais tomadas com base nos dados ou recomendações da IA. SLA garantido conforme plano contratado.</p>
      </Section>

      <Section title="7. Foro">
        <p>Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer controvérsias.</p>
      </Section>

      <CTACard title="Dúvidas jurídicas?" desc="Fale com nosso departamento jurídico em juridico@imobiflow.app." />
    </PageShell>
  );
}
