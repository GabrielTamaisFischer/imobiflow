import { isNetworkUnavailableError } from "./api";
import type { AccessResponse } from "./auth";

/**
 * Cache da última sessão validada pelo servidor, usado SOMENTE quando a
 * validação falha por falta de rede (vistoria offline). Nunca guarda tokens:
 * só o bloco `access` já exibido ao usuário, amarrado a usuário + empresa do
 * token atual. O servidor continua autoritativo: toda chamada de API segue
 * exigindo o token, e a fila offline só sincroniza quando ele volta a valer.
 */
const OFFLINE_SESSION_KEY = "imobiflow.offline_session";
export const OFFLINE_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type TokenScope = { companyId: string; userId: string };

type CachedSession = {
  userId: string;
  companyId: string;
  savedAt: string;
  access: AccessResponse["access"];
};

export function decodeTokenScope(token: string | null): TokenScope | null {
  if (!token) return null;
  try {
    const encoded = token.split(".")[1];
    if (!encoded) return null;
    const normalized = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const claims = JSON.parse(atob(normalized)) as Record<string, unknown>;
    return typeof claims.company_id === "string" && typeof claims.sub === "string"
      ? { companyId: claims.company_id, userId: claims.sub }
      : null;
  } catch {
    return null;
  }
}

function storage() {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function saveOfflineSessionCache(session: AccessResponse, token: string | null) {
  const scope = decodeTokenScope(token);
  const userId = session.access.appUser?.id;
  const companyId = session.access.company?.id;
  // Só guarda quando a sessão bate com o token (evita cache cruzado entre tenants).
  if (!scope || !userId || !companyId || scope.userId !== userId || scope.companyId !== companyId)
    return;
  const cached: CachedSession = {
    userId,
    companyId,
    savedAt: new Date().toISOString(),
    access: session.access,
  };
  try {
    storage()?.setItem(OFFLINE_SESSION_KEY, JSON.stringify(cached));
  } catch {
    /* quota/bloqueio: o modo offline apenas fica indisponível */
  }
}

export function readOfflineSessionCache(
  token: string | null,
  now = Date.now(),
): AccessResponse | null {
  const scope = decodeTokenScope(token);
  if (!scope) return null;
  let cached: CachedSession | null = null;
  try {
    const raw = storage()?.getItem(OFFLINE_SESSION_KEY);
    cached = raw ? (JSON.parse(raw) as CachedSession) : null;
  } catch {
    return null;
  }
  if (!cached || cached.userId !== scope.userId || cached.companyId !== scope.companyId)
    return null;
  const savedAt = Date.parse(cached.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > OFFLINE_SESSION_MAX_AGE_MS) return null;
  return { access: cached.access };
}

export function clearOfflineSessionCache() {
  try {
    storage()?.removeItem(OFFLINE_SESSION_KEY);
  } catch {
    /* nada a limpar */
  }
}

export function isConnectivityFailure(error: unknown, navigatorOnline: boolean | undefined) {
  const status = (error as { status?: number } | null)?.status;
  return (
    navigatorOnline === false ||
    isNetworkUnavailableError(error) ||
    (typeof status === "number" && status >= 500)
  );
}

export type SessionFailureDecision =
  { kind: "offline"; session: AccessResponse } | { kind: "login"; clearToken: boolean };

/**
 * Decide o que fazer quando a validação de sessão lança erro.
 * - Sem rede / servidor indisponível: usa a sessão em cache do MESMO
 *   usuário+empresa; sem cache, manda ao login SEM apagar o token (a fila
 *   offline continua acessível quando a rede voltar).
 * - Demais erros (401/403/4xx): comportamento anterior — limpa e volta ao login.
 */
export function resolveSessionFailure(
  error: unknown,
  token: string | null,
  options: { navigatorOnline?: boolean; now?: number } = {},
): SessionFailureDecision {
  if (isConnectivityFailure(error, options.navigatorOnline)) {
    const cached = readOfflineSessionCache(token, options.now);
    return cached ? { kind: "offline", session: cached } : { kind: "login", clearToken: false };
  }
  return { kind: "login", clearToken: true };
}
