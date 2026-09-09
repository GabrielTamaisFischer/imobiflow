import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireActiveSubscription, requireAuth, requireCompany, requirePermission } from "../middleware/auth.js";
import { buildPropertyScopeFilter } from "../services/authorization.js";
import { getPrisma } from "../lib/website-builder-prisma.js";
import { canTransitionContract, contractStatuses, contractTypes, contractSnapshotHash } from "../services/contracts-f6.js";
import type { RequestWithAccess } from "../types/access.js";
import { buildPdfBuffer } from "../services/inspection-f5f.js";
import { createStoredFileRecord, findStoredFilesForEntity } from "../services/storage/stored-files.js";
import { buildStorageFolder, getStorageProvider, getStorageProviderForName } from "../services/storage/index.js";
import { deliveryAccessForPurpose } from "../services/storage/purposes.js";
import { validateUploadFile } from "../services/storage/file-policy.js";
import { resolveIdempotencyKey, withIdempotency } from "../services/idempotency.js";
import { assertSafeContractContent, resolveContractPlaceholders } from "../services/contract-editor-f6d.js";
import { findPartyForContract, canPartyDownloadSignedDocument, canPartySignVersion, canPartyViewContract, getContractsForParty } from "../services/contract-party-portal.js";

export const mysqlContractsRouter = Router();
mysqlContractsRouter.use(requireAuth, requireCompany, requireActiveSubscription);

const partySchema = z.object({
  party_type: z.enum(["owner", "tenant", "buyer", "seller", "broker", "guarantor", "company", "other"]),
  name: z.string().trim().min(2).max(180),
  document: z.string().trim().max(40).optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  signature_required: z.boolean().default(true),
});
const contractSchema = z.object({
  id: z.string().uuid(), property_id: z.string().uuid(), lead_id: z.string().uuid().optional().nullable(),
  entry_inspection_id: z.string().uuid().optional().nullable(), exit_inspection_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(240), contract_type: z.enum(contractTypes),
  starts_at: z.coerce.date().optional().nullable(), ends_at: z.coerce.date().optional().nullable(),
  total_amount_cents: z.number().int().nonnegative().optional().nullable(), monthly_amount_cents: z.number().int().nonnegative().optional().nullable(), deposit_cents: z.number().int().nonnegative().optional().nullable(),
  notes: z.string().max(12000).optional().nullable(), parties: z.array(partySchema).max(20).default([]),
});
const patchSchema = contractSchema.omit({ id: true, parties: true }).partial().extend({ expected_version: z.number().int().nonnegative(), status: z.enum(contractStatuses).optional() });
const fromLeadSchema = z.object({ lead_id: z.string().uuid(), property_id: z.string().uuid(), title: z.string().trim().min(2).max(240), contract_type: z.enum(contractTypes), notes: z.string().max(12000).optional().nullable() });

function notFound() { return Object.assign(new Error("Contrato não encontrado."), { statusCode: 404, code: "CONTRACT_NOT_FOUND" }); }
function invalid(message: string, code = "CONTRACT_INVALID") { return Object.assign(new Error(message), { statusCode: 422, code }); }
function conflict(message: string, code = "CONTRACT_VERSION_CONFLICT") { return Object.assign(new Error(message), { statusCode: 409, code }); }

const include = {
  property: { select: { id: true, code: true, title: true, city: true, state: true, ownerId: true } },
  parties: { orderBy: { createdAt: "asc" as const } },
  versions: { orderBy: { versionNumber: "desc" as const }, take: 10 },
  clauses: { orderBy: { position: "asc" as const } },
};
const db = () => getPrisma() as any;

function contractArtifactDto(file: any, metadata: any, url: string | null) {
  return {
    id: file.id,
    company_id: file.companyId,
    entity_type: file.entityType,
    entity_id: file.entityId,
    purpose: file.purpose,
    filename: file.originalFilename,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes,
    created_at: file.createdAt.toISOString(),
    metadata,
    url,
  };
}

async function privateContractUrl(file: any) {
  const provider = getStorageProviderForName(file.provider as any);
  return provider.getAuthenticatedDownloadUrl?.({ publicId: file.publicId, resourceType: file.resourceType, format: file.format }) ?? null;
}

function decodeBase64File(value: string) {
  const match = value.match(/^data:[^;]+;base64,(.+)$/s);
  const encoded = match?.[1] ?? value;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw invalid("Arquivo base64 inválido.", "INVALID_FILE");
  return Buffer.from(encoded.replace(/\s+/g, ""), "base64");
}

