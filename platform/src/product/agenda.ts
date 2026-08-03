import { apiRequest } from "./api";
import { getStoredToken, isPreviewToken } from "./auth";

const previewAppointmentsKey = "imobiflow.preview.appointments";
const previewRentalsKey = "imobiflow.preview.rentals";

export type Appointment = {
  id: string;
  company_id: string;
  lead_id: string | null;
  property_id: string | null;
  assigned_to: string | null;
  appointment_type: "visit" | "return" | "meeting" | "inspection" | "signature" | "follow_up";
  title: string;
  description: string | null;
  location_text: string | null;
  starts_at: string;
  ends_at: string | null;
  reminder_at: string | null;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "rescheduled" | "no_show";
  result_notes: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  leads?: { id: string; name: string; phone: string | null; email: string | null } | null;
  properties?: {
    id: string;
    title: string;
    code: string | null;
    street: string | null;
    number: string | null;
    neighborhood: string | null;
    city: string | null;
    state: string | null;
  } | null;
  users?: { id: string; name: string; email: string } | null;
};

export type AppointmentInput = {
  lead_id?: string;
  property_id?: string;
  assigned_to?: string;
  appointment_type: Appointment["appointment_type"];
  title: string;
  description?: string;
  location_text?: string;
  starts_at: string;
  ends_at?: string;
  reminder_at?: string;
  metadata?: Record<string, unknown>;
};

export type AppointmentUpdateInput = Partial<AppointmentInput> & {
  status?: Appointment["status"];
  metadata?: Record<string, unknown>;
};

