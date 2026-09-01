import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { AccessContext, SubscriptionStatus } from "../types/access.js";
export { isSubscriptionAllowed } from "./subscription-access.js";

type UserRow = {
  id: string;
  company_id: string;
  name: string;
  email: string;
  status: string;
  companies: {
    id: string;
    name: string;
    status: string;
  } | null;
  roles: {
    id: string;
    system_key: string | null;
    name: string;
  } | null;
};

export async function buildAccessContext(authUser: User): Promise<AccessContext> {
  const { data: appUser, error: userError } = await supabaseAdmin
    .from("users")
    .select(
      "id, company_id, name, email, status, companies(id, name, status), roles(id, system_key, name)",
    )
    .eq("id", authUser.id)
    .maybeSingle<UserRow>();

  if (userError) throw userError;
  if (!appUser || !appUser.company_id || !appUser.companies) {
    throw accessDenied(
      "INTERNAL_USER_REQUIRED",
      "Usuário interno ativo e vinculado a uma empresa é obrigatório.",
    );
  }
  if (appUser.status !== "active") {
    throw accessDenied("USER_INACTIVE", "Usuário interno inativo.");
  }
  if (appUser.companies.id !== appUser.company_id || appUser.companies.status !== "active") {
    throw accessDenied("COMPANY_INACTIVE", "Vínculo com empresa ativa é obrigatório.");
  }

  const { data: rolePermissions, error: permissionsError } = await supabaseAdmin
    .from("role_permissions")
    .select("permissions(key)")
    .eq("role_id", appUser.roles?.id ?? "");

  if (permissionsError) throw permissionsError;

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, expires_at, plans(slug)")
    .eq("company_id", appUser.company_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      id: string;
      status: SubscriptionStatus;
      expires_at: string | null;
      plans: { slug: string } | null;
    }>();

  if (subscriptionError) throw subscriptionError;

  const permissions = (rolePermissions ?? []) as Array<{
    permissions: { key?: string } | null;
  }>;

  return {
    authUser: {
      id: authUser.id,
      email: authUser.email ?? appUser.email,
      name: appUser.name,
    },
    appUser: {
      id: appUser.id,
      company_id: appUser.company_id,
      name: appUser.name,
      email: appUser.email,
      status: appUser.status,
      role: appUser.roles?.system_key ?? appUser.roles?.name ?? "member",
      permissions: permissions
        .map((item) => item.permissions)
        .map((permission) => permission?.key)
        .filter((key): key is string => Boolean(key)),
      permissionScopes: {},
    },
    company: {
      id: appUser.companies.id,
      name: appUser.companies.name,
      status: appUser.companies.status,
    },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          plan_slug: subscription.plans?.slug ?? null,
          expires_at: subscription.expires_at,
          grace_ends_at: null,
        }
      : null,
  };
}

function accessDenied(code: string, message: string) {
  return Object.assign(new Error(message), { statusCode: 403, code });
}