function serialize(row: any) {
  return {
    id: row.id, company_id: row.companyId, property_id: row.propertyId, lead_id: row.leadId, entry_inspection_id: row.entryInspectionId ?? null, exit_inspection_id: row.exitInspectionId ?? null, title: row.title, contract_type: row.contractType, status: row.status,
    starts_at: row.startsAt?.toISOString() ?? null, ends_at: row.endsAt?.toISOString() ?? null, total_amount_cents: row.totalAmountCents, monthly_amount_cents: row.monthlyAmountCents, deposit_cents: row.depositCents, notes: row.notes, current_version: row.currentVersion, signed_version: row.signedVersion,
    created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(), property: row.property, parties: row.parties, versions: row.versions, clauses: row.clauses,
  };
}

function contractSnapshot(row: any) {
  const snapshot = {
    contract_id: row.id,
    company_id: row.companyId,
    property: row.property ? { id: row.property.id, code: row.property.code, title: row.property.title, city: row.property.city, state: row.property.state } : null,
    lead_id: row.leadId,
    title: row.title,
    contract_type: row.contractType,
    status: row.status,
    starts_at: row.startsAt?.toISOString() ?? null,
    ends_at: row.endsAt?.toISOString() ?? null,
    total_amount_cents: row.totalAmountCents,
    monthly_amount_cents: row.monthlyAmountCents,
    deposit_cents: row.depositCents,
    notes: row.notes,
    parties: (row.parties ?? []).map((party: any) => ({ party_type: party.partyType, name: party.name, document: party.document, email: party.email, phone: party.phone, signature_required: party.signatureRequired })),
    clauses: (row.clauses ?? []).map((clause: any) => ({ id: clause.id, title: clause.title, content: clause.content, position: clause.position, source_clause_id: clause.sourceClauseId })),
  };
  for (const clause of snapshot.clauses) { assertSafeContractContent(clause.content); const result = resolveContractPlaceholders(clause.content, snapshot); if (result.unknown.length) throw invalid(`Placeholder desconhecido: ${result.unknown.join(", ")}.`, "INVALID_PLACEHOLDER"); clause.content = result.resolved; }
  return snapshot;
}

async function findContract(req: RequestWithAccess, id: string, manage = false) {
  const access = req.access!;
  const row = await db().contract.findFirst({ where: { id, companyId: access.company.id, property: buildPropertyScopeFilter(access, "properties.view", "VIEW") }, include });
  if (!row) throw notFound();
  if (manage && !access.appUser.permissions.includes("contracts.manage")) throw Object.assign(new Error("Sem permissão para gerenciar contratos."), { statusCode: 403, code: "FORBIDDEN" });
  return row;
}

async function assertProperty(req: RequestWithAccess, propertyId: string) {
  const access = req.access!;
  const property = await db().property.findFirst({ where: { id: propertyId, companyId: access.company.id, ...buildPropertyScopeFilter(access, "properties.view", "VIEW") }, select: { id: true } });
  if (!property) throw invalid("Imóvel inválido ou fora do escopo de acesso.", "INVALID_PROPERTY");
}

async function assertInspectionLink(req: RequestWithAccess, inspectionId: string | null | undefined, propertyId: string, expectedType?: "entry" | "exit") {
  if (!inspectionId) return;
  const row = await db().inspection.findFirst({ where: { id: inspectionId, companyId: req.access!.company.id, propertyId }, select: { id: true, type: true } });
  if (!row || (expectedType && row.type !== expectedType)) throw invalid("Vistoria inválida, de outra empresa, imóvel ou tipo.", "INVALID_INSPECTION");
}

mysqlContractsRouter.get("/", requirePermission("contracts.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const rows = await db().contract.findMany({ where: { companyId: req.access!.company.id, ...(status && status !== "all" ? { status } : {}), property: buildPropertyScopeFilter(req.access!, "properties.view", "VIEW") }, include, orderBy: { createdAt: "desc" }, take: 100 });
    res.json({ contracts: rows.map(serialize) });
  } catch (error) { next(error); }
});