export type RentalAgreement = {
  id: string;
  company_id: string;
  contract_id: string;
  property_id: string;
  owner_id: string | null;
  tenant_party_id: string | null;
  lead_id: string | null;
  status: "draft" | "active" | "pending_signature" | "ending" | "ended" | "cancelled" | "overdue";
  starts_at: string;
  ends_at: string | null;
  monthly_amount_cents: number;
  condominium_fee_cents: number;
  iptu_cents: number;
  insurance_cents: number;
  due_day: number;
  adjustment_index: string;
  guarantee_type: string | null;
  commission_type: "percentage" | "fixed";
  commission_rate: number;
  commission_fixed_cents: number;
  operational_fee_cents: number;
  operational_fee_payer: "company" | "tenant" | "owner";
  preferred_payment_method: "pix" | "boleto" | "hybrid" | "manual";
  last_charge_due_date: string | null;
  next_charge_due_date: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  properties?: { id: string; title: string; code: string | null; status: string } | null;
  property_owners?: { id: string; name: string; email: string | null; phone: string | null } | null;
  contract_parties?: {
    id: string;
    name: string;
    document: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  contracts?: { id: string; title: string; contract_number: string | null; status: string } | null;
};

export type RentalInput = {
  property_id: string;
  owner_id?: string;
  lead_id?: string;
  tenant_name: string;
  tenant_document?: string;
  tenant_email?: string;
  tenant_phone?: string;
  starts_at: string;
  ends_at?: string;
  monthly_amount_cents: number;
  condominium_fee_cents?: number;
  iptu_cents?: number;
  insurance_cents?: number;
  due_day: number;
  adjustment_index?: string;
  guarantee_type?: string;
  commission_type?: "percentage" | "fixed";
  commission_rate?: number;
  commission_fixed_cents?: number;
  operational_fee_cents?: number;
  operational_fee_payer?: "company" | "tenant" | "owner";
  preferred_payment_method?: "pix" | "boleto" | "hybrid" | "manual";
  generate_first_charge?: boolean;
  first_due_date?: string;
  notes?: string;
};

export function isPreviewAgenda() {
  return isPreviewToken(getStoredToken());
}

export async function listAppointments() {
  if (isPreviewAgenda()) return { appointments: readPreviewAppointments() };

  return apiRequest<{ appointments: Appointment[] }>("/appointments?status=all", {
    token: getStoredToken() ?? undefined,
  });
}

export async function createAppointment(input: AppointmentInput) {
  if (isPreviewAgenda()) {
    const appointment = createPreviewAppointment(input);
    return { appointment };
  }

  return apiRequest<{ appointment: Appointment }>("/appointments", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function updateAppointmentStatus(
  appointmentId: string,
  input: {
    status: Appointment["status"];
    result_notes?: string;
    next_follow_up_at?: string;
  },
) {
  if (isPreviewAgenda()) {
    return { appointment: updatePreviewAppointmentStatus(appointmentId, input) };
  }

  return apiRequest<{ appointment: Appointment }>(`/appointments/${appointmentId}/status`, {
    method: "PATCH",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function updateAppointment(appointmentId: string, input: AppointmentUpdateInput) {
  if (isPreviewAgenda()) {
    return { appointment: updatePreviewAppointment(appointmentId, input) };
  }

  return apiRequest<{ appointment: Appointment }>(`/appointments/${appointmentId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function deleteAppointment(appointmentId: string) {
  if (isPreviewAgenda()) {
    deletePreviewAppointment(appointmentId);
    return;
  }

  await apiRequest<void>(`/appointments/${appointmentId}`, {
    method: "DELETE",
    token: getStoredToken() ?? undefined,
  });
}

export async function listRentals() {
  if (isPreviewAgenda()) return { rentals: readPreviewRentals() };

  return apiRequest<{ rentals: RentalAgreement[] }>("/rentals?status=all", {
    token: getStoredToken() ?? undefined,
  });
}

export async function createRental(input: RentalInput) {
  if (isPreviewAgenda()) {
    const rental = createPreviewRental(input);
    return { rental, contract: null, charge: null };
  }

  return apiRequest<{ rental: RentalAgreement; contract: unknown; charge: unknown }>("/rentals", {
    method: "POST",
    body: JSON.stringify(input),
    token: getStoredToken() ?? undefined,
  });
}

export async function generateNextRentalCharge(
  rentalId: string,
  input: { due_date?: string; notes?: string } = {},
) {
  if (isPreviewAgenda()) {
    const rental = updatePreviewRentalNextCharge(rentalId, input.due_date);
    return { rental, charge: null };
  }

  return apiRequest<{ rental: RentalAgreement; charge: unknown }>(
    `/rentals/${rentalId}/generate-charge`,
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function generateDueRentalCharges(input: { until_date?: string; limit?: number } = {}) {
  if (isPreviewAgenda()) return { generated: [], skipped: [], until_date: input.until_date ?? null };

  return apiRequest<{ generated: unknown[]; skipped: Array<{ rental_id: string; reason: string }>; until_date: string }>(
    "/rentals/generate-due-charges",
    {
      method: "POST",
      body: JSON.stringify(input),
      token: getStoredToken() ?? undefined,
    },
  );
}

function readPreviewAppointments() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(previewAppointmentsKey) ?? "[]") as Appointment[];
  } catch {
    return [];
  }
}

function writePreviewAppointments(appointments: Appointment[]) {
  window.localStorage.setItem(previewAppointmentsKey, JSON.stringify(appointments));
}

function readPreviewRentals() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(previewRentalsKey) ?? "[]") as RentalAgreement[];
  } catch {
    return [];
  }
}

function writePreviewRentals(rentals: RentalAgreement[]) {
  window.localStorage.setItem(previewRentalsKey, JSON.stringify(rentals));
}

function createPreviewAppointment(input: AppointmentInput): Appointment {
  const now = new Date().toISOString();
  const appointment: Appointment = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    lead_id: input.lead_id || null,
    property_id: input.property_id || null,
    assigned_to: input.assigned_to || null,
    appointment_type: input.appointment_type,
    title: input.title,
    description: input.description || null,
    location_text: input.location_text || null,
    starts_at: input.starts_at,
    ends_at: input.ends_at || null,
    reminder_at: input.reminder_at || null,
    status: "scheduled",
    result_notes: null,
    completed_at: null,
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
  };

  writePreviewAppointments([appointment, ...readPreviewAppointments()]);
  return appointment;
}

function deletePreviewAppointment(appointmentId: string) {
  writePreviewAppointments(readPreviewAppointments().filter((item) => item.id !== appointmentId));
}

function updatePreviewAppointmentStatus(
  appointmentId: string,
  input: { status: Appointment["status"]; result_notes?: string },
) {
  const appointments = readPreviewAppointments();
  const appointment = appointments.find((item) => item.id === appointmentId);
  if (!appointment) throw new Error("Compromisso nao encontrado.");

  appointment.status = input.status;
  appointment.result_notes = input.result_notes || appointment.result_notes;
  appointment.completed_at = input.status === "completed" ? new Date().toISOString() : appointment.completed_at;
  appointment.updated_at = new Date().toISOString();
  writePreviewAppointments(appointments);
  return appointment;
}

function updatePreviewAppointment(appointmentId: string, input: AppointmentUpdateInput) {
  const appointments = readPreviewAppointments();
  const appointment = appointments.find((item) => item.id === appointmentId);
  if (!appointment) throw new Error("Compromisso nao encontrado.");

  if ("lead_id" in input) appointment.lead_id = input.lead_id || null;
  if ("property_id" in input) appointment.property_id = input.property_id || null;
  if ("assigned_to" in input) appointment.assigned_to = input.assigned_to || null;
  if (input.appointment_type) appointment.appointment_type = input.appointment_type;
  if (input.title) appointment.title = input.title;
  if ("description" in input) appointment.description = input.description || null;
  if ("location_text" in input) appointment.location_text = input.location_text || null;
  if (input.starts_at) appointment.starts_at = input.starts_at;
  if ("ends_at" in input) appointment.ends_at = input.ends_at || null;
  if ("reminder_at" in input) appointment.reminder_at = input.reminder_at || null;
  if (input.status) appointment.status = input.status;
  if (input.metadata) appointment.metadata = input.metadata;
  appointment.updated_at = new Date().toISOString();

  writePreviewAppointments(appointments);
  return appointment;
}

function createPreviewRental(input: RentalInput): RentalAgreement {
  const now = new Date().toISOString();
  const rental: RentalAgreement = {
    id: window.crypto.randomUUID(),
    company_id: "preview-company",
    contract_id: window.crypto.randomUUID(),
    property_id: input.property_id,
    owner_id: input.owner_id || null,
    tenant_party_id: window.crypto.randomUUID(),
    lead_id: input.lead_id || null,
    status: "active",
    starts_at: input.starts_at,
    ends_at: input.ends_at || null,
    monthly_amount_cents: input.monthly_amount_cents,
    condominium_fee_cents: input.condominium_fee_cents ?? 0,
    iptu_cents: input.iptu_cents ?? 0,
    insurance_cents: input.insurance_cents ?? 0,
    due_day: input.due_day,
    adjustment_index: input.adjustment_index || "ipca",
    guarantee_type: input.guarantee_type || null,
    commission_type: input.commission_type || "percentage",
    commission_rate: input.commission_rate ?? 10,
    commission_fixed_cents: input.commission_fixed_cents ?? 0,
    operational_fee_cents: input.operational_fee_cents ?? 0,
    operational_fee_payer: input.operational_fee_payer || "company",
    preferred_payment_method: input.preferred_payment_method || "pix",
    last_charge_due_date: null,
    next_charge_due_date: input.first_due_date || input.starts_at,
    notes: input.notes || null,
    metadata: { tenant_name: input.tenant_name },
    created_at: now,
    updated_at: now,
    contract_parties: {
      id: window.crypto.randomUUID(),
      name: input.tenant_name,
      document: input.tenant_document || null,
      email: input.tenant_email || null,
      phone: input.tenant_phone || null,
    },
  };

  writePreviewRentals([rental, ...readPreviewRentals()]);
  return rental;
}

function updatePreviewRentalNextCharge(rentalId: string, dueDate?: string) {
  const rentals = readPreviewRentals();
  const rental = rentals.find((item) => item.id === rentalId);
  if (!rental) throw new Error("Locacao nao encontrada.");

  const currentDueDate = dueDate || rental.next_charge_due_date || rental.starts_at;
  rental.last_charge_due_date = currentDueDate;
  rental.next_charge_due_date = addPreviewMonth(currentDueDate, rental.due_day);
  rental.updated_at = new Date().toISOString();
  writePreviewRentals(rentals);
  return rental;
}

function addPreviewMonth(dueDate: string, dueDay: number) {
  const [year, month] = dueDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, Math.min(dueDay, 28)));
  return date.toISOString().slice(0, 10);
}
