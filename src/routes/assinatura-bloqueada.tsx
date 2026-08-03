import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, MessageCircle } from "lucide-react";
import { kiwifyLinks } from "@/product/checkout-links";

export const Route = createFileRoute("/assinatura-bloqueada")({
  component: SubscriptionBlockedPage,
});

function SubscriptionBlockedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-xl rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-destructive/10 text-destructive">
          <CreditCard className="h-6 w-6" />
        </div>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">Acesso pausado</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Sua conta pode estar autenticada, mas o sistema interno exige empresa vinculada e
          assinatura ativa. Regularize o plano para liberar os módulos do ImobiFlow.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <a
            href={kiwifyLinks.salesPage}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            <CreditCard className="h-4 w-4" />
            Regularizar plano
          </a>
          <a
            href="https://wa.me/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-input px-4 text-sm font-semibold transition hover:bg-accent"
          >
            <MessageCircle className="h-4 w-4" />
            Falar com suporte
          </a>
        </div>
      </section>
    </main>
  );
}
