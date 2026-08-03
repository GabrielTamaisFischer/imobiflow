import type { User } from "@supabase/supabase-js";
import { env } from "../config/env.js";
import type { AccessContext } from "../types/access.js";

const defaultLocalDevToken = "imobiflow.local_dev_access";
const previewDevToken = "imobiflow.preview_access";

export function isLocalDevAuthEnabled() {
  return process.env.NODE_ENV !== "production" && env.IMOBIFLOW_LOCAL_DEV_AUTH === "true";
}

export function buildLocalDevAccessContext(token: string | null): AccessContext | null {
  if (!isLocalDevAuthEnabled()) return null;

  const localToken = env.IMOBIFLOW_LOCAL_DEV_TOKEN || defaultLocalDevToken;
  if (token !== localToken && token !== previewDevToken) return null;

  const companyId = env.IMOBIFLOW_LOCAL_DEV_COMPANY_ID || "local-company";
  const userId = env.IMOBIFLOW_LOCAL_DEV_USER_ID || "local-user";

  return {
    authUser: {
      id: userId,
      email: "local@imobiflow.app",
      app_metadata: {},
      user_metadata: {
        name: "ImobiFlow Local",
      },
      aud: "authenticated",
      created_at: new Date(0).toISOString(),
    } as User,
    appUser: {
      id: userId,
      company_id: companyId,
      name: "ImobiFlow Local",
      email: "local@imobiflow.app",
      status: "active",
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
    company: {
      id: companyId,
      name: "ImobiFlow Local",
      status: "active",
    },
    subscription: {
      id: "local-subscription",
      status: "active",
      plan_slug: "local-dev",
      expires_at: null,
    },
  };
}
