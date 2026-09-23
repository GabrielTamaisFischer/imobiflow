import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { apiRequest } from "@/product/api";
import { getStoredToken } from "@/product/auth";

export const Route = createFileRoute("/app/qa/fase-h3a")({ component: H3AVerifierPage });

function H3AVerifierPage() {
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const token = getStoredToken() ?? undefined;
      const auth = await apiRequest<{ authenticated: boolean; company_resolved: boolean; authorized: boolean }>(
        "/real-estate/qa-fase-h3a/auth-smoke", { token },
      );
      if (!auth.authenticated || !auth.company_resolved || !auth.authorized) throw new Error("AUTH_SMOKE_FAILED");
      const prepared = await apiRequest<{ owner_id: string }>("/real-estate/qa-fase-h3a/prepare", { token });
      const invalid = await apiRequest<Record<string, unknown>>("/real-estate/qa-fase-h3a/invalid-cpf", { token });
      const configured = await apiRequest<Record<string, unknown>>("/real-estate/qa-fase-h3a/configured-false", { token });
      const real = await apiRequest<{ check?: { status?: string } }>(
        `/real-estate/owners/${encodeURIComponent(prepared.owner_id)}/intelligence/query`,
        { method: "POST", headers: { "Idempotency-Key": "h3a-real-route-20260923" }, body: JSON.stringify({ capabilities: ["IDENTITY"] }), token },
      );
      setResult({
        auth_transport_ok: true,
        invalid_cpf_backend_ok: invalid.backend_ok === true,
        invalid_cpf_status: invalid.status ?? null,
        configured_false_ok: configured.configured_false_ok === true,
        not_configured_ok: configured.not_configured_ok === true && real.check?.status === "NOT_CONFIGURED",
        external_request_count: configured.external_request_count ?? null,
        fake_data_count: configured.fake_data_count ?? null,
        five_xx_count: configured.five_xx_count ?? 0,
        secrets_exposed: configured.secrets_exposed === true,
      });
    } catch (cause) {
      const failure = cause as Error & { status?: number; code?: string };
      setError([failure.message || "H3A verification failed", failure.status ? `HTTP ${failure.status}` : null, failure.code ?? null].filter(Boolean).join(" ("));
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen bg-background p-6">
      <section className="mx-auto max-w-3xl space-y-4 rounded-lg border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">QA staging-only</p>
        <h1 className="text-2xl font-semibold">Fase H3A — CPF adapter</h1>
        <p className="text-sm text-muted-foreground">Executa uma prova sanitizada sem exibir tokens, documentos ou respostas externas.</p>
        <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Executando..." : "Executar verificação"}</button>
        {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        {result ? <pre className="max-h-[70vh] overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(result, null, 2)}</pre> : null}
      </section>
    </main>
  );
}
