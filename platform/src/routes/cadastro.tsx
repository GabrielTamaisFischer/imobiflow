import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/cadastro")({ component: RegisterPage });

function RegisterPage() {
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
