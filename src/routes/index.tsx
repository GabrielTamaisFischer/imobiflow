import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import { ProfileCards } from "@/components/ProfileCards";
import { Features } from "@/components/Features";
import { Benefits } from "@/components/Benefits";
import { AIShowcase } from "@/components/AIShowcase";
import { Testimonials } from "@/components/Testimonials";
import { Integrations } from "@/components/Integrations";
import { Pricing } from "@/components/Pricing";
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
        <Features />
        <ProfileCards />
        <Benefits />
        <AIShowcase />
        <Testimonials />
        <Integrations />
        <Pricing />
        <FAQ />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
