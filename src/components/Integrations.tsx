const partners = ["WhatsApp", "ZAP Imóveis", "OLX", "Viva Real", "Stripe", "Google", "Asaas", "Receita Federal"];

export function Integrations() {
  return (
    <section className="relative border-y border-border py-12">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          Integrações nativas
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-80">
          {partners.map((p) => (
            <div key={p} className="text-base font-bold tracking-tight text-muted-foreground transition hover:text-foreground">
              {p}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