mysqlContractsRouter.post("/", requirePermission("contracts.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = contractSchema.parse(req.body); const access = req.access!;
    await assertProperty(req, input.property_id);
    await assertInspectionLink(req, input.entry_inspection_id, input.property_id, "entry");
    await assertInspectionLink(req, input.exit_inspection_id, input.property_id, "exit");
    if (input.lead_id) { const lead = await db().lead.findFirst({ where: { id: input.lead_id, companyId: access.company.id } }); if (!lead) throw invalid("Lead inválido para esta empresa.", "INVALID_LEAD"); }
    const created = await db().$transaction(async (tx: any) => {
      const contract = await tx.contract.create({ data: { id: input.id, companyId: access.company.id, propertyId: input.property_id, leadId: input.lead_id ?? null, entryInspectionId: input.entry_inspection_id ?? null, exitInspectionId: input.exit_inspection_id ?? null, createdBy: access.appUser.id, title: input.title, contractType: input.contract_type, startsAt: input.starts_at ?? null, endsAt: input.ends_at ?? null, totalAmountCents: input.total_amount_cents ?? null, monthlyAmountCents: input.monthly_amount_cents ?? null, depositCents: input.deposit_cents ?? null, notes: input.notes ?? null, metadataJson: {} } });
      if (input.parties.length) await tx.contractParty.createMany({ data: input.parties.map((party) => ({ id: randomUUID(), companyId: access.company.id, contractId: contract.id, partyType: party.party_type, name: party.name, document: party.document ?? null, email: party.email ?? null, phone: party.phone ?? null, signatureRequired: party.signature_required, signatureStatus: party.signature_required ? "pending" : "not_required" })) });
      await tx.contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, actorUserId: access.appUser.id, eventType: "contract.created", payloadJson: { contract_type: input.contract_type } } });
      return tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include });
    });
    res.status(201).json({ contract: serialize(created) });
  } catch (error) { next(error); }
});

// Creates a draft from the canonical CRM lead. Negotiation is represented by
// the approved lead/proposal context already available in this installation;
// the tenant and property are always revalidated server-side.
mysqlContractsRouter.post("/from-lead", requirePermission("contracts.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = fromLeadSchema.parse(req.body); const access = req.access!;
    const lead = await db().lead.findFirst({ where: { id: input.lead_id, companyId: access.company.id }, include: { siteLeads: { where: { companyId: access.company.id, propertyId: input.property_id }, take: 1 }, assignee: true } });
    if (!lead) throw notFound();
    await assertProperty(req, input.property_id);
    if (!lead.siteLeads.length && lead.propertyReference && lead.propertyReference !== input.property_id) throw invalid("O imóvel não corresponde ao interesse do lead.", "NEGOTIATION_PROPERTY_MISMATCH");
    const created = await db().$transaction(async (tx: any) => {
      const contract = await tx.contract.create({ data: { id: randomUUID(), companyId: access.company.id, propertyId: input.property_id, leadId: lead.id, createdBy: access.appUser.id, title: input.title, contractType: input.contract_type, notes: input.notes ?? lead.notes ?? null, metadataJson: { source: "lead", source_lead_id: lead.id } } });
      await tx.contractParty.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, partyType: "tenant", name: lead.name, email: lead.email, phone: lead.phone, signatureRequired: true, signatureStatus: "pending" } });
      await tx.contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, actorUserId: access.appUser.id, eventType: "contract.created", payloadJson: { source: "lead", lead_id: lead.id } } });
      return tx.contract.findUniqueOrThrow({ where: { id: contract.id }, include });
    });
    res.status(201).json({ contract: serialize(created), source: { lead_id: lead.id, property_id: input.property_id } });
  } catch (error) { next(error); }
});

// Authenticated party read model. It intentionally derives identity from the
// session email; contractId/partyId from a client cannot widen the tenant.
mysqlContractsRouter.get("/portal/mine", async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const contracts = await getContractsForParty(db(), { companyId: access.company.id, email: access.appUser.email });
    res.json({ contracts: contracts.map(serialize) });
  } catch (error) { next(error); }
});

mysqlContractsRouter.get("/portal/:id", async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!; const id = String(req.params.id);
    if (!(await canPartyViewContract(db(), { companyId: access.company.id, email: access.appUser.email }, id))) throw notFound();
    const row = await db().contract.findFirst({ where: { id, companyId: access.company.id }, include });
    if (!row) throw notFound();
    res.json({ contract: serialize(row) });
  } catch (error) { next(error); }
});

const portalDocumentQuery = z.object({ version_id: z.string().uuid().optional() });
mysqlContractsRouter.get("/portal/:id/document", async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!;
    const contractId = String(req.params.id);
    const identity = { companyId: access.company.id, email: access.appUser.email };
    const query = portalDocumentQuery.parse(req.query);
    if (!(await canPartyViewContract(db(), identity, contractId))) throw notFound();
    const version = await db().contractVersion.findFirst({
      where: { companyId: access.company.id, contractId, status: "signed", ...(query.version_id ? { id: query.version_id } : {}) },
      orderBy: { versionNumber: "desc" },
    });
    if (!version?.documentFileId || !(await canPartyDownloadSignedDocument(db(), identity, contractId, version.id))) throw notFound();
    const file = await db().storedFile.findFirst({ where: { id: version.documentFileId, companyId: access.company.id, entityType: "contract_version", entityId: version.id, purpose: "contract_document" } });
    if (!file) throw notFound();
    res.json({ document: contractArtifactDto(file, file.metadataJson, await privateContractUrl(file)), version_id: version.id, document_hash: version.documentHash });
  } catch (error) { next(error); }
});

