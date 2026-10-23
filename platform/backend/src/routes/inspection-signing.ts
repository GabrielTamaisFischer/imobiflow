import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { assertInspectionAccess, buildInspectionScopeFilter } from "../services/authorization.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { getStorageProvider, getStorageProviderForName, buildStorageFolder } from "../services/storage/index.js";
import { deliveryAccessForPurpose } from "../services/storage/purposes.js";
import { validateUploadFile } from "../services/storage/file-policy.js";
import { createStoredFileRecord } from "../services/storage/stored-files.js";
import { readStoredFileBuffer } from "../services/storage/read-file.js";
import { buildSignedInspectionCertificate } from "../services/inspection-signing-pdf.js";
import {
  buildSigningPartySnapshot,
  computeSigningProcessStatus,
  generateSigningToken,
  hashDocument,
  hashSigningToken,
  isSigningPartyRole,
  SIGNING_CONSENT_TEXT,
  SIGNING_PARTY_ROLE_LABELS,
  signingProgressLabel,
  signingTokenExpiry,
  type SigningPartyRole,
} from "../services/inspection-signing.js";
import type { StorageResourceType } from "../services/storage/types.js";
import type { RequestWithAccess } from "../types/access.js";

// Assinatura Online (Bloco 5) — domínio novo (InspectionSigningProcess/
// Party/Event, migration já aplicada: 20261023010000_f5c_inspection_signing_
// domain). O mecanismo interno/presencial simples (POST /:id/signatures em
// inspections-mysql.ts) continua existindo em paralelo, intocado — nenhum
// registro antigo é migrado para este domínio.
//
// Dois routers neste arquivo:
//   - mysqlInspectionSigningRouter: autenticado, gestão do processo
//     (criar, listar, gerar/revogar link, cancelar, auditoria, assinatura
//     presencial, download do PDF assinado).
//   - publicInspectionSigningRouter: SEM autenticação, fluxo do signatário
//     via token opaco (nunca o plaintext é persistido — só o hash).
export const mysqlInspectionSigningRouter = Router();
mysqlInspectionSigningRouter.use(requireAuth, requireCompany, requireActiveSubscription);

export const publicInspectionSigningRouter = Router();

function invalid(message: string, code = "SIGNING_INVALID") {
  return Object.assign(new Error(message), { statusCode: 400, code });
}
function notFound(code = "SIGNING_NOT_FOUND") {
  return Object.assign(new Error("Recurso não encontrado."), { statusCode: 404, code });
}
function conflictError(message: string, code = "SIGNING_CONFLICT") {
  return Object.assign(new Error(message), { statusCode: 409, code });
}

const signerInputSchema = z.object({
  role: z.enum(["owner", "tenant_buyer", "responsible", "witness"]),
  party_id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(180),
  document: z.string().trim().max(32).optional().nullable(),
  email: z.string().trim().email().max(180).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});
const createProcessSchema = z.object({
  report_stored_file_id: z.string().uuid().optional(),
  signers: z.array(signerInputSchema).min(1).max(8),
});

async function findInspectionForSigning(req: RequestWithAccess, inspectionId: string, permissionKey: string) {
  await assertInspectionAccess(req.access!, inspectionId, permissionKey, "INSPECT");
  const inspection = await getPrisma().inspection.findFirst({
    where: { id: inspectionId, AND: [buildInspectionScopeFilter(req.access!, permissionKey, "INSPECT")] },
  });
  if (!inspection) throw notFound("INSPECTION_NOT_FOUND");
  return inspection;
}

async function findProcessForCompany(companyId: string, processId: string) {
  const process = await (getPrisma() as any).inspectionSigningProcess.findFirst({
    where: { id: processId, companyId },
    include: { parties: true },
  });
  if (!process) throw notFound("SIGNING_PROCESS_NOT_FOUND");
  return process;
}

