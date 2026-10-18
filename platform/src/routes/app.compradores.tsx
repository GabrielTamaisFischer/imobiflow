import { createFileRoute } from "@tanstack/react-router";
import { PartyRegistryPage } from "@/components/app/party-registry-page";

export const Route = createFileRoute("/app/compradores")({
  component: BuyersPage,
});

function BuyersPage() {
  return (
    <PartyRegistryPage
      config={{
        role: "buyer",
        moduleKey: "buyers",
        singular: "Comprador",
        plural: "Compradores",
        description: "Cadastre compradores independentemente de uma oportunidade do CRM.",
        emptyDescription: "Cadastre compradores para reutilizar a mesma identidade em leads, propostas e contratos.",
      }}
    />
  );
}
