/** F8A — privacy-safe aggregates for authenticated tenant and buyer portals. */

import { listFinancialEntriesForPortal } from "./mysql-finance.js";

export type PortalPartyType = "tenant" | "buyer";
type PortalDb = any;

export function normalizePortalEmail(email: string) {
  return email.trim().toLowerCase();
}

export function partyWhere(companyId: string, email: string, partyType: PortalPartyType) {
  return { companyId, email: normalizePortalEmail(email), partyType };
}

function iso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function publicProperty(property: any) {
  if (!property) return null;
  return { id: property.id, code: property.code, title: property.title, city: property.city ?? null, state: property.state ?? null };
}

function publicProposal(row: any) {
  return {
    id: row.id,
    property: publicProperty(row.property),
    amount: String(row.amount),
    currency: row.currency,
    status: row.status,
    terms_public: row.termsPublic ?? null,
    expires_at: iso(row.expiresAt),
    version: row.version,
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  };
}

export function portalDocumentDto(file: any, contractId: string, versionId: string | null = null, partyType: PortalPartyType = "tenant") {
  return {
    id: file.id,
    purpose: file.purpose,
    filename: file.originalFilename,
    mime_type: file.mimeType,
    size_bytes: file.sizeBytes ?? null,
    created_at: iso(file.createdAt),
    download_path: versionId ? `/portal/${partyType}/contracts/${contractId}/document?version_id=${encodeURIComponent(versionId)}` : null,
  };
}

export function portalInspectionDto(row: any) {
  return {
    id: row.id,
    property_id: row.propertyId,
    type: row.type,
    status: row.status,
    completed_at: iso(row.completedAt),
    archived_at: iso(row.archivedAt),
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
    rooms: (row.rooms ?? []).map((room: any) => ({
      id: room.id, name: room.name, position: room.position, notes: room.notes ?? null,
      items: (room.items ?? []).map((item: any) => ({ id: item.id, name: item.name, condition: item.condition, position: item.position, notes: item.notes ?? null })),
    })),
    evidence: (row.evidence ?? []).map((evidence: any) => ({
      id: evidence.id, room_id: evidence.roomId ?? null, item_id: evidence.itemId ?? null,
      caption: evidence.caption ?? null, position: evidence.position,
      filename: evidence.storedFile?.originalFilename ?? null, mime_type: evidence.storedFile?.mimeType ?? null,
      size_bytes: evidence.storedFile?.sizeBytes ?? null, created_at: iso(evidence.createdAt),
    })),
    history: (row.events ?? []).map((event: any) => ({ type: event.eventType, occurred_at: iso(event.createdAt) })),
  };
}

function contractDto(row: any, partyType: PortalPartyType, partyIds: Set<string>, documents: any[]) {
  const ownParties = (row.parties ?? []).filter((party: any) => partyIds.has(party.id) && party.partyType === partyType);
  const latestVersion = (row.versions ?? [])[0] ?? null;
  const pendingSignature = ownParties.some((party: any) => party.signatureRequired && party.signatureStatus !== "signed");
  return {
    id: row.id,
    title: row.title,
    contract_type: row.contractType,
    status: row.status,
    starts_at: iso(row.startsAt),
    ends_at: iso(row.endsAt),
    current_version: row.currentVersion,
    signed_version: row.signedVersion ?? null,
    property: publicProperty(row.property),
    party: ownParties.map((party: any) => ({ id: party.id, type: party.partyType, name: party.name, signature_required: party.signatureRequired, signature_status: party.signatureStatus, signed_at: iso(party.signedAt) })),
    signature: { pending: pendingSignature, status: ownParties.map((party: any) => ({ id: party.id, status: party.signatureStatus, signed_at: iso(party.signedAt) })) },
    latest_version: latestVersion ? { id: latestVersion.id, version_number: latestVersion.versionNumber, status: latestVersion.status, document_hash: latestVersion.documentHash ?? null } : null,
    documents: documents.filter((document) => document.contractId === row.id).map((document) => portalDocumentDto(document.file, row.id, document.versionId, partyType)),
    history: (row.events ?? []).map((event: any) => ({ type: event.eventType, occurred_at: iso(event.createdAt) })),
  };
}

