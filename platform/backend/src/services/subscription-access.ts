import type { SubscriptionStatus } from "../types/access.js";
import { env, isStagingFreeAccessEnabled } from "../config/env.js";

export type SubscriptionAccessDecision = {
  allowed: boolean;
  normalizedStatus: "PENDING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
  reason: string | null;
};

export type ApplicationEntitlement = "PAID" | "STAGING_QA" | "DENIED";

export type BillingEnforcement = "DISABLED" | "ENABLED";

/**
 * Financial enforcement is disabled only for the verified staging project.
 * Authentication, company membership, RBAC and tenant checks remain separate
 * middleware concerns and are never bypassed by this decision.
 */
export function resolveBillingEnforcement(config = env): BillingEnforcement {
  if (isStagingFreeAccessEnabled(config)) return "DISABLED";
  if (config.NODE_ENV !== "production" && config.BILLING_REQUIRED !== "true") return "DISABLED";
  return "ENABLED";
}

export function resolveApplicationEntitlement(
  subscription:
    | {
        status?: SubscriptionStatus | null;
        expires_at?: string | null;
        grace_ends_at?: string | null;
      }
    | null
    | undefined,
  config = env,
  now = new Date(),
): ApplicationEntitlement {
  if (
    getSubscriptionAccessDecision(
      subscription?.status,
      subscription?.expires_at,
      subscription?.grace_ends_at,
      now,
    ).allowed
  ) {
    return "PAID";
  }
  return resolveBillingEnforcement(config) === "DISABLED" ? "STAGING_QA" : "DENIED";
}

export function getSubscriptionAccessDecision(
  status?: SubscriptionStatus | null,
  expiresAt?: string | null,
  graceEndsAt?: string | null,
  now = new Date(),
): SubscriptionAccessDecision {
  const normalizedStatus = normalizeSubscriptionStatus(status);
  if (normalizedStatus === "ACTIVE") {
    if (expiresAt && new Date(expiresAt).getTime() <= now.getTime()) {
      return { allowed: false, normalizedStatus: "SUSPENDED", reason: "PERIOD_EXPIRED" };
    }
    return { allowed: true, normalizedStatus, reason: null };
  }
  if (normalizedStatus === "PAST_DUE" && graceEndsAt) {
    const allowed = new Date(graceEndsAt).getTime() > now.getTime();
    return {
      allowed,
      normalizedStatus,
      reason: allowed ? "PAYMENT_GRACE_PERIOD" : "GRACE_PERIOD_EXPIRED",
    };
  }
  return { allowed: false, normalizedStatus, reason: `SUBSCRIPTION_${normalizedStatus}` };
}

export function isSubscriptionAllowed(
  status?: SubscriptionStatus | null,
  expiresAt?: string | null,
  graceEndsAt?: string | null,
) {
  return getSubscriptionAccessDecision(status, expiresAt, graceEndsAt).allowed;
}

export function normalizeSubscriptionStatus(
  status?: SubscriptionStatus | null,
): SubscriptionAccessDecision["normalizedStatus"] {
  switch (status?.toUpperCase()) {
    case "ACTIVE":
    case "TRIAL":
      return "ACTIVE";
    case "PAST_DUE":
      return "PAST_DUE";
    case "SUSPENDED":
    case "EXPIRED":
    case "INACTIVE":
      return "SUSPENDED";
    case "CANCELLED":
    case "CANCELED":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}