async function logSigningEvent(
  companyId: string,
  processId: string,
  eventType: string,
  options: { partyId?: string | null; metadata?: Record<string, unknown>; ipAddress?: string | null; userAgent?: string | null } = {},
) {
  await (getPrisma() as any).inspectionSigningEvent.create({
    data: {
      id: randomUUID(),
      companyId,
      processId,
      partyId: options.partyId ?? null,
      eventType,
      metadataJson: (options.metadata ?? {}) as Prisma.InputJsonValue,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ? options.userAgent.slice(0, 400) : null,
    },
  });
}

function serializeParty(party: any) {
  return {
    id: party.id,
    role: party.role,
    role_label: SIGNING_PARTY_ROLE_LABELS[party.role as SigningPartyRole] ?? party.role,
    party_id: party.partyId,
    name: party.signerNameSnapshot,
    document: party.signerDocumentSnapshot,
    email: party.signerEmailSnapshot,
    phone: party.signerPhoneSnapshot,
    status: party.status,
    signature_method: party.signatureMethod,
    has_active_link: Boolean(party.tokenHash) && party.status === "pending" && (!party.tokenExpiresAt || new Date(party.tokenExpiresAt).getTime() > Date.now()),
    token_expires_at: party.tokenExpiresAt ? new Date(party.tokenExpiresAt).toISOString() : null,
    link_created_at: party.linkCreatedAt ? new Date(party.linkCreatedAt).toISOString() : null,
    viewed_at: party.viewedAt ? new Date(party.viewedAt).toISOString() : null,
    consented_at: party.consentedAt ? new Date(party.consentedAt).toISOString() : null,
    signed_at: party.signedAt ? new Date(party.signedAt).toISOString() : null,
    revoked_at: party.revokedAt ? new Date(party.revokedAt).toISOString() : null,
    expired_at: party.expiredAt ? new Date(party.expiredAt).toISOString() : null,
  };
}

function serializeProcess(process: any) {
  return {
    id: process.id,
    inspection_id: process.inspectionId,
    report_stored_file_id: process.reportStoredFileId,
    document_hash: process.documentHash,
    status: process.status,
    progress_label: signingProgressLabel(process.parties),
    created_at: new Date(process.createdAt).toISOString(),
    completed_at: process.completedAt ? new Date(process.completedAt).toISOString() : null,
    cancelled_at: process.cancelledAt ? new Date(process.cancelledAt).toISOString() : null,
    expired_at: process.expiredAt ? new Date(process.expiredAt).toISOString() : null,
    parties: process.parties.map(serializeParty),
  };
}

// -----------------------------------------------------------------------
// Autenticado
// -----------------------------------------------------------------------

