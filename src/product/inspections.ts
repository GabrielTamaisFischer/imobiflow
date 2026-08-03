import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";
import { compactPreviewMediaUrl, safeSetPreviewItem } from "./preview-storage";
import { listProperties, type Property } from "./real-estate";

const previewInspectionsKey = "imobiflow.preview.inspections";
const previewRoomsKey = "imobiflow.preview.inspection_rooms";
const previewItemsKey = "imobiflow.preview.inspection_items";
const previewMediaKey = "imobiflow.preview.inspection_media";
const previewSignaturesKey = "imobiflow.preview.inspection_signatures";

export type Inspection = {
  id: string;
  company_id: string;
  property_id: string;
  assigned_to: string | null;
  inspection_type: "entry" | "exit" | "maintenance" | "periodic";
  status: "draft" | "scheduled" | "in_progress" | "waiting_signature" | "completed" | "cancelled" | "archived";
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  title: string;
  summary: string | null;
  tenant_name: string | null;
  tenant_document: string | null;
  owner_name: string | null;
  public_token: string | null;
  pdf_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  properties?: {
    id: string;
    code: string | null;
    title: string;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  } | null;
};

export type InspectionRoom = {
  id: string;
  company_id: string;
  inspection_id: string;
  name: string;
  position: number;
  general_condition: "excellent" | "good" | "regular" | "poor" | "damaged" | "not_checked";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InspectionItem = {
  id: string;
  company_id: string;
  inspection_id: string;
  room_id: string | null;
  label: string;
  category: string | null;
  condition: InspectionRoom["general_condition"];
  notes: string | null;
  repair_required: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

export type InspectionMedia = {
  id: string;
  company_id: string;
  inspection_id: string;
  room_id: string | null;
  item_id: string | null;
  media_type: "photo" | "video" | "audio" | "document";
  file_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  caption: string | null;
  position: number;
  created_by: string | null;
  created_at: string;
  signed_url?: string | null;
};

export type InspectionSignature = {
  id: string;
  company_id: string;
  inspection_id: string;
  signer_name: string;
  signer_document: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  signer_role: "tenant" | "owner" | "broker" | "manager" | "witness";
  status: "pending" | "signed" | "cancelled" | "expired";
  signature_token: string | null;
  signature_url: string | null;
  signature_text: string | null;
  signed_at: string | null;
  ip_address: string | null;
  signed_user_agent: string | null;
  signed_payload: Record<string, unknown>;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InspectionInput = {
  property_id: string;
  inspection_type: Inspection["inspection_type"];
  status: Inspection["status"];
  scheduled_at?: string;
  title: string;
  summary?: string;
  tenant_name?: string;
  tenant_document?: string;
  owner_name?: string;
  create_default_rooms?: boolean;
};

export type InspectionUpdateInput = Partial<Omit<InspectionInput, "property_id" | "create_default_rooms">>;

export type InspectionRoomInput = {
  name: string;
  position?: number;
  general_condition?: InspectionRoom["general_condition"];
  notes?: string;
};

export type InspectionItemInput = {
  room_id?: string;
  label: string;
  category?: string;
  condition?: InspectionItem["condition"];
  notes?: string;
  repair_required?: boolean;
  position?: number;
};

export type InspectionMediaInput = {
  room_id?: string;
  item_id?: string;
  media_type?: InspectionMedia["media_type"];
  file_url?: string;
  storage_bucket?: string;
  storage_path?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  caption?: string;
  position?: number;
};

export type InspectionUploadUrlInput = {
  file_name: string;
  mime_type: string;
  file_size: number;
};

export type InspectionSignatureInput = {
  signer_name: string;
  signer_document?: string;
  signer_email?: string;
  signer_phone?: string;
  signer_role: InspectionSignature["signer_role"];
  expires_at?: string;
};

export type SignInspectionSignatureInput = {
  signature_text: string;
  accepted_terms: true;
};

export type InspectionPdfResponse = {
  inspection: Inspection;
  pdf: {
    bucket?: string | null;
    path?: string | null;
    signed_url: string;
    generated_at: string;
  };
};

const defaultRoomNames = [
  "Entrada",
  "Sala",
  "Sacada",
  "Cozinha",
  "Área de serviço",
  "Quarto",
  "Suíte",
  "Banheiro",
  "Lavabo",
  "Garagem",
  "Entrega de chaves e acessórios",
];

export function isPreviewInspections() {
  return isPreviewToken(getStoredToken());
}

export async function listInspections() {
  if (isPreviewInspections()) return { inspections: await readPreviewInspectionsWithProperties() };

  return apiRequest<{ inspections: Inspection[] }>("/inspections?status=all", {
    token: getStoredToken() ?? undefined,
  });
}

export async function createInspection(input: InspectionInput) {
  if (isPreviewInspections()) {
    const inspection = await createPreviewInspection(input);
    return { inspection };
  }

  return apiRequest<{ inspection: Inspection }>("/inspections", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function updateInspection(inspectionId: string, input: InspectionUpdateInput) {
  if (isPreviewInspections()) {
    const inspection = updatePreviewInspection(inspectionId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.inspection_type !== undefined ? { inspection_type: input.inspection_type } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.scheduled_at !== undefined ? { scheduled_at: input.scheduled_at || null } : {}),
      ...(input.summary !== undefined ? { summary: input.summary || null } : {}),
      ...(input.tenant_name !== undefined ? { tenant_name: input.tenant_name || null } : {}),
      ...(input.tenant_document !== undefined ? { tenant_document: input.tenant_document || null } : {}),
      ...(input.owner_name !== undefined ? { owner_name: input.owner_name || null } : {}),
      updated_at: new Date().toISOString(),
    });
    return { inspection };
  }

  return apiRequest<{ inspection: Inspection }>(`/inspections/${inspectionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function deleteInspection(inspectionId: string) {
  if (isPreviewInspections()) {
    deletePreviewInspection(inspectionId);
    return { ok: true };
  }

  return apiRequest<{ ok: boolean }>(`/inspections/${inspectionId}`, {
    method: "DELETE",
    token: getStoredToken() ?? undefined,
  });
}

export async function getInspectionDetails(inspectionId: string) {
  if (isPreviewInspections()) {
    const inspection = (await readPreviewInspectionsWithProperties()).find((item) => item.id === inspectionId);

    if (!inspection) {
      throw new Error("Vistoria não encontrada.");
    }

    return {
      inspection,
      rooms: readPreviewRooms().filter((room) => room.inspection_id === inspectionId),
      items: readPreviewItems().filter((item) => item.inspection_id === inspectionId),
      media: readPreviewMedia().filter((media) => media.inspection_id === inspectionId),
      signatures: readPreviewSignatures().filter((signature) => signature.inspection_id === inspectionId),
    };
  }

  return apiRequest<{
    inspection: Inspection;
    rooms: InspectionRoom[];
    items: InspectionItem[];
    media: InspectionMedia[];
    signatures: InspectionSignature[];
  }>(`/inspections/${inspectionId}`, {
    token: getStoredToken() ?? undefined,
  });
}

export async function listInspectionSignatures(inspectionId: string) {
  if (isPreviewInspections()) {
    return {
      signatures: readPreviewSignatures().filter((signature) => signature.inspection_id === inspectionId),
    };
  }

  return apiRequest<{ signatures: InspectionSignature[] }>(`/inspections/${inspectionId}/signatures`, {
    token: getStoredToken() ?? undefined,
  });
}

export async function createInspectionSignature(
  inspectionId: string,
  input: InspectionSignatureInput,
) {
  if (isPreviewInspections()) {
    return createPreviewSignature(inspectionId, input);
  }

  return apiRequest<{ signature: InspectionSignature; inspection: Inspection }>(
    `/inspections/${inspectionId}/signatures`,
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function signInspectionSignature(
  inspectionId: string,
  signatureId: string,
  input: SignInspectionSignatureInput,
) {
  if (isPreviewInspections()) {
    return signPreviewSignature(inspectionId, signatureId, input);
  }

  return apiRequest<{ signature: InspectionSignature; inspection: Inspection }>(
    `/inspections/${inspectionId}/signatures/${signatureId}/sign`,
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function generateInspectionPdf(inspectionId: string) {
  if (isPreviewInspections()) {
    return createPreviewInspectionPdf(inspectionId);
  }

  return apiRequest<InspectionPdfResponse>(`/inspections/${inspectionId}/pdf`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

export async function loadInspectionRooms(inspectionId: string) {
  if (isPreviewInspections()) {
    return {
      rooms: readPreviewRooms().filter((room) => room.inspection_id === inspectionId),
      items: readPreviewItems().filter((item) => item.inspection_id === inspectionId),
      media: readPreviewMedia().filter((media) => media.inspection_id === inspectionId),
    };
  }

  return apiRequest<{ rooms: InspectionRoom[]; items: InspectionItem[]; media: InspectionMedia[] }>(
    `/inspections/${inspectionId}/rooms`,
    {
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function listInspectionMedia(inspectionId: string) {
  if (isPreviewInspections()) {
    return { media: readPreviewMedia().filter((media) => media.inspection_id === inspectionId) };
  }

  return apiRequest<{ media: InspectionMedia[] }>(`/inspections/${inspectionId}/media`, {
    token: getStoredToken() ?? undefined,
  });
}

export async function createInspectionUploadUrl(
  inspectionId: string,
  input: InspectionUploadUrlInput,
) {
  return apiRequest<{
    bucket: string;
    path: string;
    token: string;
    signed_url: string;
    expires_in_seconds: number;
  }>(`/inspections/${inspectionId}/media/upload-url`, {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function createInspectionMedia(inspectionId: string, input: InspectionMediaInput) {
  if (isPreviewInspections()) {
    const media = createPreviewMedia(inspectionId, input);
    return { media };
  }

  return apiRequest<{ media: InspectionMedia }>(`/inspections/${inspectionId}/media`, {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function deleteInspectionMedia(inspectionId: string, mediaId: string) {
  if (isPreviewInspections()) {
    const media = readPreviewMedia().filter(
      (entry) => !(entry.id === mediaId && entry.inspection_id === inspectionId),
    );
    writePreviewMedia(media);
    return { ok: true, media_id: mediaId };
  }

  return apiRequest<{ ok: boolean; media_id: string }>(
    `/inspections/${inspectionId}/media/${mediaId}`,
    {
      method: "DELETE",
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function createInspectionRoom(inspectionId: string, input: InspectionRoomInput) {
  if (isPreviewInspections()) {
    const room = createPreviewRoom(inspectionId, input);
    return { room };
  }

  return apiRequest<{ room: InspectionRoom }>(`/inspections/${inspectionId}/rooms`, {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function updateInspectionRoom(
  inspectionId: string,
  roomId: string,
  input: Partial<InspectionRoomInput>,
) {
  if (isPreviewInspections()) {
    const room = updatePreviewRoom(inspectionId, roomId, input);
    return { room };
  }

  return apiRequest<{ room: InspectionRoom }>(`/inspections/${inspectionId}/rooms/${roomId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function createInspectionItem(inspectionId: string, input: InspectionItemInput) {
  if (isPreviewInspections()) {
    const item = createPreviewItem(inspectionId, input);
    return { item };
  }

  return apiRequest<{ item: InspectionItem }>(`/inspections/${inspectionId}/items`, {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function updateInspectionItem(
  inspectionId: string,
  itemId: string,
  input: Partial<InspectionItemInput>,
) {
  if (isPreviewInspections()) {
    const item = updatePreviewItem(inspectionId, itemId, input);
    return { item };
  }

  return apiRequest<{ item: InspectionItem }>(`/inspections/${inspectionId}/items/${itemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

function readPreviewInspections() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewInspectionsKey) ?? "[]") as Inspection[];
  } catch {
    return [];
  }
}

async function readPreviewInspectionsWithProperties() {
  const { properties } = await listProperties();
  return readPreviewInspections().map((inspection) => ({
    ...inspection,
    properties: mapProperty(properties.find((property) => property.id === inspection.property_id)),
  }));
}

function writePreviewInspections(inspections: Inspection[]) {
  safeSetPreviewItem(previewInspectionsKey, JSON.stringify(inspections));
}

function readPreviewRooms() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewRoomsKey) ?? "[]") as InspectionRoom[];
  } catch {
    return [];
  }
}

function writePreviewRooms(rooms: InspectionRoom[]) {
  safeSetPreviewItem(previewRoomsKey, JSON.stringify(rooms));
}

function readPreviewItems() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewItemsKey) ?? "[]") as InspectionItem[];
  } catch {
    return [];
  }
}

function writePreviewItems(items: InspectionItem[]) {
  safeSetPreviewItem(previewItemsKey, JSON.stringify(items));
}

function readPreviewMedia() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewMediaKey) ?? "[]") as InspectionMedia[];
  } catch {
    return [];
  }
}

function writePreviewMedia(media: InspectionMedia[]) {
  safeSetPreviewItem(previewMediaKey, JSON.stringify(media), () => JSON.stringify(compactInspectionMediaForPreviewStorage(media)));
}

function compactInspectionMediaForPreviewStorage(media: InspectionMedia[]) {
  return media.slice(0, 900).map((item) => ({
    ...item,
    file_url: compactPreviewMediaUrl(item.file_url),
    file_size: item.file_size && item.file_size > 500_000 ? 500_000 : item.file_size,
  }));
}

function readPreviewSignatures() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewSignaturesKey) ?? "[]") as InspectionSignature[];
  } catch {
    return [];
  }
}

function writePreviewSignatures(signatures: InspectionSignature[]) {
  safeSetPreviewItem(previewSignaturesKey, JSON.stringify(signatures));
}

async function createPreviewInspection(input: InspectionInput): Promise<Inspection> {
  const now = new Date().toISOString();
  const { properties } = await listProperties();
  const property = properties.find((item) => item.id === input.property_id);
  const inspection: Inspection = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    property_id: input.property_id,
    assigned_to: null,
    inspection_type: input.inspection_type,
    status: input.status,
    scheduled_at: input.scheduled_at || null,
    started_at: null,
    completed_at: null,
    title: input.title,
    summary: input.summary || null,
    tenant_name: input.tenant_name || null,
    tenant_document: input.tenant_document || null,
    owner_name: input.owner_name || property?.property_owners?.name || null,
    public_token: null,
    pdf_url: null,
    metadata: {},
    created_at: now,
    updated_at: now,
    properties: mapProperty(property),
  };

  writePreviewInspections([inspection, ...readPreviewInspections()]);

  if (input.create_default_rooms ?? true) {
    const rooms = defaultRoomNames.map((name, index) => ({
      id: window.crypto.randomUUID(),
      company_id: "preview-company",
      inspection_id: inspection.id,
      name,
      position: index + 1,
      general_condition: "not_checked" as const,
      notes: null,
      created_at: now,
      updated_at: now,
    }));
    writePreviewRooms([...rooms, ...readPreviewRooms()]);
  }

  return inspection;
}

function mapProperty(property?: Property) {
  if (!property) return null;

  return {
    id: property.id,
    code: property.code,
    title: property.title,
    neighborhood: property.neighborhood,
    city: property.city,
    state: property.state,
  };
}

function createPreviewRoom(inspectionId: string, input: InspectionRoomInput): InspectionRoom {
  const now = new Date().toISOString();
  const room: InspectionRoom = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    inspection_id: inspectionId,
    name: input.name,
    position: input.position ?? readPreviewRooms().filter((item) => item.inspection_id === inspectionId).length + 1,
    general_condition: input.general_condition ?? "not_checked",
    notes: input.notes || null,
    created_at: now,
    updated_at: now,
  };

  writePreviewRooms([...readPreviewRooms(), room]);
  return room;
}

function updatePreviewRoom(
  inspectionId: string,
  roomId: string,
  input: Partial<InspectionRoomInput>,
): InspectionRoom {
  const rooms = readPreviewRooms();
  const room = rooms.find((item) => item.id === roomId && item.inspection_id === inspectionId);
  if (!room) throw new Error("Ambiente não encontrado.");

  const updated = {
    ...room,
    ...input,
    notes: input.notes === undefined ? room.notes : input.notes || null,
    updated_at: new Date().toISOString(),
  };
  writePreviewRooms(rooms.map((item) => (item.id === roomId ? updated : item)));
  return updated;
}

function createPreviewItem(inspectionId: string, input: InspectionItemInput): InspectionItem {
  const now = new Date().toISOString();
  const item: InspectionItem = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    inspection_id: inspectionId,
    room_id: input.room_id || null,
    label: input.label,
    category: input.category || null,
    condition: input.condition ?? "not_checked",
    notes: input.notes || null,
    repair_required: input.repair_required ?? false,
    position: input.position ?? readPreviewItems().filter((entry) => entry.inspection_id === inspectionId).length + 1,
    created_at: now,
    updated_at: now,
  };

  writePreviewItems([...readPreviewItems(), item]);
  return item;
}

function updatePreviewItem(
  inspectionId: string,
  itemId: string,
  input: Partial<InspectionItemInput>,
): InspectionItem {
  const items = readPreviewItems();
  const item = items.find((entry) => entry.id === itemId && entry.inspection_id === inspectionId);
  if (!item) throw new Error("Item não encontrado.");

  const updated = {
    ...item,
    ...input,
    room_id: input.room_id === undefined ? item.room_id : input.room_id || null,
    category: input.category === undefined ? item.category : input.category || null,
    notes: input.notes === undefined ? item.notes : input.notes || null,
    repair_required: input.repair_required ?? item.repair_required,
    updated_at: new Date().toISOString(),
  };
  writePreviewItems(items.map((entry) => (entry.id === itemId ? updated : entry)));
  return updated;
}

function createPreviewMedia(inspectionId: string, input: InspectionMediaInput): InspectionMedia {
  const now = new Date().toISOString();
  const media: InspectionMedia = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    inspection_id: inspectionId,
    room_id: input.room_id || null,
    item_id: input.item_id || null,
    media_type: input.media_type ?? "photo",
    file_url: input.file_url || null,
    storage_bucket: input.storage_bucket || null,
    storage_path: input.storage_path || null,
    file_name: input.file_name || null,
    mime_type: input.mime_type || null,
    file_size: input.file_size ?? null,
    caption: input.caption || null,
    position: input.position ?? readPreviewMedia().filter((entry) => entry.inspection_id === inspectionId).length + 1,
    created_by: "preview-user",
    created_at: now,
    signed_url: input.file_url || null,
  };

  writePreviewMedia([...readPreviewMedia(), media]);
  return media;
}

function createPreviewSignature(
  inspectionId: string,
  input: InspectionSignatureInput,
): { signature: InspectionSignature; inspection: Inspection } {
  const now = new Date().toISOString();
  const signature: InspectionSignature = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    inspection_id: inspectionId,
    signer_name: input.signer_name,
    signer_document: input.signer_document || null,
    signer_email: input.signer_email || null,
    signer_phone: input.signer_phone || null,
    signer_role: input.signer_role,
    status: "pending",
    signature_token: window.crypto.randomUUID(),
    signature_url: null,
    signature_text: null,
    signed_at: null,
    ip_address: null,
    signed_user_agent: null,
    signed_payload: {},
    expires_at: input.expires_at || null,
    created_at: now,
    updated_at: now,
  };

  writePreviewSignatures([...readPreviewSignatures(), signature]);
  const inspection = updatePreviewInspection(inspectionId, {
    status: "waiting_signature",
    public_token: window.crypto.randomUUID(),
    updated_at: now,
  });

  return { signature, inspection };
}

function signPreviewSignature(
  inspectionId: string,
  signatureId: string,
  input: SignInspectionSignatureInput,
): { signature: InspectionSignature; inspection: Inspection } {
  const signatures = readPreviewSignatures();
  const signature = signatures.find(
    (item) => item.id === signatureId && item.inspection_id === inspectionId,
  );

  if (!signature) throw new Error("Assinatura não encontrada.");
  if (signature.status === "signed") throw new Error("Assinatura já confirmada.");

  const now = new Date().toISOString();
  const updatedSignature: InspectionSignature = {
    ...signature,
    status: "signed",
    signature_text: input.signature_text,
    signed_at: now,
    ip_address: "preview",
    signed_user_agent: window.navigator.userAgent,
    signed_payload: {
      accepted_terms: input.accepted_terms,
      signed_by_user_id: "preview-user",
      signed_at: now,
    },
    updated_at: now,
  };
  const nextSignatures = signatures.map((item) => (item.id === signatureId ? updatedSignature : item));
  writePreviewSignatures(nextSignatures);

  const hasPending = nextSignatures.some(
    (item) => item.inspection_id === inspectionId && item.status === "pending",
  );
  const inspection = updatePreviewInspection(inspectionId, {
    status: hasPending ? "waiting_signature" : "completed",
    ...(hasPending ? {} : { completed_at: now }),
    updated_at: now,
  });

  return { signature: updatedSignature, inspection };
}

function updatePreviewInspection(inspectionId: string, patch: Partial<Inspection>) {
  const inspections = readPreviewInspections();
  const inspection = inspections.find((item) => item.id === inspectionId);
  if (!inspection) throw new Error("Vistoria não encontrada.");

  const updated = { ...inspection, ...patch };
  writePreviewInspections(inspections.map((item) => (item.id === inspectionId ? updated : item)));
  return updated;
}

function deletePreviewInspection(inspectionId: string) {
  writePreviewInspections(readPreviewInspections().filter((item) => item.id !== inspectionId));
  writePreviewRooms(readPreviewRooms().filter((room) => room.inspection_id !== inspectionId));
  writePreviewItems(readPreviewItems().filter((item) => item.inspection_id !== inspectionId));
  writePreviewMedia(readPreviewMedia().filter((entry) => entry.inspection_id !== inspectionId));
  writePreviewSignatures(
    readPreviewSignatures().filter((signature) => signature.inspection_id !== inspectionId),
  );
}

async function createPreviewInspectionPdf(inspectionId: string): Promise<InspectionPdfResponse> {
  const details = await getInspectionDetails(inspectionId);
  const generatedAt = new Date().toISOString();
  const pdfUrl = createPreviewPdfDataUrl({
    ...details,
    generatedAt,
  });
  const inspections = readPreviewInspections();
  const baseInspection = inspections.find((item) => item.id === inspectionId);

  if (!baseInspection) {
    throw new Error("Vistoria não encontrada.");
  }

  const updatedInspection: Inspection = {
    ...baseInspection,
    pdf_url: pdfUrl,
    metadata: {
      ...(baseInspection.metadata ?? {}),
      pdf_generated_at: generatedAt,
      pdf_preview: true,
    },
    updated_at: generatedAt,
    properties: details.inspection.properties,
  };

  writePreviewInspections(
    inspections.map((item) => (item.id === inspectionId ? { ...updatedInspection, properties: undefined } : item)),
  );

  return {
    inspection: updatedInspection,
    pdf: {
      bucket: null,
      path: null,
      signed_url: pdfUrl,
      generated_at: generatedAt,
    },
  };
}

function createPreviewPdfDataUrl({
  inspection,
  rooms,
  items,
  media,
  signatures,
  generatedAt,
}: {
  inspection: Inspection;
  rooms: InspectionRoom[];
  items: InspectionItem[];
  media: InspectionMedia[];
  signatures: InspectionSignature[];
  generatedAt: string;
}) {
  const address = [
    inspection.properties?.neighborhood,
    inspection.properties?.city,
    inspection.properties?.state,
  ]
    .filter(Boolean)
    .join(", ");
  const lines = [
    "IMOBIFLOW - LAUDO DE VISTORIA",
    "",
    `Titulo: ${inspection.title}`,
    `Imovel: ${inspection.properties?.title ?? "Nao informado"}`,
    `Regiao: ${address || "Nao informado"}`,
    `Tipo: ${inspection.inspection_type}`,
    `Status: ${inspection.status}`,
    `Gerado em: ${formatPdfDate(generatedAt)}`,
    "",
    "PARTES",
    `Proprietario: ${inspection.owner_name || "Nao informado"}`,
    `Locatario: ${inspection.tenant_name || "Nao informado"}`,
    `Documento do locatario: ${inspection.tenant_document || "Nao informado"}`,
    "",
    "RESUMO TECNICO",
    inspection.summary || "Nenhum resumo tecnico informado.",
    "",
    "INDICADORES",
    `Ambientes: ${rooms.length}`,
    `Itens tecnicos: ${items.length}`,
    `Itens verificados: ${items.filter((item) => item.condition !== "not_checked").length}`,
    `Reparos sinalizados: ${items.filter((item) => item.repair_required).length}`,
    `Fotos/anexos: ${media.length}`,
    `Assinaturas: ${signatures.filter((signature) => signature.status === "signed").length}/${signatures.length}`,
    "",
    "AMBIENTES E CHECKLIST",
  ];

  for (const room of rooms) {
    const roomItems = items.filter((item) => item.room_id === room.id);
    lines.push("");
    lines.push(`${room.name} - ${room.general_condition}`);
    if (room.notes) lines.push(`Observacoes: ${room.notes}`);

    if (roomItems.length === 0) {
      lines.push("Nenhum item tecnico registrado neste ambiente.");
      continue;
    }

    for (const item of roomItems) {
      lines.push(
        `- ${item.label} | ${item.category || "Sem categoria"} | ${item.condition} | ${
          item.repair_required ? "Reparo necessario" : "Sem reparo"
        }`,
      );
      if (item.notes) lines.push(`  Observacao: ${item.notes}`);
    }
  }

  if (signatures.length > 0) {
    lines.push("");
    lines.push("ASSINATURAS");
    for (const signature of signatures) {
      lines.push(
        `- ${signature.signer_name} | ${signature.signer_role} | ${
          signature.signer_document || "Documento nao informado"
        } | ${signature.status === "signed" ? `Assinada em ${formatPdfDate(signature.signed_at)}` : "Pendente"}`,
      );
    }
  }

  lines.push("");
  lines.push("Documento gerado automaticamente pelo ImobiFlow em modo preview.");

  return `data:application/pdf;base64,${window.btoa(createPdfString(lines.flatMap((line) => wrapPdfLine(line))))}`;
}

function createPdfString(lines: string[]) {
  const pageLineLimit = 44;
  const pages = chunkArray(lines, pageLineLimit);
  const objects = new Map<number, string>();
  const pageIds: number[] = [];
  let nextId = 4;

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const pageLines of pages) {
    const pageId = nextId;
    const contentId = nextId + 1;
    nextId += 2;
    pageIds.push(pageId);

    const content = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL", ...pageLines.map((line) => `(${escapePdfText(line)}) Tj T*`), "ET"].join("\n");
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.set(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }

  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);

  const maxId = nextId - 1;
  const offsets = Array<number>(maxId + 1).fill(0);
  let pdf = "%PDF-1.4\n";

  for (let id = 1; id <= maxId; id += 1) {
    const object = objects.get(id);
    if (!object) continue;
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= maxId; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

function escapePdfText(value: string) {
  return normalizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function normalizePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapPdfLine(line: string, maxLength = 92) {
  const normalized = normalizePdfText(line);
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length > maxLength) {
      lines.push(current);
      current = word;
      continue;
    }

    current = `${current} ${word}`;
  }

  if (current) lines.push(current);
  return lines;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function formatPdfDate(value: string | null) {
  if (!value) return "Nao informado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
