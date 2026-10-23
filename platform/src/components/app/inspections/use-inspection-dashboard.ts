import { useCallback, useEffect, useState } from "react";
import { listMysqlInspections, type MysqlInspectionStatus } from "@/product/inspections";
import { buildInspectionKpis, isPendingThisWeek, type InspectionKpiCard, type InspectionStatusCounts } from "@/product/inspection-dashboard";

const STATUSES: MysqlInspectionStatus[] = ["draft", "in_progress", "completed", "archived"];
// Página única e razoavelmente grande só para estimar o KPI de "Pendências"
// (vistoria mutável criada nos últimos 7 dias) sem precisar de uma rota
// dedicada de contagem - é uma aproximação sobre uma janela recente, documentada
// aqui e em isPendingThisWeek, não um status novo persistido no backend.
const PENDING_WINDOW_PAGE_SIZE = 50;

export type InspectionDashboardData = {
  loading: boolean;
  error: string | null;
  kpis: InspectionKpiCard[];
  refresh: () => Promise<void>;
};

/**
 * Carrega só os KPIs do topo de /app/vistorias (contagens reais por status +
 * a aproximação de "pendências da semana"). A listagem em si (busca, filtros,
 * paginação) é responsabilidade da própria página, que fala direto com
 * listMysqlInspections - não duplicamos essa busca aqui.
 */
export function useInspectionDashboard(enabled: boolean): InspectionDashboardData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<InspectionStatusCounts>({});
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [countEntries, recentWindow] = await Promise.all([
        Promise.all(STATUSES.map((status) => listMysqlInspections(1, 1, status).then((page) => [status, page.pagination.total] as const))),
        listMysqlInspections(1, PENDING_WINDOW_PAGE_SIZE),
      ]);
      setCounts(Object.fromEntries(countEntries));
      setPendingCount(recentWindow.inspections.filter((item) => isPendingThisWeek(item)).length);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os indicadores de vistorias.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return { loading, error, kpis: buildInspectionKpis(counts, pendingCount), refresh: load };
}
