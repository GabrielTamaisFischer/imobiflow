import { apiRequest } from "./api";
import type { Inspection, InspectionSignature } from "./inspections";

const previewInspectionsKey = "imobiflow.preview.inspections";
const previewSignaturesKey = "imobiflow.preview.inspection_signatures";
const previewPropertiesKey = "imobiflow.preview.properties";

type PreviewProperty = {
  id: string;
  code: string | null;
  title: string;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
};

export type PublicInspectionSignatureResponse = {
  signature: InspectionSignature;
  inspection: Inspection;
  company: {
    id: string;
    name: string;
    status: string;
  };
};

export async function getPublicInspectionSignature(token: string) {
  const preview = readPreviewPublicSignature(token);
  if (preview) return preview;

  return apiRequest<PublicInspectionSignatureResponse>(`/public/inspections/signatures/${token}`);
}

export async function signPublicInspectionSignature(
  token: string,
  input: { signature_text: string; accepted_terms: true },
) {
  const preview = signPreviewPublicSignature(token, input);
  if (preview) return preview;

  return apiRequest<PublicInspectionSignatureResponse>(`/public/inspections/signatures/${token}/sign`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function readPreviewPublicSignature(token: string): PublicInspectionSignatureResponse | null {
  if (typeof window === "undefined") return null;

  const signatures = readPreviewSignatures();
  const signature = signatures.find((item) => item.signature_token === token);
  if (!signature) return null;

  const inspections = readPreviewInspections();
  const inspection = inspections.find((item) => item.id === signature.inspection_id);
  if (!inspection) return null;

  const properties = readPreviewProperties();
  const property = properties.find((item) => item.id === inspection.property_id);

  return {
    signature,
    inspection: {
      ...inspection,
      properties: property
        ? {
            id: property.id,
            code: property.code,
            title: property.title,
            neighborhood: property.neighborhood,
            city: property.city,
            state: property.state,
          }
        : null,
    },
    company: {
      id: "preview-company",
      name: "ImobiFlow Preview",
      status: "active",
    },
  };
}

function signPreviewPublicSignature(
  token: string,
  input: { signature_text: string; accepted_terms: true },
): PublicInspectionSignatureResponse | null {
  if (typeof window === "undefined") return null;

  const current = readPreviewPublicSignature(token);
  if (!current) return null;
  if (current.signature.status === "signed") return current;

  const now = new Date().toISOString();
  const signatures = readPreviewSignatures();
  const updatedSignature: InspectionSignature = {
    ...current.signature,
    status: "signed",
    signature_text: input.signature_text,
    signed_at: now,
    ip_address: "preview-public",
    signed_user_agent: window.navigator.userAgent,
    signed_payload: {
      accepted_terms: input.accepted_terms,
      signed_publicly: true,
      signed_at: now,
    },
    updated_at: now,
  };

  writePreviewSignatures(
    signatures.map((signature) =>
      signature.id === updatedSignature.id ? updatedSignature : signature,
    ),
  );

  const hasPending = signatures.some(
    (signature) =>
      signature.inspection_id === updatedSignature.inspection_id &&
      signature.id !== updatedSignature.id &&
      signature.status === "pending",
  );

  const inspections = readPreviewInspections();
  const inspection = inspections.find((item) => item.id === updatedSignature.inspection_id);
  if (!inspection) return null;

  const updatedInspection: Inspection = {
    ...inspection,
    status: hasPending ? "waiting_signature" : "completed",
    ...(hasPending ? {} : { completed_at: now }),
    updated_at: now,
  };
  writePreviewInspections(
    inspections.map((item) => (item.id === updatedInspection.id ? updatedInspection : item)),
  );

  return {
    ...current,
    signature: updatedSignature,
    inspection: {
      ...current.inspection,
      ...updatedInspection,
      properties: current.inspection.properties,
    },
  };
}

function readPreviewInspections() {
  try {
    return JSON.parse(window.localStorage.getItem(previewInspectionsKey) ?? "[]") as Inspection[];
  } catch {
    return [];
  }
}

function writePreviewInspections(inspections: Inspection[]) {
  window.localStorage.setItem(previewInspectionsKey, JSON.stringify(inspections));
}

function readPreviewSignatures() {
  try {
    return JSON.parse(window.localStorage.getItem(previewSignaturesKey) ?? "[]") as InspectionSignature[];
  } catch {
    return [];
  }
}

function writePreviewSignatures(signatures: InspectionSignature[]) {
  window.localStorage.setItem(previewSignaturesKey, JSON.stringify(signatures));
}

function readPreviewProperties() {
  try {
    return JSON.parse(window.localStorage.getItem(previewPropertiesKey) ?? "[]") as PreviewProperty[];
  } catch {
    return [];
  }
}