const inspectionSelect = {
  id: true, propertyId: true, type: true, status: true, completedAt: true, archivedAt: true, createdAt: true, updatedAt: true,
  rooms: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] } } },
  evidence: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { storedFile: { select: { originalFilename: true, mimeType: true, sizeBytes: true } } } },
  events: { orderBy: { createdAt: "asc" }, select: { eventType: true, createdAt: true } },
} as const;

const contractSelect = {
  id: true, propertyId: true, leadId: true, entryInspectionId: true, exitInspectionId: true, title: true, contractType: true, status: true,
  startsAt: true, endsAt: true, currentVersion: true, signedVersion: true,
  property: { select: { id: true, code: true, title: true, city: true, state: true } },
  parties: { select: { id: true, partyType: true, name: true, signatureRequired: true, signatureStatus: true, signedAt: true } },
  versions: { orderBy: { versionNumber: "desc" as const }, take: 20, select: { id: true, versionNumber: true, status: true, documentFileId: true, documentHash: true } },
  events: { orderBy: { createdAt: "asc" as const }, select: { eventType: true, createdAt: true } },
} as const;

async function loadArtifacts(db: PortalDb, companyId: string, contracts: any[]) {
  const versionIds = contracts.flatMap((row) => (row.versions ?? []).map((version: any) => version.id));
  if (!versionIds.length) return [];
  const files = await db.storedFile.findMany({ where: { companyId, entityType: "contract_version", entityId: { in: versionIds }, purpose: "contract_document" }, select: { id: true, entityId: true, purpose: true, originalFilename: true, mimeType: true, sizeBytes: true, createdAt: true } });
  const byVersion = new Map(files.map((file: any) => [file.entityId, file]));
  return contracts.flatMap((contract) => (contract.versions ?? []).flatMap((version: any) => { const file = byVersion.get(version.id); return file ? [{ contractId: contract.id, versionId: version.id, file }] : []; }));
}

async function loadInspections(db: PortalDb, companyId: string, contracts: any[]) {
  const ids = contracts.flatMap((row) => [row.entryInspectionId, row.exitInspectionId]).filter(Boolean);
  if (!ids.length) return [];
  const rows = await db.inspection.findMany({ where: { companyId, id: { in: ids } }, select: inspectionSelect });
  return rows.map(portalInspectionDto);
}

function propertyList(contracts: any[]) {
  const seen = new Set<string>();
  return contracts.flatMap((row) => { const property = publicProperty(row.property); if (!property || seen.has(property.id)) return []; seen.add(property.id); return [property]; });
}

export async function loadTenantPortal(db: PortalDb, party: { id: string; companyId: string; name: string; email: string | null; partyType: "tenant" }) {
  const companyId = party.companyId;
  const partyIds = new Set([party.id]);
  const contracts = await db.contract.findMany({ where: { companyId, parties: { some: { id: party.id, companyId, partyType: "tenant" } } }, select: contractSelect, orderBy: { updatedAt: "desc" } });
  const documents = await loadArtifacts(db, companyId, contracts);
  const inspections = await loadInspections(db, companyId, contracts);
  const payments = await listFinancialEntriesForPortal({
    companyId,
    tenantPartyId: party.id,
    contractIds: contracts.map((contract: any) => contract.id),
  }, db);
  return {
    portal: "tenant",
    identity: { name: party.name, email: party.email, party_type: "tenant" },
    properties: propertyList(contracts),
    contracts: contracts.map((row: any) => contractDto(row, "tenant", partyIds, documents)),
    inspections,
    payments: {
      available: true,
      next_due_dates: payments
        .filter((entry) => entry.type === "receivable" && ["pending", "overdue"].includes(entry.status) && entry.due_date)
        .map((entry) => entry.due_date as string),
      entries: payments
        .filter((entry) => entry.type === "receivable")
        .map((entry) => ({
          id: entry.id,
          contract_id: entry.contract_id,
          property_id: entry.property_id,
          amount: entry.amount,
          currency: entry.currency,
          description: entry.description,
          due_date: entry.due_date,
          competence_date: entry.competence_date,
          paid_at: entry.paid_at,
          status: entry.status,
          property: entry.property,
          contract: entry.contract,
        })),
    },
    actions: { sign_contract: contracts.some((row: any) => row.parties.some((party: any) => partyIds.has(party.id) && party.partyType === "tenant" && party.signatureRequired && party.signatureStatus !== "signed")), download_document: documents.length > 0, view_inspection: inspections.length > 0 },
  };
}

