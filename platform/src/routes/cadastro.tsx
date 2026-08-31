import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { registerFreeAccount } from "@/product/auth";
import { isFreeRegistrationUiEnabled } from "@/product/registration-access";
import { isSubscriptionActive } from "@/product/subscription";

export const Route = createFileRoute("/cadastro")({ component: RegisterPage });

// Diretriz Mestre do MVP, Fase 1, Item 2: cadastro aberto real, via UI, sem
// nenhum atalho tecnico (sem admin secret, sem endpoint oculto, sem insercao
// manual no banco). Cada envio deste formulario cria UMA empresa nova, com um
// Owner novo, chamando o mesmo /auth/register que qualquer outro cliente da
// API usaria. So aparece fora de producao e com a flag explicita ligada
// (VITE_IMOBIFLOW_REGISTRATION_ENABLED) — em producao o fluxo comercial por
// plano abaixo continua sendo o unico caminho.
const registrationUiEnabled = isFreeRegistrationUiEnabled(import.meta.env);

function RegisterPage() {
  return registrationUiEnabled ? <FreeRegistrationForm /> : <PaidPlanOnlyNotice />;
}

function FreeRegistrationForm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const companyName = String(formData.get("company_name") ?? "").trim();
    const companyDocument = String(formData.get("company_document") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    try {
      const response = await registerFreeAccount({
        email,
        name,
        password,
        company_name: companyName,
        company_document: companyDocument || undefined,
        phone: phone || undefined,
      });

      const subscription = response.access.subscription;
      await navigate({
        to: isSubscriptionActive(subscription?.status, subscription?.expires_at)
          ? "/app"
          : "/assinatura-bloqueada",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar sua conta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-2xl items-center">
        <form
          method="post"
          onSubmit={handleSubmit}
          className="w-full rounded-2xl border border-border bg-card p-8 shadow-sm"
        >
          <Link to="/" className="text-sm font-semibold text-primary">
            ImobiFlow
          </Link>
          <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">Criar sua conta ImobiFlow</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Ambiente de staging — crie sua imobiliária e o usuário owner para testar a plataforma.
          </p>

          <div className="mt-8 space-y-4">
            <label className="block text-sm font-medium">
              Seu nome
              <input
                name="name"
                type="text"
                required
                minLength={2}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
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
                minLength={8}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              Nome da imobiliária
              <input
                name="company_name"
                type="text"
                required
                minLength={2}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              CNPJ/CPF (opcional)
              <input
                name="company_document"
                type="text"
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block text-sm font-medium">
              Telefone (opcional)
              <input
                name="phone"
                type="tel"
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
          </div>

          {error ? (
            <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-6 h-11 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {isSubmitting ? "Criando conta..." : "Criar conta"}
          </button>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            Já possui uma conta?{" "}
            <Link to="/entrar" className="font-semibold text-primary">
              Entrar
            </Link>
          </p>
        </form>
      </section>
    </main>
  );
}

function PaidPlanOnlyNotice() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-2xl items-center">
        <div className="w-full rounded-2xl border border-border bg-card p-8 shadow-sm">
          <Link to="/" className="text-sm font-semibold text-primary">
            ImobiFlow
          </Link>
          <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            Para criar sua conta ImobiFlow, escolha um plano.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Não existe cadastro gratuito público. Depois da confirmação do pagamento, você recebe um
            link seguro e de uso único para criar a imobiliária e o primeiro usuário owner.
          </p>
          <Link
            to="/planos"
            className="mt-8 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Escolher um plano <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-6 text-sm text-muted-foreground">
            Já possui uma conta?{" "}
            <Link to="/entrar" className="font-semibold text-primary">
              Entrar
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
