import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import { OperationsNarrative } from "@/components/OperationsNarrative";
import { Integrations } from "@/components/Integrations";
import { FAQ } from "@/components/FAQ";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute left-1/2 top-[100vh] hidden h-[420vh] w-px -translate-x-1/2 flow-line opacity-40 md:block" />

      <Navbar />
      <main>
        <Hero />
        <Stats />
        <OperationsNarrative />
        <Integrations />
        <FAQ />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
