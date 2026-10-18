import { createFileRoute } from "@tanstack/react-router";
import { PartyRegistryPage } from "@/components/app/party-registry-page";

export const Route = createFileRoute("/app/corretores")({
  component: BrokersPage,
});

function BrokersPage() {
  return (
    <PartyRegistryPage
      config={{
        role: "broker",
        moduleKey: "brokers",
        singular: "Corretor",
        plural: "Corretores",
        description: "Ficha civil e profissional do corretor, separada das credenciais de acesso.",
        emptyDescription: "Cadastre corretores com CPF, CRECI e dados profissionais; o acesso ao sistema continua em Configurações.",
      }}
    />
  );
}
