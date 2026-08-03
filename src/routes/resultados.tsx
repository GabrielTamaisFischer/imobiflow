import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/MarketingPage";
import { marketingPages } from "@/product/marketing-pages";

export const Route = createFileRoute("/resultados")({
  component: ResultadosPage,
});

function ResultadosPage() {
  return <MarketingPage page={marketingPages.resultados} />;
}
