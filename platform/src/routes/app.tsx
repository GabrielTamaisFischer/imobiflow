import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app")({
  component: AppLayoutRoute,
});

function AppLayoutRoute() {
  return <Outlet />;
}
