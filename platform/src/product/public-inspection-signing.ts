import { API_URL } from "./api";

/**
 * Assinatura Online (Bloco 5) — cliente PÚBLICO (sem autenticação) para
 * /public/inspection-signing/:token. Domínio novo, em paralelo à página e ao
 * cliente legados (assinar-vistoria.$token.tsx / public-inspection-
 * signatures.ts), que continuam intocados e servem o mecanismo antigo
 * (Supabase). Esta página nunca reaproveita esses módulos.
 *
 * Toda falha do backend aqui é um 404 neutro — nunca diferencia token
 * inexistente / expirado / revogado / processo cancelado. O cliente só
 * repassa essa mensagem genérica, nunca tenta adivinhar o motivo.
 */

const NEUTRAL_NOT_FOUND_MESSAGE = "Este link de assinatura não está mais disponível. Solicite um novo link à imobiliária.";

export type PublicSigningView = {
  company: { name: string };
  property: { code: string | null; title: string; street: string | null; neighborhood: string | null; city: string | null } | null;
  inspection: { type: "entry" | "exit"; completed_at: string | null };
  signer: { name: string; role: string; role_label: string };
  already_signed: boolean;
  signed_at: string | null;
  consent_text: string;
};

async function parsePublicJson<T>(response: Response): Promise<T> {
  if (response.status === 404) {
    throw Object.assign(new Error(NEUTRAL_NOT_FOUND_MESSAGE), { code: "SIGNING_TOKEN_NOT_FOUND" });
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error((payload as { message?: string } | null)?.message ?? "Não foi possível completar a solicitação."), {
      code: (payload as { error?: string } | null)?.error,
      payload,
    });
  }
  return payload as T;
}

function networkError(): never {
  throw Object.assign(new Error("Não foi possível conectar. Verifique sua internet e tente novamente."), {
    code: "NETWORK_UNAVAILABLE",
  });
}

export async function getPublicSigningView(token: string) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/public/inspection-signing/${encodeURIComponent(token)}`);
  } catch {
    networkError();
  }
  return parsePublicJson<PublicSigningView>(response);
}

/** Bytes do laudo original, para exibir antes de assinar. */
export async function getPublicSigningDocumentBlob(token: string) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/public/inspection-signing/${encodeURIComponent(token)}/document`);
  } catch {
    networkError();
  }
  if (response.status === 404) {
    throw Object.assign(new Error(NEUTRAL_NOT_FOUND_MESSAGE), { code: "SIGNING_TOKEN_NOT_FOUND" });
  }
  if (!response.ok) {
    throw new Error("Não foi possível carregar o laudo.");
  }
  return response.blob();
}

export async function signPublicSigning(
  token: string,
  input: { method: "drawn" | "typed"; image_base64: string; typed_text?: string; typed_font_id?: string; consent: true },
) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/public/inspection-signing/${encodeURIComponent(token)}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    networkError();
  }
  return parsePublicJson<{ already_signed: true; signed_at: string }>(response);
}