// "Enviar para assinatura": cria o processo (hash do laudo exato, impede
// duplicata ativa para o mesmo documento) e já provisiona um link por
// signatário. Nunca altera Inspection.status.
mysqlInspectionSigningRouter.post("/inspections/:inspectionId/processes", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const inspection = await findInspectionForSigning(req, String(req.params.inspectionId), "inspections.manage");
    if (inspection.status !== "completed" && inspection.status !== "archived") {
      throw invalid("A vistoria precisa estar concluída para iniciar a assinatura.", "SIGNING_REQUIRES_COMPLETED_INSPECTION");
    }
    const input = createProcessSchema.parse(req.body);

    const reportFile = input.report_stored_file_id
      ? await getPrisma().storedFile.findFirst({ where: { id: input.report_stored_file_id, companyId: access.company.id, purpose: "inspection_report" } })
      : await getPrisma().storedFile.findFirst({ where: { companyId: access.company.id, entityType: "inspection_report", purpose: "inspection_report" }, orderBy: { createdAt: "desc" } });
    if (!reportFile || (reportFile.metadataJson as any)?.inspection_id !== inspection.id) {
      throw invalid("Gere o laudo da vistoria antes de enviar para assinatura.", "SIGNING_REPORT_REQUIRED");
    }

    const existingActive = await (getPrisma() as any).inspectionSigningProcess.findFirst({
      where: { companyId: access.company.id, inspectionId: inspection.id, reportStoredFileId: reportFile.id, status: { in: ["pending", "partially_signed"] } },
    });
    if (existingActive) throw conflictError("Já existe um processo de assinatura ativo para esta versão do laudo.", "SIGNING_PROCESS_ALREADY_ACTIVE");

    const reportBytes = await readStoredFileBuffer(reportFile as any);
    const documentHash = hashDocument(reportBytes);

    // Snapshot de identidade: quando party_id é informado, valida que a
    // Party pertence à MESMA empresa antes de aceitar — nunca confia no
    // id enviado pelo cliente sem revalidar o tenant.
    const resolvedSigners: Array<ReturnType<typeof buildSigningPartySnapshot>> = [];
    for (const signer of input.signers) {
      if (signer.party_id) {
        const party = await getPrisma().party.findFirst({ where: { id: signer.party_id, companyId: access.company.id } });
        if (!party) throw invalid("Um dos signatários informa uma Party que não pertence a esta empresa.", "SIGNING_PARTY_CROSS_TENANT");
      }
      resolvedSigners.push(
        buildSigningPartySnapshot({ role: signer.role, name: signer.name, document: signer.document, email: signer.email, phone: signer.phone, partyId: signer.party_id ?? null }),
      );
    }

    const processId = randomUUID();
    const now = new Date();
    let createdProcess: any;
    try {
      createdProcess = await getPrisma().$transaction(async (tx) => {
        const process = await (tx as any).inspectionSigningProcess.create({
          data: {
            id: processId,
            companyId: access.company.id,
            inspectionId: inspection.id,
            reportStoredFileId: reportFile.id,
            documentHash,
            status: "pending",
            activeSlot: 1,
            createdBy: access.appUser.id,
          },
        });
        const parties = [];
        for (const snapshot of resolvedSigners) {
          const party = await (tx as any).inspectionSigningParty.create({
            data: {
              id: randomUUID(),
              companyId: access.company.id,
              processId: process.id,
              partyId: snapshot.partyId,
              role: snapshot.role,
              signerNameSnapshot: snapshot.signerNameSnapshot,
              signerDocumentSnapshot: snapshot.signerDocumentSnapshot,
              signerEmailSnapshot: snapshot.signerEmailSnapshot,
              signerPhoneSnapshot: snapshot.signerPhoneSnapshot,
              status: "pending",
              tokenHash: hashSigningToken(generateSigningToken()),
              tokenExpiresAt: signingTokenExpiry(now),
              linkCreatedAt: now,
            },
          });
          parties.push(party);
        }
        return { ...process, parties };
      });
    } catch (txError: any) {
      if (txError?.code === "P2002") throw conflictError("Já existe um processo de assinatura ativo para esta versão do laudo.", "SIGNING_PROCESS_ALREADY_ACTIVE");
      throw txError;
    }

    // Gera o TOKEN REAL (plaintext) fora da transação para cada parte — o
    // tokenHash gravado acima é só um placeholder de "tem token"; regerar
    // aqui, já com o hash definitivo, evita manter o token em memória
    // durante toda a transação. Resultado: cada signer recebe seu link
    // (plaintext) só nesta resposta, nunca persistido, nunca logado.
    const rawTokensByPartyId = new Map<string, string>();
    for (const party of createdProcess.parties) {
      const rawToken = generateSigningToken();
      rawTokensByPartyId.set(party.id, rawToken);
      await (getPrisma() as any).inspectionSigningParty.update({ where: { id: party.id }, data: { tokenHash: hashSigningToken(rawToken) } });
      await logSigningEvent(access.company.id, processId, "link_created", { partyId: party.id });
    }
    await logSigningEvent(access.company.id, processId, "process_created", { metadata: { report_stored_file_id: reportFile.id, document_hash: documentHash, signer_count: createdProcess.parties.length } });

    const refreshed = await findProcessForCompany(access.company.id, processId);
    const dto = serializeProcess(refreshed);
    dto.parties = dto.parties.map((party: any) => ({ ...party, link_token: rawTokensByPartyId.get(party.id) ?? null }));
    res.status(201).json({ process: dto });
  } catch (error) {
    next(error);
  }
});

