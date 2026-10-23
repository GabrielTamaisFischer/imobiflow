import { API_URL, apiRequest } from "./api";
import { getStoredToken } from "./auth";

/**
 * Assinatura Online (Bloco 5) — cliente autenticado para
 * /real-estate/inspection-signing. Domínio novo, em paralelo ao mecanismo
 * interno/presencial simples já existente em inspections.ts
 * (createMysqlInspectionSignature/downloadMysqlInspectionReport), que
 * continua intocado.
 *
 * Sem modo preview/offline: assinatura online sempre exige conexão (o
 * processo, o token e o PDF final vivem no backend).
 */

function signingToken() {
  return getStoredToken() ?? undefined;
}

export const SIGNING_PARTY_ROLES = ["owner", "tenant_buyer", "responsible", "witness"] as const;
export type SigningPartyRole = (typeof SIGNING_PARTY_ROLES)[number];

export const SIGNING_PARTY_ROLE_LABELS: Record<SigningPartyRole, string> = {
  owner: "Proprietário",
  tenant_buyer: "Locatário/Comprador",
  responsible: "Responsável",
  witness: "Testemunha",
};

export type SigningPartyStatus = "pending" | "signed" | "expired" | "revoked";
export type SigningProcessStatus = "pending" | "partially_signed" | "completed" | "expired" | "cancelled";
export type SigningMethod = "drawn" | "typed";

export type SigningParty = {
  id: string;
  role: SigningPartyRole;
  role_label: string;
  party_id: string | null;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  status: SigningPartyStatus;
  signature_method: SigningMethod | null;
  has_active_link: boolean;
  token_expires_at: string | null;
  link_created_at: string | null;
  viewed_at: string | null;
  consented_at: string | null;
  signed_at: string | null;
  revoked_at: string | null;
  expired_at: string | null;
  /** Só vem preenchido na resposta de criação/regeneração do link — nunca é
   * lido de volta depois (só o hash é persistido no backend). */
  link_token?: string | null;
};

export type SigningProcess = {
  id: string;
  inspection_id: string;
  report_stored_file_id: string;
  document_hash: string;
  status: SigningProcessStatus;
  progress_label: string;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
  parties: SigningParty[];
};

export type SigningEvent = {
  id: string;
  event_type: string;
  party_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type SigningSignerInput = {
  role: SigningPartyRole;
  party_id?: string;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function createSigningProcess(
  inspectionId: string,
  signers: SigningSignerInput[],
  reportStoredFileId?: string,
) {
  return apiRequest<{ process: SigningProcess }>(
    `/real-estate/inspection-signing/inspections/${encodeURIComponent(inspectionId)}/processes`,
    {
      method: "POST",
      body: JSON.stringify({ signers, ...(reportStoredFileId ? { report_stored_file_id: reportStoredFileId } : {}) }),
      token: signingToken(),
    },
  );
}

export async function listSigningProcesses(inspectionId: string) {
  return apiRequest<{ processes: SigningProcess[] }>(
    `/real-estate/inspection-signing/inspections/${encodeURIComponent(inspectionId)}/processes`,
    { token: signingToken() },
  );
}

export async function getSigningProcess(processId: string) {
  return apiRequest<{ process: SigningProcess }>(`/real-estate/inspection-signing/processes/${encodeURIComponent(processId)}`, {
    token: signingToken(),
  });
}

export async function getSigningAudit(processId: string) {
  return apiRequest<{ events: SigningEvent[] }>(`/real-estate/inspection-signing/processes/${encodeURIComponent(processId)}/audit`, {
    token: signingToken(),
  });
}

export async function regenerateSigningLink(processId: string, partyId: string) {
  return apiRequest<{ link_token: string; token_expires_at: string }>(
    `/real-estate/inspection-signing/processes/${encodeURIComponent(processId)}/parties/${encodeURIComponent(partyId)}/link`,
    { method: "POST", token: signingToken() },
  );
}

export async function revokeSigningParty(processId: string, partyId: string) {
  return apiRequest<{ party: SigningParty }>(
    `/real-estate/inspection-signing/processes/${encodeURIComponent(processId)}/parties/${encodeURIComponent(partyId)}/revoke`,
    { method: "POST", token: signingToken() },
  );
}

export async function cancelSigningProcess(processId: string) {
  return apiRequest<{ process: SigningProcess }>(`/real-estate/inspection-signing/processes/${encodeURIComponent(processId)}/cancel`, {
    method: "POST",
    token: signingToken(),
  });
}

export async function signInPerson(
  processId: string,
  partyId: string,
  input: { method: SigningMethod; image_base64: string; typed_text?: string; typed_font_id?: string; consent: true },
) {
  return apiRequest<{ party: SigningParty }>(
    `/real-estate/inspection-signing/processes/${encodeURIComponent(processId)}/parties/${encodeURIComponent(partyId)}/sign-in-person`,
    { method: "POST", body: JSON.stringify(input), token: signingToken() },
  );
}

/**
 * Download autenticado do laudo assinado final — mesmo motivo de
 * downloadMysqlInspectionReport (inspections.ts) para não usar apiRequest:
 * a rota devolve bytes de PDF, não JSON.
 */
export async function downloadSignedInspectionReport(inspectionId: string) {
  const token = signingToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${API_URL}/real-estate/inspection-signing/inspections/${encodeURIComponent(inspectionId)}/signed-report/download`, {
      headers,
    });
  } catch {
    throw Object.assign(new Error("Não foi possível conectar para baixar o laudo assinado. Tente novamente."), {
      code: "NETWORK_UNAVAILABLE",
    });
  }
  if (!response.ok) {
    const message = await response.json().catch(() => null);
    throw new Error((message as { message?: string } | null)?.message ?? "Não foi possível baixar o laudo assinado.");
  }
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disposition);
  const fileName = match?.[1] ?? `laudo-assinado-${inspectionId}.pdf`;
  const blob = await response.blob();
  return { blob, fileName };
}
