import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/site/$slug")({
  component: PublicSiteLayout,
});

function PublicSiteLayout() {
  return <Outlet />;
}
