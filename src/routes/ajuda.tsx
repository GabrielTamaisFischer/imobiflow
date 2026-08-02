import { createFileRoute } from "@tanstack/react-router";
import { PageShell, Section, FeatureGrid, CTACard } from "@/components/PageShell";

export const Route = createFileRoute("/ajuda")({
  head: () => ({
    meta: [
      { title: "Central de Ajuda | ImobiFlow" },
      { name: "description", content: "Tudo o que você precisa para tirar o máximo do ImobiFlow. Respostas rápidas e suporte humano quando você precisar." },
    ],
  }),
  component: Page_ajuda,
});

function Page_ajuda() {
  return (
    <PageShell
      eyebrow="Suporte"
      title="Estamos aqui para ajudar você a vender mais"
      subtitle="Tudo o que você precisa para tirar o máximo do ImobiFlow. Respostas rápidas e suporte humano quando você precisar."
      crumbs={[{ label: "Central de Ajuda" }]}
    >
      <Section title="Como podemos ajudar?">
        <FeatureGrid items={[
          { title: "Primeiros passos", desc: "Configure sua conta, importe imóveis e cadastre sua equipe em 30 minutos." },
          { title: "Tutoriais em vídeo", desc: "Mais de 80 vídeos curtos cobrindo cada funcionalidade." },
          { title: "Base de conhecimento", desc: "400+ artigos organizados por módulo e cenário." },
          { title: "Comunidade", desc: "Conecte-se com outros usuários no nosso grupo exclusivo do WhatsApp." }
        ]} />
      </Section>

      <Section title="Canais de atendimento">
        <ul className="list-disc space-y-2 pl-5">
          <li>Chat ao vivo: segunda a sexta, 8h às 20h (resposta em até 3 minutos).</li>
          <li>E-mail: suporte@imobiflow.app — resposta em até 4 horas úteis.</li>
          <li>WhatsApp: (11) 3000-0002 (apenas para clientes ativos).</li>
          <li>Suporte VIP 24/7 disponível nos planos Enterprise.</li>
        </ul>
      </Section>

      <CTACard title="Não encontrou o que procurava?" desc="Fale com nosso time agora." />
    </PageShell>
  );
}
