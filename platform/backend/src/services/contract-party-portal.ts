import type { PrismaClient } from "../../../node_modules/@prisma/client/index.js";

export type PortalPartyIdentity = { companyId: string; email: string; partyType?: string };

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
  const email = identity.email.trim().toLowerCase();
  const row = await db.contractParty.findFirst({ where: { companyId: identity.companyId, contractId, email, ...(identity.partyType ? { partyType: identity.partyType } : {}) }, select: { id: true } });
  return Boolean(row);
}

export async function canPartySignVersion(db: PrismaClient, identity: PortalPartyIdentity, contractId: string, versionId: string) {
  const email = identity.email.trim().toLowerCase();
  const row = await db.contractParty.findFirst({ where: { companyId: identity.companyId, contractId, email, signatureRequired: true, signatureStatus: "pending" }, select: { id: true } });
  const version = await db.contractVersion.findFirst({ where: { id: versionId, contractId, companyId: identity.companyId, status: { in: ["waiting_signature", "partially_signed", "awaiting_signature"] } }, select: { id: true } });
  return Boolean(row && version);
}

export async function canPartyDownloadSignedDocument(db: PrismaClient, identity: PortalPartyIdentity, contractId: string, versionId: string) {
  return (await canPartyViewContract(db, identity, contractId)) && Boolean(await db.contractVersion.findFirst({ where: { id: versionId, contractId, companyId: identity.companyId, status: "signed" }, select: { id: true } }));
}
