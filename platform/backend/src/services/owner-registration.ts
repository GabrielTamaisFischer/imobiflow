import { getPrisma } from "../lib/website-builder-prisma.js";
import { normalizeBrazilianDocument } from "./brazilian-document.js";
import { createMysqlOwner, serializeOwner, updateMysqlOwner } from "./mysql-real-estate.js";
import { ensurePartyRole, resolveOrCreateParty } from "./party-identity.js";

/**
 * C2 — serviço canônico de cadastro de Proprietários, integrado à
 * identidade Party/PartyRole (C1.1/C1.2).
 *
 * PropertyOwner continua sendo a ficha operacional de proprietário (Owner360,
 * OwnerProfile, checks, documentos, portal — tudo isso permanece 100%
 * intacto e ancorado em PropertyOwner, nunca em Party). Este arquivo apenas
 * GARANTE que, a partir da C2, toda criação/edição de PropertyOwner que
 * passa por aqui resolve a identidade civil (Party) e o papel comercial
 * (PartyRole "owner") antes de tocar em PropertyOwner — sem jamais
 * substituir PropertyOwner por Party.
 *
 * Fluxo canônico de criação:
 *   resolveOrCreateParty(...) → ensurePartyRole(..., "owner") → PropertyOwner
 *
 * Regra de duplicidade (decisão confirmada com o usuário nesta fase):
 *   se o documento informado já resolve para uma Party que JÁ POSSUI um
 *   PropertyOwner nesta empresa, a criação é rejeitada com 409
 *   DUPLICATE_OWNER_DOCUMENT — mesmo contrato que `ensureOwnerDocumentAvailable`
 *   já aplicava antes da C2 (nunca reaproveita silenciosamente), agora
 *   detectado via Party em vez de string crua de documento.
 *
 * Regra de troca de documento (decisão confirmada com o usuário nesta fase):
 *   se o PropertyOwner já possui partyId e o update tenta mudar o documento,
 *   a operação é BLOQUEADA (409 OWNER_DOCUMENT_CHANGE_BLOCKED) — troca de
 *   documento de um proprietário já vinculado à identidade canônica fica
 *   para uma fase futura dedicada, dado o risco de merge silencioso de
 *   identidades.
 *
 * Lazy-link (C2, seção 13): um PropertyOwner legado (partyId NULL) que é
 * editado e cujo update inclui explicitamente "document" ganha partyId
 * nesse momento (resolve/cria a Party correspondente). Nenhum outro campo
 * dispara lazy-link — isso evita vincular uma identidade prematuramente só
 * porque, por exemplo, uma nota ou telefone foi corrigido.
 *
 * Limitação conhecida e aceita nesta fase (reportada como dívida, não
 * corrigida aqui): não existe hoje nenhuma UNIQUE constraint em
 * PropertyOwner (companyId, partyId) — a proteção contra duas criações
 * SIMULTÂNEAS do mesmo proprietário (mesmo documento, mesma empresa, nunca
 * visto antes) é feita apenas por uma consulta de aplicação antes do
 * INSERT, sem lock de linha. A camada Party/PartyRole (C1.2) É segura contra
 * essa corrida (UNIQUE real no banco); a camada PropertyOwner, nesta fase,
 * não é. Ver nota de dívida no relatório da C2.
 *
 * party-identity.ts (resolveOrCreateParty/ensurePartyRole) não aceita hoje
 * um PrismaClient/TransactionClient — por isso as chamadas abaixo não ficam
 * dentro de um `$transaction` único com a criação do PropertyOwner (faria
 * refactor amplo em party-identity.ts, fora do escopo pedido para esta
 * fase). Ver nota de dívida no relatório da C2.
 */

type OwnerRegistrationInput = Record<string, unknown>;

function readOwnerPartyType(input: OwnerRegistrationInput): "individual" | "company" {
  return input.owner_type === "company" ? "company" : "individual";
}

function readOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function duplicateOwnerDocumentError() {
  // Mesmo código/mensagem usados por ensureOwnerDocumentAvailable antes da
  // C2 — nenhum consumidor existente (frontend, testes) precisa mudar.
  return Object.assign(new Error("Já existe um proprietário com este CPF/CNPJ nesta empresa."), {
    statusCode: 409,
    code: "DUPLICATE_OWNER_DOCUMENT",
  });
}

