import { apiRequest } from "./api";

const accessTokenKey = "imobiflow.access_token";
const refreshTokenKey = "imobiflow.refresh_token";

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  refresh_expires_at?: number;
};

export type AccessResponse = {
  session?: AuthSession;
  access: {
    company?: { id: string; name: string; status: string };
    appUser?: {
      id: string;
      company_id?: string;
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
      grace_ends_at: string | null;
    } | null;
  };
};

export type AppUserSummary = {
  id: string;
  company_id: string;
  role_id: string;
  name: string;
  email: string;
  phone: string | null;
  status: "active" | "inactive" | "blocked";
  created_at: string;
  updated_at: string;
  roles: { id: string; system_key: string | null; name: string };
};

export type UserInvitation = {
  id: string;
  company_id: string;
  role_id: string;
  invited_by: string | null;
  email: string;
  name: string | null;
  status: "pending" | "accepted" | "cancelled" | "expired";
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  roles: { id: string; system_key: string | null; name: string };
};

export type CompanyIdentity = {
  id: string;
  name: string;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
};

export type CompanyRole = {
  id: string;
  company_id: string;
  name: string;
  system_key: string | null;
  is_system: boolean;
  permissions: Array<{ key: string; description: string }>;
  users_count: number;
};

export function getStoredToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(accessTokenKey);
}

export function getStoredRefreshToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(refreshTokenKey);
}

export function storeSession(session: AuthSession) {
  window.localStorage.setItem(accessTokenKey, session.access_token);
  window.localStorage.setItem(refreshTokenKey, session.refresh_token);
}

export function storeToken(token: string) {
  window.localStorage.setItem(accessTokenKey, token);
}

export function clearToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(accessTokenKey);
  window.localStorage.removeItem(refreshTokenKey);
}

export function isPreviewToken(_token: string | null) {
  return false;
}

export async function login(email: string, password: string) {
  const response = await apiRequest<AccessResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (response.session) storeSession(response.session);
  return response;
}

export async function logout() {
  const token = getStoredToken();
  try {
    if (token) await apiRequest<void>("/auth/logout", { method: "POST", token });
  } finally {
    clearToken();
  }
}

export async function refreshSession() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;
  const response = await apiRequest<AccessResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.session) throw new Error("A API nao retornou uma sessao renovada.");
  storeSession(response.session);
  return response;
}

export async function activateAccount(input: {
  token: string;
  name: string;
  password: string;
  company_name: string;
  company_document?: string;
  phone?: string;
}) {
  const response = await apiRequest<
    AccessResponse & {
      message: string;
      company: CompanyIdentity;
      owner: { id: string; name: string; email: string; role: string };
    }
  >("/auth/activate-account", { method: "POST", body: JSON.stringify(input) });
  if (response.session) storeSession(response.session);
  return response;
}

export async function validateAccountActivation(token: string) {
  return apiRequest<{
    activation: {
      email: string;
      plan: { slug: string; name: string };
      expires_at: string;
      synthetic: boolean;
    };
  }>(`/auth/activations/validate?token=${encodeURIComponent(token)}`);
}

export async function loadSession() {
  const token = getStoredToken();
  if (!token) return null;
  try {
    return await apiRequest<AccessResponse>("/auth/session", { token });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status !== 401) throw error;
    try {
      return await refreshSession();
    } catch {
      clearToken();
      return null;
    }
  }
}

export async function listUsers() {
  return apiRequest<{ users: AppUserSummary[] }>("/auth/users", {
    token: getStoredToken() ?? undefined,
  });
}

export async function updateUser(
  id: string,
  input: {
    name?: string;
    phone?: string;
    roleSystemKey?: string;
    roleId?: string;
    status?: "active" | "inactive" | "blocked";
  },
) {
  return apiRequest<{ user: AppUserSummary }>(`/auth/users/${id}`, {
    method: "PATCH",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function listRoles() {
  return apiRequest<{ roles: CompanyRole[] }>("/auth/roles", {
    token: getStoredToken() ?? undefined,
  });
}

export async function listPermissions() {
  return apiRequest<{ permissions: Array<{ id: string; key: string; description: string }> }>(
    "/auth/permissions",
    {
      token: getStoredToken() ?? undefined,
    },
  );
}

export async function createRole(input: { name: string; permissionKeys: string[] }) {
  return apiRequest<{ role: CompanyRole }>("/auth/roles", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function updateRole(id: string, input: { name?: string; permissionKeys?: string[] }) {
  return apiRequest<{ role: CompanyRole }>(`/auth/roles/${id}`, {
    method: "PATCH",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function deleteRole(id: string) {
  return apiRequest<void>(`/auth/roles/${id}`, {
    method: "DELETE",
    token: getStoredToken() ?? undefined,
  });
}

export async function getCompany() {
  return apiRequest<{ company: CompanyIdentity }>("/auth/company", {
    token: getStoredToken() ?? undefined,
  });
}

export async function updateCompany(
  input: Partial<Pick<CompanyIdentity, "name" | "document" | "phone" | "email">>,
) {
  return apiRequest<{ company: CompanyIdentity }>("/auth/company", {
    method: "PATCH",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify(input),
  });
}

export async function inviteUser(input: {
  email: string;
  name?: string;
  roleSystemKey?: string;
  roleId?: string;
}) {
  return apiRequest<{ invitation: UserInvitation; invite_url: string; delivered: boolean }>(
    "/auth/invite",
    {
      method: "POST",
      token: getStoredToken() ?? undefined,
      body: JSON.stringify(input),
    },
  );
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
  return apiRequest<{ invitation: UserInvitation; invite_url: string; delivered: boolean }>(
    `/auth/invitations/${id}/reissue`,
    { method: "POST", token: getStoredToken() ?? undefined },
  );
}

export async function validateInvitation(token: string) {
  return apiRequest<{
    invitation: {
      email: string;
      name: string | null;
      company_name: string;
      role_name: string;
      expires_at: string;
    };
  }>(`/auth/invitations/validate?token=${encodeURIComponent(token)}`);
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

export async function requestPasswordReset(email: string) {
  return apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string) {
  return apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const response = await apiRequest<{ message: string }>("/auth/change-password", {
    method: "POST",
    token: getStoredToken() ?? undefined,
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  clearToken();
  return response;
}