mysqlContractsRouter.get("/:id", requirePermission("contracts.view"), async (req: RequestWithAccess, res, next) => {
  try { res.json({ contract: serialize(await findContract(req, String(req.params.id))) }); } catch (error) { next(error); }
});

mysqlContractsRouter.patch("/:id", requirePermission("contracts.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const input = patchSchema.parse(req.body); const current = await findContract(req, String(req.params.id), true);
    if (["signed", "active", "cancelled", "terminated", "archived"].includes(current.status)) throw conflict("Contrato assinado ou encerrado é imutável.", "CONTRACT_IMMUTABLE");
    if (input.status && !canTransitionContract(current.status, input.status)) throw conflict("Transição de status inválida.", "CONTRACT_STATUS_CONFLICT");
    if (input.property_id !== undefined) await assertProperty(req, input.property_id);
    const targetPropertyId = input.property_id ?? current.propertyId;
    await assertInspectionLink(req, input.entry_inspection_id, targetPropertyId, "entry");
    await assertInspectionLink(req, input.exit_inspection_id, targetPropertyId, "exit");
    if (input.lead_id) {
      const lead = await db().lead.findFirst({ where: { id: input.lead_id, companyId: req.access!.company.id }, select: { id: true } });
      if (!lead) throw invalid("Lead inválido para esta empresa.", "INVALID_LEAD");
    }
    const result = await db().contract.updateMany({ where: { id: current.id, companyId: req.access!.company.id, currentVersion: input.expected_version }, data: { ...(input.title !== undefined ? { title: input.title } : {}), ...(input.property_id !== undefined ? { propertyId: input.property_id } : {}), ...(input.lead_id !== undefined ? { leadId: input.lead_id } : {}), ...(input.entry_inspection_id !== undefined ? { entryInspectionId: input.entry_inspection_id } : {}), ...(input.exit_inspection_id !== undefined ? { exitInspectionId: input.exit_inspection_id } : {}), ...(input.contract_type !== undefined ? { contractType: input.contract_type } : {}), ...(input.starts_at !== undefined ? { startsAt: input.starts_at } : {}), ...(input.ends_at !== undefined ? { endsAt: input.ends_at } : {}), ...(input.total_amount_cents !== undefined ? { totalAmountCents: input.total_amount_cents } : {}), ...(input.monthly_amount_cents !== undefined ? { monthlyAmountCents: input.monthly_amount_cents } : {}), ...(input.deposit_cents !== undefined ? { depositCents: input.deposit_cents } : {}), ...(input.notes !== undefined ? { notes: input.notes } : {}), ...(input.status !== undefined ? { status: input.status } : {}), currentVersion: { increment: 1 } } });
    if (!result.count) throw conflict("A versão do contrato mudou; recarregue antes de salvar.");
    const updated = await db().contract.findUniqueOrThrow({ where: { id: current.id }, include });
    await db().contractEvent.create({ data: { id: randomUUID(), companyId: req.access!.company.id, contractId: current.id, actorUserId: req.access!.appUser.id, eventType: "contract.updated", payloadJson: { version: updated.currentVersion } } });
    res.json({ contract: serialize(updated) });
  } catch (error) { next(error); }
});

