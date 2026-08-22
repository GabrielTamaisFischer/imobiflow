import { afterEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import {
  assertSyntheticProvisioningAllowed,
  createCanonicalCheckout,
} from "../src/services/billing-provisioning.js";
import { getSubscriptionAccessDecision } from "../src/services/subscription-access.js";

const original = {
  nodeEnv: env.NODE_ENV,
  allow: env.ALLOW_SYNTHETIC_BILLING_PROVISIONING,
  secret: env.SYNTHETIC_BILLING_ADMIN_SECRET,
};

afterEach(() => {
  env.NODE_ENV = original.nodeEnv;
  env.ALLOW_SYNTHETIC_BILLING_PROVISIONING = original.allow;
  env.SYNTHETIC_BILLING_ADMIN_SECRET = original.secret;
});

describe("paid provisioning boundary", () => {
  it("rejects the synthetic provisioner completely in production", () => {
    env.NODE_ENV = "production";
    env.ALLOW_SYNTHETIC_BILLING_PROVISIONING = "true";
    env.SYNTHETIC_BILLING_ADMIN_SECRET = "x".repeat(48);
    expect(() => assertSyntheticProvisioningAllowed("x".repeat(48))).toThrowError(
      expect.objectContaining({ code: "NOT_FOUND", statusCode: 404 }),
    );
  });

  it("requires both an explicit flag and a strong administrative secret", () => {
    env.NODE_ENV = "staging";
    env.ALLOW_SYNTHETIC_BILLING_PROVISIONING = "false";
    env.SYNTHETIC_BILLING_ADMIN_SECRET = "x".repeat(48);
    expect(() => assertSyntheticProvisioningAllowed("x".repeat(48))).toThrowError(
      expect.objectContaining({ code: "SYNTHETIC_PROVISIONING_DISABLED" }),
    );

    env.ALLOW_SYNTHETIC_BILLING_PROVISIONING = "true";
    env.SYNTHETIC_BILLING_ADMIN_SECRET = "weak";
    expect(() => assertSyntheticProvisioningAllowed("weak")).toThrowError(
      expect.objectContaining({ code: "SYNTHETIC_PROVISIONING_FORBIDDEN" }),
    );

    env.SYNTHETIC_BILLING_ADMIN_SECRET = "x".repeat(48);
    expect(() => assertSyntheticProvisioningAllowed("y".repeat(48))).toThrowError(
      expect.objectContaining({ code: "SYNTHETIC_PROVISIONING_FORBIDDEN" }),
    );
    expect(() => assertSyntheticProvisioningAllowed("x".repeat(48))).not.toThrow();
  });

  it("does not pretend a payment exists while no provider is configured", async () => {
    const database = {
      plan: {
        findFirst: async () => ({
          id: "plan-a",
          slug: "pro-monthly",
          name: "Pro",
          description: null,
          billingInterval: "monthly",
          priceCents: 19700,
          currency: "BRL",
          featuresJson: null,
          active: true,
          isSynthetic: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    } as never;
    await expect(
      createCanonicalCheckout(
        { planSlug: "pro-monthly", purchaserEmail: "buyer@example.test" },
        database,
        null,
      ),
    ).rejects.toMatchObject({ code: "CHECKOUT_NOT_CONFIGURED", statusCode: 503 });
  });
});

describe("subscription access policy", () => {
  it.each(["PENDING", "SUSPENDED", "CANCELLED"] as const)("blocks %s", (status) => {
    expect(getSubscriptionAccessDecision(status).allowed).toBe(false);
  });

  it("allows ACTIVE and a PAST_DUE subscription only during its configured grace", () => {
    const now = new Date("2026-08-13T12:00:00.000Z");
    expect(getSubscriptionAccessDecision("ACTIVE", null, null, now).allowed).toBe(true);
    expect(
      getSubscriptionAccessDecision("PAST_DUE", null, "2026-08-14T12:00:00.000Z", now).allowed,
    ).toBe(true);
    expect(
      getSubscriptionAccessDecision("PAST_DUE", null, "2026-08-12T12:00:00.000Z", now).allowed,
    ).toBe(false);
  });
});