mysqlInspectionSigningRouter.get("/inspections/:inspectionId/processes", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const inspection = await findInspectionForSigning(req, String(req.params.inspectionId), "inspections.view");
    const processes = await (getPrisma() as any).inspectionSigningProcess.findMany({
      where: { companyId: access.company.id, inspectionId: inspection.id },
      include: { parties: true },
      orderBy: { createdAt: "desc" },
    });
    res.json({ processes: processes.map(serializeProcess) });
  } catch (error) {
    next(error);
  }
});

mysqlInspectionSigningRouter.get("/processes/:processId", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const process = await findProcessForCompany(req.access!.company.id, String(req.params.processId));
    res.json({ process: serializeProcess(process) });
  } catch (error) {
    next(error);
  }
});

mysqlInspectionSigningRouter.get("/processes/:processId/audit", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    await findProcessForCompany(access.company.id, String(req.params.processId));
    const events = await (getPrisma() as any).inspectionSigningEvent.findMany({ where: { companyId: access.company.id, processId: String(req.params.processId) }, orderBy: { createdAt: "asc" } });
    res.json({
      // IP/user-agent nunca são identidade primária — só contexto de
      // auditoria (ver InspectionSigningEvent no schema).
      events: events.map((row: any) => ({ id: row.id, event_type: row.eventType, party_id: row.partyId, metadata: row.metadataJson ?? {}, ip_address: row.ipAddress, user_agent: row.userAgent, created_at: new Date(row.createdAt).toISOString() })),
    });
  } catch (error) {
    next(error);
  }
});

// "Gerar novo link" — regenera o token de UM signatário; o token anterior
// para de autenticar imediatamente (sobrescrito). Nunca permite mais de um
// token ativo simultâneo por não manter histórico de tokens antigos válidos
// — só o hash atual é checado no fluxo público.
mysqlInspectionSigningRouter.post("/processes/:processId/parties/:partyId/link", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const process = await findProcessForCompany(access.company.id, String(req.params.processId));
    if (process.status !== "pending" && process.status !== "partially_signed") throw conflictError("O processo de assinatura não está mais ativo.", "SIGNING_PROCESS_NOT_ACTIVE");
    const party = process.parties.find((row: any) => row.id === String(req.params.partyId));
    if (!party) throw notFound("SIGNING_PARTY_NOT_FOUND");
    if (party.status === "signed" || party.status === "revoked") throw conflictError("Este signatário não pode receber um novo link.", "SIGNING_PARTY_NOT_LINKABLE");
    const hadToken = Boolean(party.tokenHash);
    const rawToken = generateSigningToken();
    const now = new Date();
    await (getPrisma() as any).inspectionSigningParty.update({
      where: { id: party.id },
      data: { tokenHash: hashSigningToken(rawToken), tokenExpiresAt: signingTokenExpiry(now), linkCreatedAt: now, status: "pending", expiredAt: null },
    });
    await logSigningEvent(access.company.id, process.id, hadToken ? "link_regenerated" : "link_created", { partyId: party.id });
    res.status(201).json({ link_token: rawToken, token_expires_at: signingTokenExpiry(now).toISOString() });
  } catch (error) {
    next(error);
  }
});

