import { useCallback, useEffect, useRef, useState } from "react";
import { listMysqlInspections, type MysqlInspection, type MysqlInspectionStatus } from "@/product/inspections";
import { getProperty } from "@/product/real-estate";
import {
  buildInspectionKpis,
  isContinuableInspection,
  isPendingThisWeek,
  sortByRecentUpdate,
  type InspectionKpiCard,
  type InspectionStatusCounts,
} from "@/product/inspection-dashboard";

const STATUSES: MysqlInspectionStatus[] = ["draft", "in_progress", "completed", "archived"];
// Página única e razoavelmente grande para alimentar "continuar", "recentes"
// e "pendências" com UMA requisição de lista, em vez de uma por seção. As
// contagens dos KPIs continuam exatas mesmo acima deste limite porque usam
// `pagination.total` de 4 chamadas dedicadas (page_size=1), não esta lista.
const RECENT_LIST_PAGE_SIZE = 50;
const MAX_PHOTO_LOOKUPS = 8;

export type InspectionDashboardData = {
  loading: boolean;
  error: string | null;
  kpis: InspectionKpiCard[];
  totalInspections: number;
  continueItems: MysqlInspection[];
  recentItems: MysqlInspection[];
  pendingItems: MysqlInspection[];
  /** property_id -> URL da foto de capa (ou null se o imóvel não tem foto). */
  propertyPhotoByPropertyId: Record<string, string | null>;
  refresh: () => Promise<void>;
};

/**
 * Carrega os dados reais do Home de Vistorias. Reaproveita a mesma listagem
 * canônica (`listMysqlInspections`) em uma única chamada de página para
 * "continuar", "recentes" e "pendências" — nada de 1 fetch por seção. As
 * fotos de capa dos imóveis usados em "Continuar vistorias" são buscadas uma
 * única vez por property_id e guardadas em um cache local (ref) que
 * sobrevive a re-renders e a chamadas de refresh(), então a mesma foto nunca
 * é buscada duas vezes nesta sessão da página.
 */
export function useInspectionDashboard(enabled: boolean): InspectionDashboardData {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MysqlInspection[]>([]);
  const [counts, setCounts] = useState<InspectionStatusCounts>({});
  // Incrementado só para forçar um re-render depois que o cache de fotos (um
  // ref, que não dispara render por si só) ganha entradas novas.
  const [, setPhotoCacheVersion] = useState(0);
  const photoCacheRef = useRef<Map<string, string | null>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [countEntries, listResult] = await Promise.all([
        Promise.all(
          STATUSES.map((status) =>
            listMysqlInspections(1, 1, status).then((page) => [status, page.pagination.total] as const),
          ),
        ),
        listMysqlInspections(1, RECENT_LIST_PAGE_SIZE),
      ]);
      setCounts(Object.fromEntries(countEntries));
      setRows(listResult.inspections);

      const continuable = sortByRecentUpdate(listResult.inspections.filter(isContinuableInspection));
      const photoTargets = Array.from(
        new Set(continuable.slice(0, MAX_PHOTO_LOOKUPS).map((item) => item.property_id)),
      ).filter((id) => !photoCacheRef.current.has(id));

      if (photoTargets.length > 0) {
        const fetched = await Promise.all(
          photoTargets.map(async (propertyId) => {
            try {
              const { property } = await getProperty(propertyId);
              const media = property.property_media ?? [];
              const cover = media.find((item) => item.is_cover) ?? media[0] ?? null;
              return [propertyId, cover?.url ?? null] as const;
            } catch {
              // Falha ao buscar a foto não deve quebrar o Home — o card
              // aparece sem foto.
              return [propertyId, null] as const;
            }
          }),
        );
        for (const [propertyId, url] of fetched) photoCacheRef.current.set(propertyId, url);
        setPhotoCacheVersion((version) => version + 1);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Não foi possível carregar o painel de vistorias.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const continuable = sortByRecentUpdate(rows.filter(isContinuableInspection));

  return {
    loading,
    error,
    kpis: buildInspectionKpis(counts),
    totalInspections: rows.length,
    continueItems: continuable.slice(0, 6),
    recentItems: sortByRecentUpdate(rows).slice(0, 8),
    pendingItems: continuable.filter((item) => isPendingThisWeek(item)).slice(0, 6),
    propertyPhotoByPropertyId: Object.fromEntries(photoCacheRef.current),
    refresh: load,
  };
}
