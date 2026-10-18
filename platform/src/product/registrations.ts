import { apiRequest } from "./api";
import { getStoredToken } from "./auth";

export type RegistrationRole = "buyer" | "tenant" | "broker";

export type PartyRegistration = {
  id: string;
  role: RegistrationRole;
  status: string;
  party: {
    id: string;
    company_id: string;
    party_type: "individual" | "company";
    name: string;
    document: string | null;
    document_normalized: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    notes: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  };
  profile: {
    id: string;
    interest_json?: Record<string, unknown>;
    financial_json?: Record<string, unknown>;
    rental_json?: Record<string, unknown>;
    guarantor_json?: Record<string, unknown>;
    creci_number?: string | null;
    bio_text?: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  linked_users: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    role: string;
  }>;
};

export type RegistrationInput = {
  name: string;
  party_type: "individual" | "company";
  document?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  notes?: string;
  interest_json?: Record<string, unknown>;
  financial_json?: Record<string, unknown>;
  rental_json?: Record<string, unknown>;
  guarantor_json?: Record<string, unknown>;
  creci_number?: string;
  bio_text?: string;
};

const endpointByRole: Record<RegistrationRole, string> = {
  buyer: "/registrations/buyers",
  tenant: "/registrations/tenants",
  broker: "/registrations/brokers",
};

export async function listRegistrations(role: RegistrationRole) {
  return apiRequest<{ registrations: PartyRegistration[] }>(endpointByRole[role], {
    token: getStoredToken() ?? undefined,
  });
}

export async function createRegistration(role: RegistrationRole, input: RegistrationInput) {
  return apiRequest<{ registration: PartyRegistration }>(endpointByRole[role], {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}
