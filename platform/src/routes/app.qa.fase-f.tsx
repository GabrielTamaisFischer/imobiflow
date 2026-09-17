import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/qa/fase-f")({ component: FaseFTransportProbe });

function FaseFTransportProbe() {
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">QA Fase F — transporte nativo</h1>
      <p className="text-sm text-muted-foreground">
        Smoke temporário de staging. Exige sessão Owner/Admin e não executa mutações.
      </p>
      <form method="post" action="/internal-qa/fase-f/run">
        <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
          Executar smoke de transporte
        </button>
      </form>
    </main>
  );
}