mysqlContractsRouter.post("/:id/versions", requirePermission("contracts.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const current = await findContract(req, String(req.params.id), true);
    if (["signed", "active", "cancelled", "terminated", "archived"].includes(current.status)) throw conflict("Contrato encerrado não pode gerar nova versão.", "CONTRACT_IMMUTABLE");
    const access = req.access!;
    const snapshot = { contract: contractSnapshot(current), generated_at: new Date().toISOString() };
    const hash = contractSnapshotHash(snapshot); const versionNumber = current.currentVersion + 1;
    const lines = [
      `Contrato ${current.title}`,
      `Identificador: ${current.id} | Versão: ${versionNumber}`,
      `Tipo: ${current.contractType} | Status: waiting_signature`,
      `Imóvel: ${current.property?.code ?? ""} ${current.property?.title ?? ""}`,
      `Período: ${current.startsAt?.toISOString() ?? "-"} a ${current.endsAt?.toISOString() ?? "-"}`,
      `Valor total: ${current.totalAmountCents ?? "-"} | Mensal: ${current.monthlyAmountCents ?? "-"} | Caução: ${current.depositCents ?? "-"}`,
      `Partes: ${(current.parties ?? []).map((party: any) => `${party.partyType}: ${party.name}`).join(", ") || "nenhuma"}`,
      `Observações: ${current.notes ?? "-"}`,
      `Hash do snapshot: ${hash}`,
    ];
    const body = buildPdfBuffer("Documento de contrato", lines);
    const policy = validateUploadFile({ purpose: "contract_document", fileName: `contract-${current.id}-v${versionNumber}.pdf`, mimeType: "application/pdf", declaredSizeBytes: body.byteLength, body });
    const key = resolveIdempotencyKey(req, `contract.version:${current.id}:${versionNumber}`);
    const { result, replayed } = await withIdempotency(access.company.id, "contract.version.generate", key, async () => {
      const versionId = randomUUID();
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "contract_version", entityId: versionId, purpose: "contract_document", fileName: `contract-${current.id}-v${versionNumber}.pdf`, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "contract_document", propertyId: current.propertyId }), deliveryAccess: deliveryAccessForPurpose("contract_document") });
      const file = await createStoredFileRecord({ companyId: access.company.id, entityType: "contract_version", entityId: versionId, file: uploaded, uploadedBy: access.appUser.id, purpose: "contract_document", metadata: { contract_id: current.id, version: versionNumber, snapshot, document_hash: hash } });
      const version = await db().$transaction(async (tx: any) => {
        const created = await tx.contractVersion.create({ data: { id: versionId, companyId: access.company.id, contractId: current.id, versionNumber, status: "waiting_signature", snapshotJson: snapshot, documentFileId: file.id, documentHash: hash, generatedAt: new Date(), createdBy: access.appUser.id } });
        await tx.contract.update({ where: { id: current.id }, data: { currentVersion: versionNumber, status: "waiting_signature" } });
        await tx.contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: current.id, versionId: created.id, actorUserId: access.appUser.id, eventType: "contract.version_generated", payloadJson: { version: versionNumber, document_hash: hash, document_file_id: file.id } } });
        await tx.contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: current.id, versionId: created.id, actorUserId: access.appUser.id, eventType: "contract.waiting_signature", payloadJson: { version: versionNumber } } });
        return created;
      });
      return { version: { id: version.id, contract_id: version.contractId, version_number: version.versionNumber, status: version.status, document_file_id: version.documentFileId, document_hash: version.documentHash, generated_at: version.generatedAt?.toISOString() ?? null }, file_id: file.id, document_hash: hash };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as any, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

mysqlContractsRouter.get("/:id/events", requirePermission("contracts.view"), async (req: RequestWithAccess, res, next) => {
  try { const contract = await findContract(req, String(req.params.id)); const events = await db().contractEvent.findMany({ where: { companyId: req.access!.company.id, contractId: contract.id }, orderBy: { createdAt: "asc" } }); res.json({ events }); } catch (error) { next(error); }
});

mysqlContractsRouter.get("/:id/versions", requirePermission("contracts.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const contract = await findContract(req, String(req.params.id));
    const versions = await db().contractVersion.findMany({ where: { companyId: req.access!.company.id, contractId: contract.id }, orderBy: { versionNumber: "desc" } });
    res.json({ versions });
  } catch (error) { next(error); }
});

mysqlContractsRouter.get("/:id/versions/:versionId/document", requirePermission("contracts.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const contract = await findContract(req, String(req.params.id));
    const version = await db().contractVersion.findFirst({ where: { id: String(req.params.versionId), contractId: contract.id, companyId: req.access!.company.id } });
    if (!version?.documentFileId) throw notFound();
    const file = await db().storedFile.findFirst({ where: { id: version.documentFileId, companyId: req.access!.company.id, entityType: "contract_version", entityId: version.id, purpose: "contract_document" } });
    if (!file) throw notFound();
    res.json({ document: contractArtifactDto(file, file.metadataJson, await privateContractUrl(file)), version_id: version.id, document_hash: version.documentHash });
  } catch (error) { next(error); }
});

