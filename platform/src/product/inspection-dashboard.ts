import type { MysqlInspection, MysqlInspectionStatus } from "./inspections";

/** Rótulos compartilhados de status/tipo de vistoria — fonte única para o
 * Home e para a lista/detalhe, evitando mapas duplicados divergindo. */
export const inspectionStatusLabels: Record<MysqlInspectionStatus, string> = {
  draft: "Rascunho",
  in_progress: "Em andamento",
  completed: "Concluída",
  archived: "Arquivada",
};

export const inspectionTypeLabels = { entry: "Entrada", exit: "Saída" } as const;

export type InspectionStatusCounts = Partial<Record<MysqlInspectionStatus, number>>;

export type InspectionKpiAvailability = "real" | "pending_backend";

export type InspectionKpiCard = {
  key: string;
  label: string;
  /** null quando o dado ainda não existe de verdade no backend — nunca um
   * número inventado. */
  value: number | null;
  availability: InspectionKpiAvailability;
  helper: string;
};

/**
 * Monta os 4 KPIs do Home a partir das contagens reais por status
 * (MysqlInspectionStatus). "Aguardando assinatura" NÃO existe como status
 * persistido no modelo canônico hoje — a assinatura eletrônica online real
 * (fora o fluxo legado Supabase, desconectado deste módulo) ainda não foi
 * integrada, então o card fica visualmente preparado com value=null em vez
 * de fingir um número.
 */
export function buildInspectionKpis(counts: InspectionStatusCounts): InspectionKpiCard[] {
  return [
    {
      key: "in_progress",
      label: "Vistorias em andamento",
      value: counts.in_progress ?? 0,
      availability: "real",
      helper: "Status real: em andamento",
    },
    {
      key: "draft",
      label: "Rascunhos",
      value: counts.draft ?? 0,
      availability: "real",
      helper: "Status real: rascunho",
    },
    {
      key: "awaiting_signature",
      label: "Aguardando assinatura",
      value: null,
      availability: "pending_backend",
      helper: "Assinatura online ainda não integrada ao fluxo canônico",
    },
    {
      key: "completed",
      label: "Vistorias concluídas",
      value: counts.completed ?? 0,
      availability: "real",
      helper: "Status real: concluída",
    },
  ];
}

/** Vistoria ainda mutável (rascunho ou em andamento) — mesma regra usada no
 * detalhe (status !== completed && status !== archived), restrita aos dois
 * estados que fazem sentido em "continuar". */
export function isContinuableInspection(inspection: Pick<MysqlInspection, "status">) {
  return inspection.status === "draft" || inspection.status === "in_progress";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Não existe um conceito de "pendência" persistido no backend hoje. Para não
 * inventar regra de negócio nova, "pendência da semana" é definida apenas
 * por dados reais e objetivos: vistoria mutável (rascunho/em andamento)
 * criada nos últimos 7 dias. É um recorte de data sobre dados reais, não um
 * status novo.
 */
export function isPendingThisWeek(
  inspection: Pick<MysqlInspection, "status" | "created_at">,
  now: Date = new Date(),
) {
  if (!isContinuableInspection(inspection)) return false;
  return now.getTime() - new Date(inspection.created_at).getTime() <= 7 * DAY_MS;
}

export function sortByRecentUpdate(rows: readonly MysqlInspection[]) {
  return [...rows].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}
