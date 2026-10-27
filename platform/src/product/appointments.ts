import { apiRequest } from "./api";
import { getSafeApiErrorMessage } from "./app-access";
import { getStoredToken } from "./auth";

export const appointmentTypes = [
  "visit",
  "return",
  "meeting",
  "inspection",
  "signature",
  "follow_up",
  "event",
  "task",
] as const;
export const appointmentStatuses = [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
] as const;
export type AppointmentType = (typeof appointmentTypes)[number];
export type AppointmentStatus = (typeof appointmentStatuses)[number];

export type Appointment = {
  id: string;
  company_id: string;
  lead_id: string | null;
  property_id: string | null;
  assigned_to: string;
  created_by: string;
  appointment_type: AppointmentType;
  title: string;
  description: string | null;
  location_text: string | null;
  starts_at: string;
  ends_at: string;
  reminder_at: string | null;
  status: AppointmentStatus;
  // Carrega participantes (ids de usuarios), prioridade/prazo de tarefa, etc. sem exigir migration.
  metadata: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  lead: { id: string; name: string; email: string | null; phone: string | null } | null;
  property: {
    id: string;
    code: string | null;
    title: string;
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city: string | null;
    state: string | null;
  } | null;
  assignee: { id: string; name: string; email: string; role: string } | null;
  creator: { id: string; name: string; email: string } | null;
  events: Array<{
    id: string;
    event_type: string;
    metadata: Record<string, unknown>;
    actor_id: string;
    created_at: string;
  }>;
};

export type AppointmentFilters = {
  status?: AppointmentStatus | "all";
  property_id?: string;
  lead_id?: string;
  assigned_to?: string;
  from?: string;
  to?: string;
  // Lista separada por virgula (ex.: "visit,task") para os filtros de categoria da agenda.
  types?: string;
  q?: string;
};
export type AppointmentInput = {
  id?: string;
  lead_id?: string | null;
  property_id?: string | null;
  assigned_to: string;
  appointment_type: AppointmentType;
  title: string;
  description?: string | null;
  location_text?: string | null;
  starts_at: string;
  ends_at?: string | null;
  reminder_at?: string | null;
  metadata?: Record<string, unknown>;
};

function token() {
  return getStoredToken() ?? undefined;
}
function newId() {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
function query(filters: AppointmentFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params.toString();
}

export function listAppointments(filters: AppointmentFilters = {}) {
  const suffix = query(filters);
  return apiRequest<{ appointments: Appointment[] }>(
    `/real-estate/appointments${suffix ? `?${suffix}` : ""}`,
    { token: token() },
  );
}
export function getAppointment(id: string) {
  return apiRequest<{ appointment: Appointment }>(
    `/real-estate/appointments/${encodeURIComponent(id)}`,
    { token: token() },
  );
}
export function createAppointment(input: AppointmentInput) {
  const id = input.id ?? newId();
  return apiRequest<{ appointment: Appointment; replayed?: boolean }>("/real-estate/appointments", {
    method: "POST",
    token: token(),
    headers: { "Idempotency-Key": `appointment-create:${id}` },
    body: JSON.stringify({ ...input, id }),
  });
}
export function updateAppointment(
  id: string,
  expected_version: number,
  input: Partial<Omit<AppointmentInput, "id">>,
) {
  return apiRequest<{ appointment: Appointment }>(
    `/real-estate/appointments/${encodeURIComponent(id)}`,
    { method: "PATCH", token: token(), body: JSON.stringify({ ...input, expected_version }) },
  );
}
export function cancelAppointment(id: string, expected_version: number) {
  return apiRequest<{ appointment: Appointment; replayed?: boolean }>(
    `/real-estate/appointments/${encodeURIComponent(id)}/cancel`,
    { method: "POST", token: token(), body: JSON.stringify({ expected_version }) },
  );
}
export function completeAppointment(id: string, expected_version: number) {
  return apiRequest<{ appointment: Appointment; replayed?: boolean }>(
    `/real-estate/appointments/${encodeURIComponent(id)}/complete`,
    { method: "POST", token: token(), body: JSON.stringify({ expected_version }) },
  );
}
// Transicao generica (confirmar, iniciar, marcar "nao compareceu" etc.) alem dos atalhos acima.
export function changeAppointmentStatus(id: string, expected_version: number, status: AppointmentStatus) {
  return apiRequest<{ appointment: Appointment; replayed?: boolean }>(
    `/real-estate/appointments/${encodeURIComponent(id)}/status`,
    { method: "POST", token: token(), body: JSON.stringify({ expected_version, status }) },
  );
}

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  visit: "Visita a imóvel",
  return: "Retorno",
  meeting: "Reunião",
  inspection: "Vistoria",
  signature: "Assinatura",
  follow_up: "Follow-up",
  event: "Evento",
  task: "Tarefa",
};
// Rótulo genérico de status (fallback neutro, usado quando o tipo não tem um rótulo próprio).
export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  confirmed: "Confirmada",
  in_progress: "Em andamento",
  completed: "Concluída",
  cancelled: "Cancelada",
  no_show: "Não compareceu",
};
// Vocabulário de status por tipo de compromisso (um corretor vê "Realizada", uma tarefa vê "Concluída" etc.),
// mantendo uma única coluna de status no banco. Um status ausente do mapa do tipo cai no label genérico acima.
const appointmentStatusLabelsByType: Record<AppointmentType, Partial<Record<AppointmentStatus, string>>> = {
  visit: {
    scheduled: "Agendada",
    confirmed: "Confirmada",
    completed: "Realizada",
    cancelled: "Cancelada",
    no_show: "Não compareceu",
  },
  return: { scheduled: "Agendado", completed: "Realizado", cancelled: "Cancelado" },
  meeting: { scheduled: "Agendada", confirmed: "Confirmada", completed: "Realizada", cancelled: "Cancelada", no_show: "Não compareceu" },
  inspection: { scheduled: "Agendada", completed: "Realizada", cancelled: "Cancelada" },
  signature: { scheduled: "Agendada", completed: "Concluída", cancelled: "Cancelada" },
  follow_up: { scheduled: "Pendente", completed: "Concluído", cancelled: "Cancelado" },
  event: { scheduled: "Agendado", confirmed: "Confirmado", completed: "Concluído", cancelled: "Cancelado" },
  task: { scheduled: "Pendente", in_progress: "Em andamento", completed: "Concluída", cancelled: "Cancelada" },
};
export function getAppointmentStatusLabel(type: AppointmentType, status: AppointmentStatus) {
  return appointmentStatusLabelsByType[type]?.[status] ?? appointmentStatusLabels[status];
}
// Estados que fazem sentido oferecer como próxima transição na UI, por tipo de compromisso.
export const appointmentStatusFlowByType: Record<AppointmentType, AppointmentStatus[]> = {
  visit: ["scheduled", "confirmed", "completed", "no_show", "cancelled"],
  return: ["scheduled", "completed", "cancelled"],
  meeting: ["scheduled", "confirmed", "completed", "no_show", "cancelled"],
  inspection: ["scheduled", "completed", "cancelled"],
  signature: ["scheduled", "completed", "cancelled"],
  follow_up: ["scheduled", "completed", "cancelled"],
  event: ["scheduled", "confirmed", "completed", "cancelled"],
  task: ["scheduled", "in_progress", "completed", "cancelled"],
};
export function formatAppointmentDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    ...options,
  }).format(new Date(value));
}
export function toIsoDateTime(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}
export function safeAppointmentError(
  error: unknown,
  fallback = "Não foi possível concluir a operação.",
) {
  return getSafeApiErrorMessage(error, fallback);
}
