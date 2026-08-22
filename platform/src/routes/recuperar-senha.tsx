import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestPasswordReset } from "@/product/auth";

export const Route = createFileRoute("/recuperar-senha")({ component: RecoverPasswordPage });

function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await requestPasswordReset(email);
      setMessage(response.message);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Nao foi possivel solicitar a recuperacao.",
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
        <h1 className="mt-3 text-2xl font-semibold">Recuperar senha</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Informe o e-mail da sua conta. A resposta e sempre neutra para proteger o cadastro.
        </p>
        <label className="mt-5 block text-sm font-medium">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 h-11 w-full rounded-md border border-input bg-background px-3"
          />
        </label>
        {message ? <p className="mt-4 rounded-md bg-primary/10 p-3 text-sm">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        <Button type="submit" disabled={loading} className="mt-5 w-full">
          {loading ? "Enviando..." : "Enviar instrucoes"}
        </Button>
        <Link to="/entrar" className="mt-4 block text-center text-sm font-medium text-primary">
          Voltar ao login
        </Link>
      </form>
    </main>
  );
}
