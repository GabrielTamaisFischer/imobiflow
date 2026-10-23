import type { SigningParty, SigningPartyStatus, SigningProcess, SigningProcessStatus } from "./inspection-signing";

/**
 * Helpers puros de UI para a seção "Assinaturas" (app.vistorias.$inspectionId)
 * e para a página pública de assinatura — extraídos para serem testáveis
 * sem depender de renderização React, no mesmo padrão já usado nos outros
 * arquivos de rota deste projeto (ex.: resolveComparisonButtonMode em
 * app.vistorias.$inspectionId.tsx).
 */

export const SIGNING_PARTY_STATUS_LABELS: Record<SigningPartyStatus, string> = {
  pending: "Aguardando assinatura",
  signed: "Assinado",
  expired: "Expirado",
  revoked: "Revogado",
};

export const SIGNING_PROCESS_STATUS_LABELS: Record<SigningProcessStatus, string> = {
  pending: "Aguardando assinaturas",
  partially_signed: "Parcialmente assinado",
  completed: "Concluído",
  expired: "Expirado",
  cancelled: "Cancelado",
};

export function isSigningProcessActive(status: SigningProcessStatus): boolean {
  return status === "pending" || status === "partially_signed";
}

/** "Gerar novo link" / "Reenviar" ficam disponíveis enquanto o signatário
 * não assinou e não foi revogado (pending ou expired), e o processo ainda
 * está ativo. */
export function canIssueNewLink(process: SigningProcess, party: SigningParty): boolean {
  if (!isSigningProcessActive(process.status)) return false;
  return party.status === "pending" || party.status === "expired";
}

/** "Revogar" só é permitido para quem ainda não assinou. */
export function canRevokeParty(party: SigningParty): boolean {
  return party.status === "pending" || party.status === "expired";
}

/** "Assinar presencialmente" só para signatário pendente de processo ativo. */
export function canSignInPerson(process: SigningProcess, party: SigningParty): boolean {
  return isSigningProcessActive(process.status) && party.status === "pending";
}

export function canCancelProcess(process: SigningProcess): boolean {
  return isSigningProcessActive(process.status);
}

export function canDownloadSignedReport(process: SigningProcess): boolean {
  return process.status === "completed";
}

/** 5 estilos de fonte cursiva para a pré-visualização da assinatura
 * digitada — puramente uma escolha de CSS no cliente; o backend só recebe a
 * imagem renderizada (ver inspection-signing-pdf.ts: a imagem é sempre uma
 * representação derivada) e o typed_font_id como registro estruturado. */
export type TypedSignatureFont = { id: string; label: string; fontFamily: string };
export const TYPED_SIGNATURE_FONTS: TypedSignatureFont[] = [
  { id: "cursive-1", label: "Clássica", fontFamily: "'Brush Script MT', 'Segoe Script', cursive" },
  { id: "cursive-2", label: "Elegante", fontFamily: "'Lucida Handwriting', 'Apple Chancery', cursive" },
  { id: "cursive-3", label: "Natural", fontFamily: "'Segoe Print', 'Comic Sans MS', cursive" },
  { id: "cursive-4", label: "Moderna", fontFamily: "'Pacifico', 'Segoe Script', cursive" },
  { id: "cursive-5", label: "Formal", fontFamily: "'Monotype Corsiva', 'Segoe Script', cursive" },
];

export function findTypedSignatureFont(id: string | null | undefined): TypedSignatureFont {
  return TYPED_SIGNATURE_FONTS.find((font) => font.id === id) ?? TYPED_SIGNATURE_FONTS[0];
}

/** Rótulo curto para a linha "Documentos" da imobiliária. */
export function signedReportAvailability(processes: SigningProcess[]): "none" | "in_progress" | "ready" {
  if (processes.some((process) => process.status === "completed")) return "ready";
  if (processes.some((process) => isSigningProcessActive(process.status))) return "in_progress";
  return "none";
}
