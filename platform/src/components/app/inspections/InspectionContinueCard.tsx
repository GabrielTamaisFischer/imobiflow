import { Link } from "@tanstack/react-router";
import { ImageOff } from "lucide-react";
import type { MysqlInspection } from "@/product/inspections";
import { inspectionStatusLabels, inspectionTypeLabels } from "@/product/inspection-dashboard";

type InspectionContinueCardProps = {
  items: MysqlInspection[];
  photoByPropertyId: Record<string, string | null>;
  loading: boolean;
};

/** Vistorias em rascunho/andamento — a pessoa continua de onde parou. */
export function InspectionContinueCard({ items, photoByPropertyId, loading }: InspectionContinueCardProps) {
  return (
    <section aria-labelledby="inspection-continue-title" className="rounded-lg border border-border bg-card p-4">
      <h2 id="inspection-continue-title" className="text-sm font-semibold text-muted-foreground">
        Continuar vistorias
      </h2>
      {loading ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-md border border-border/60 bg-muted/40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Você não possui vistorias em andamento.</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((inspection) => {
            const photo = photoByPropertyId[inspection.property_id];
            const totalItems = inspection.rooms.reduce((sum, room) => sum + room.items.length, 0);
            const reviewedItems = inspection.rooms.reduce(
              (sum, room) => sum + room.items.filter((item) => item.condition !== "not_inspected").length,
              0,
            );
            return (
              <li key={inspection.id}>
                <Link
                  to="/app/vistorias/$inspectionId"
                  params={{ inspectionId: inspection.id }}
                  className="flex h-full flex-col overflow-hidden rounded-md border border-border transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div className="flex h-20 items-center justify-center bg-muted/60">
                    {photo ? (
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex-1 p-3">
                    <p className="text-sm font-semibold">{inspection.property?.code || "Imóvel"}</p>
                    <p className="truncate text-xs text-muted-foreground">{inspection.property?.title || "Imóvel vinculado"}</p>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{inspectionStatusLabels[inspection.status]}</span>
                      <span className="text-muted-foreground">{inspectionTypeLabels[inspection.type]}</span>
                    </div>
                    {totalItems > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">{reviewedItems} de {totalItems} itens revisados</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
