import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/MarketingPage";
import { marketingPages } from "@/product/marketing-pages";

export const Route = createFileRoute("/quem-usa")({
  component: QuemUsaPage,
});

function QuemUsaPage() {
  return <MarketingPage page={marketingPages["quem-usa"]} />;
}
