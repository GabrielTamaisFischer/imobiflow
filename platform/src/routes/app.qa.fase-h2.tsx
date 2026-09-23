import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { apiRequest } from "@/product/api";
import { getStoredToken } from "@/product/auth";

export const Route = createFileRoute("/app/qa/fase-h2")({ component: PhaseH2VerifierPage });

function PhaseH2VerifierPage() {
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const token = getStoredToken() ?? undefined;
      // apiRequest prefixes API_URL (/api); keep this path relative so the
      // request reaches the staging-only bridge at /api/internal-qa.
      const bridge = "/real-estate/qa-fase-h2";
      const smoke = await apiRequest<{ authenticated: boolean; authorized: boolean }>(
        `${bridge}/fase-h2-auth-smoke`,
        { token },
      );
      if (!smoke.authenticated || !smoke.authorized) {
        throw new Error("Transporte autenticado não confirmado.");
      }
      setResult(await apiRequest<Record<string, unknown>>(`${bridge}/fase-h2/run`, { token }));
    } catch (cause) {
      const failure = cause as Error & { status?: number; code?: string };
      const detail = [failure.status ? `HTTP ${failure.status}` : null, failure.code ?? null]
        .filter(Boolean)
        .join(" ");
      setError(`${failure.message || "Falha na verificação H2."}${detail ? ` (${detail})` : ""}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <section className="mx-auto max-w-3xl space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          QA staging-only
        </p>
        <h1 className="text-2xl font-semibold">Fase H2 — multi-provider</h1>
        <p className="text-sm text-muted-foreground">
          Executa a matriz sanitizada para a sessão atual. Nenhum token, documento ou payload
          externo é exibido.
        </p>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? "Executando..." : "Executar verificação"}
        </button>
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {result ? (
          <pre className="max-h-[70vh] overflow-auto rounded-md bg-muted p-4 text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </section>
    </main>
  );
}
