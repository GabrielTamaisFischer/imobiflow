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
    rg: string | null;
    nationality: string | null;
    occupation: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    address_json: Record<string, unknown>;
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
    job_title?: string | null;
    photo_url?: string | null;
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
  rg?: string;
  nationality?: string;
  occupation?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address_json?: Record<string, unknown>;
  interest_json?: Record<string, unknown>;
  financial_json?: Record<string, unknown>;
  rental_json?: Record<string, unknown>;
  guarantor_json?: Record<string, unknown>;
  creci_number?: string;
  job_title?: string;
  bio_text?: string;
  access_email?: string;
  access_password?: string;
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


export async function lookupRegistrationDocument(document: string) {
  return apiRequest<{
    type: "cpf" | "cnpj";
    source: "tenant" | "none" | "brasilapi";
    found: boolean;
    party?: PartyRegistration["party"] | null;
    company?: {
      name: string;
      email: string;
      phone: string;
      address: Record<string, string>;
    };
  }>(`/registrations/lookup/document?document=${encodeURIComponent(document)}`, {
    token: getStoredToken() ?? undefined,
  });
}

export async function lookupRegistrationCep(cep: string) {
  return apiRequest<{ address: Record<string, string> }>(
    `/registrations/lookup/cep?cep=${encodeURIComponent(cep)}`,
    { token: getStoredToken() ?? undefined },
  );
}

export async function uploadBrokerPhoto(roleId: string, file: File) {
  const contentBase64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });

  return apiRequest<{ photo_url: string }>(`/registrations/brokers/${roleId}/photo`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify({
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      content_base64: contentBase64,
    }),
  });
}
