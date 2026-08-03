import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { login, storeDemoPreviewAccess } from "@/product/auth";
import { API_SETUP_MESSAGE, isUnavailableProductionApi } from "@/product/api";
import { isSubscriptionActive } from "@/product/subscription";

export const Route = createFileRoute("/entrar")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const accessInSetup = isUnavailableProductionApi();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email"));
    const password = String(formData.get("password"));

    const allowedPreviewAccess = await storeDemoPreviewAccess(email, password);
    if (allowedPreviewAccess) {
      setIsSubmitting(false);
      await navigate({ to: "/app" });
      return;
    }

    if (accessInSetup) {
      setIsSubmitting(false);
      setError("E-mail ou senha inválidos para o acesso de visualização.");
      return;
    }

    try {
      const response = await login(email, password);

      const subscription = response.access.subscription;
      await navigate({
        to: isSubscriptionActive(subscription?.status, subscription?.expires_at)
          ? "/app"
          : "/assinatura-bloqueada",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_420px]">
        <div>
          <Link to="/" className="text-sm font-semibold text-primary">
            ImobiFlow
          </Link>
          <h1 className="mt-8 max-w-2xl text-4xl font-bold tracking-tight md:text-5xl">
            Acesse sua operação imobiliária
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            O acesso interno valida login, empresa vinculada, assinatura ativa e permissões antes de
            liberar dados.
          </p>
          <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              ["Login seguro", "Supabase Auth"],
              ["Empresa", "Multiempresa"],
              ["Assinatura", "Bloqueio ativo"],
            ].map(([title, label]) => (
              <div key={title} className="rounded-lg border border-border bg-card/60 p-4">
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Entrar</h2>
          {accessInSetup ? (
            <div className="mt-5 rounded-lg border border-primary/25 bg-primary/5 p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-semibold">Acesso de visualização liberado</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {API_SETUP_MESSAGE} A conta autorizada pode entrar para acompanhar como a área interna está ficando.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              E-mail
              <input
                name="email"
                type="email"
                required
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              Senha
              <input
                name="password"
                type="password"
                required
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          {error ? (
            <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {isSubmitting ? "Entrando..." : "Entrar"}
          </button>
          {accessInSetup ? (
            <div className="mt-4 grid gap-2">
              <Link
                to="/cadastro"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:bg-accent"
              >
                Solicitar acesso antecipado
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/planos"
                className="inline-flex items-center justify-center gap-2 text-sm font-medium text-primary"
              >
                <Clock3 className="h-4 w-4" />
                Ver estrutura dos planos
              </Link>
            </div>
          ) : null}

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Ainda não tem conta?{" "}
            <Link to="/cadastro" className="font-medium text-primary">
              Criar cadastro
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}
