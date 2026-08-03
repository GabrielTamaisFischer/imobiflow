import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, ClipboardList, FlaskConical, Home, Loader2, Play, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { ModulePage } from "@/components/app/module-page";
import { getModuleByKey } from "@/product/app-modules";
import {
  clearBackendTestLab,
  createTestScenarioPlan,
  runBackendTestLab,
  type TestLabClearResult,
  type TestLabRunResult,
} from "@/product/test-lab";
import { useSessionGuard } from "@/product/use-session-guard";

export const Route = createFileRoute("/app/testes")({
  component: TestLabPage,
});

function TestLabPage() {
  const { session, isLoading } = useSessionGuard();
  const module = getModuleByKey("tests");
  const plan = useMemo(() => createTestScenarioPlan(), []);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<TestLabRunResult | null>(null);
  const [clearResult, setClearResult] = useState<TestLabClearResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    if (
      !window.confirm(
        "Gerar dados de teste no banco da empresa autenticada? Todos os navegadores da mesma conta verão a mesma massa QA.",
      )
    ) {
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      setResult(await runBackendTestLab());
      setClearResult(null);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Não foi possível gerar os cenários de teste.");
    } finally {
      setIsRunning(false);
    }
  }

  async function handleClear() {
    if (
      !window.confirm(
        "Esta ação apagará todos os dados de teste gerados para esta empresa. Dados reais não serão removidos.",
      )
    ) {
      return;
    }

    setIsRunning(true);
    setError(null);
    try {
      setClearResult(await clearBackendTestLab());
      setResult(null);
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Não foi possível limpar a massa de testes.");
    } finally {
      setIsRunning(false);
    }
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Validando acesso...
      </main>
    );
  }

  return (
    <ModulePage session={session} module={module}>
      <section className="mb-4 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Laboratório controlado</p>
            <h2 className="mt-1 text-lg font-semibold">Cenários automáticos para validar o sistema</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Cria imóveis QA cobrindo todos os tipos do cadastro, agenda compromissos automáticos e gera vistorias
              de entrada e saída com checklist, fotos e PDF. Agora a massa QA é gravada no backend da empresa,
              marcada como teste e refletida em todos os navegadores autenticados na mesma conta.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={isRunning}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {isRunning ? "Processando..." : "Gerar dados de teste"}
            </button>
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={isRunning}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border px-4 text-sm font-semibold transition hover:bg-accent disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Limpar testes
            </button>
          </div>
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Massa QA persistente por empresa</p>
            <p className="mt-1">
              Os dados são gravados no backend com company_id e marca de teste. Chrome, Edge, Firefox e Codex devem
              enxergar a mesma lista quando a conta for a mesma.
            </p>
          </div>
        </div>
      </section>

      {error ? (
        <section className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </section>
      ) : null}

      {result ? <ResultPanel result={result} /> : null}
      {clearResult ? <ClearResultPanel result={clearResult} /> : null}

      <section className="grid gap-4 xl:grid-cols-4">
        <PlanCard
          icon={Home}
          title="Imóveis"
          value={plan.properties.length}
          description={`Todos os tipos do cadastro com ${plan.coverage.media_per_property} fotos reais por imóvel, capa, galeria, tour e liberação de portais.`}
        />
        <PlanCard
          icon={CalendarDays}
          title="Agenda"
          value={plan.appointments.length}
          description="Visitas, reuniões e vistorias vinculadas a imóveis, com endereço, horário e lembrete."
        />
        <PlanCard
          icon={ClipboardList}
          title="Vistorias"
          value={plan.inspections.length}
          description={`Entrada e saída para ${plan.coverage.inspection_property_limit} imóveis, com ${plan.coverage.media_per_inspection_room} fotos por cômodo, checklist e PDF.`}
        />
        <PlanCard
          icon={FlaskConical}
          title="Próximo passo"
          value="Sites"
          description="Depois de validar os dados gerados, avançamos para a área de sites com imóveis publicados reais/preview."
        />
      </section>

      <section className="mt-4 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Cobertura do cadastro de imóveis</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {plan.coverage.property_type_options.map((label) => (
            <span key={label} className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <CoverageLine label="Operações" value={plan.coverage.operations.join(", ")} />
          <CoverageLine label="Status" value={plan.coverage.statuses.join(", ")} />
          <CoverageLine label="Grupos de detalhes" value={plan.coverage.feature_groups.join(", ")} />
          <CoverageLine
            label="Mídia visual"
            value={`${plan.coverage.media_per_property} imagens por imóvel + ${plan.coverage.media_per_inspection_room} fotos por cômodo nas vistorias`}
          />
        </div>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-4">
        <a href="/app/imoveis" className="rounded-lg border border-border bg-card p-4 text-sm transition hover:bg-accent">
          Ver imóveis gerados
        </a>
        <a href="/app/agenda" className="rounded-lg border border-border bg-card p-4 text-sm transition hover:bg-accent">
          Ver agenda gerada
        </a>
        <a href="/app/vistorias" className="rounded-lg border border-border bg-card p-4 text-sm transition hover:bg-accent">
          Ver vistorias geradas
        </a>
        <a href="/app/site" className="rounded-lg border border-border bg-card p-4 text-sm transition hover:bg-accent">
          Ir para Sites
        </a>
      </section>
    </ModulePage>
  );
}

function ClearResultPanel({ result }: { result: TestLabClearResult }) {
  const total =
    result.properties +
    result.owners +
    result.appointments +
    result.inspections +
    result.rooms +
    result.items +
    result.media +
    result.signatures +
    (result.leads ?? 0) +
    (result.site_leads ?? 0);

  return (
    <section className="mb-4 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700">
      <p className="font-semibold">Massa QA antiga removida: {total} registro(s)</p>
      <p className="mt-1">
        Foram limpos imóveis, proprietários, agenda, leads, vistorias e mídias geradas automaticamente no backend da
        empresa.
      </p>
    </section>
  );
}

function ResultPanel({ result }: { result: TestLabRunResult }) {
  return (
    <section className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <CheckCircle2 className="h-4 w-4" />
        Cenários gerados com segurança no backend
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        <MiniResult label="Proprietários" value={result.created.owners} />
        <MiniResult label="Imóveis" value={result.created.properties} />
        <MiniResult label="Mídias" value={result.created.media} />
        <MiniResult label="Agendas" value={result.created.appointments} />
        <MiniResult label="Vistorias" value={result.created.inspections} />
        <MiniResult label="Itens" value={result.created.inspection_items} />
        <MiniResult label="Fotos laudo" value={result.created.inspection_media} />
        <MiniResult label="PDFs" value={result.created.pdfs} />
        <MiniResult label="Leads" value={result.created.leads ?? 0} />
        <MiniResult label="Site leads" value={result.created.site_leads ?? 0} />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Repetições são ignoradas por código/título: {result.skipped.properties} imóvel(is),{" "}
        {result.skipped.appointments} agenda(s) e {result.skipped.inspections} vistoria(s) já existiam.
      </p>
    </section>
  );
}

function PlanCard({
  icon: Icon,
  title,
  value,
  description,
}: {
  icon: typeof Home;
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <h3 className="mt-1 text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </article>
  );
}

function MiniResult({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CoverageLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
