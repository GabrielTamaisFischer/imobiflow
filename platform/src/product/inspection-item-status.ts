import type { MysqlInspectionCondition } from "./inspections";

/**
 * SUB-BLOCO 3 — camada de apresentação UI → domínio para o status do item.
 *
 * O domínio real (backend, MysqlInspectionCondition) tem 7 valores:
 * not_inspected, excellent, good, fair, poor, damaged, not_applicable.
 * A tela aprovada (referência visual) usa só 4 botões: Bom, Atenção, Avaria,
 * Não se aplica. Em vez de uma migration (proibida nesta etapa) ou de
 * inventar um valor novo, os 4 botões escrevem direto em 4 dos 7 valores já
 * suportados hoje — nunca um valor fora do enum real:
 *
 *   Bom          → "good"
 *   Atenção      → "fair"
 *   Avaria       → "damaged"
 *   Não se aplica→ "not_applicable"
 *
 * "excellent" e "poor" continuam valores válidos no domínio (histórico, ou
 * gravados por outra tela), mas os 4 botões novos nunca os escrevem — só os
 * leem, mapeando para o botão mais próximo por severidade só para destacar
 * visualmente qual botão corresponde ao valor já salvo:
 *   excellent → aparece destacado como "Bom" (está acima de "good")
 *   poor      → aparece destacado como "Atenção" (está entre "fair" e "damaged")
 *   not_inspected → nenhum botão destacado (ainda não revisado)
 *
 * Isto é uma aproximação de leitura documentada, não uma gravação de valor
 * inválido: o clique em qualquer botão grava sempre um dos 4 valores do
 * domínio listados acima.
 */
export type InspectionItemStatusKey = "good" | "attention" | "damaged" | "not_applicable";

export const INSPECTION_ITEM_STATUSES: ReadonlyArray<{
  key: InspectionItemStatusKey;
  label: string;
  domainValue: MysqlInspectionCondition;
}> = [
  { key: "good", label: "Bom", domainValue: "good" },
  { key: "attention", label: "Atenção", domainValue: "fair" },
  { key: "damaged", label: "Avaria", domainValue: "damaged" },
  { key: "not_applicable", label: "Não se aplica", domainValue: "not_applicable" },
];

const DOMAIN_TO_DISPLAY_KEY: Record<MysqlInspectionCondition, InspectionItemStatusKey | null> = {
  not_inspected: null,
  excellent: "good",
  good: "good",
  fair: "attention",
  poor: "attention",
  damaged: "damaged",
  not_applicable: "not_applicable",
};

/** Qual dos 4 botões (se algum) deve aparecer selecionado para um condition já salvo. */
export function displayStatusKeyFor(condition: MysqlInspectionCondition): InspectionItemStatusKey | null {
  return DOMAIN_TO_DISPLAY_KEY[condition];
}

export function domainValueForStatusKey(key: InspectionItemStatusKey): MysqlInspectionCondition {
  return INSPECTION_ITEM_STATUSES.find((status) => status.key === key)!.domainValue;
}

/**
 * Regra de "revisado" (diretriz do Sub-bloco 3): item revisado = condition
 * preenchido (qualquer valor diferente de not_inspected). Observação e foto
 * NÃO são exigidas — regra determinística e sem exceção.
 */
export function isItemReviewed(condition: MysqlInspectionCondition): boolean {
  return condition !== "not_inspected";
}
