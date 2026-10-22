import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import type { MysqlInspection } from "@/product/inspections";
import { inspectionStatusLabels } from "@/product/inspection-dashboard";

type InspectionPendingCardProps = { items: MysqlInspection[]; loading: boolean };

/**
 * "Pendências da semana": vistorias ainda em rascunho/andamento criadas nos
 * últimos 7 dias (ver isPendingThisWeek em inspection-dashboard.ts). Não é
 * um status novo no backend — é um recorte de data sobre dados reais.
 */
export function InspectionPendingCard({ items, loading }: InspectionPendingCardProps) {
  return (
    <aside aria-labelledby="inspection-pending-title" className="rounded-lg border border-border bg-card p-4">
      <h2 id="inspection-pending-title" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Pendências da semana
      </h2>
      {loading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-md bg-muted/40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Nenhuma pendência nos últimos 7 dias.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((inspection) => (
            <li key={inspection.id}>
              <Link
                to="/app/vistorias/$inspectionId"
                params={{ inspectionId: inspection.id }}
                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2 text-sm hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <span className="truncate">{inspection.property?.code || "Imóvel"} — {inspection.property?.title || "vistoria"}</span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                  {inspectionStatusLabels[inspection.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
