import { Clock3, FileCheck2, PenLine, PlayCircle } from "lucide-react";
import type { InspectionKpiCard } from "@/product/inspection-dashboard";

const iconByKey: Record<string, typeof PlayCircle> = {
  in_progress: PlayCircle,
  draft: Clock3,
  awaiting_signature: PenLine,
  completed: FileCheck2,
};

type InspectionStatsProps = { kpis: InspectionKpiCard[]; loading: boolean };

/**
 * KPIs do Home. Cada card usa um status real de MysqlInspectionStatus — o
 * único que não tem dado real ainda ("Aguardando assinatura", que exigiria
 * a assinatura online canônica, ainda não implementada) aparece com "—" e
 * uma explicação, nunca com um número inventado.
 */
export function InspectionStats({ kpis, loading }: InspectionStatsProps) {
  return (
    <section aria-label="Indicadores de vistorias" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = iconByKey[kpi.key] ?? PlayCircle;
        const isPending = kpi.availability === "pending_backend";
        return (
          <div
            key={kpi.key}
            className={`rounded-lg border border-border bg-card p-4 ${isPending ? "opacity-70" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              {isPending ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  Em breve
                </span>
              ) : null}
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums">
              {loading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-muted" aria-hidden="true" /> : kpi.value ?? "—"}
            </p>
            <p className="mt-1 text-sm font-medium">{kpi.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{kpi.helper}</p>
          </div>
        );
      })}
    </section>
  );
}
