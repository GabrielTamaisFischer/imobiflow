import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { apiRequest } from "@/product/api";
import { getStoredToken } from "@/product/auth";
import { useSessionGuard } from "@/product/use-session-guard";

type TransportResult = { received: boolean; authenticated: boolean; authorized: boolean };
type PhaseFResult = Record<string, unknown> & { transport_ok?: boolean; already_executed?: boolean; five_xx_count?: number };

export const Route = createFileRoute("/app/qa/fase-f")({ component: PhaseFBridgePage });

function BridgeResult({ result }: { result: Record<string, unknown> }) {
  return <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(result, null, 2)}</pre>;
}

function PhaseFBridgePage() {
  const { session, isLoading } = useSessionGuard();
  const [busy, setBusy] = useState(false);
  const [transport, setTransport] = useState<TransportResult | null>(null);
  const [result, setResult] = useState<PhaseFResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null); setTransport(null); setResult(null);
    const token = getStoredToken() ?? undefined;
    const bridge = `${window.location.origin}/internal-qa`;
    try {
      const smoke = await apiRequest<TransportResult>(`${bridge}/fase-f-auth-smoke`, { token });
      setTransport(smoke);
      if (!smoke.authenticated || !smoke.authorized) throw new Error("Transporte autenticado não foi confirmado.");
      const first = await apiRequest<PhaseFResult>(`${bridge}/fase-f/run`, { token });
      setResult(first);
      const second = await apiRequest<PhaseFResult>(`${bridge}/fase-f/run`, { token });
      setResult({ ...second, second_run: true, first_already_executed: first.already_executed ?? false });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na prova bridge.");
    } finally { setBusy(false); }
  }

  if (isLoading) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Validando acesso...</main>;
  if (!session) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Sessão necessária.</main>;
  return <ModulePage session={session} module={getModuleByKey("owners")}>
    <section className="mx-auto max-w-3xl space-y-4 rounded-lg border border-border bg-card p-6">
      <p className="text-xs font-semibold uppercase text-muted-foreground">QA staging-only</p>
      <h1 className="text-2xl font-semibold">Fase F — bridge autenticado</h1>
      <p className="text-sm text-muted-foreground">Usa o cliente autenticado oficial e exibe somente indicadores sanitizados.</p>
      <button type="button" onClick={() => void run()} disabled={busy} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Executando..." : "Testar transporte autenticado"}</button>
      {transport ? <BridgeResult result={transport} /> : null}
      {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {result ? <BridgeResult result={result} /> : null}
    </section>
  </ModulePage>;
}
