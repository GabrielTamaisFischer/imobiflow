import { describe, expect, it, vi } from "vitest";
import { isSubscriptionActive } from "./subscription";

describe("subscription authorization", () => {
  it.each(["inactive", "expired", "cancelled", "past_due", "pending"])(
    "blocks %s subscriptions",
    (status) => {
      expect(isSubscriptionActive(status)).toBe(false);
    },
  );

  it("allows active subscriptions", () => {
    expect(isSubscriptionActive("active")).toBe(true);
  });

  it("allows trial subscriptions only before expiration", () => {
    vi.setSystemTime(new Date("2026-05-16T12:00:00.000Z"));

    expect(isSubscriptionActive("trial", "2026-05-17T12:00:00.000Z")).toBe(true);
    expect(isSubscriptionActive("trial", "2026-05-15T12:00:00.000Z")).toBe(false);

    vi.useRealTimers();
  });
});
