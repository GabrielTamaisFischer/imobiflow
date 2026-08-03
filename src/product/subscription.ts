export function isSubscriptionActive(status?: string | null, expiresAt?: string | null) {
  if (!status) return false;
  if (["inactive", "expired", "cancelled", "past_due", "pending"].includes(status)) return false;

  if (status === "trial" && expiresAt) {
    return new Date(expiresAt).getTime() > Date.now();
  }

  return status === "active" || status === "trial";
}
