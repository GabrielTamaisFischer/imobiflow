export function isSubscriptionActive(
  status?: string | null,
  expiresAt?: string | null,
  graceEndsAt?: string | null,
) {
  if (!status) return false;
  const normalized = status.toUpperCase();
  if (["PENDING", "SUSPENDED", "CANCELLED", "CANCELED", "INACTIVE", "EXPIRED"].includes(normalized))
    return false;

  if (normalized === "PAST_DUE") {
    return Boolean(graceEndsAt && new Date(graceEndsAt).getTime() > Date.now());
  }

  if (normalized === "TRIAL" && expiresAt) {
    return new Date(expiresAt).getTime() > Date.now();
  }

  if (normalized === "ACTIVE" && expiresAt) {
    return new Date(expiresAt).getTime() > Date.now();
  }
  return normalized === "ACTIVE" || normalized === "TRIAL";
}
