// A6 (Fase A): antes, o "purpose" de um StoredFile era só uma ideia
// documentada — não existia como coluna persistida, e não havia nenhum
// controle de acesso diferenciado por tipo de documento (qualquer usuário
// autenticado da empresa podia ler qualquer arquivo da empresa, incluindo
// contrato assinado, laudo de vistoria ou documento financeiro, independente
// de ter permissão para o módulo dono do dado). Este módulo torna o
// propósito real (persistido no banco) e adiciona uma checagem mínima de
// autorização por propósito, reaproveitando o sistema de permissões já
// existente (mesma permissão exigida pela rota "dona" daquele tipo de dado)
// — sem criar um sistema de storage paralelo por módulo.

export const STORED_FILE_PURPOSES = [
  "property_media",
  "contract_document",
  "signed_contract",
  "inspection_evidence",
  "inspection_report",
  "inspection_comparison",
  "owner_document",
  "tenant_document",
  "buyer_document",
  "financial_document",
  "signature_evidence",
  // F3C (2026-09-04): logo da empresa usado como overlay de marca d'água nas
  // fotos publicadas (nunca no original). Guardado como StoredFile normal
  // (entityType "company_watermark_logo", entityId=companyId) — não é um
  // documento de cliente/contrato/financeiro, então a leitura autenticada
  // exige só a mesma permissão de quem gerencia o site (site.manage), não
  // uma permissão nova.
  "company_logo",
] as const;

export type StoredFilePurpose = (typeof STORED_FILE_PURPOSES)[number];

export function isStoredFilePurpose(value: unknown): value is StoredFilePurpose {
  return typeof value === "string" && (STORED_FILE_PURPOSES as readonly string[]).includes(value);
}

/**
 * Permissão mínima exigida para LER um arquivo com este propósito, além do
 * isolamento por empresa (já garantido em toda consulta por companyId).
 * `null` = público por natureza dentro da empresa (não exige permissão
 * adicional além de pertencer à empresa) — hoje só a mídia de imóvel, que já
 * é exibida no site público da imobiliária.
 */
export const STORED_FILE_PURPOSE_PERMISSION: Record<StoredFilePurpose, string | null> = {
  property_media: null,
  contract_document: "contracts.view",
  signed_contract: "contracts.view",
  inspection_evidence: "inspections.view",
  inspection_report: "inspections.view",
  inspection_comparison: "inspections.view",
  owner_document: "owners.view",
  tenant_document: "owners.view",
  buyer_document: "owners.view",
  financial_document: "finance.view",
  signature_evidence: "contracts.view",
  company_logo: "site.manage",
};

/**
 * Propósito padrão quando o chamador não informa um explicitamente
 * (retrocompatibilidade com os pontos de chamada existentes). Baseado no
 * entityType já usado hoje por cada módulo.
 */
export function inferStoredFilePurpose(entityType: string): StoredFilePurpose {
  switch (entityType) {
    case "inspection_media":
      return "inspection_evidence";
    case "contract_document":
    case "contracts":
      return "contract_document";
    case "financial_document":
    case "financial_entries":
    case "financial_charges":
      return "financial_document";
    case "property_media":
    case "properties":
    default:
      return "property_media";
  }
}

export function assertStoredFilePurposeAccess(
  purpose: string | null | undefined,
  permissions: string[],
) {
  if (!purpose) return;
  const required = isStoredFilePurpose(purpose) ? STORED_FILE_PURPOSE_PERMISSION[purpose] : null;
  if (!required) return;
  if (!permissions.includes(required)) {
    throw Object.assign(new Error("Usuário sem permissão para acessar este documento."), {
      statusCode: 403,
      code: "STORED_FILE_PURPOSE_DENIED",
    });
  }
}
