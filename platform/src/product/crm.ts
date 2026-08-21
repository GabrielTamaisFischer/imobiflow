import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

const previewLeadsKey = "imobiflow.preview.crm.leads";

export type CrmStage = {
  id: string;
  name: string;
  position: number;
  probability: number;
  color: string | null;
  status: string;
};

export type CrmPipelineResponse = {
  pipeline: {
    id: string;
    name: string;
    is_default: boolean;
    status: string;
  };
  stages: CrmStage[];
};

export type Lead = {
  id: string;
  company_id: string;
  stage_id: string | null;
  assigned_to: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  interest_type: "sale" | "rent" | "both" | "not_defined";
  status: "open" | "won" | "lost" | "archived";
  lost_reason: string | null;
  budget_cents: number | null;
  property_reference: string | null;
  notes: string | null;
  first_contact_at: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadInput = {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  interest_type: Lead["interest_type"];
  stage_id?: string;
  budget_cents?: number;
  property_reference?: string;
  notes?: string;
  next_follow_up_at?: string;
  assigned_to?: string;
  status?: Lead["status"];
  lost_reason?: string;
};

export type CrmUser = { id: string; name: string; email: string; role: string; status: string };
export type LeadInterest = {
  id: string;
  property_id: string | null;
  property_code: string | null;
  property_title: string | null;
  operation: string | null;
  created_at: string;
  source: string;
};
export type LeadActivity = { id: string; type: string; body: string | null; occurred_at: string; user_name?: string | null };

export type LeadTask = {
  id: string;
  company_id: string;
  lead_id: string;
  assigned_to: string | null;
  title: string;
  due_at: string | null;
  status: "pending" | "done" | "cancelled";
  created_at: string;
  updated_at: string;
};

const previewStages: CrmStage[] = [
  { id: "preview-stage-new", name: "Novo lead", position: 1, probability: 10, color: "#8b5cf6", status: "active" },
  { id: "preview-stage-contact", name: "Atendimento", position: 2, probability: 25, color: "#06b6d4", status: "active" },
  { id: "preview-stage-visit", name: "Visita", position: 3, probability: 45, color: "#22c55e", status: "active" },
  { id: "preview-stage-offer", name: "Proposta", position: 4, probability: 70, color: "#f59e0b", status: "active" },
  { id: "preview-stage-close", name: "Fechamento", position: 5, probability: 90, color: "#ef4444", status: "active" },
];

export function isPreviewCrm() {
  return isPreviewToken(getStoredToken());
}

export async function loadCrmPipeline() {
  if (isPreviewCrm()) return getPreviewPipeline();

  return apiRequest<CrmPipelineResponse>("/crm/pipeline", {
    token: getStoredToken() ?? undefined,
  });
}

export async function listLeads(filters: Record<string, string | number | undefined> = {}) {
  if (isPreviewCrm()) {
    const preview = readPreviewLeads();
    return { leads: preview, pagination: { page: 1, page_size: preview.length, total: preview.length, total_pages: 1, has_next: false, has_previous: false } };
  }

  const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
  return apiRequest<{ leads: Lead[]; pagination: { page: number; page_size: number; total: number; total_pages: number; has_next: boolean; has_previous: boolean } }>(`/crm/leads${query.toString() ? `?${query}` : ""}`, {
    token: getStoredToken() ?? undefined,
  });
}

export async function createLead(input: LeadInput) {
  if (isPreviewCrm()) {
    const lead = createPreviewLead(input);
    return { lead };
  }

  return apiRequest<{ lead: Lead }>("/crm/leads", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function moveLeadToStage(leadId: string, stageId: string) {
  if (isPreviewCrm()) {
    const leads = readPreviewLeads();
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) throw new Error("Lead não encontrado.");
    const updatedLead = { ...lead, stage_id: stageId, updated_at: new Date().toISOString() };
    writePreviewLeads(leads.map((item) => (item.id === leadId ? updatedLead : item)));
    return { lead: updatedLead };
  }

  return apiRequest<{ lead: Lead }>(`/crm/leads/${leadId}/stage`, {
    method: "PATCH",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify({ stage_id: stageId }),
  });
}

export async function getLead(leadId: string) {
  return apiRequest<{ lead: Lead; interests: LeadInterest[]; activities: LeadActivity[] }>(`/crm/leads/${leadId}`, { token: getStoredToken() ?? undefined });
}

export async function createLeadActivity(leadId: string, input: { type: string; body?: string; occurred_at?: string }) {
  return apiRequest<{ activity: LeadActivity }>(`/crm/leads/${leadId}/activities`, { method: "POST", token: getStoredToken() ?? undefined, body: JSON.stringify(input) });
}

export async function getCrmRouting() {
  return apiRequest<{ mode: "manual" | "round_robin"; user_ids: string[]; users: CrmUser[] }>("/crm/routing", { token: getStoredToken() ?? undefined });
}

export async function updateCrmRouting(input: { mode: "manual" | "round_robin"; user_ids: string[] }) {
  return apiRequest<{ mode: string; user_ids: string[] }>("/crm/routing", { method: "PATCH", token: getStoredToken() ?? undefined, body: JSON.stringify(input) });
}

export async function listCrmUsers() {
  return apiRequest<{ users: CrmUser[] }>("/auth/users", { token: getStoredToken() ?? undefined });
}

export async function updateLead(leadId: string, input: Partial<LeadInput>) {
  if (isPreviewCrm()) throw new Error("Edição CRM não disponível no modo de visualização.");
  return apiRequest<{ lead: Lead }>(`/crm/leads/${leadId}`, {
    method: "PATCH",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function createLeadTask(
  leadId: string,
  input: { title: string; due_at?: string; assigned_to?: string },
) {
  return apiRequest<{ task: LeadTask }>(`/crm/leads/${leadId}/tasks`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

function getPreviewPipeline(): CrmPipelineResponse {
  return {
    pipeline: {
      id: "preview-pipeline",
      name: "Funil comercial",
      is_default: true,
      status: "active",
    },
    stages: previewStages,
  };
}

function readPreviewLeads() {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(previewLeadsKey) ?? "[]") as Lead[];
  } catch {
    return [];
  }
}

function writePreviewLeads(leads: Lead[]) {
  window.localStorage.setItem(previewLeadsKey, JSON.stringify(leads));
}

function createPreviewLead(input: LeadInput): Lead {
  const now = new Date().toISOString();
  const lead: Lead = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    stage_id: input.stage_id ?? previewStages[0].id,
    assigned_to: null,
    name: input.name,
    email: input.email || null,
    phone: input.phone || null,
    source: input.source || null,
    interest_type: input.interest_type,
    status: "open",
    lost_reason: null,
    budget_cents: input.budget_cents ?? null,
    property_reference: input.property_reference || null,
    notes: input.notes || null,
    last_contact_at: null,
    next_follow_up_at: input.next_follow_up_at || null,
    created_at: now,
    updated_at: now,
  };

  writePreviewLeads([lead, ...readPreviewLeads()]);
  return lead;
}
