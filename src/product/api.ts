const configuredApiUrl = import.meta.env.VITE_IMOBIFLOW_API_URL?.trim();
export const API_URL = configuredApiUrl || (import.meta.env.DEV ? "http://localhost:3333" : "/api");
export const API_SETUP_MESSAGE =
  "O acesso antecipado ao produto SaaS está em ativação. A equipe ImobiFlow está conectando a área interna ao ambiente seguro de autenticação, empresa e assinatura.";

export type ApiError = {
  error: string;
  message: string;
  subscription?: {
    status?: string;
  };
};

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  if (isUnavailableProductionApi()) {
    throw new Error(API_SETUP_MESSAGE);
  }

  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Não foi possível conectar à área segura do ImobiFlow neste momento. Tente novamente em alguns instantes ou fale com a equipe de implantação.",
    );
  }

  const payload = (await response.json().catch(() => null)) as T | ApiError | null;

  if (!response.ok) {
    const error = payload as ApiError | null;
    throw Object.assign(new Error(error?.message ?? "Falha na solicitação."), {
      status: response.status,
      code: error?.error,
      payload: error,
    });
  }

  return payload as T;
}

export function isUnavailableProductionApi() {
  const isLocalApi = isLocalApiUrl(API_URL);

  if (typeof window === "undefined") {
    return import.meta.env.PROD && isLocalApi;
  }

  const isLocalApp = ["localhost", "127.0.0.1"].includes(window.location.hostname);

  return !isLocalApp && isLocalApi;
}

export function isLocalApiUrl(url: string) {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

export function getConfiguredApiUrl() {
  if (typeof window === "undefined") {
    return import.meta.env.PROD && isLocalApiUrl(API_URL) ? null : API_URL;
  }

  const isLocalApp = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (!isLocalApp && isLocalApiUrl(API_URL)) return null;

  return API_URL;
}