const signerRoleSchema = z.enum(["owner", "tenant", "buyer", "seller", "broker", "guarantor", "company", "witness", "other"]);
const signatureSchema = z.object({ version_id: z.string().uuid(), party_id: z.string().uuid().optional(), signer_name: z.string().trim().min(2).max(180), signer_role: signerRoleSchema, accepted_terms: z.boolean().default(true), signature_base64: z.string().min(1).max(8_000_000) });
const portalSignatureSchema = signatureSchema.omit({ party_id: true, signer_role: true });
mysqlContractsRouter.post("/:id/signatures", requirePermission("contracts.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!;
    const contract = await findContract(req, String(req.params.id), true);
    const input = signatureSchema.parse(req.body);
    if (!input.accepted_terms) throw invalid("É necessário confirmar a assinatura.", "SIGNATURE_TERMS_REQUIRED");
    const version = await db().contractVersion.findFirst({ where: { id: input.version_id, contractId: contract.id, companyId: access.company.id } });
    if (!version) throw notFound();
    const party = await db().contractParty.findFirst({ where: { companyId: access.company.id, contractId: contract.id, ...(input.party_id ? { id: input.party_id } : { partyType: input.signer_role }), signatureRequired: true }, select: { id: true, signatureStatus: true, partyType: true } });
    if (!party) throw notFound();
    if (input.party_id && party.partyType !== input.signer_role) throw invalid("O papel não corresponde à parte selecionada.", "SIGNER_PARTY_MISMATCH");
    const key = resolveIdempotencyKey(req, `contract.signature:${version.id}:${party.id}`);
    if (version.status === "signed") {
      const prior = await db().idempotencyKey.findUnique({ where: { companyId_scope_idempotencyKey: { companyId: access.company.id, scope: "contract.signature.create", idempotencyKey: key } } });
      if (prior?.status === "completed" && prior.responseJson) return res.status(200).json({ ...(prior.responseJson as object), replayed: true });
      throw conflict("A versão já está assinada.", "CONTRACT_VERSION_SIGNED");
    }
    if (!["generated", "awaiting_signature", "waiting_signature", "partially_signed"].includes(version.status)) throw conflict("A versão não está disponível para assinatura.", "CONTRACT_VERSION_IMMUTABLE");
    if (party.signatureStatus === "signed") throw conflict("Esta parte já assinou esta versão.", "SIGNATURE_DUPLICATE");
    const body = decodeBase64File(input.signature_base64);
    const mimeType = input.signature_base64.startsWith("data:image/jpeg") ? "image/jpeg" : input.signature_base64.startsWith("data:image/webp") ? "image/webp" : "image/png";
    const signatureId = randomUUID();
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const fileName = `contract-signature-${contract.id}-${version.versionNumber}-${signatureId}.${extension}`;
    const policy = validateUploadFile({ purpose: "contract_signature", fileName, mimeType, declaredSizeBytes: body.byteLength, body });
    const { result, replayed } = await withIdempotency(access.company.id, "contract.signature.create", key, async () => {
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "contract_signature", entityId: contract.id, purpose: "signature_evidence", fileName, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "signature_evidence", propertyId: contract.propertyId }), deliveryAccess: deliveryAccessForPurpose("signature_evidence"), metadata: { signature_id: signatureId, contract_version_id: version.id } });
      const file = await createStoredFileRecord({ companyId: access.company.id, entityType: "contract_signature", entityId: contract.id, file: uploaded, uploadedBy: access.appUser.id, purpose: "signature_evidence", metadata: { signature_id: signatureId, contract_id: contract.id, contract_version_id: version.id, party_id: party.id, signer_name: input.signer_name, signer_role: input.signer_role, accepted_terms: input.accepted_terms, signature_hash: contractSnapshotHash(body.toString("base64")) } });
      await db().$transaction(async (tx: any) => {
        await tx.contractParty.update({ where: { id: party.id }, data: { signatureStatus: "signed", signedAt: new Date() } });
        const required = await tx.contractParty.count({ where: { companyId: access.company.id, contractId: contract.id, signatureRequired: true } });
        const signed = await tx.contractParty.count({ where: { companyId: access.company.id, contractId: contract.id, signatureRequired: true, signatureStatus: "signed" } });
        const nextStatus = signed >= required ? "signed" : signed > 0 ? "partially_signed" : "waiting_signature";
        await tx.contractVersion.update({ where: { id: version.id }, data: { status: nextStatus, signedAt: nextStatus === "signed" ? new Date() : null } });
        await tx.contract.update({ where: { id: contract.id }, data: { status: nextStatus, signedVersion: nextStatus === "signed" ? version.versionNumber : null } });
        await tx.contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, versionId: version.id, actorUserId: access.appUser.id, eventType: "contract.signature_created", payloadJson: { signature_file_id: file.id, party_id: party.id, signer_role: input.signer_role, version: version.versionNumber, signed_count: signed, required_count: required } } });
        await tx.contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, versionId: version.id, actorUserId: access.appUser.id, eventType: `contract.${nextStatus}`, payloadJson: { version: version.versionNumber, signed_count: signed, required_count: required } } });
      });
      return { signature_id: file.id, version_id: version.id, signature_type: "simple_electronic_capture" as const };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as any, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

