import { createFileRoute } from "@tanstack/react-router";
import { PortalDashboard } from "@/product/portal-dashboard";

export const Route = createFileRoute("/portal/inquilino/$token")({ component: TenantPortalRoute });

function TenantPortalRoute() {
  const { token } = Route.useParams();
  return <PortalDashboard kind="tenant" token={token} />;
}
