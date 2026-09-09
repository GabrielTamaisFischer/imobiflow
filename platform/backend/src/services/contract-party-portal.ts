import type { PrismaClient } from "../../../node_modules/@prisma/client/index.js";

export type PortalPartyIdentity = { companyId: string; email: string; partyType?: string };

export type PortalContractParty = {
  id: string;
  partyType: string;
  name: string;
  email: string | null;
  signatureRequired: boolean;
  signatureStatus: string;
};

const partySelect = {
  id: true,
  partyType: true,
  name: true,
  email: true,
  signatureRequired: true,
  signatureStatus: true,
} as const;

/** Resolves a party only from the authenticated tenant and session email. */
export async function findPartyForContract(
  db: PrismaClient,
  identity: PortalPartyIdentity,
  contractId: string,
  options: { signatureRequired?: boolean; signatureStatus?: string } = {},
) {
  const email = identity.email.trim().toLowerCase();
  return db.contractParty.findFirst({
    where: {
      companyId: identity.companyId,
      contractId,
      email,
      ...(identity.partyType ? { partyType: identity.partyType } : {}),
      ...(options.signatureRequired === undefined ? {} : { signatureRequired: options.signatureRequired }),
      ...(options.signatureStatus ? { signatureStatus: options.signatureStatus } : {}),
    },
    select: partySelect,
  }) as Promise<PortalContractParty | null>;
}

/** Resolves a portal identity only through a tenant-scoped ContractParty row. */
export async function getContractsForParty(db: PrismaClient, identity: PortalPartyIdentity) {
  const email = identity.email.trim().toLowerCase();
  return db.contract.findMany({
    where: {
      companyId: identity.companyId,
      parties: { some: { companyId: identity.companyId, email, ...(identity.partyType ? { partyType: identity.partyType } : {}) } },
    },
    include: { parties: true, versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function canPartyViewContract(db: PrismaClient, identity: PortalPartyIdentity, contractId: string) {
  return Boolean(await findPartyForContract(db, identity, contractId));
}

export async function canPartySignVersion(db: PrismaClient, identity: PortalPartyIdentity, contractId: string, versionId: string) {
  const row = await findPartyForContract(db, identity, contractId, { signatureRequired: true, signatureStatus: "pending" });
  const version = await db.contractVersion.findFirst({ where: { id: versionId, contractId, companyId: identity.companyId, status: { in: ["waiting_signature", "partially_signed", "awaiting_signature"] } }, select: { id: true } });
  return Boolean(row && version);
}

export async function canPartyDownloadSignedDocument(db: PrismaClient, identity: PortalPartyIdentity, contractId: string, versionId: string) {
  return Boolean((await findPartyForContract(db, identity, contractId)) && await db.contractVersion.findFirst({ where: { id: versionId, contractId, companyId: identity.companyId, status: "signed" }, select: { id: true } }));
}
