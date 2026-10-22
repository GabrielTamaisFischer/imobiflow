import type { MysqlInspection } from "@/product/inspections";
import { inspectionStatusLabels } from "@/product/inspection-dashboard";

type Props = { status: MysqlInspection["status"] };

/**
 * SUB-BLOCO 4 — deixa claro, sem ambiguidade, quando a vistoria não está
 * mais em andamento. Não cria um botão de "desarquivar": não existe essa
 * regra hoje (backend não expõe transição archived → outro status).
 */
export function InspectionStatusBanner({ status }: Props) {
  if (status === "completed") {
    return (
      <div role="status" className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm">
        <p className="font-semibold text-emerald-800">Vistoria concluída</p>
        <p className="mt-1 text-emerald-800/80">
          Os ambientes e itens não podem mais ser alterados. Use as ações abaixo (laudo, comparação, ou editar/arquivar para cargos administrativos).
        </p>
      </div>
    );
  }
  if (status === "archived") {
    return (
      <div role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
        <p className="font-semibold">Vistoria arquivada</p>
        <p className="mt-1 text-muted-foreground">
          Modo somente leitura: {inspectionStatusLabels.archived.toLowerCase()} não aceita novas alterações operacionais.
        </p>
      </div>
    );
  }
  return null;
}