mysqlInspectionSigningRouter.post("/processes/:processId/parties/:partyId/revoke", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const process = await findProcessForCompany(access.company.id, String(req.params.processId));
    const party = process.parties.find((row: any) => row.id === String(req.params.partyId));
    if (!party) throw notFound("SIGNING_PARTY_NOT_FOUND");
    if (party.status === "signed") throw conflictError("Um signatário que já assinou não pode ser revogado.", "SIGNING_PARTY_ALREADY_SIGNED");
    if (party.status === "revoked") return res.json({ party: serializeParty(party) });
    const now = new Date();
    const updated = await (getPrisma() as any).inspectionSigningParty.update({ where: { id: party.id }, data: { status: "revoked", revokedAt: now, tokenHash: null } });
    await logSigningEvent(access.company.id, process.id, "signer_revoked", { partyId: party.id });
    const refreshed = await findProcessForCompany(access.company.id, process.id);
    const nextStatus = computeSigningProcessStatus(refreshed.status, refreshed.parties);
    if (nextStatus !== refreshed.status) {
      await (getPrisma() as any).inspectionSigningProcess.update({ where: { id: process.id }, data: { status: nextStatus, ...(nextStatus === "completed" ? { completedAt: now } : {}) } });
      await logSigningEvent(access.company.id, process.id, nextStatus === "completed" ? "process_completed" : "process_partially_signed");
    }
    res.json({ party: serializeParty(updated) });
  } catch (error) {
    next(error);
  }
});

mysqlInspectionSigningRouter.post("/processes/:processId/cancel", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const process = await findProcessForCompany(access.company.id, String(req.params.processId));
    if (process.status !== "pending" && process.status !== "partially_signed") throw conflictError("Só é possível cancelar um processo ainda ativo.", "SIGNING_PROCESS_NOT_ACTIVE");
    await (getPrisma() as any).inspectionSigningProcess.update({ where: { id: process.id }, data: { status: "cancelled", cancelledAt: new Date(), activeSlot: null } });
    await logSigningEvent(access.company.id, process.id, "process_cancelled");
    const refreshed = await findProcessForCompany(access.company.id, process.id);
    res.json({ process: serializeProcess(refreshed) });
  } catch (error) {
    next(error);
  }
});

async function loadReportBytesForProcess(process: any) {
  const reportFile = await getPrisma().storedFile.findFirst({ where: { id: process.reportStoredFileId, companyId: process.companyId } });
  if (!reportFile) throw notFound("SIGNING_REPORT_FILE_NOT_FOUND");
  return { reportFile, bytes: await readStoredFileBuffer(reportFile as any) };
}

async function finalizeCompletedProcess(process: any) {
  const { reportFile, bytes } = await loadReportBytesForProcess(process);
  const signers = [];
  for (const party of process.parties.filter((row: any) => row.status === "signed")) {
    let signatureImage: { buffer: Buffer; mimeType: string } | null = null;
    if (party.signatureStoredFileId) {
      const file = await getPrisma().storedFile.findFirst({ where: { id: party.signatureStoredFileId, companyId: process.companyId } });
      if (file) signatureImage = { buffer: await readStoredFileBuffer(file as any), mimeType: file.mimeType ?? "image/png" };
    }
    signers.push({
      name: party.signerNameSnapshot,
      roleLabel: party.role,
      signedAt: new Date(party.signedAt ?? Date.now()).toISOString(),
      method: (party.signatureMethod ?? "drawn") as "drawn" | "typed",
      consentText: SIGNING_CONSENT_TEXT,
      signatureImage,
      auditId: party.id,
    });
  }
  const { buffer, warnings } = await buildSignedInspectionCertificate({ baseReportBytes: bytes, documentHash: process.documentHash, generatedAt: new Date().toISOString(), signers });
  if (warnings.length) console.warn(`[inspection.signing] processo ${process.id}: ${warnings.join(" | ")}`);
  const fileName = `laudo-assinado-${process.inspectionId}.pdf`;
  const policy = validateUploadFile({ purpose: "inspection_signing_report", fileName, mimeType: "application/pdf", declaredSizeBytes: buffer.byteLength, body: buffer });
  const storage = getStorageProvider();
  const uploaded = await storage.uploadFile({
    companyId: process.companyId,
    entityType: "inspection_signing_report",
    entityId: process.id,
    purpose: "inspection_signing_report",
    fileName,
    mimeType: policy.normalizedMimeType,
    sizeBytes: buffer.byteLength,
    body: buffer,
    folder: buildStorageFolder({ companyId: process.companyId, purpose: "inspection_signing_report", inspectionId: process.inspectionId }),
    deliveryAccess: deliveryAccessForPurpose("inspection_signing_report"),
  });
  await createStoredFileRecord({
    companyId: process.companyId,
    entityType: "inspection_signing_report",
    entityId: process.id,
    file: uploaded,
    purpose: "inspection_signing_report",
    metadata: { inspection_id: process.inspectionId, process_id: process.id, document_hash: process.documentHash, signer_count: signers.length, base_report_stored_file_id: reportFile.id },
  });
}

