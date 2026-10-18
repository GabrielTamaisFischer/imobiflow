import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { ensurePartyRole, resolveOrCreateParty } from "./party-identity.js";

/**
 * C3 — serviço canônico de identidade de Compradores.
 *
 * Responsabilidade deste serviço:
 *   Party -> PartyRole("buyer") -> BuyerProfile
 *
 * Lead continua sendo a oportunidade comercial do CRM e NÃO é substituído
 * por BuyerProfile. O vínculo Lead.partyId é feito pela camada de CRM em uma
 * etapa posterior da C3.
 *
 * Regras:
 * - documento válido deduplica Party somente dentro da mesma companyId;
 * - sem documento válido, resolveOrCreateParty cria uma Party nova;
 * - PartyRole "buyer" é idempotente;
 * - BuyerProfile é 1:1 com PartyRole e também precisa ser idempotente sob
 *   concorrência real;
 * - nenhum dado de tenant vem do payload do cliente: companyId deve ser
 *   fornecido pelo contexto autenticado do backend.
 */

export type BuyerRegistrationInput = {
  name: string;
  document?: string | null;
  partyType?: "individual" | "company";
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  notes?: string | null;
  interestJson?: Prisma.InputJsonValue | null;
  financialJson?: Prisma.InputJsonValue | null;
};

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function cleanOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

async function ensureBuyerProfile(
  companyId: string,
  partyRoleId: string,
  input: Pick<BuyerRegistrationInput, "interestJson" | "financialJson">,
) {
  const prisma = getPrisma();

  const existing = await prisma.buyerProfile.findFirst({
    where: { companyId, partyRoleId },
  });
  if (existing) {
    return { buyerProfile: existing, created: false };
  }

  try {
    const created = await prisma.buyerProfile.create({
      data: {
        companyId,
        partyRoleId,
        interestJson: input.interestJson ?? undefined,
        financialJson: input.financialJson ?? undefined,
      },
    });
    return { buyerProfile: created, created: true };
  } catch (error) {
    // Duas requisições podem chegar juntas para a mesma PartyRole. A
    // constraint @@unique([companyId, partyRoleId]) decide a vencedora;
    // a perdedora relê o perfil persistido, sem duplicar e sem virar 500.
    if (!isUniqueConstraintViolation(error)) throw error;

    const reread = await prisma.buyerProfile.findFirst({
      where: { companyId, partyRoleId },
    });
    if (reread) return { buyerProfile: reread, created: false };
    throw error;
  }
}

/**
 * Resolve/cria a identidade canônica de comprador e garante seu profile.
 *
 * Importante: este método NÃO cria Lead. Isso é deliberado para manter
 * identidade e oportunidade comercial separadas e permitir vários Leads
 * apontando para a mesma Party.
 */
export async function resolveOrCreateBuyerIdentity(
  companyId: string,
  userId: string | null | undefined,
  input: BuyerRegistrationInput,
) {
  const { party, created: partyCreated } = await resolveOrCreateParty({
    companyId,
    name: input.name.trim(),
    partyType: input.partyType ?? "individual",
    taxId: cleanOptionalString(input.document),
    email: cleanOptionalString(input.email),
    phone: cleanOptionalString(input.phone),
    whatsapp: cleanOptionalString(input.whatsapp),
    notes: cleanOptionalString(input.notes),
    createdBy: userId ?? null,
  });

  const { partyRole, created: partyRoleCreated } = await ensurePartyRole(
    companyId,
    party.id,
    "buyer",
  );

  const { buyerProfile, created: buyerProfileCreated } = await ensureBuyerProfile(
    companyId,
    partyRole.id,
    input,
  );

  return {
    party,
    partyRole,
    buyerProfile,
    created: {
      party: partyCreated,
      partyRole: partyRoleCreated,
      buyerProfile: buyerProfileCreated,
    },
  };
}
