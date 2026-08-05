import type { User } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import type { AccessContext } from "../types/access.js";

const forbiddenLocalTokens = new Set(["imobiflow.local_dev_access", "imobiflow.preview_access"]);

export type LocalDevRequestSource = {
  hostname?: string | null;
  remoteAddress?: string | null;
  forwardedHost?: string | null;
  forwardedFor?: string | null;
};

function isLoopbackAddress(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized.startsWith("127.") ||
    normalized.startsWith("::ffff:127.")
  );
}

function isLoopbackHostname(value: string) {
  const firstHost = value.split(",")[0]?.trim();
  if (!firstHost) return false;

  try {
    return isLoopbackAddress(new URL(`http://${firstHost}`).hostname);
  } catch {
    return false;
  }
}

function hasOnlyLoopbackForwarding(value: string | null | undefined, parser: (part: string) => boolean) {
  if (!value) return true;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 && parts.every(parser);
}

export function isLoopbackLocalDevRequest(source: LocalDevRequestSource | undefined) {
  if (!source?.hostname || !source.remoteAddress) return false;
  if (!isLoopbackHostname(source.hostname) || !isLoopbackAddress(source.remoteAddress)) return false;
  if (!hasOnlyLoopbackForwarding(source.forwardedHost, isLoopbackHostname)) return false;
  if (!hasOnlyLoopbackForwarding(source.forwardedFor, isLoopbackAddress)) return false;
  return true;
}

function hasStrongExplicitToken(token: string | undefined) {
  return Boolean(token && token.length >= 32 && !forbiddenLocalTokens.has(token));
}

function tokensMatch(received: string, expected: string) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

export function isLocalDevAuthEnabled(source?: LocalDevRequestSource) {
  const runtime = process.env.NODE_ENV;
  return (
    (runtime === "development" || runtime === "test") &&
    env.IMOBIFLOW_LOCAL_DEV_AUTH === "true" &&
    hasStrongExplicitToken(env.IMOBIFLOW_LOCAL_DEV_TOKEN) &&
    Boolean(env.IMOBIFLOW_LOCAL_DEV_COMPANY_ID) &&
    Boolean(env.IMOBIFLOW_LOCAL_DEV_USER_ID) &&
    Boolean(env.IMOBIFLOW_LOCAL_DEV_ROLE) &&
    isLoopbackLocalDevRequest(source)
  );
}

export function buildLocalDevAccessContext(
  token: string | null,
  source?: LocalDevRequestSource,
): AccessContext | null {
  if (!isLocalDevAuthEnabled(source) || !token) return null;

  const localToken = env.IMOBIFLOW_LOCAL_DEV_TOKEN!;
  if (!tokensMatch(token, localToken)) return null;

  const companyId = env.IMOBIFLOW_LOCAL_DEV_COMPANY_ID!;
  const userId = env.IMOBIFLOW_LOCAL_DEV_USER_ID!;
  const role = env.IMOBIFLOW_LOCAL_DEV_ROLE!;

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
      role,
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
