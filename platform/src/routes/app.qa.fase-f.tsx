import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import { useSessionGuard } from "@/product/use-session-guard";
import { getStoredToken } from "@/product/auth";

type PhaseFResult = {
  conflict_created: boolean;
  conflict_persisted: boolean;
  conflict_resolved: boolean;
  resolution_persisted: boolean;
  document_created: boolean;
  document_persisted: boolean;
  freshness_valid: boolean;
  freshness_expired: boolean;
  owner360_updated: boolean;
  dto_contract_ok: boolean;
  dto_inspection_ok: boolean;
  dto_insurance_ok: boolean;
  dto_financing_ok: boolean;
  audit_ok: boolean;
  tenant_ok: boolean;
  five_xx_count: number;
};

export const Route = createFileRoute("/app/qa/fase-f")({ component: PhaseFVerificationPage });

function PhaseFVerificationPage() {
  const { session, isLoading } = useSessionGuard();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PhaseFResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runVerification() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/app/qa/fase-f/run", {
        method: "POST",
        headers: { Authorization: `Bearer ${getStoredToken() ?? ""}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json().catch(() => null)) as PhaseFResult | { message?: string } | null;
      if (!response.ok) throw new Error((payload as { message?: string } | null)?.message ?? "Não foi possível executar a prova QA.");
      setResult(payload as PhaseFResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível executar a prova QA.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Validando acesso...</main>;
  if (!session) return <main className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Sessão necessária.</main>;

  return (
    <ModulePage session={session} module={getModuleByKey("owners")}>
      <section className="mx-auto max-w-3xl space-y-4 rounded-lg border border-border bg-card p-6">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">QA staging-only</p>
          <h1 className="mt-1 text-2xl font-semibold">Verificação runtime da Fase F</h1>
          <p className="mt-2 text-sm text-muted-foreground">Executa uma única prova sintética de conflito, documentos, freshness, Owner360, DTOs, auditoria e isolamento. Nenhuma PII é exibida.</p>
        </div>
        <button type="button" onClick={() => void runVerification()} disabled={busy} className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Executando..." : "Executar QA Fase F"}
        </button>
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
        {result ? <pre className="overflow-auto rounded-md bg-muted p-4 text-xs">{JSON.stringify(result, null, 2)}</pre> : null}
      </section>
    </ModulePage>
  );
}