export async function loadBuyerPortal(db: PortalDb, party: { id: string; companyId: string; name: string; email: string | null; partyType: "buyer" }) {
  const companyId = party.companyId;
  const partyIds = new Set([party.id]);
  const contracts = await db.contract.findMany({ where: { companyId, parties: { some: { id: party.id, companyId, partyType: "buyer" } } }, select: contractSelect, orderBy: { updatedAt: "desc" } });
  if (!contracts.length) return null;
  const leadIds = contracts.map((contract: any) => contract.leadId).filter(Boolean);
  const leads = leadIds.length ? await db.lead.findMany({ where: { companyId, id: { in: leadIds }, status: { not: "lost" } }, select: { id: true, name: true, email: true, status: true, propertyReference: true, stage: { select: { id: true, name: true, position: true } }, siteLeads: { where: { companyId }, select: { property: { select: { id: true, code: true, title: true, city: true, state: true } } } } }, orderBy: { updatedAt: "desc" } }) : [];
  const appointmentLeadIds = leads.map((lead: any) => lead.id);
  const appointments = appointmentLeadIds.length ? await db.appointment.findMany({ where: { companyId, leadId: { in: appointmentLeadIds } }, select: { id: true, leadId: true, property: { select: { id: true, code: true, title: true, city: true, state: true } }, startsAt: true, endsAt: true, status: true, appointmentType: true, assignee: { select: { name: true } } }, orderBy: { startsAt: "asc" } }) : [];
  const proposals = leadIds.length ? await db.proposal.findMany({ where: { companyId, leadId: { in: leadIds } }, select: { id: true, property: { select: { id: true, code: true, title: true, city: true, state: true } }, amount: true, currency: true, status: true, termsPublic: true, expiresAt: true, version: true, createdAt: true, updatedAt: true }, orderBy: { updatedAt: "desc" } }) : [];
  const documents = await loadArtifacts(db, companyId, contracts);
  return {
    portal: "buyer",
    identity: { name: party.name, email: party.email, party_type: "buyer" },
    properties: propertyList(contracts).concat(leads.flatMap((lead: any) => (lead.siteLeads ?? []).map((siteLead: any) => publicProperty(siteLead.property)).filter(Boolean))),
    commercial: leads.map((lead: any) => ({ id: lead.id, name: lead.name, status: lead.status, stage: lead.stage ? { id: lead.stage.id, name: lead.stage.name, position: lead.stage.position } : null, property_reference: lead.propertyReference ?? null, properties: (lead.siteLeads ?? []).map((siteLead: any) => publicProperty(siteLead.property)).filter(Boolean) })),
    proposals: { available: proposals.length > 0, items: proposals.map(publicProposal) },
    appointments: appointments.map((appointment: any) => ({ id: appointment.id, lead_id: appointment.leadId, property: publicProperty(appointment.property), starts_at: iso(appointment.startsAt), ends_at: iso(appointment.endsAt), status: appointment.status, type: appointment.appointmentType, broker_name: appointment.assignee?.name ?? null })),
    contracts: contracts.map((row: any) => contractDto(row, "buyer", partyIds, documents)),
    actions: { sign_contract: contracts.some((row: any) => row.parties.some((party: any) => partyIds.has(party.id) && party.partyType === "buyer" && party.signatureRequired && party.signatureStatus !== "signed")), download_document: documents.length > 0 },
  };
}
