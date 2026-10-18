import { randomUUID } from "node:crypto";
import { Prisma, type Party, type PartyRole } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { isValidBrazilianDocument, normalizeBrazilianDocument } from "./brazilian-document.js";

/**
 * C1.2 — Serviço canônico de identidade Party/PartyRole (IMOBIFLOW C1→C7).
 *
 * Objetivo desta fase: fazer `Party` funcionar como motor de identidade de
 * fato — reconhecer quando a MESMA pessoa/empresa já existe dentro da MESMA
 * imobiliária (companyId) e reutilizar essa identidade em vez de duplicar,
 * e vincular papéis comerciais (owner/buyer/tenant/broker) de forma
 * idempotente via PartyRole.
 *
 * Fora de escopo nesta fase (deliberadamente): nenhuma migração de schema,
 * nenhum backfill de registros existentes (PropertyOwner/ContractParty não
 * são tocados), nenhuma integração com rotas de Owner/CRM/Lead/Contratos —
 * isso é C2+. Este arquivo entrega apenas o serviço canônico e seus testes.
 *
 * Regra de tenant-safety (obrigatória, nunca relaxar): toda busca/criação é
 * sempre `companyId + identidade`. Nunca existe busca global de Party. O
 * `companyId` usado aqui DEVE vir de uma origem confiável no backend —
 * `getAuthenticatedCompanyId(req)` (src/middleware/auth.ts) no caminho real
 * de produção, ou um argumento interno explicitamente documentado como
 * confiável (ex.: um script de infraestrutura/teste). Este serviço nunca lê
 * `companyId` de um payload de cliente — quem chama é responsável por isso.
 *
 * Regra de documento (CPF/CNPJ): reaproveita normalizeBrazilianDocument /
 * isValidBrazilianDocument de ./brazilian-document.ts — nunca reimplementa
 * essa lógica. Três estados possíveis para `tax_id_normalized`:
 *  - documento ausente (vazio/null/undefined)        -> null
 *  - documento presente porém INVÁLIDO (CPF/CNPJ)    -> null
 *  - documento presente e VÁLIDO                      -> valor normalizado
 * Nos dois primeiros casos o documento NUNCA participa de deduplicação —
 * cada Party criada sem documento válido é sempre uma Party nova. Nome,
 * e-mail, telefone e WhatsApp nunca são usados para deduplicar nesta fase
 * (não são sinais fortes de identidade o suficiente).
 *
 * Regra de concorrência: `parties` tem `@@unique([companyId, taxIdNormalized])`
 * (migração C1.1) exatamente para proteger contra duas criações simultâneas
 * do mesmo documento válido na mesma empresa. `party_roles` tem
 * `@@unique([companyId, partyId, role])` com o mesmo propósito. Em ambos os
 * casos o padrão é: tentar criar; se o banco rejeitar com violação de
 * unique (Prisma P2002), reler pela chave única e devolver o registro que
 * venceu a corrida — nunca deixar o erro subir como 500, e nunca criar um
 * duplicado.
 *
 * Conservador por construção: ao reutilizar uma Party existente, este
 * serviço NUNCA sobrescreve campos já preenchidos com entrada vazia/
 * undefined — nenhuma lógica de atualização está sendo construída nesta
 * fase (fica para quando houver uma estratégia deliberada e testada).
 */

/**
 * Papéis de PartyRole reconhecidos nesta fase. Restrito aos quatro papéis
 * que já possuem suporte real no schema C1.1: `owner` (via
 * PropertyOwner.partyId), e os três profiles 1:1 com PartyRole
 * (BuyerProfile/TenantProfile/BrokerProfile). Não inventamos papéis como
 * "guarantor"/"legal_representative" aqui porque não há profile/consumo
 * real para eles ainda — ver nota em schema.prisma sobre BrokerProfile/C5.
 */
export const PARTY_ROLES = ["owner", "buyer", "tenant", "broker"] as const;
export type PartyRoleName = (typeof PARTY_ROLES)[number];

export class PartyIdentityError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * companyId precisa ser uma string não vazia vinda de contexto confiável.
 * Esta função não valida PROVENIÊNCIA (isso é responsabilidade de quem
 * chama, via getAuthenticatedCompanyId) — apenas rejeita um valor ausente/
 * malformado, como última linha de defesa contra uso incorreto da API.
 */
function requireCompanyId(companyId: string | null | undefined): string {
  if (!companyId || typeof companyId !== "string") {
    throw new PartyIdentityError(
      "companyId e obrigatorio e deve vir de contexto confiavel (AccessContext/getAuthenticatedCompanyId) — nunca de payload de cliente.",
      403,
      "COMPANY_REQUIRED",
    );
  }
  return companyId;
}

function assertValidRole(role: string): role is PartyRoleName {
  if (!(PARTY_ROLES as readonly string[]).includes(role)) {
    throw new PartyIdentityError(
      `Role de PartyRole invalida: "${role}". Valores permitidos nesta fase: ${PARTY_ROLES.join(", ")}.`,
      400,
      "PARTY_ROLE_INVALID",
    );
  }
  return true;
}

function inferOwnerTypeFromDigits(digits: string): "individual" | "company" | null {
  if (digits.length === 11) return "individual";
  if (digits.length === 14) return "company";
  return null;
}

/**
 * Normaliza e valida um documento BR, devolvendo o valor normalizado SOMENTE
 * quando ele é um CPF/CNPJ realmente válido — null em qualquer outro caso
 * (ausente, malformado, ou dígitos que não fecham o cálculo de verificação).
 * Nunca lança erro: documento inválido é um estado esperado, não uma falha.
 */
