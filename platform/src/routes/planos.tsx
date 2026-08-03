import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/MarketingPage";
import { Pricing } from "@/components/Pricing";
import { marketingPages } from "@/product/marketing-pages";

export const Route = createFileRoute("/planos")({
  component: PlanosPage,
});

function PlanosPage() {
  return (
    <MarketingPage page={marketingPages.planos} childrenAfterMetrics={<Pricing />} />
  );
}
