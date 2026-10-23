import { AlertCircle, Clock3, FileCheck2, PlayCircle } from "lucide-react";
import type { InspectionKpiCard } from "@/product/inspection-dashboard";

const iconByKey: Record<string, typeof PlayCircle> = {
  in_progress: PlayCircle,
  draft: Clock3,
  pending: AlertCircle,
  completed: FileCheck2,
};

type InspectionStatsProps = {
  kpis: InspectionKpiCard[];
  loading: boolean;
  /** "draft"/"in_progress"/"completed" dão um atalho real para filtrar a
   * listagem abaixo (ex.: clicar em "Rascunhos" chama onSelectStatus("draft"),
   * cobrindo o antigo botão "Ver rascunhos"). "Pendências" é um recorte de
   * data, não um status filtrável no backend, então seu card não é clicável. */
  onSelectStatus?: (status: "draft" | "in_progress" | "completed") => void;
};

const clickableStatusByKey: Record<string, "draft" | "in_progress" | "completed"> = {
  draft: "draft",
  in_progress: "in_progress",
  completed: "completed",
};

/**
 * KPIs do topo de /app/vistorias. Todos os 4 cards usam dados reais - 3
 * contagens diretas por status e "Pendências" (aproximação sobre uma janela
 * recente, ver buildInspectionKpis) - nenhum card fica desabilitado/"em
 * breve" aqui.
 */
export function InspectionStats({ kpis, loading, onSelectStatus }: InspectionStatsProps) {
  return (
    <section aria-label="Indicadores de vistorias" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = iconByKey[kpi.key] ?? PlayCircle;
        const targetStatus = clickableStatusByKey[kpi.key];
        const clickable = Boolean(targetStatus && onSelectStatus);
        const Wrapper = clickable ? "button" : "div";
        return (
          <Wrapper
            key={kpi.key}
            type={clickable ? "button" : undefined}
            onClick={clickable ? () => onSelectStatus!(targetStatus) : undefined}
            className={`rounded-lg border border-border bg-card p-4 text-left ${clickable ? "transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {loading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted" aria-hidden="true" /> : kpi.value ?? "—"}
            </p>
            <p className="mt-1 text-sm font-medium">{kpi.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{kpi.helper}</p>
          </Wrapper>
        );
      })}
    </section>
  );
}
