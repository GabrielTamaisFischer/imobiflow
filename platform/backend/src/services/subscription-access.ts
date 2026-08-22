import type { SubscriptionStatus } from "../types/access.js";

export type SubscriptionAccessDecision = {
  allowed: boolean;
  normalizedStatus: "PENDING" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELLED";
  reason: string | null;
};

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
