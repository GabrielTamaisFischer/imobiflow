import { describe, expect, it } from "vitest";
import { validateAccountActivation } from "../src/services/account-activation.js";

describe("account activation validation", () => {
  it("rejects activation without a verified payment", async () => {
    await expect(
      validateAccountActivation("a".repeat(43), database(provisioning({ paymentVerified: false }))),
    ).rejects.toMatchObject({ code: "PAYMENT_NOT_CONFIRMED", statusCode: 403 });
  });

  it("rejects invalid, expired and already-used tokens", async () => {
    await expect(validateAccountActivation("a".repeat(43), database(null))).rejects.toMatchObject({
      code: "ACTIVATION_TOKEN_INVALID",
    });
    await expect(
      validateAccountActivation("a".repeat(43), database(provisioning({ expired: true }))),
    ).rejects.toMatchObject({ code: "ACTIVATION_TOKEN_EXPIRED" });
    await expect(
      validateAccountActivation("a".repeat(43), database(provisioning({ used: true }))),
    ).rejects.toMatchObject({ code: "ACTIVATION_TOKEN_USED" });
  });

  it("returns only immutable purchase data for a valid token", async () => {
    await expect(
      validateAccountActivation("a".repeat(43), database(provisioning())),
    ).resolves.toMatchObject({
      email: "buyer@example.test",
      plan: { slug: "pro-monthly", name: "Pro" },
      synthetic: false,
    });
  });
});

function database(record: ReturnType<typeof provisioning> | null) {
  return {
    accountProvisioning: { findUnique: async () => record },
  } as never;
}

function provisioning(
  options: { expired?: boolean; used?: boolean; paymentVerified?: boolean } = {},
) {
  const used = options.used ?? false;
  const paymentVerified = options.paymentVerified ?? true;
  return {
    status: used ? "ACTIVATED" : "READY",
    expiresAt: options.expired ? new Date("2020-01-01") : new Date("2099-01-01"),
    activatedAt: used ? new Date() : null,
    companyId: used ? "company-a" : null,
    ownerUserId: used ? "owner-a" : null,
    subscriptionId: used ? "subscription-a" : null,
    purchaserEmail: "buyer@example.test",
    isSynthetic: false,
    plan: { slug: "pro-monthly", name: "Pro" },
    checkoutSession: {
      status: paymentVerified ? "PAYMENT_CONFIRMED" : "PENDING",
      confirmedAt: paymentVerified ? new Date() : null,
      paymentEvents: paymentVerified ? [{ id: "event-a" }] : [],
    },
  };
}
