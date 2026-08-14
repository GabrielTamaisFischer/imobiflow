import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvite, validateInvitation } from "@/product/auth";

export const Route = createFileRoute("/aceitar-convite")({
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const token =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("token") ?? "");
  const [form, setForm] = useState({ name: "", phone: "", password: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitationInfo, setInvitationInfo] = useState<{
    company_name: string;
    role_name: string;
    email: string;
  } | null>(null);
  const [isValidating, setIsValidating] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;
    void validateInvitation(token)
      .then(({ invitation }) => {
        setInvitationInfo(invitation);
        if (invitation.name) setForm((current) => ({ ...current, name: invitation.name ?? "" }));
      })
      .catch((validationError) => {
        setError(validationError instanceof Error ? validationError.message : "Convite invalido.");
      })
      .finally(() => setIsValidating(false));
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await acceptInvite({
        token,
        name: form.name,
        phone: form.phone || undefined,
        password: form.password,
      });
      setMessage(response.message);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Não foi possível aceitar o convite.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <section className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">ImobiFlow</p>
        <h1 className="mt-3 text-2xl font-semibold">Aceitar convite</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie sua senha para entrar na empresa que convidou você. O acesso ao sistema continuará
          respeitando assinatura ativa e permissões do cargo.
        </p>
        {isValidating ? (
          <p className="mt-4 text-sm text-muted-foreground">Validando convite...</p>
        ) : null}
        {invitationInfo ? (
          <div className="mt-4 rounded-md border border-border bg-background p-3 text-sm">
            <p className="font-medium">{invitationInfo.company_name}</p>
            <p className="mt-1 text-muted-foreground">
              {invitationInfo.email} · {invitationInfo.role_name}
            </p>
          </div>
        ) : null}

        {!token ? (
          <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Link de convite inválido. Solicite um novo convite ao administrador da imobiliária.
          </div>
        ) : message ? (
          <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
            <CheckCircle2 className="mb-2 h-5 w-5 text-primary" />
            <p className="font-medium">{message}</p>
            <Button asChild className="mt-4 w-full">
              <Link to="/entrar">Ir para login</Link>
            </Button>
          </div>
        ) : (
          <form method="post" onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block text-sm">
              <span className="font-medium">Nome completo</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                required
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Telefone</span>
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium">Senha</span>
              <input
                type="password"
                minLength={12}
                value={form.password}
                onChange={(event) =>
                  setForm((current) => ({ ...current, password: event.target.value }))
                }
                required
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <Button
              type="submit"
              disabled={isSubmitting || isValidating || !invitationInfo}
              className="w-full"
            >
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Aceitar convite
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
