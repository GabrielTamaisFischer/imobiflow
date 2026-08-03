import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/MarketingPage";
import { marketingPages } from "@/product/marketing-pages";

export const Route = createFileRoute("/inteligencia")({
  component: InteligenciaPage,
});

function InteligenciaPage() {
  return <MarketingPage page={marketingPages.inteligencia} />;
}