export function resolvePartyTaxIdNormalized(
  rawValue: string | null | undefined,
  ownerType?: "individual" | "company",
): string | null {
  const normalized = normalizeBrazilianDocument(rawValue);
  if (!normalized) return null; // ausente

  const effectiveOwnerType = ownerType ?? inferOwnerTypeFromDigits(normalized);
  if (!effectiveOwnerType) return null; // nem 11 nem 14 dígitos — nunca dedupa

  // isValidBrazilianDocument(valor, tipo) reaproveita isValidCpf/isValidCnpj
  // internamente. Note que a própria função devolve `true` para string
  // normalizada vazia (significa "não bloqueia", não "é válido") — esse
  // caso já foi tratado acima (normalized é garantidamente não-vazio aqui).
  if (!isValidBrazilianDocument(normalized, effectiveOwnerType)) return null; // presente porém inválido

  return normalized;
}

export type ResolveOrCreatePartyInput = {
  /** Deve vir de getAuthenticatedCompanyId(req) ou equivalente confiável. */
  companyId: string;
  name: string;
  partyType?: "individual" | "company";
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  addressJson?: Prisma.InputJsonValue | null;
  notes?: string | null;
  createdBy?: string | null;
};

export type ResolveOrCreatePartyResult = {
  party: Party;
  /** true = Party nova foi criada agora; false = uma Party existente foi reutilizada. */
  created: boolean;
};

/**
 * Resolve (reaproveitando) ou cria uma Party, sempre escopada por
 * companyId.
 *
 * - Com documento válido: busca por (companyId, taxIdNormalized); reutiliza
 *   se encontrar, cria se não encontrar. Concorrência: se duas chamadas
 *   simultâneas tentarem criar a mesma (companyId, taxIdNormalized), a
 *   constraint UNIQUE do banco deixa só uma passar; a outra recebe P2002,
 *   relê pela mesma chave e devolve a Party que venceu — nunca duplica,
 *   nunca estoura 500.
 * - Sem documento válido (ausente ou inválido): NUNCA tenta deduplicar por
 *   nome/e-mail/telefone/whatsapp — sempre cria uma Party nova.
 * - Reaproveitamento é conservador: quando uma Party existente é devolvida,
 *   nenhum campo dela é sobrescrito pelos dados de entrada.
 */
export async function resolveOrCreateParty(input: ResolveOrCreatePartyInput): Promise<ResolveOrCreatePartyResult> {
  const prisma = getPrisma();
  const companyId = requireCompanyId(input.companyId);
  const partyType = input.partyType ?? "individual";
  const taxIdNormalized = resolvePartyTaxIdNormalized(input.taxId, input.partyType);

  if (taxIdNormalized) {
    const existing = await prisma.party.findFirst({ where: { companyId, taxIdNormalized } });
    if (existing) return { party: existing, created: false };
  }

  try {
    const created = await prisma.party.create({
      data: {
        id: randomUUID(),
        companyId,
        partyType,
        name: input.name,
        taxId: input.taxId ?? null,
        taxIdNormalized,
        email: input.email ?? null,
        phone: input.phone ?? null,
        whatsapp: input.whatsapp ?? null,
        addressJson: input.addressJson ?? undefined,
        notes: input.notes ?? null,
        createdBy: input.createdBy ?? null,
      },
    });
    return { party: created, created: true };
  } catch (error) {
    // Só pode ser uma corrida real de documento válido duplicado: sem
    // taxIdNormalized não há como violar essa constraint (MySQL/TiDB trata
    // cada NULL como distinto num índice único).
    if (!taxIdNormalized || !isUniqueConstraintViolation(error)) throw error;

    const reread = await prisma.party.findFirst({ where: { companyId, taxIdNormalized } });
    if (reread) return { party: reread, created: false };
    throw error; // não deveria acontecer: P2002 sem o registro concorrente existir
  }
}

export type EnsurePartyRoleResult = {
  partyRole: PartyRole;
  /** true = PartyRole nova foi criada agora; false = uma existente foi reutilizada. */
  created: boolean;
};

/**
 * Garante (idempotentemente) que uma Party possui um dado PartyRole dentro
 * da mesma empresa. Repetir a mesma chamada nunca duplica o vínculo.
 *
 * Isolamento de tenant: antes de criar/reutilizar, confirma que a Party
 * (partyId) de fato pertence a essa companyId — um partyId de outra empresa
 * nunca pode "ganhar" um papel nesta empresa.
 *
 * Concorrência: mesmo padrão de resolveOrCreateParty — tenta criar, e em
 * caso de P2002 (duas chamadas simultâneas para a mesma
 * (companyId, partyId, role)) relê pela chave única e devolve o vínculo que
 * venceu a corrida.
 */
export async function ensurePartyRole(
  companyId: string,
  partyId: string,
  role: PartyRoleName,
): Promise<EnsurePartyRoleResult> {
  const prisma = getPrisma();
  const safeCompanyId = requireCompanyId(companyId);
  assertValidRole(role);

  const party = await prisma.party.findFirst({ where: { companyId: safeCompanyId, id: partyId } });
  if (!party) {
    throw new PartyIdentityError("Party nao encontrada nesta empresa.", 404, "PARTY_NOT_FOUND");
  }

  const existing = await prisma.partyRole.findFirst({
    where: { companyId: safeCompanyId, partyId, role },
  });
  if (existing) return { partyRole: existing, created: false };

  try {
    const created = await prisma.partyRole.create({
      data: { id: randomUUID(), companyId: safeCompanyId, partyId, role },
    });
    return { partyRole: created, created: true };
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;

    const reread = await prisma.partyRole.findFirst({
      where: { companyId: safeCompanyId, partyId, role },
    });
    if (reread) return { partyRole: reread, created: false };
    throw error;
  }
}
