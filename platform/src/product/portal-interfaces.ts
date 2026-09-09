import { apiRequest } from "./api";

export type PortalKind = "tenant" | "buyer";
export type PortalProperty = {
  id: string;
  code: string | null;
  title: string;
  city: string | null;
  state: string | null;
};
export type PortalDocument = {
  id: string;
  purpose: string;
  filename: string;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
  download_path: string | null;
};
export type PortalContract = {
  id: string;
  title: string;
  contract_type: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  current_version: number;
  signed_version: number | null;
  property: PortalProperty | null;
  party: Array<{
    id: string;
    type: string;
    name: string;
    signature_required: boolean;
    signature_status: string;
    signed_at: string | null;
  }>;
  signature: {
    pending: boolean;
    status: Array<{ id: string; status: string; signed_at: string | null }>;
  };
  latest_version: {
    id: string;
    version_number: number;
    status: string;
    document_hash: string | null;
  } | null;
  documents: PortalDocument[];
  history: Array<{ type: string; occurred_at: string | null }>;
};
export type PortalInspection = {
  id: string;
  property_id: string;
  type: string;
  status: string;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  rooms: Array<{
    id: string;
    name: string;
    position: number;
    notes: string | null;
    items: Array<{
      id: string;
      name: string;
      condition: string;
      position: number;
      notes: string | null;
    }>;
  }>;
  evidence: Array<{
    id: string;
    filename: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string | null;
  }>;
  history: Array<{ type: string; occurred_at: string | null }>;
};
export type TenantPortalAggregate = {
  portal: "tenant";
  identity: { name: string; email: string | null; party_type: "tenant" };
  properties: PortalProperty[];
  contracts: PortalContract[];
  inspections: PortalInspection[];
  payments: { available: boolean; reason?: string; next_due_dates: string[] };
  actions: { sign_contract: boolean; download_document: boolean; view_inspection: boolean };
};
export type BuyerPortalAggregate = {
  portal: "buyer";
  identity: { name: string; email: string | null; party_type: "buyer" };
  properties: PortalProperty[];
  commercial: Array<{
    id: string;
    name: string;
    status: string;
    stage: { id: string; name: string; position: number } | null;
    property_reference: string | null;
    properties: PortalProperty[];
  }>;
  proposals: { available: boolean; reason?: string };
  appointments: Array<{
    id: string;
    property: PortalProperty | null;
    starts_at: string | null;
    ends_at: string | null;
    status: string;
    type: string;
    broker_name: string | null;
  }>;
  contracts: PortalContract[];
  actions: { sign_contract: boolean; download_document: boolean };
};
export type PortalAggregate = TenantPortalAggregate | BuyerPortalAggregate;
export type PortalDocumentResponse = {
  document: {
    id: string;
    filename: string;
    mime_type: string;
    size_bytes: number | null;
    created_at: string;
    url: string | null;
  };
  version_id: string;
  document_hash: string | null;
};

export function portalApiPath(kind: PortalKind) {
  return `/portal/${kind}/me`;
}
export async function getPortalAggregate(kind: PortalKind, token: string) {
  return apiRequest<PortalAggregate>(portalApiPath(kind), { token });
}
export async function getPortalDocument(
  kind: PortalKind,
  token: string,
  contractId: string,
  versionId?: string,
) {
  const query = versionId ? `?version_id=${encodeURIComponent(versionId)}` : "";
  return apiRequest<PortalDocumentResponse>(
    `/portal/${kind}/contracts/${encodeURIComponent(contractId)}/document${query}`,
    { token },
  );
}
export async function signPortalContract(
  kind: PortalKind,
  token: string,
  contractId: string,
  input: { version_id: string; signer_name: string; signature_base64: string },
  idempotencyKey: string,
) {
  return apiRequest<{
    signature_id: string;
    contract_id: string;
    party_id: string;
    version_id: string;
    status: string;
    replayed?: boolean;
  }>(`/portal/${kind}/contracts/${encodeURIComponent(contractId)}/signatures`, {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ ...input, accepted_terms: true }),
    token,
  });
}
export function portalStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    generated: "Gerado",
    waiting_signature: "Aguardando assinatura",
    awaiting_signature: "Aguardando assinatura",
    partially_signed: "Parcialmente assinado",
    signed: "Assinado",
    active: "Ativo",
    cancelled: "Cancelado",
    terminated: "Encerrado",
    archived: "Arquivado",
    pending: "Pendente",
    confirmed: "Confirmado",
    completed: "Concluído",
    cancelled_by_user: "Cancelado",
  };
  return labels[status] ?? status.replaceAll("_", " ");
}
export function portalErrorMessage(error: unknown) {
  const value = error as { status?: number; message?: string } | null;
  if (value?.status === 401)
    return "Este link não é válido ou foi revogado. Solicite um novo acesso à imobiliária.";
  if (value?.status === 404) return "Este conteúdo não está disponível para este portal.";
  if (value?.status === 409)
    return "O documento foi atualizado em outra sessão. Atualize a página antes de tentar novamente.";
  if (value?.status === 422) return "Confira os dados informados e tente novamente.";
  return (
    value?.message || "Não foi possível carregar o portal agora. Tente novamente em instantes."
  );
}
export function portalDocumentView(document: PortalDocument) {
  return {
    name: document.filename || "Documento",
    mimeType: document.mime_type,
    date: document.created_at,
    sizeBytes: document.size_bytes,
  };
}
export function portalHistory(aggregate: PortalAggregate) {
  return aggregate.contracts
    .flatMap((contract) =>
      contract.history.map((event) => ({ ...event, contractTitle: contract.title })),
    )
    .sort((a, b) => String(a.occurred_at ?? "").localeCompare(String(b.occurred_at ?? "")));
}
