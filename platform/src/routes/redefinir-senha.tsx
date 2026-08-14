import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { resetPassword } from "@/product/auth";

export const Route = createFileRoute("/redefinir-senha")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const token =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("As senhas nao coincidem.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await resetPassword(token, password);
      setMessage(response.message);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Nao foi possivel redefinir a senha.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16 text-foreground">
      <form
        method="post"
        onSubmit={submit}
        className="mx-auto max-w-md rounded-lg border border-border bg-card p-6 shadow-sm"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">ImobiFlow</p>
        <h1 className="mt-3 text-2xl font-semibold">Definir nova senha</h1>
        {!token ? (
          <p className="mt-4 text-sm text-destructive">Link de recuperacao invalido.</p>
        ) : null}
        {message ? (
          <div className="mt-4 rounded-md bg-primary/10 p-4 text-sm">
            <p>{message}</p>
            <Link to="/entrar" className="mt-3 block font-medium text-primary">
              Ir para login
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Use ao menos 12 caracteres com maiuscula, minuscula, numero e simbolo.
            </p>
            <label className="mt-5 block text-sm font-medium">
              Nova senha
              <input
                type="password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3"
              />
            </label>
            <label className="mt-4 block text-sm font-medium">
              Confirmar nova senha
              <input
                type="password"
                minLength={12}
                maxLength={128}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3"
              />
            </label>
            {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={loading || !token} className="mt-5 w-full">
              {loading ? "Salvando..." : "Redefinir senha"}
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
