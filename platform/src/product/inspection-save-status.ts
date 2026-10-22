/**
 * SUB-BLOCO 3 (ajuste) — indicador de estado de salvamento.
 *
 * Deriva UM estado visível a partir de sinais que o domínio já consegue
 * detectar hoje (offline/pending/conflicts/syncing — inspection-offline.ts
 * — mais "saving"/"justSaved", que são apenas o rastreamento local, nesta
 * tela, de uma mutação em voo). Nunca inventa um estado que o domínio não
 * detecta, e nunca mostra "Salvo"/"Sincronizado" enquanto houver fila
 * pendente ou conflito em aberto.
 *
 * Mapeamento para os 7 estados pedidos:
 *   - "Conflito"           → conflicts > 0 (prioridade máxima).
 *   - "Salvando..."        → uma mutação desta tela está em voo.
 *   - "Sincronizando..."   → sincronização da fila offline em andamento,
 *                            OU uma mutação ficou pendente enquanto online
 *                            (ver nota abaixo — não há hoje um sinal que
 *                            distinga essa janela transitória de uma
 *                            sincronização já em curso).
 *   - "Aguardando internet"→ offline COM alterações pendentes de
 *                            sincronizar (já salvo neste dispositivo, só
 *                            falta a conexão voltar).
 *   - "Salvo neste dispositivo" → offline SEM nada pendente ainda.
 *   - "Salvo"               → confirmação transitória após uma mutação
 *                            bem-sucedida (enquanto online, sem fila).
 *   - "Sincronizado"        → estado de repouso: online, sem fila, sem
 *                            conflito, sem mutação em voo.
 */
export type InspectionSaveStatusKey =
  | "saving"
  | "saved"
  | "saved_locally"
  | "awaiting_connection"
  | "syncing"
  | "synced"
  | "conflict";

export type InspectionSaveStatusInput = {
  /** Uma mutação desta tela (responsável/observações/status/ambiente/item) está em voo agora. */
  saving: boolean;
  /** Confirmação transitória: a última mutação terminou com sucesso há pouco. */
  justSaved: boolean;
  /** navigator.onLine === false (inspection-offline.ts: isOfflineRuntime()). */
  offline: boolean;
  /** Mutações na fila offline ainda não sincronizadas (pending/syncing/failed). */
  pending: number;
  /** Mutações na fila offline em conflito de versão. */
  conflicts: number;
  /** Sincronização da fila offline em andamento agora (syncMysqlInspectionOfflineQueue). */
  syncing: boolean;
};

export const INSPECTION_SAVE_STATUS_LABELS: Record<InspectionSaveStatusKey, string> = {
  saving: "Salvando...",
  saved: "Salvo",
  saved_locally: "Salvo neste dispositivo",
  awaiting_connection: "Aguardando internet",
  syncing: "Sincronizando...",
  synced: "Sincronizado",
  conflict: "Conflito",
};

export function resolveInspectionSaveStatus(input: InspectionSaveStatusInput): InspectionSaveStatusKey {
  if (input.conflicts > 0) return "conflict";
  if (input.saving) return "saving";
  if (input.syncing) return "syncing";
  if (input.offline) return input.pending > 0 ? "awaiting_connection" : "saved_locally";
  if (input.pending > 0) return "syncing";
  if (input.justSaved) return "saved";
  return "synced";
}
