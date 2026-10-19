import { apiRequest } from "./api";
import { getStoredToken } from "./auth";
import { isLocalFrontend } from "./local-dev-session";

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
const localStorageKey = "imobiflow-local-registrations";

function readLocalRegistrations(): PartyRegistration[] {
  if (!isLocalFrontend() || typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(localStorageKey) ?? "[]");
    return Array.isArray(parsed) ? (parsed as PartyRegistration[]) : [];
  } catch {
    return [];
  }
}

function writeLocalRegistrations(registrations: PartyRegistration[]) {
  if (!isLocalFrontend() || typeof window === "undefined") return;
  window.localStorage.setItem(localStorageKey, JSON.stringify(registrations));
}

function localId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeDocument(value?: string | null) {
  return String(value ?? "").replace(/\D/g, "");
}

function buildLocalRegistration(role: RegistrationRole, input: RegistrationInput): PartyRegistration {
  const now = new Date().toISOString();
  const roleId = localId(`local-${role}`);
  const partyId = localId("local-party");
  const document = input.document?.trim() || null;

  return {
    id: roleId,
    role,
    status: "active",
    party: {
      id: partyId,
      company_id: "local-dev-company",
      party_type: input.party_type,
      name: input.name.trim(),
      document,
      document_normalized: document ? normalizeDocument(document) : null,
      rg: input.rg?.trim() || null,
      nationality: input.nationality?.trim() || null,
      occupation: input.occupation?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      whatsapp: input.whatsapp?.trim() || null,
      address_json: input.address_json ?? {},
      status: "active",
      created_at: now,
      updated_at: now,
    },
    profile: {
      id: localId("local-profile"),
      ...(role === "buyer"
        ? { interest_json: input.interest_json ?? {}, financial_json: input.financial_json ?? {} }
        : {}),
      ...(role === "tenant"
        ? { rental_json: input.rental_json ?? {}, guarantor_json: input.guarantor_json ?? {} }
        : {}),
      ...(role === "broker"
        ? {
            creci_number: input.creci_number?.trim() || null,
            job_title: input.job_title?.trim() || null,
            photo_url: null,
            bio_text: input.bio_text?.trim() || null,
          }
        : {}),
      created_at: now,
      updated_at: now,
    },
    linked_users:
      role === "broker" && input.access_email?.trim()
        ? [
            {
              id: localId("local-user"),
              name: input.name.trim(),
              email: input.access_email.trim(),
              phone: input.phone?.trim() || null,
              status: "active",
              role: "broker",
            },
          ]
        : [],
  };
}


export async function listRegistrations(role: RegistrationRole) {
  if (isLocalFrontend()) {
    return { registrations: readLocalRegistrations().filter((item) => item.role === role) };
  }

  return apiRequest<{ registrations: PartyRegistration[] }>(endpointByRole[role], {
    token: getStoredToken() ?? undefined,
  });
}

export async function createRegistration(role: RegistrationRole, input: RegistrationInput) {
  if (isLocalFrontend()) {
    const registration = buildLocalRegistration(role, input);
    const current = readLocalRegistrations();
    writeLocalRegistrations([registration, ...current]);
    return { registration };
  }

  return apiRequest<{ registration: PartyRegistration }>(endpointByRole[role], {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}


export async function lookupRegistrationDocument(document: string) {
  if (isLocalFrontend()) {
    const normalized = normalizeDocument(document);
    const existing = readLocalRegistrations().find(
      (item) => normalizeDocument(item.party.document) === normalized,
    );
    return {
      type: normalized.length === 14 ? "cnpj" as const : "cpf" as const,
      source: existing ? "tenant" as const : "none" as const,
      found: Boolean(existing),
      party: existing?.party ?? null,
    };
  }

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
  if (isLocalFrontend()) {
    const digits = cep.replace(/\D/g, "");
    const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    if (!response.ok) throw new Error("Não foi possível consultar o CEP.");
    const data = (await response.json()) as Record<string, string | boolean>;
    if (data.erro) throw new Error("CEP não encontrado.");
    return {
      address: {
        zip_code: String(data.cep ?? cep),
        street: String(data.logradouro ?? ""),
        complement: String(data.complemento ?? ""),
        neighborhood: String(data.bairro ?? ""),
        city: String(data.localidade ?? ""),
        state: String(data.uf ?? ""),
        country: "Brasil",
        ddd: String(data.ddd ?? ""),
      },
    };
  }

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

  if (isLocalFrontend()) {
    const current = readLocalRegistrations();
    const next = current.map((item) =>
      item.id === roleId
        ? {
            ...item,
            profile: item.profile
              ? { ...item.profile, photo_url: contentBase64, updated_at: new Date().toISOString() }
              : item.profile,
          }
        : item,
    );
    writeLocalRegistrations(next);
    return { photo_url: contentBase64 };
  }

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
