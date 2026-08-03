import { apiRequest, isUnavailableProductionApi } from "./api";
import { isPreviewAccessAllowed, isStoredPreviewTokenAllowed, previewAccessToken } from "./access-control";

const tokenKey = "imobiflow.access_token";
const previewUserKey = "imobiflow.preview_user";
const previewToken = previewAccessToken;
const localDevToken = import.meta.env.VITE_IMOBIFLOW_LOCAL_DEV_TOKEN || "imobiflow.local_dev_access";
const demoAccessEmail = "gtamaisfischer@gmail.com";
const demoAccessPasswordHash = "568c3c475d919820cc93717fe9a13a44df01d7f6b617d65f29aa202a4f3d9af7";

export type AccessResponse = {
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
  };
  access: {
    company?: {
      id: string;
      name: string;
      status: string;
    };
    appUser?: {
      id: string;
      name: string;
      email: string;
      role: string;
      permissions: string[];
    };
    subscription?: {
      id: string;
      status: string;
      plan_slug: string | null;
      expires_at: string | null;
    } | null;
  };
};

export type AppUserSummary = {
  id: string;
  company_id: string;
  role_id: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: "active" | "invited" | "inactive" | "blocked";
  created_at: string;
  updated_at: string;
  roles?: {
    id: string;
    system_key: string | null;
    name: string;
  } | null;
};

export type UserInvitation = {
  id: string;
  company_id: string;
  role_id: string | null;
  invited_by: string | null;
  email: string;
  name: string | null;
  status: "pending" | "accepted" | "cancelled" | "expired";
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  roles?: {
    id?: string;
    system_key?: string | null;
    name?: string | null;
  } | null;
};

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(tokenKey);
}

export function storeToken(token: string) {
  window.localStorage.setItem(tokenKey, token);
}

export function clearToken() {
  window.localStorage.removeItem(tokenKey);
}

export function isPreviewAccessEnabled() {
  return isPreviewAccessAllowed(import.meta.env) || isUnavailableProductionApi();
}

export function storePreviewAccess() {
  if (!isPreviewAccessEnabled()) return false;

  window.localStorage.setItem(tokenKey, previewToken);
  return true;
}

export function isLocalDevAccessEnabled() {
  return !import.meta.env.PROD && import.meta.env.VITE_IMOBIFLOW_LOCAL_DEV_AUTH === "true";
}

export function storeLocalDevAccess() {
  if (!isLocalDevAccessEnabled()) return false;

  window.localStorage.setItem(tokenKey, localDevToken);
  return true;
}

export function createLocalDevSession(): AccessResponse {
  return {
    session: {
      access_token: localDevToken,
      refresh_token: localDevToken,
    },
    access: {
      company: {
        id: "local-company",
        name: "ImobiFlow Local",
        status: "active",
      },
      appUser: {
        id: "local-user",
        name: "ImobiFlow Local",
        email: "local@imobiflow.app",
        role: "owner",
        permissions: [
          "site.manage",
          "properties.view",
          "properties.manage",
          "owners.view",
          "owners.manage",
          "crm.view",
          "crm.manage",
          "appointments.view",
          "appointments.manage",
        ],
      },
      subscription: {
        id: "local-subscription",
        status: "active",
        plan_slug: "local-dev",
        expires_at: null,
      },
    },
  };
}

export async function storeDemoPreviewAccess(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await sha256(password);

  if (normalizedEmail !== demoAccessEmail || passwordHash !== demoAccessPasswordHash) {
    return false;
  }

  window.localStorage.setItem(tokenKey, previewToken);
  window.localStorage.setItem(
    previewUserKey,
    JSON.stringify({
      name: "GTA Mais Fischer",
      email: demoAccessEmail,
    }),
  );

  return true;
}

export function isPreviewToken(token: string | null) {
  return (
    isStoredPreviewTokenAllowed(token, import.meta.env) ||
    (token === previewToken && hasStoredDemoPreviewUser())
  );
}

export function createPreviewSession(): AccessResponse {
  const previewUser = readStoredPreviewUser();

  if (!isPreviewAccessEnabled() && previewUser.email === "preview@imobiflow.app") {
    throw new Error("O acesso preview esta desativado neste ambiente.");
  }

  return {
    session: {
      access_token: previewToken,
      refresh_token: previewToken,
    },
    access: {
      company: {
        id: "preview-company",
        name: "ImobiFlow Preview",
        status: "preview",
      },
      appUser: {
        id: "preview-user",
        name: previewUser.name,
        email: previewUser.email,
        role: "owner",
        permissions: ["preview:read"],
      },
      subscription: {
        id: "preview-subscription",
        status: "active",
        plan_slug: "preview",
        expires_at: null,
      },
    },
  };
}

function readStoredPreviewUser() {
  if (typeof window === "undefined") {
    return { name: "Visitante", email: "preview@imobiflow.app" };
  }

  const stored = window.localStorage.getItem(previewUserKey);
  if (!stored) return { name: "Visitante", email: "preview@imobiflow.app" };

  try {
    const parsed = JSON.parse(stored) as { name?: string; email?: string };
    return {
      name: parsed.name || "Visitante",
      email: parsed.email || "preview@imobiflow.app",
    };
  } catch {
    return { name: "Visitante", email: "preview@imobiflow.app" };
  }
}

function hasStoredDemoPreviewUser() {
  if (typeof window === "undefined") return false;

  const stored = window.localStorage.getItem(previewUserKey);
  if (!stored) return false;

  try {
    const parsed = JSON.parse(stored) as { email?: string };
    return parsed.email === demoAccessEmail;
  } catch {
    return false;
  }
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function login(email: string, password: string) {
  const response = await apiRequest<AccessResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (response.session?.access_token) {
    storeToken(response.session.access_token);
  }

  return response;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  companyName: string;
  companyDocument?: string;
  phone?: string;
}) {
  return apiRequest<{
    message: string;
    company: { id: string; name: string; status: string };
    authorization: {
      authenticated: boolean;
      companyLinked: boolean;
      subscriptionActive: boolean;
      blockedReason: string;
    };
  }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function inviteUser(input: {
  email: string;
  name?: string;
  roleSystemKey: "admin" | "manager" | "broker" | "financial" | "inspector" | "legal";
}) {
  const token = getStoredToken();

  return apiRequest<{
    invitation: {
      id: string;
      email: string;
      name?: string;
      status: string;
      expires_at: string;
    };
    invite_url: string;
    token: string;
  }>("/auth/invite", {
    method: "POST",
    token: token ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function listUsers() {
  return apiRequest<{ users: AppUserSummary[] }>("/auth/users", {
    token: getStoredToken() ?? undefined,
  });
}

export async function listInvitations() {
  return apiRequest<{ invitations: UserInvitation[] }>("/auth/invitations", {
    token: getStoredToken() ?? undefined,
  });
}

export async function cancelInvitation(id: string) {
  return apiRequest<{ invitation: UserInvitation }>(`/auth/invitations/${id}/cancel`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

export async function reissueInvitation(id: string) {
  return apiRequest<{
    invitation: UserInvitation;
    invite_url: string;
    token: string;
  }>(`/auth/invitations/${id}/reissue`, {
    method: "POST",
    token: getStoredToken() ?? undefined,
  });
}

export async function acceptInvite(input: {
  token: string;
  name: string;
  password: string;
  phone?: string;
}) {
  return apiRequest<{ message: string }>("/auth/accept-invite", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loadSession() {
  const token = getStoredToken();
  if (!token) return null;

  if (isPreviewToken(token)) {
    return createPreviewSession();
  }

  return apiRequest<AccessResponse>("/auth/session", { token });
}
