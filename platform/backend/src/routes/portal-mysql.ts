import { Router } from "express";
import { z } from "zod";
import { hashOpaqueToken } from "../services/mysql-auth.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { loadBuyerPortal, loadTenantPortal } from "../services/portal-f8a.js";
import type { PortalPartyAccess, RequestWithAccess } from "../types/access.js";
import { deliveryAccessForPurpose } from "../services/storage/purposes.js";
import { getStorageProviderForName } from "../services/storage/index.js";
import { createPortalSignature } from "../services/portal-signatures-f8b.js";

export const mysqlPortalRouter = Router();
const db = () => getPrisma() as any;

function readBearerToken(header?: string) {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export function requirePortalParty(partyType: "tenant" | "buyer") {
  return async (req: RequestWithAccess, res: any, next: any) => {
    try {
      const token = readBearerToken(req.headers.authorization);
      if (!token) return res.status(401).json({ error: "PORTAL_AUTH_REQUIRED", message: "Acesso do portal requer token próprio." });
      const party = await db().contractParty.findFirst({
        where: { portalTokenHash: hashOpaqueToken(token), portalEnabled: true, partyType, company: { status: "active" } },
        select: { id: true, companyId: true, name: true, email: true, partyType: true },
      });
      if (!party) return res.status(401).json({ error: "PORTAL_TOKEN_INVALID", message: "Token do portal inválido ou revogado." });
      await db().contractParty.update({ where: { id: party.id }, data: { portalLastAccessAt: new Date() } });
      req.portalParty = party as any;
      return next();
    } catch (error) { return next(error); }
  };
}

function partyNotFound() {
  return Object.assign(new Error("Parte do portal não encontrada."), { statusCode: 404, code: "PORTAL_PARTY_NOT_FOUND" });
}

mysqlPortalRouter.get("/tenant/me", requirePortalParty("tenant"), async (req: RequestWithAccess, res, next) => {
  try {
    const portal = await loadTenantPortal(db(), req.portalParty! as PortalPartyAccess & { partyType: "tenant" });
    if (!portal) throw partyNotFound();
    res.json(portal);
  } catch (error) { next(error); }
});

mysqlPortalRouter.get("/buyer/me", requirePortalParty("buyer"), async (req: RequestWithAccess, res, next) => {
  try {
    const portal = await loadBuyerPortal(db(), req.portalParty! as PortalPartyAccess & { partyType: "buyer" });
    if (!portal) throw partyNotFound();
    res.json(portal);
  } catch (error) { next(error); }
});

export const portalSignatureSchema = z.object({
  version_id: z.string().uuid(),
  signer_name: z.string().trim().min(2).max(180),
  accepted_terms: z.boolean().default(true),
  signature_base64: z.string().min(1).max(8_000_000),
}).strict();

function portalSignatureRoute(partyType: "tenant" | "buyer") {
  return [requirePortalParty(partyType), async (req: RequestWithAccess, res: any, next: any) => {
    try {
      const party = req.portalParty!;
      const input = portalSignatureSchema.parse(req.body);
      if (party.partyType !== partyType) return next(Object.assign(new Error("Parte não autorizada."), { statusCode: 404, code: "PORTAL_PARTY_NOT_FOUND" }));
      if (party.name.trim().toLowerCase() !== input.signer_name.trim().toLowerCase()) return next(Object.assign(new Error("O nome não corresponde à parte autenticada."), { statusCode: 422, code: "SIGNER_NAME_MISMATCH" }));
      const contract = await db().contract.findFirst({ where: { id: String(req.params.id), companyId: party.companyId, parties: { some: { id: party.id, companyId: party.companyId, partyType, signatureRequired: true } } }, select: { id: true, propertyId: true } });
      if (!contract) return next(Object.assign(new Error("Contrato não encontrado."), { statusCode: 404, code: "PORTAL_CONTRACT_NOT_FOUND" }));
      const version = await db().contractVersion.findFirst({ where: { id: input.version_id, contractId: contract.id, companyId: party.companyId }, select: { id: true, versionNumber: true, status: true } });
      if (!version) return next(Object.assign(new Error("Versão não encontrada."), { statusCode: 404, code: "PORTAL_VERSION_NOT_FOUND" }));
      const partyState = await db().contractParty.findFirst({ where: { id: party.id, companyId: party.companyId, contractId: contract.id, partyType, signatureRequired: true }, select: { signatureStatus: true } });
      if (!partyState) return next(Object.assign(new Error("Parte do portal não encontrada."), { statusCode: 404, code: "PORTAL_PARTY_NOT_FOUND" }));
      const result = await createPortalSignature({ db: db(), companyId: party.companyId, contractId: contract.id, propertyId: contract.propertyId, partyId: party.id, partyType, partySignatureStatus: partyState.signatureStatus, version, signerName: input.signer_name, signatureBase64: input.signature_base64, acceptedTerms: input.accepted_terms, request: req });
      return res.status(result.replayed ? 200 : 201).json({ ...result.result, replayed: result.replayed });
    } catch (error) { return next(error); }
  }];
}

mysqlPortalRouter.post("/tenant/contracts/:id/signatures", ...portalSignatureRoute("tenant") as any);
mysqlPortalRouter.post("/buyer/contracts/:id/signatures", ...portalSignatureRoute("buyer") as any);

function portalDocumentRoute(partyType: "tenant" | "buyer") {
  return [requirePortalParty(partyType), async (req: RequestWithAccess, res: any, next: any) => {
    try {
      const party = req.portalParty!;
      const versionId = typeof req.query.version_id === "string" ? req.query.version_id : undefined;
      const contract = await db().contract.findFirst({
        where: { id: String(req.params.id), companyId: party.companyId, parties: { some: { id: party.id, companyId: party.companyId, partyType } } },
        select: { id: true },
      });
      if (!contract) return next(Object.assign(new Error("Contrato não encontrado."), { statusCode: 404, code: "PORTAL_CONTRACT_NOT_FOUND" }));
      const version = await db().contractVersion.findFirst({ where: { companyId: party.companyId, contractId: contract.id, status: "signed", ...(versionId ? { id: versionId } : {}) }, orderBy: { versionNumber: "desc" } });
      if (!version?.documentFileId) return next(Object.assign(new Error("Documento não encontrado."), { statusCode: 404, code: "PORTAL_DOCUMENT_NOT_FOUND" }));
      const file = await db().storedFile.findFirst({ where: { id: version.documentFileId, companyId: party.companyId, entityType: "contract_version", entityId: version.id, purpose: "contract_document" }, select: { id: true, provider: true, publicId: true, resourceType: true, format: true, originalFilename: true, mimeType: true, sizeBytes: true, createdAt: true } });
      if (!file) return next(Object.assign(new Error("Documento não encontrado."), { statusCode: 404, code: "PORTAL_DOCUMENT_NOT_FOUND" }));
      const provider = getStorageProviderForName(file.provider as any);
      const url = deliveryAccessForPurpose("contract_document") === "authenticated" ? provider.getAuthenticatedDownloadUrl?.({ publicId: file.publicId, resourceType: file.resourceType as any, format: file.format }) ?? null : null;
      return res.json({ document: { id: file.id, filename: file.originalFilename, mime_type: file.mimeType, size_bytes: file.sizeBytes ?? null, created_at: file.createdAt.toISOString(), url }, version_id: version.id, document_hash: version.documentHash });
    } catch (error) { return next(error); }
  }];
}

mysqlPortalRouter.get("/tenant/contracts/:id/document", ...portalDocumentRoute("tenant") as any);
mysqlPortalRouter.get("/buyer/contracts/:id/document", ...portalDocumentRoute("buyer") as any);
