import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, LoaderCircle, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { activateAccount, validateAccountActivation } from "@/product/auth";

export const Route = createFileRoute("/ativar-conta")({ component: ActivateAccountPage });

type Activation = Awaited<ReturnType<typeof validateAccountActivation>>["activation"];

function ActivateAccountPage() {
  const navigate = useNavigate();
  const token =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("token") ?? "");
  const [activation, setActivation] = useState<Activation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Link de ativação ausente.");
      setLoading(false);
      return;
    }
    void validateAccountActivation(token)
      .then(({ activation: value }) => setActivation(value))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Link inválido."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("password_confirmation"))) {
      setError("A confirmação da senha não confere.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await activateAccount({
        token,
        name: String(form.get("name")),
        password,
        company_name: String(form.get("company_name")),
        company_document: String(form.get("company_document") || ""),
        phone: String(form.get("phone") || ""),
      });
      await navigate({ to: "/app/configuracoes" });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível ativar a conta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto w-full max-w-xl rounded-2xl border border-border bg-card p-7 shadow-sm">
        <Link to="/" className="text-sm font-semibold text-primary">
          ImobiFlow
        </Link>
        <div className="mt-7 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          {loading ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <Building2 className="h-5 w-5" />
          )}
        </div>
        <h1 className="mt-5 text-3xl font-bold tracking-tight">Ative sua conta</h1>
        {loading ? <p className="mt-4 text-muted-foreground">Validando o link seguro…</p> : null}
        {error && !activation ? (
          <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <Link to="/planos" className="mt-3 inline-block text-sm font-semibold text-primary">
              Ver planos
            </Link>
          </div>
        ) : null}
        {activation ? (
          <form method="post" onSubmit={handleSubmit} className="mt-6 grid gap-4">
            {activation.synthetic ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                Provisionamento sintético de ambiente não produtivo.
              </p>
            ) : null}
            <div className="rounded-md border border-border bg-background p-3 text-sm">
              <p>
                <span className="text-muted-foreground">Plano:</span> {activation.plan.name}
              </p>
              <p className="mt-1">
                <span className="text-muted-foreground">E-mail da compra:</span> {activation.email}
              </p>
            </div>
            <Field name="name" label="Seu nome" />
            <Field name="company_name" label="Nome da imobiliária" />
            <Field name="company_document" label="Documento (opcional)" required={false} />
            <Field name="phone" label="Telefone (opcional)" required={false} />
            <Field name="password" label="Senha" type="password" minLength={12} />
            <Field
              name="password_confirmation"
              label="Confirme a senha"
              type="password"
              minLength={12}
            />
            {error ? (
              <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
            ) : null}
            <button
              disabled={submitting}
              className="mt-2 h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {submitting ? "Ativando…" : "Criar empresa e acessar"}
            </button>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />O e-mail, o plano e a confirmação
              do pagamento vêm da transação validada e não podem ser alterados aqui.
            </p>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function Field({
  name,
  label,
  type = "text",
  required = true,
  minLength,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
