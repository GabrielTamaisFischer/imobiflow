import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { ensurePartyRole, resolveOrCreateParty } from "./party-identity.js";
import { isValidBrazilianDocument, normalizeBrazilianDocument } from "./brazilian-document.js";

type BrokerDatabase = ReturnType<typeof getPrisma> | Prisma.TransactionClient;

export type BrokerRegistrationInput = {
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
  creciNumber?: string | null;
  jobTitle?: string | null;
  photoUrl?: string | null;
  bioText?: string | null;
};

export class BrokerIdentityError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function cleanOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function inferPartyType(document: string): "individual" | "company" {
  return normalizeBrazilianDocument(document).length === 14 ? "company" : "individual";
}

function validateBrokerDocument(document: string | null | undefined, explicitType?: "individual" | "company") {
  const value = cleanOptionalString(document);
  if (!value) return;
  const type = explicitType ?? inferPartyType(value);
  if (!isValidBrazilianDocument(value, type)) {
    throw new BrokerIdentityError(
      "CPF/CNPJ invalido para a identidade do corretor.",
      422,
      "INVALID_BROKER_DOCUMENT",
    );
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function ensureBrokerProfile(
  companyId: string,
  partyRoleId: string,
  input: Pick<BrokerRegistrationInput, "creciNumber" | "jobTitle" | "photoUrl" | "bioText">,
  database: BrokerDatabase,
) {
  const existing = await database.brokerProfile.findFirst({
    where: { companyId, partyRoleId },
  });

  if (existing) {
    const nextCreci = cleanOptionalString(input.creciNumber);
    const nextJobTitle = cleanOptionalString(input.jobTitle);
    const nextPhotoUrl = cleanOptionalString(input.photoUrl);
    const nextBio = cleanOptionalString(input.bioText);
    if (
      (nextCreci !== null && nextCreci !== existing.creciNumber) ||
      (nextJobTitle !== null && nextJobTitle !== existing.jobTitle) ||
      (nextPhotoUrl !== null && nextPhotoUrl !== existing.photoUrl) ||
      (nextBio !== null && nextBio !== existing.bioText)
    ) {
      const updated = await database.brokerProfile.update({
        where: { id: existing.id },
        data: {
          ...(nextCreci !== null ? { creciNumber: nextCreci } : {}),
          ...(nextJobTitle !== null ? { jobTitle: nextJobTitle } : {}),
          ...(nextPhotoUrl !== null ? { photoUrl: nextPhotoUrl } : {}),
          ...(nextBio !== null ? { bioText: nextBio } : {}),
        },
      });
      return { brokerProfile: updated, created: false };
    }
    return { brokerProfile: existing, created: false };
  }

  try {
    const created = await database.brokerProfile.create({
      data: {
        companyId,
        partyRoleId,
        creciNumber: cleanOptionalString(input.creciNumber),
        jobTitle: cleanOptionalString(input.jobTitle),
        photoUrl: cleanOptionalString(input.photoUrl),
        bioText: cleanOptionalString(input.bioText),
      },
    });
    return { brokerProfile: created, created: true };
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    const reread = await database.brokerProfile.findFirst({
      where: { companyId, partyRoleId },
    });
    if (reread) return { brokerProfile: reread, created: false };
    throw error;
  }
}

export async function ensureBrokerIdentityForParty(
  companyId: string,
  partyId: string,
  input: Pick<BrokerRegistrationInput, "creciNumber" | "bioText"> = {},
  database: BrokerDatabase = getPrisma(),
) {
  const { partyRole, created: partyRoleCreated } = await ensurePartyRole(
    companyId,
    partyId,
    "broker",
    database,
  );
  const { brokerProfile, created: brokerProfileCreated } = await ensureBrokerProfile(
    companyId,
    partyRole.id,
    input,
    database,
  );
  return {
    partyRole,
    brokerProfile,
    created: { partyRole: partyRoleCreated, brokerProfile: brokerProfileCreated },
  };
}

export async function resolveOrCreateBrokerIdentity(
  companyId: string,
  userId: string | null | undefined,
  input: BrokerRegistrationInput,
  database: BrokerDatabase = getPrisma(),
) {
  validateBrokerDocument(input.document, input.partyType);
  const { party, created: partyCreated } = await resolveOrCreateParty(
    {
      companyId,
      name: input.name.trim(),
      partyType: input.partyType ?? "individual",
      taxId: cleanOptionalString(input.document),
      email: cleanOptionalString(input.email),
      phone: cleanOptionalString(input.phone),
      whatsapp: cleanOptionalString(input.whatsapp),
      notes: cleanOptionalString(input.notes),
      createdBy: userId ?? null,
    },
    database,
  );

  const broker = await ensureBrokerIdentityForParty(companyId, party.id, input, database);

  return {
    party,
    partyRole: broker.partyRole,
    brokerProfile: broker.brokerProfile,
    created: {
      party: partyCreated,
      partyRole: broker.created.partyRole,
      brokerProfile: broker.created.brokerProfile,
    },
  };
}

export async function linkAppUserToBrokerIdentity(
  companyId: string,
  appUserId: string,
  input: BrokerRegistrationInput,
  database: BrokerDatabase = getPrisma(),
) {
  validateBrokerDocument(input.document, input.partyType);
  const user = await database.appUser.findFirst({
    where: { id: appUserId, companyId },
    include: { party: true },
  });
  if (!user) {
    throw new BrokerIdentityError("Usuario nao encontrado nesta empresa.", 404, "USER_NOT_FOUND");
  }

  if (user.partyId) {
    const currentDocument = normalizeBrazilianDocument(user.party?.taxId);
    const incomingDocument = normalizeBrazilianDocument(input.document);
    if (incomingDocument && currentDocument && incomingDocument !== currentDocument) {
      throw new BrokerIdentityError(
        "Troca de CPF/CNPJ da identidade vinculada ao usuario nao e permitida.",
        409,
        "BROKER_DOCUMENT_CHANGE_BLOCKED",
      );
    }

    const broker = await ensureBrokerIdentityForParty(companyId, user.partyId, input, database);
    return {
      appUser: user,
      party: user.party!,
      partyRole: broker.partyRole,
      brokerProfile: broker.brokerProfile,
      created: {
        party: false,
        partyRole: broker.created.partyRole,
        brokerProfile: broker.created.brokerProfile,
        userLink: false,
      },
    };
  }

  const identity = await resolveOrCreateBrokerIdentity(companyId, appUserId, input, database);

  try {
    const result = await database.appUser.updateMany({
      where: { id: appUserId, companyId, partyId: null },
      data: { partyId: identity.party.id },
    });
    if (result.count !== 1) {
      const reread = await database.appUser.findFirst({
        where: { id: appUserId, companyId },
        include: { party: true },
      });
      if (reread?.partyId === identity.party.id) {
        return {
          appUser: reread,
          party: identity.party,
          partyRole: identity.partyRole,
          brokerProfile: identity.brokerProfile,
          created: { ...identity.created, userLink: false },
        };
      }
      throw new BrokerIdentityError(
        "Usuario ja foi vinculado a outra identidade.",
        409,
        "APP_USER_PARTY_LINK_CONFLICT",
      );
    }
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    throw new BrokerIdentityError(
      "Esta identidade civil ja esta vinculada a outro usuario nesta empresa.",
      409,
      "PARTY_ALREADY_LINKED_TO_USER",
    );
  }

  const linkedUser = await database.appUser.findFirstOrThrow({
    where: { id: appUserId, companyId },
    include: { party: true },
  });

  return {
    appUser: linkedUser,
    party: identity.party,
    partyRole: identity.partyRole,
    brokerProfile: identity.brokerProfile,
    created: { ...identity.created, userLink: true },
  };
}
