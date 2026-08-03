import { createFileRoute } from "@tanstack/react-router";
import { MarketingPage } from "@/components/marketing/MarketingPage";
import { marketingPages } from "@/product/marketing-pages";

export const Route = createFileRoute("/produto")({
  component: ProdutoPage,
});

function ProdutoPage() {
  return <MarketingPage page={marketingPages.produto} />;
}
