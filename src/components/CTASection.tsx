import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="relative py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="relative overflow-hidden rounded-[36px] border border-border bg-card px-8 py-16 text-center md:px-16 md:py-24">
          <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[600px] -translate-x-1/2 rounded-full bg-gradient-brand opacity-30 blur-3xl" />
          <div className="absolute inset-0 grid-bg opacity-50" />

          <h2 className="relative text-4xl font-black md:text-6xl">
            Centralize sua imobiliária em uma <br />
            <span className="text-gradient-brand">plataforma operacional inteligente.</span>
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-muted-foreground">
            Menos retrabalho, mais controle, mais velocidade e mais fechamento. Veja como o
            ImobiFlow organiza sua operação do lead ao repasse.
          </p>
          <a href="/cadastro" className="relative mt-10 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow animate-glow-pulse transition hover:brightness-110">
            Solicitar demonstração
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
