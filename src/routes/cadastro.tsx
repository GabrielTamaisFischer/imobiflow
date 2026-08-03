import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Building2, CheckCircle2, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { register } from "@/product/auth";
import { API_SETUP_MESSAGE, isUnavailableProductionApi } from "@/product/api";

export const Route = createFileRoute("/cadastro")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const accessInSetup = isUnavailableProductionApi();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (accessInSetup) {
      setError(null);
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      await register({
        name: String(formData.get("name")),
        email: String(formData.get("email")),
        password: String(formData.get("password")),
        companyName: String(formData.get("companyName")),
        companyDocument: String(formData.get("companyDocument") || ""),
        phone: String(formData.get("phone") || ""),
      });

      await navigate({ to: "/assinatura-bloqueada" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o cadastro.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[1fr_460px]">
        <div>
          <Link to="/" className="text-sm font-semibold text-primary">
            ImobiFlow
          </Link>
          <h1 className="mt-8 max-w-2xl text-4xl font-bold tracking-tight md:text-5xl">
            Crie a empresa e o usuário dono
          </h1>
          <p className="mt-4 max-w-xl text-base text-muted-foreground">
            O cadastro inicial cria a imobiliária, vincula o owner e deixa a assinatura inativa até
            confirmação de pagamento por webhook.
          </p>
          <div className="mt-8 max-w-xl rounded-lg border border-border bg-card/60 p-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              <div>
                <h2 className="text-sm font-semibold">Cadastro preparado para SaaS real</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  A base valida usuário, empresa, plano, assinatura e permissão antes de liberar a área interna.
                </p>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-card p-6 shadow-sm"
        >
          <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Cadastro SaaS</h2>
          {accessInSetup ? (
            <div className="mt-5 rounded-lg border border-primary/25 bg-primary/5 p-4">
              <h3 className="text-sm font-semibold">Acesso antecipado em ativação</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {API_SETUP_MESSAGE} O formulário será liberado assim que o ambiente seguro estiver conectado.
              </p>
              <ul className="mt-4 space-y-2 text-sm">
                {[
                  "Cadastro de empresa e usuário dono.",
                  "Assinatura inicial bloqueada até pagamento.",
                  "Liberação por plano ativo e permissão.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-6 grid gap-4">
            <label className="block text-sm font-medium">
              Nome
              <input
                name="name"
                required
                disabled={accessInSetup}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              E-mail
              <input
                name="email"
                type="email"
                required
                disabled={accessInSetup}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              Senha
              <input
                name="password"
                type="password"
                minLength={8}
                required
                disabled={accessInSetup}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              Nome da imobiliária
              <input
                name="companyName"
                required
                disabled={accessInSetup}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Documento
                <input
                  name="companyDocument"
                  disabled={accessInSetup}
                  className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
              <label className="block text-sm font-medium">
                Telefone
                <input
                  name="phone"
                  disabled={accessInSetup}
                  className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || accessInSetup}
            className="mt-6 h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {accessInSetup ? "Cadastro em ativação" : isSubmitting ? "Criando..." : "Criar cadastro"}
          </button>
          {accessInSetup ? (
            <div className="mt-4 grid gap-2">
              <Link
                to="/entrar"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Entrar com conta liberada
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/planos"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-semibold transition hover:bg-accent"
              >
                Conhecer planos e implantação
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </form>
      </section>
    </main>
  );
}