mysqlInspectionSigningRouter.get("/inspections/:inspectionId/signed-report/download", requirePermission("inspections.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const inspection = await findInspectionForSigning(req, String(req.params.inspectionId), "inspections.view");
    const completedProcess = await (getPrisma() as any).inspectionSigningProcess.findFirst({ where: { companyId: access.company.id, inspectionId: inspection.id, status: "completed" }, orderBy: { completedAt: "desc" } });
    if (!completedProcess) throw invalid("Nenhum processo de assinatura concluído para esta vistoria.", "SIGNING_REPORT_NOT_READY");
    const file = await getPrisma().storedFile.findFirst({ where: { companyId: access.company.id, entityType: "inspection_signing_report", purpose: "inspection_signing_report" }, orderBy: { createdAt: "desc" } });
    const matching = file && (file.metadataJson as any)?.process_id === completedProcess.id ? file : null;
    if (!matching) throw invalid("O laudo assinado ainda está sendo gerado. Tente novamente em instantes.", "SIGNING_REPORT_NOT_READY");
    const body = await readStoredFileBuffer(matching as any);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="laudo-assinado-${inspection.id}.pdf"`);
    res.setHeader("Content-Length", String(body.byteLength));
    res.status(200).send(body);
  } catch (error) {
    next(error);
  }
});

const signSchema = z.object({
  method: z.enum(["drawn", "typed"]),
  image_base64: z.string().min(1).max(4_000_000),
  typed_text: z.string().trim().min(1).max(180).optional(),
  typed_font_id: z.string().trim().min(1).max(40).optional(),
  consent: z.literal(true),
});

function decodeBase64Image(value: string) {
  const payload = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const mimeType = value.startsWith("data:image/jpeg") ? "image/jpeg" : value.startsWith("data:image/webp") ? "image/webp" : "image/png";
  try {
    const body = Buffer.from(payload, "base64");
    if (!body.length) throw new Error("empty");
    return { body, mimeType };
  } catch {
    throw invalid("Imagem de assinatura inválida.", "SIGNING_INVALID_IMAGE");
  }
}

async function applySignature(options: {
  process: any;
  party: any;
  input: z.infer<typeof signSchema>;
  ipAddress: string | null;
  userAgent: string | null;
}) {
  const { process, party, input } = options;
  const { body, mimeType } = decodeBase64Image(input.image_base64);
  const artifactId = randomUUID();
  const fileName = `signing-${artifactId}.${mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png"}`;
  const policy = validateUploadFile({ purpose: "inspection_signing_artifact", fileName, mimeType, declaredSizeBytes: body.byteLength, body });
  const storage = getStorageProvider();
  const uploaded = await storage.uploadFile({
    companyId: process.companyId,
    entityType: "inspection_signing_artifact",
    entityId: artifactId,
    purpose: "inspection_signing_artifact",
    fileName,
    mimeType: policy.normalizedMimeType,
    sizeBytes: body.byteLength,
    body,
    folder: buildStorageFolder({ companyId: process.companyId, purpose: "inspection_signing_artifact", inspectionId: process.inspectionId }),
    deliveryAccess: deliveryAccessForPurpose("inspection_signing_artifact"),
  });
  await createStoredFileRecord({
    companyId: process.companyId,
    entityType: "inspection_signing_artifact",
    entityId: artifactId,
    file: uploaded,
    purpose: "inspection_signing_artifact",
    metadata: { process_id: process.id, party_id: party.id, inspection_id: process.inspectionId, method: input.method },
  });
  const file = await getPrisma().storedFile.findFirstOrThrow({ where: { companyId: process.companyId, entityType: "inspection_signing_artifact", entityId: artifactId } });

  const now = new Date();
  const updatedParty = await (getPrisma() as any).inspectionSigningParty.update({
    where: { id: party.id },
    data: {
      status: "signed",
      signatureMethod: input.method,
      typedText: input.method === "typed" ? input.typed_text ?? null : null,
      typedFontId: input.method === "typed" ? input.typed_font_id ?? null : null,
      signatureStoredFileId: file.id,
      consentedAt: now,
      signedAt: now,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
    },
  });
  await logSigningEvent(process.companyId, process.id, "signer_signed", { partyId: party.id, metadata: { method: input.method }, ipAddress: options.ipAddress, userAgent: options.userAgent });

  const refreshed = await findProcessForCompany(process.companyId, process.id);
  const nextStatus = computeSigningProcessStatus(refreshed.status, refreshed.parties);
  if (nextStatus !== refreshed.status) {
    await (getPrisma() as any).inspectionSigningProcess.update({ where: { id: process.id }, data: { status: nextStatus, ...(nextStatus === "completed" ? { completedAt: now } : {}) } });
    await logSigningEvent(process.companyId, process.id, nextStatus === "completed" ? "process_completed" : "process_partially_signed");
    if (nextStatus === "completed") {
      const finalProcess = await findProcessForCompany(process.companyId, process.id);
      await finalizeCompletedProcess(finalProcess);
    }
  }
  return updatedParty;
}

// "Assinar presencialmente": mesmo efeito do fluxo público, mas disparado
// por um usuário autenticado da empresa (ex.: o signatário assina no
// tablet da imobiliária, sem precisar do link).
mysqlInspectionSigningRouter.post("/processes/:processId/parties/:partyId/sign-in-person", requirePermission("inspections.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const process = await findProcessForCompany(access.company.id, String(req.params.processId));
    if (process.status !== "pending" && process.status !== "partially_signed") throw conflictError("O processo de assinatura não está mais ativo.", "SIGNING_PROCESS_NOT_ACTIVE");
    const party = process.parties.find((row: any) => row.id === String(req.params.partyId));
    if (!party) throw notFound("SIGNING_PARTY_NOT_FOUND");
    if (party.status !== "pending") throw conflictError("Este signatário não está pendente de assinatura.", "SIGNING_PARTY_NOT_PENDING");
    const input = signSchema.parse(req.body);
    const updated = await applySignature({ process, party, input, ipAddress: req.ip ?? null, userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null });
    res.json({ party: serializeParty(updated) });
  } catch (error) {
    next(error);
  }
});

// -----------------------------------------------------------------------
// Público (SEM autenticação) — fluxo do signatário via token opaco.
// Qualquer falha (token inexistente, expirado, revogado, processo
// cancelado) responde 404 NEUTRO — nunca diferencia o motivo externamente,
// para não vazar a existência de um processo/empresa/vistoria. Regras de
// privacidade do projeto (ver instruções do sistema): dados de outra
// empresa, de outro signatário, e o estado interno do processo nunca
// aparecem na resposta pública.
// -----------------------------------------------------------------------

async function resolvePublicSigningParty(token: string) {
  if (!token || typeof token !== "string") throw notFound("SIGNING_TOKEN_NOT_FOUND");
  const tokenHash = hashSigningToken(token);
  const party = await (getPrisma() as any).inspectionSigningParty.findFirst({ where: { tokenHash } });
  if (!party) throw notFound("SIGNING_TOKEN_NOT_FOUND");
  const process = await (getPrisma() as any).inspectionSigningProcess.findFirst({ where: { id: party.processId, companyId: party.companyId } });
  if (!process || (process.status !== "pending" && process.status !== "partially_signed" && party.status !== "signed")) throw notFound("SIGNING_TOKEN_NOT_FOUND");
  if (party.status === "revoked") throw notFound("SIGNING_TOKEN_NOT_FOUND");
  if (party.status === "pending" && party.tokenExpiresAt && new Date(party.tokenExpiresAt).getTime() <= Date.now()) {
    await (getPrisma() as any).inspectionSigningParty.update({ where: { id: party.id }, data: { status: "expired", expiredAt: new Date() } });
    throw notFound("SIGNING_TOKEN_NOT_FOUND");
  }
  return { party, process };
}

publicInspectionSigningRouter.get("/:token", async (req, res, next) => {
  try {
    const { party, process } = await resolvePublicSigningParty(String(req.params.token));
    const inspection = await getPrisma().inspection.findFirst({ where: { id: process.inspectionId, companyId: process.companyId }, include: { property: true } });
    const company = await getPrisma().company.findFirst({ where: { id: process.companyId } });
    if (!inspection || !company) throw notFound("SIGNING_TOKEN_NOT_FOUND");
    if (party.status === "pending" && !party.viewedAt) {
      await (getPrisma() as any).inspectionSigningParty.update({ where: { id: party.id }, data: { viewedAt: new Date() } });
      await logSigningEvent(process.companyId, process.id, "link_viewed", { partyId: party.id, ipAddress: req.ip ?? null, userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null });
    }
    res.json({
      company: { name: company.name },
      property: inspection.property ? { code: inspection.property.code ?? null, title: inspection.property.title, street: inspection.property.street ?? null, neighborhood: inspection.property.neighborhood ?? null, city: inspection.property.city ?? null } : null,
      inspection: { type: inspection.type, completed_at: inspection.completedAt ? new Date(inspection.completedAt).toISOString() : null },
      signer: { name: party.signerNameSnapshot, role: party.role, role_label: SIGNING_PARTY_ROLE_LABELS[party.role as SigningPartyRole] ?? party.role },
      already_signed: party.status === "signed",
      signed_at: party.signedAt ? new Date(party.signedAt).toISOString() : null,
      consent_text: SIGNING_CONSENT_TEXT,
    });
  } catch (error) {
    next(error);
  }
});

publicInspectionSigningRouter.get("/:token/document", async (req, res, next) => {
  try {
    const { process } = await resolvePublicSigningParty(String(req.params.token));
    const reportFile = await getPrisma().storedFile.findFirst({ where: { id: process.reportStoredFileId, companyId: process.companyId } });
    if (!reportFile) throw notFound("SIGNING_TOKEN_NOT_FOUND");
    const body = await readStoredFileBuffer(reportFile as any);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=\"laudo-vistoria.pdf\"");
    res.status(200).send(body);
  } catch (error) {
    next(error);
  }
});

publicInspectionSigningRouter.post("/:token/sign", async (req, res, next) => {
  try {
    const { party, process } = await resolvePublicSigningParty(String(req.params.token));
    if (party.status !== "pending") throw notFound("SIGNING_TOKEN_NOT_FOUND");
    const input = signSchema.parse(req.body);
    if (input.method === "typed" && !input.typed_text) throw invalid("Informe o nome completo para a assinatura digitada.", "SIGNING_TYPED_TEXT_REQUIRED");
    await applySignature({ process, party, input, ipAddress: req.ip ?? null, userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null });
    res.json({ already_signed: true, signed_at: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});
