import { randomUUID } from "node:crypto";
import { contractSnapshotHash } from "./contracts-f6.js";
import { resolveIdempotencyKey, withIdempotency } from "./idempotency.js";
import { buildStorageFolder, getStorageProvider, getStorageProviderForName } from "./storage/index.js";
import { deliveryAccessForPurpose } from "./storage/purposes.js";
import { createStoredFileRecord } from "./storage/stored-files.js";
import { validateUploadFile } from "./storage/file-policy.js";

export const portalSignatureInputLimit = 8_000_000;

export function decodePortalSignature(value: string) {
  const match = value.match(/^data:[^;]+;base64,(.+)$/s);
  const encoded = match?.[1] ?? value;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
    throw Object.assign(new Error("Arquivo de assinatura inválido."), { statusCode: 422, code: "INVALID_FILE" });
  }
  return Buffer.from(encoded.replace(/\s+/g, ""), "base64");
}

export async function createPortalSignature(input: {
  db: any;
  companyId: string;
  contractId: string;
  propertyId: string;
  partyId: string;
  partyType: "tenant" | "buyer";
  partySignatureStatus: string;
  version: { id: string; versionNumber: number; status: string };
  signerName: string;
  signatureBase64: string;
  acceptedTerms: boolean;
  request: { headers: Record<string, unknown> };
}) {
  if (!input.acceptedTerms) throw Object.assign(new Error("É necessário confirmar a assinatura."), { statusCode: 422, code: "SIGNATURE_TERMS_REQUIRED" });
  const replayKey = resolveIdempotencyKey(input.request, `contract.signature:${input.version.id}:${input.partyId}`);
  if (!["generated", "awaiting_signature", "waiting_signature", "partially_signed"].includes(input.version.status) && input.version.status !== "signed") throw Object.assign(new Error("A versão não está disponível para assinatura."), { statusCode: 409, code: "CONTRACT_VERSION_IMMUTABLE" });

  const body = decodePortalSignature(input.signatureBase64);
  const mimeType = input.signatureBase64.startsWith("data:image/jpeg") ? "image/jpeg" : input.signatureBase64.startsWith("data:image/webp") ? "image/webp" : "image/png";
  const signatureId = randomUUID();
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const fileName = `contract-signature-${input.contractId}-${input.version.versionNumber}-${signatureId}.${extension}`;
  const policy = validateUploadFile({ purpose: "contract_signature", fileName, mimeType, declaredSizeBytes: body.byteLength, body });
  let uploaded: any = null;
  try {
    const result = await withIdempotency(input.companyId, "contract.signature.create", replayKey, async () => {
      if (input.version.status === "signed") throw Object.assign(new Error("A versão já está assinada."), { statusCode: 409, code: "CONTRACT_VERSION_SIGNED" });
      if (input.partySignatureStatus === "signed") throw Object.assign(new Error("Esta parte já assinou esta versão."), { statusCode: 409, code: "SIGNATURE_DUPLICATE" });
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({ companyId: input.companyId, entityType: "contract_signature", entityId: input.contractId, purpose: "signature_evidence", fileName, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: input.companyId, purpose: "signature_evidence", propertyId: input.propertyId }), deliveryAccess: deliveryAccessForPurpose("signature_evidence"), metadata: { signature_id: signatureId, contract_version_id: input.version.id, party_id: input.partyId } });
      const file = await createStoredFileRecord({ companyId: input.companyId, entityType: "contract_signature", entityId: input.contractId, file: uploaded, uploadedBy: null, purpose: "signature_evidence", metadata: { signature_id: signatureId, contract_id: input.contractId, contract_version_id: input.version.id, party_id: input.partyId, signer_name: input.signerName, signer_role: input.partyType, accepted_terms: input.acceptedTerms, signature_hash: contractSnapshotHash(body.toString("base64")) } });
      await input.db.$transaction(async (tx: any) => {
        const partyUpdate = await tx.contractParty.updateMany({ where: { id: input.partyId, companyId: input.companyId, contractId: input.contractId, signatureStatus: { not: "signed" } }, data: { signatureStatus: "signed", signedAt: new Date() } });
        if (partyUpdate.count !== 1) throw Object.assign(new Error("Esta parte já assinou esta versão."), { statusCode: 409, code: "SIGNATURE_DUPLICATE" });
        const required = await tx.contractParty.count({ where: { companyId: input.companyId, contractId: input.contractId, signatureRequired: true } });
        const signed = await tx.contractParty.count({ where: { companyId: input.companyId, contractId: input.contractId, signatureRequired: true, signatureStatus: "signed" } });
        const nextStatus = signed >= required ? "signed" : signed > 0 ? "partially_signed" : "waiting_signature";
        await tx.contractVersion.update({ where: { id: input.version.id }, data: { status: nextStatus, signedAt: nextStatus === "signed" ? new Date() : null } });
        await tx.contract.update({ where: { id: input.contractId }, data: { status: nextStatus, signedVersion: nextStatus === "signed" ? input.version.versionNumber : null } });
        await tx.contractEvent.create({ data: { id: randomUUID(), companyId: input.companyId, contractId: input.contractId, versionId: input.version.id, actorUserId: null, eventType: "contract.signature_created", payloadJson: { signature_file_id: file.id, party_id: input.partyId, signer_role: input.partyType, version: input.version.versionNumber, signed_count: signed, required_count: required, source: "portal" } } });
        await tx.contractEvent.create({ data: { id: randomUUID(), companyId: input.companyId, contractId: input.contractId, versionId: input.version.id, actorUserId: null, eventType: `contract.${nextStatus}`, payloadJson: { version: input.version.versionNumber, signed_count: signed, required_count: required, source: "portal" } } });
      });
      return { signature_id: file.id, version_id: input.version.id, signature_type: "simple_electronic_capture" as const };
    });
    return result;
  } catch (error) {
    if (uploaded) {
      try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as any, deliveryAccess: "authenticated" }); } catch { /* best effort */ }
    }
    throw error;
  }
}