/** Party signing derives both party and signer role from the authenticated email. */
mysqlContractsRouter.post("/portal/:id/signatures", async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!;
    const contractId = String(req.params.id);
    const input = portalSignatureSchema.parse(req.body);
    if (!input.accepted_terms) throw invalid("É necessário confirmar a assinatura.", "SIGNATURE_TERMS_REQUIRED");
    const identity = { companyId: access.company.id, email: access.appUser.email };
    const party = await findPartyForContract(db(), identity, contractId);
    if (!party) throw notFound();
    if (party.name.trim().toLowerCase() !== input.signer_name.trim().toLowerCase()) throw invalid("O nome não corresponde à parte autenticada.", "SIGNER_NAME_MISMATCH");
    const version = await db().contractVersion.findFirst({ where: { id: input.version_id, contractId, companyId: access.company.id } });
    if (!version || (version.status !== "signed" && !await canPartySignVersion(db(), identity, contractId, version.id))) throw notFound();
    const contract = await db().contract.findFirst({ where: { id: contractId, companyId: access.company.id }, select: { id: true, propertyId: true } });
    if (!contract) throw notFound();
    const key = resolveIdempotencyKey(req, `contract.signature:${version.id}:${party.id}`);
    if (version.status === "signed") {
      const prior = await db().idempotencyKey.findUnique({ where: { companyId_scope_idempotencyKey: { companyId: access.company.id, scope: "contract.signature.create", idempotencyKey: key } } });
      if (prior?.status === "completed" && prior.responseJson) return res.status(200).json({ ...(prior.responseJson as object), replayed: true });
      throw conflict("A versão já está assinada.", "CONTRACT_VERSION_SIGNED");
    }
    if (!["generated", "awaiting_signature", "waiting_signature", "partially_signed"].includes(version.status)) throw conflict("A versão não está disponível para assinatura.", "CONTRACT_VERSION_IMMUTABLE");
    const body = decodeBase64File(input.signature_base64);
    const mimeType = input.signature_base64.startsWith("data:image/jpeg") ? "image/jpeg" : input.signature_base64.startsWith("data:image/webp") ? "image/webp" : "image/png";
    const signatureId = randomUUID();
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const fileName = `contract-signature-${contract.id}-${version.versionNumber}-${signatureId}.${extension}`;
    const policy = validateUploadFile({ purpose: "contract_signature", fileName, mimeType, declaredSizeBytes: body.byteLength, body });
    const { result, replayed } = await withIdempotency(access.company.id, "contract.signature.create", key, async () => {
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "contract_signature", entityId: contract.id, purpose: "signature_evidence", fileName, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "signature_evidence", propertyId: contract.propertyId }), deliveryAccess: deliveryAccessForPurpose("signature_evidence"), metadata: { signature_id: signatureId, contract_version_id: version.id } });
      const file = await createStoredFileRecord({ companyId: access.company.id, entityType: "contract_signature", entityId: contract.id, file: uploaded, uploadedBy: access.appUser.id, purpose: "signature_evidence", metadata: { signature_id: signatureId, contract_id: contract.id, contract_version_id: version.id, party_id: party.id, signer_name: input.signer_name, signer_role: party.partyType, accepted_terms: input.accepted_terms, signature_hash: contractSnapshotHash(body.toString("base64")) } });
      await db().$transaction(async (tx: any) => {
        await tx.contractParty.update({ where: { id: party.id }, data: { signatureStatus: "signed", signedAt: new Date() } });
        const required = await tx.contractParty.count({ where: { companyId: access.company.id, contractId: contract.id, signatureRequired: true } });
        const signed = await tx.contractParty.count({ where: { companyId: access.company.id, contractId: contract.id, signatureRequired: true, signatureStatus: "signed" } });
        const nextStatus = signed >= required ? "signed" : signed > 0 ? "partially_signed" : "waiting_signature";
        await tx.contractVersion.update({ where: { id: version.id }, data: { status: nextStatus, signedAt: nextStatus === "signed" ? new Date() : null } });
        await tx.contract.update({ where: { id: contract.id }, data: { status: nextStatus, signedVersion: nextStatus === "signed" ? version.versionNumber : null } });
        await tx.contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, versionId: version.id, actorUserId: access.appUser.id, eventType: "contract.signature_created", payloadJson: { signature_file_id: file.id, party_id: party.id, signer_role: party.partyType, version: version.versionNumber, signed_count: signed, required_count: required } } });
        await tx.contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, versionId: version.id, actorUserId: access.appUser.id, eventType: `contract.${nextStatus}`, payloadJson: { version: version.versionNumber, signed_count: signed, required_count: required } } });
      });
      return { signature_id: file.id, version_id: version.id, signature_type: "simple_electronic_capture" as const };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as any, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

mysqlContractsRouter.get("/:id/signatures", requirePermission("contracts.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const contract = await findContract(req, String(req.params.id));
    const files = await findStoredFilesForEntity(req.access!.company.id, "contract_signature", contract.id, "signature_evidence", req.access!.appUser.permissions);
    res.json({ signatures: await Promise.all(files.map(async (file: any) => contractArtifactDto(file, file.metadataJson, await privateContractUrl(file)))) });
  } catch (error) { next(error); }
});

