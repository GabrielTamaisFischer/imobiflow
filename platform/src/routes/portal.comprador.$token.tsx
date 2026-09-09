import { createFileRoute } from "@tanstack/react-router";
import { PortalDashboard } from "@/product/portal-dashboard";

export const Route = createFileRoute("/portal/comprador/$token")({ component: BuyerPortalRoute });

function BuyerPortalRoute() {
  const { token } = Route.useParams();
  return <PortalDashboard kind="buyer" token={token} />;
}
