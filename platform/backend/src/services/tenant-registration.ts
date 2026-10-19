import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { ensurePartyRole, resolveOrCreateParty } from "./party-identity.js";

export type TenantRegistrationInput = {
  name: string;
  document?: string | null;
  partyType?: "individual" | "company";
  rg?: string | null;
  nationality?: string | null;
  occupation?: string | null;
  addressJson?: Prisma.InputJsonValue | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  notes?: string | null;
  rentalJson?: Prisma.InputJsonValue | null;
  guarantorJson?: Prisma.InputJsonValue | null;
};

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function cleanOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

async function ensureTenantProfile(
  companyId: string,
  partyRoleId: string,
  input: Pick<TenantRegistrationInput, "rentalJson" | "guarantorJson"> = {},
) {
  const prisma = getPrisma();
  const existing = await prisma.tenantProfile.findFirst({ where: { companyId, partyRoleId } });
  if (existing) return { tenantProfile: existing, created: false };

  try {
    const created = await prisma.tenantProfile.create({
      data: {
        companyId,
        partyRoleId,
        rentalJson: input.rentalJson ?? undefined,
        guarantorJson: input.guarantorJson ?? undefined,
      },
    });
    return { tenantProfile: created, created: true };
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    const reread = await prisma.tenantProfile.findFirst({ where: { companyId, partyRoleId } });
    if (reread) return { tenantProfile: reread, created: false };
    throw error;
  }
}

export async function ensureTenantIdentityForParty(
  companyId: string,
  partyId: string,
  input: Pick<TenantRegistrationInput, "rentalJson" | "guarantorJson"> = {},
) {
  const { partyRole, created: partyRoleCreated } = await ensurePartyRole(companyId, partyId, "tenant");
  const { tenantProfile, created: tenantProfileCreated } = await ensureTenantProfile(companyId, partyRole.id, input);
  return {
    partyRole,
    tenantProfile,
    created: { partyRole: partyRoleCreated, tenantProfile: tenantProfileCreated },
  };
}

export async function resolveOrCreateTenantIdentity(
  companyId: string,
  userId: string | null | undefined,
  input: TenantRegistrationInput,
) {
  const { party, created: partyCreated } = await resolveOrCreateParty({
    companyId,
    name: input.name.trim(),
    partyType: input.partyType ?? "individual",
    taxId: cleanOptionalString(input.document),
    rg: cleanOptionalString(input.rg),
    nationality: cleanOptionalString(input.nationality),
    occupation: cleanOptionalString(input.occupation),
    addressJson: input.addressJson ?? undefined,
    email: cleanOptionalString(input.email),
    phone: cleanOptionalString(input.phone),
    whatsapp: cleanOptionalString(input.whatsapp),
    notes: cleanOptionalString(input.notes),
    createdBy: userId ?? null,
  });

  const tenant = await ensureTenantIdentityForParty(companyId, party.id, input);

  return {
    party,
    partyRole: tenant.partyRole,
    tenantProfile: tenant.tenantProfile,
    created: {
      party: partyCreated,
      partyRole: tenant.created.partyRole,
      tenantProfile: tenant.created.tenantProfile,
    },
  };
}
