import { createFileRoute } from "@tanstack/react-router";
import { PartyRegistryPage } from "@/components/app/party-registry-page";

export const Route = createFileRoute("/app/inquilinos")({
  component: TenantsPage,
});

function TenantsPage() {
  return (
    <PartyRegistryPage
      config={{
        role: "tenant",
        moduleKey: "tenants",
        singular: "Inquilino",
        plural: "Inquilinos",
        description: "Cadastre inquilinos antes ou depois da criação de um contrato.",
        emptyDescription: "Cadastre inquilinos para selecioná-los em locações sem duplicar a identidade civil.",
      }}
    />
  );
}
