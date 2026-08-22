import { createFileRoute, notFound } from "@tanstack/react-router";
import { LongFormPage } from "@/components/marketing/LongFormPage";
import { contentPages } from "@/product/content-pages";

export const Route = createFileRoute("/$slug")({
  loader: ({ params }) => {
    const { slug } = params as { slug: string };
    const page = contentPages[slug];

    if (!page) {
      throw notFound();
    }

    return page;
  },
  component: Page,
});

function Page() {
  const page = Route.useLoaderData();

  return <LongFormPage page={page} />;
}