mysqlContractsRouter.get("/:id/attachments", requirePermission("contracts.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const contract = await findContract(req, String(req.params.id));
    const files = await findStoredFilesForEntity(req.access!.company.id, "contract_attachment", contract.id, "contract_attachment", req.access!.appUser.permissions);
    res.json({
      attachments: await Promise.all(
        files.map(async (file: any) => contractArtifactDto(file, file.metadataJson, await privateContractUrl(file))),
      ),
    });
  } catch (error) { next(error); }
});

mysqlContractsRouter.get("/:id/attachments/:fileId", requirePermission("contracts.view"), async (req: RequestWithAccess, res, next) => {
  try {
    const contract = await findContract(req, String(req.params.id));
    const file = await db().storedFile.findFirst({ where: { id: String(req.params.fileId), companyId: req.access!.company.id, entityType: "contract_attachment", entityId: contract.id, purpose: "contract_attachment" } });
    if (!file) throw notFound();
    res.json({ attachment: contractArtifactDto(file, file.metadataJson, await privateContractUrl(file)) });
  } catch (error) { next(error); }
});

const attachmentSchema = z.object({ filename: z.string().trim().min(1).max(240), mime_type: z.string().trim().min(1).max(120), content_base64: z.string().min(1).max(14_000_000) });
mysqlContractsRouter.post("/:id/attachments", requirePermission("contracts.manage"), async (req: RequestWithAccess, res, next) => {
  let uploaded: any = null;
  try {
    const access = req.access!, contract = await findContract(req, String(req.params.id), true), input = attachmentSchema.parse(req.body);
    if (["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)) throw conflict("Contrato encerrado não aceita novos anexos.", "CONTRACT_IMMUTABLE");
    const body = decodeBase64File(input.content_base64);
    const policy = validateUploadFile({ purpose: "contract_attachment", fileName: input.filename, mimeType: input.mime_type, declaredSizeBytes: body.byteLength, body });
    const key = resolveIdempotencyKey(req, `contract.attachment:${contract.id}:${input.filename}:${contract.updatedAt.toISOString()}`);
    const { result, replayed } = await withIdempotency(access.company.id, "contract.attachment.upload", key, async () => {
      const attachmentId = randomUUID();
      const storage = getStorageProvider();
      uploaded = await storage.uploadFile({ companyId: access.company.id, entityType: "contract_attachment", entityId: contract.id, purpose: "contract_attachment", fileName: input.filename, mimeType: policy.normalizedMimeType, sizeBytes: body.byteLength, body, folder: buildStorageFolder({ companyId: access.company.id, purpose: "contract_attachment", propertyId: contract.propertyId }), deliveryAccess: deliveryAccessForPurpose("contract_attachment") });
      const file = await createStoredFileRecord({ companyId: access.company.id, entityType: "contract_attachment", entityId: contract.id, file: uploaded, uploadedBy: access.appUser.id, purpose: "contract_attachment", metadata: { contract_id: contract.id, attachment_id: attachmentId, filename: input.filename, mime_type: policy.normalizedMimeType } });
      await db().contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, actorUserId: access.appUser.id, eventType: "contract.attachment_uploaded", payloadJson: { file_id: file.id, filename: input.filename } } });
      return { attachment: contractArtifactDto(file, file.metadataJson, await privateContractUrl(file)) };
    });
    res.status(replayed ? 200 : 201).json({ ...result, replayed });
  } catch (error) {
    if (uploaded) { try { await getStorageProviderForName(uploaded.provider as any).deleteFile({ publicId: uploaded.publicId, resourceType: uploaded.resourceType as any, deliveryAccess: "authenticated" }); } catch { /* best effort */ } }
    next(error);
  }
});

mysqlContractsRouter.delete("/:id/attachments/:fileId", requirePermission("contracts.manage"), async (req: RequestWithAccess, res, next) => {
  try {
    const access = req.access!, contract = await findContract(req, String(req.params.id), true);
    if (["signed", "active", "cancelled", "terminated", "archived"].includes(contract.status)) throw conflict("Contrato encerrado não permite remoção de anexos.", "CONTRACT_IMMUTABLE");
    const file = await db().storedFile.findFirst({ where: { id: String(req.params.fileId), companyId: access.company.id, entityType: "contract_attachment", entityId: contract.id, purpose: "contract_attachment" } });
    if (!file) throw notFound();
    await db().storedFile.delete({ where: { id: file.id } });
    try { await getStorageProviderForName(file.provider as any).deleteFile({ publicId: file.publicId, resourceType: file.resourceType as any, deliveryAccess: "authenticated" }); } catch { /* best effort */ }
    await db().contractEvent.create({ data: { id: randomUUID(), companyId: access.company.id, contractId: contract.id, actorUserId: access.appUser.id, eventType: "contract.attachment_deleted", payloadJson: { file_id: file.id } } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});
