import { createHash, randomBytes } from "node:crypto";

/**
 * Assinatura Online (Bloco 5) — domínio novo, em paralelo ao mecanismo
 * interno/presencial simples já existente (POST /:id/signatures em
 * inspections-mysql.ts, que continua intocado). Usa os modelos
 * InspectionSigningProcess/Party/Event já migrados
 * (20261023010000_f5c_inspection_signing_domain) — nenhuma migration nova
 * aqui.
 *
 * Este arquivo é puro: nenhuma função toca Prisma/storage/rede. A rota
 * (inspection-signing.ts) busca os dados e chama estas funções, o que as
 * torna testáveis isoladamente — mesmo padrão de inspection-f5f.ts e
 * inspection-report-pdf.ts.
 */

export const SIGNING_PARTY_ROLES = ["owner", "tenant_buyer", "responsible", "witness"] as const;
export type SigningPartyRole = (typeof SIGNING_PARTY_ROLES)[number];

export const SIGNING_PARTY_ROLE_LABELS: Record<SigningPartyRole, string> = {
  owner: "Proprietário",
  tenant_buyer: "Locatário/Comprador",
  responsible: "Responsável",
  witness: "Testemunha",
};

export const SIGNING_PARTY_STATUSES = ["pending", "signed", "expired", "revoked"] as const;
export type SigningPartyStatus = (typeof SIGNING_PARTY_STATUSES)[number];

export const SIGNING_PARTY_STATUS_LABELS: Record<SigningPartyStatus, string> = {
  pending: "Aguardando assinatura",
  signed: "Assinado",
  expired: "Expirado",
  revoked: "Revogado",
};

export const SIGNING_PROCESS_STATUSES = ["pending", "partially_signed", "completed", "expired", "cancelled"] as const;
export type SigningProcessStatus = (typeof SIGNING_PROCESS_STATUSES)[number];

export const SIGNING_METHODS = ["drawn", "typed"] as const;
export type SigningMethod = (typeof SIGNING_METHODS)[number];

// Texto EXATO exigido pelo usuário para o consentimento obrigatório — nunca
// reescrever; mudar a redação é uma decisão de produto, não de
// implementação.
export const SIGNING_CONSENT_TEXT =
  "Declaro que li o laudo apresentado e concordo em registrar minha assinatura eletrônica neste documento.";

// Token público opaco. Nunca o plaintext é persistido — só o hash SHA-256
// (hashSigningToken), igual ao padrão já usado em todo o projeto
// (hashOpaqueToken em mysql-auth.ts) para reset de senha, convite, portal de
// contrato etc. O token em si é gerado aqui (não reaproveita
// hashOpaqueToken) só para manter este módulo sem depender de
// mysql-auth.ts — o algoritmo (sha256 hex) é idêntico de propósito.
export function generateSigningToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSigningToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function signingTokenExpiry(now = new Date(), days = 7) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export function hashDocument(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isSigningPartyRole(value: unknown): value is SigningPartyRole {
  return typeof value === "string" && (SIGNING_PARTY_ROLES as readonly string[]).includes(value);
}

/**
 * Papel exige Party existente? Não — nenhum papel exige Party (mesmo
 * proprietário/locatário podem ser cadastrados só com os dados do
 * snapshot, ex.: durante onboarding antes de a Party canônica existir).
 * "witness" é o único papel para o qual isso é uma garantia explícita do
 * requisito ("Testemunha pode existir sem Party") — os demais simplesmente
 * reaproveitam Party QUANDO uma é informada.
 */
export function requiresPartyLink(_role: SigningPartyRole): boolean {
  return false;
}

/**
 * Um signatário está "ativo" para fins de completude do processo quando não
 * foi revogado. "expired"/"pending" ainda contam como pendentes — só
 * "revoked" remove o signatário do cálculo (decisão operacional: revogar um
 * signatário é a forma de um admin seguir adiante sem aquela assinatura,
 * ex.: testemunha que não está mais disponível).
 */
export function isActiveSigningParty(status: SigningPartyStatus): boolean {
  return status !== "revoked";
}

/**
 * Deriva o status do PROCESSO a partir do status de cada signatário. Nunca
 * lido/escrito diretamente como "completed" por uma rota — sempre
 * recalculado aqui para garantir que a mesma regra vale em toda transição
 * (assinatura via token público, assinatura presencial, revogação).
 *
 * - Nenhum signatário ativo (todos revogados) -> mantém o status atual
 *   (nunca conclui/cancela sozinho; cancelamento é uma ação explícita).
 * - Todos os signatários ativos assinados -> completed.
 * - Pelo menos um assinado e pelo menos um ainda não -> partially_signed.
 * - Nenhum assinado ainda -> pending.
 *
 * Processos já cancelled/expired nunca são recalculados por esta função —
 * esses são estados terminais explícitos (ver cancelSigningProcess).
 */
export function computeSigningProcessStatus(
  currentStatus: SigningProcessStatus,
  parties: Array<{ status: SigningPartyStatus }>,
): SigningProcessStatus {
  if (currentStatus === "cancelled" || currentStatus === "expired") return currentStatus;
  const active = parties.filter((party) => isActiveSigningParty(party.status));
  if (active.length === 0) return currentStatus;
  const signedCount = active.filter((party) => party.status === "signed").length;
  if (signedCount === active.length) return "completed";
  if (signedCount > 0) return "partially_signed";
  return "pending";
}

export function signingProgressLabel(parties: Array<{ status: SigningPartyStatus }>): string {
  const active = parties.filter((party) => isActiveSigningParty(party.status));
  const signed = active.filter((party) => party.status === "signed").length;
  if (active.length > 0 && signed === active.length) return "Concluído";
  return `${signed} de ${active.length}`;
}

export type SigningSnapshotInput = {
  role: SigningPartyRole;
  name: string;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  partyId?: string | null;
};

/**
 * Normaliza os dados de um signatário no momento da criação do processo —
 * sempre um SNAPSHOT (nunca uma referência viva a Party para exibição;
 * Party pode mudar depois sem reescrever retroativamente um processo já em
 * andamento ou concluído).
 */
export function buildSigningPartySnapshot(input: SigningSnapshotInput) {
  return {
    role: input.role,
    partyId: input.partyId ?? null,
    signerNameSnapshot: input.name.trim(),
    signerDocumentSnapshot: input.document?.trim() || null,
    signerEmailSnapshot: input.email?.trim().toLowerCase() || null,
    signerPhoneSnapshot: input.phone?.trim() || null,
  };
}
