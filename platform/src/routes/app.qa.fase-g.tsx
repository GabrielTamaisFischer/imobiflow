import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { apiRequest } from "@/product/api";
import { getStoredToken } from "@/product/auth";

type Result = Record<string, unknown>;

export const Route = createFileRoute("/app/qa/fase-g")({ component: PhaseGVerifierPage });

function PhaseGVerifierPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    const token = getStoredToken() ?? undefined;
    const bridge = `${window.location.origin}/internal-qa`;
    try {
      const smoke = await apiRequest<Result>(`${bridge}/fase-g-auth-smoke`, { token });
      if (!smoke.authenticated || !smoke.authorized) throw new Error("Transporte autenticado não confirmado.");
      const main = await apiRequest<Result>(`${bridge}/fase-g/run`, { token });
      setResult({ auth_smoke: smoke, owner: main });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na verificação Fase G.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <section className="mx-auto max-w-3xl space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">QA staging-only</p>
        <h1 className="text-2xl font-semibold">Fase G — automações downstream</h1>
        <p className="text-sm text-muted-foreground">Executa somente leituras/serviços canônicos para a sessão atual e exibe indicadores sanitizados.</p>
        <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Executando..." : "Executar verificação"}
        </button>
        {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        {result ? <pre className="max-h-[70vh] overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(result, null, 2)}</pre> : null}
      </section>
    </main>
  );
}