function ownerDocumentChangeBlockedError() {
  return Object.assign(
    new Error("Troca de documento não é permitida nesta fase para um proprietário já vinculado a uma identidade (Party)."),
    { statusCode: 409, code: "OWNER_DOCUMENT_CHANGE_BLOCKED" },
  );
}

/** Existe algum PropertyOwner (diferente de exceptOwnerId) já ligado a esta Party, nesta empresa? */
async function findExistingOwnerForParty(companyId: string, partyId: string, exceptOwnerId?: string) {
  const prisma = getPrisma();
  return prisma.propertyOwner.findFirst({
    where: { companyId, partyId, ...(exceptOwnerId ? { id: { not: exceptOwnerId } } : {}) },
    select: { id: true },
  });
}

/**
 * Fluxo canônico de criação de proprietário (C2). Usado pela rota
 * POST /real-estate/owners e pelo gerador de dados de QA (test-lab).
 *
 * companyId e userId devem vir de contexto de backend confiável (nunca de
 * payload de cliente) — mesma regra de party-identity.ts.
 */
export async function createOrResolveOwner(companyId: string, userId: string, input: OwnerRegistrationInput) {
  const { party, created } = await resolveOrCreateParty({
    companyId,
    name: String(input.name ?? ""),
    partyType: readOwnerPartyType(input),
    taxId: typeof input.document === "string" ? input.document : null,
    email: readOptionalString(input.email) ?? null,
    phone: readOptionalString(input.phone) ?? null,
    whatsapp: readOptionalString(input.whatsapp) ?? null,
    notes: readOptionalString(input.notes) ?? null,
    createdBy: userId,
  });

  if (!created) {
    const existingOwner = await findExistingOwnerForParty(companyId, party.id);
    if (existingOwner) throw duplicateOwnerDocumentError();
  }

  await ensurePartyRole(companyId, party.id, "owner");

  return createMysqlOwner(companyId, userId, input, party.id);
}

/**
 * Fluxo canônico de atualização de proprietário (C2). Usado pela rota
 * PATCH /real-estate/owners/:id.
 */
export async function updateOwnerCanonical(companyId: string, ownerId: string, input: OwnerRegistrationInput) {
  const prisma = getPrisma();
  const current = await prisma.propertyOwner.findFirst({ where: { id: ownerId, companyId } });
  if (!current) {
    throw Object.assign(new Error("Proprietário inválido para esta empresa."), { statusCode: 404, code: "OWNER_NOT_FOUND" });
  }

  const documentChanging = "document" in input;

  if (current.partyId) {
    // Já vinculado a uma identidade canônica: troca de documento é
    // bloqueada nesta fase (decisão confirmada com o usuário). Qualquer
    // outro campo segue o fluxo normal de updateMysqlOwner, sem tocar na
    // Party.
    if (documentChanging) {
      const newNormalized = normalizeBrazilianDocument(typeof input.document === "string" ? input.document : "");
      const currentNormalized = normalizeBrazilianDocument(current.document);
      if (newNormalized !== currentNormalized) throw ownerDocumentChangeBlockedError();
    }
    return updateMysqlOwner(companyId, ownerId, input);
  }

  if (!documentChanging) {
    // Registro legado (partyId NULL) e o update não toca em "document":
    // nenhum sinal de identidade novo foi dado — não vincular
    // automaticamente (seção 13: "se houver ambiguidade, não vincular").
    return updateMysqlOwner(companyId, ownerId, input);
  }

  // Lazy-link: registro legado sendo editado e "document" foi informado
  // explicitamente — este é o único gatilho de lazy-link nesta fase.
  const effectiveName = typeof input.name === "string" && input.name.trim() ? input.name : current.name;
  const effectiveOwnerType = (input.owner_type ?? current.ownerType) as "individual" | "company";
  const { party, created } = await resolveOrCreateParty({
    companyId,
    name: effectiveName,
    partyType: effectiveOwnerType,
    taxId: typeof input.document === "string" ? input.document : null,
    createdBy: current.createdBy ?? undefined,
  });

  if (!created) {
    const existingOwner = await findExistingOwnerForParty(companyId, party.id, ownerId);
    if (existingOwner) throw duplicateOwnerDocumentError();
  }

  await ensurePartyRole(companyId, party.id, "owner");

  return updateMysqlOwner(companyId, ownerId, input, party.id);
}
