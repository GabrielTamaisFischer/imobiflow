import { Check, LoaderCircle } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { listPlans, type PublicPlan, startCheckout } from "@/product/billing";

export function Pricing() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingPlan, setSubmittingPlan] = useState<string | null>(null);

  useEffect(() => {
    void listPlans()
      .then(({ plans: canonicalPlans }) => setPlans(canonicalPlans))
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "Planos indisponíveis."),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleCheckout(event: FormEvent<HTMLFormElement>, plan: PublicPlan) {
    event.preventDefault();
    setError(null);
    setSubmittingPlan(plan.slug);
    try {
      const data = new FormData(event.currentTarget);
      const checkout = await startCheckout(plan.slug, String(data.get("email")));
      window.location.assign(checkout.checkout_url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível iniciar o checkout.");
    } finally {
      setSubmittingPlan(null);
    }
  }

  return (
    <section id="planos" className="relative py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary">Planos</p>
          <h2 className="mt-3 text-4xl font-black md:text-5xl">
            Escolha o seu <span className="text-gradient-brand">fluxo</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            A conta é criada somente depois da confirmação do pagamento. Não há cadastro gratuito
            público.
          </p>
        </div>

        {loading ? (
          <div className="mt-14 flex justify-center">
            <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
          </div>
        ) : null}
        {error ? (
          <p className="mx-auto mt-8 max-w-2xl rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {plans.map((plan, index) => {
            const highlight = index === 1;
            return (
              <div
                key={plan.id}
                className={`relative rounded-3xl border p-8 transition ${highlight ? "border-transparent bg-card shadow-glow" : "border-border bg-card hover:border-primary/40"}`}
              >
                {highlight ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-brand px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground">
                    Mais escolhido
                  </span>
                ) : null}
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <p className="mt-1 min-h-10 text-sm text-muted-foreground">{plan.description}</p>
                <div className="mt-6 flex items-end gap-1">
                  <span className="text-4xl font-black">
                    {formatMoney(plan.price_cents, plan.currency)}
                  </span>
                  <span className="pb-1 text-sm text-muted-foreground">
                    /{plan.billing_interval === "quarterly" ? "trimestre" : "mês"}
                  </span>
                </div>
                <ul className="mt-8 min-h-32 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <form
                  onSubmit={(event) => void handleCheckout(event, plan)}
                  className="mt-8 grid gap-2"
                >
                  <label className="text-xs font-medium text-muted-foreground">
                    E-mail da compra
                    <input
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    />
                  </label>
                  <button
                    disabled={Boolean(submittingPlan)}
                    className={`h-11 rounded-full text-sm font-semibold transition disabled:opacity-60 ${highlight ? "bg-gradient-brand text-primary-foreground shadow-glow" : "border border-border bg-background hover:bg-accent"}`}
                  >
                    {submittingPlan === plan.slug ? "Abrindo checkout…" : "Escolher plano"}
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}
