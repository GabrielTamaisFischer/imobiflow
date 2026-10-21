import {
  clearInspectionOfflineScope,
  getInspectionOfflinePendingSummary,
  getInspectionOfflineScope,
  type InspectionOfflinePendingSummary,
} from "./inspection-offline";

export function describeOfflinePending(summary: InspectionOfflinePendingSummary) {
  const parts = [
    summary.mutations ? `${summary.mutations} edição(ões)` : null,
    summary.evidence ? `${summary.evidence} foto(s)` : null,
    summary.conflicts ? `${summary.conflicts} conflito(s) não resolvido(s)` : null,
  ].filter(Boolean);
  return (
    `Há dados de vistoria salvos neste aparelho que ainda não chegaram ao servidor: ${parts.join(", ")}.\n\n` +
    "Se sair agora, esses dados serão apagados deste aparelho e não poderão ser recuperados.\n\n" +
    "Clique em Cancelar para continuar conectado e sincronizar quando houver internet, ou em OK para sair e apagar."
  );
}

/**
 * Executar ANTES de logout(): o escopo offline (empresa+usuário) vem do token.
 * - Sem pendências: limpa os dados offline deste escopo e libera o logout.
 * - Com pendências: avisa e só apaga se o usuário confirmar; cancelar mantém
 *   a sessão e os dados.
 * Dados de outra empresa/usuário nunca ficam visíveis: toda leitura offline é
 * filtrada pelo escopo do token atual.
 */
export async function confirmLogoutWithOfflineData(
  confirmFn: (message: string) => boolean = (message) => window.confirm(message),
  deps: {
    getScope?: typeof getInspectionOfflineScope;
    getSummary?: typeof getInspectionOfflinePendingSummary;
    clearScope?: typeof clearInspectionOfflineScope;
  } = {},
): Promise<boolean> {
  const scope = (deps.getScope ?? getInspectionOfflineScope)();
  if (!scope) return true;
  const getSummary = deps.getSummary ?? getInspectionOfflinePendingSummary;
  const clearScope = deps.clearScope ?? clearInspectionOfflineScope;
  let summary: InspectionOfflinePendingSummary;
  try {
    summary = await getSummary(scope);
  } catch {
    // Não dá para garantir que não há pendências: pergunta em vez de apagar.
    if (
      !confirmFn(
        "Não foi possível verificar se há vistorias pendentes de sincronização neste aparelho. Deseja sair mesmo assim? Dados offline deste usuário serão apagados.",
      )
    )
      return false;
    await clearScope(scope).catch(() => undefined);
    return true;
  }
  if (summary.total > 0 && !confirmFn(describeOfflinePending(summary))) return false;
  // Falha ao apagar não bloqueia o logout: o que sobrar continua isolado pelo
  // escopo empresa+usuário e só reaparece para o mesmo usuário.
  await clearScope(scope).catch(() => undefined);
  return true;
}
