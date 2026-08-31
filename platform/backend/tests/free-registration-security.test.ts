import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env, isFreeRegistrationEnabled } from "../src/config/env.js";

const original = {
  nodeEnv: env.NODE_ENV,
  registrationEnabled: env.REGISTRATION_ENABLED,
  billingRequired: env.BILLING_REQUIRED,
};

afterEach(() => {
  env.NODE_ENV = original.nodeEnv;
  env.REGISTRATION_ENABLED = original.registrationEnabled;
  env.BILLING_REQUIRED = original.billingRequired;
});

describe("isFreeRegistrationEnabled — fail-safe matrix (Diretriz Mestre, Secoes 3/54.3)", () => {
  it("never allows free registration in production, even if the flags are misconfigured", () => {
    env.NODE_ENV = "production";
    env.REGISTRATION_ENABLED = "true";
    env.BILLING_REQUIRED = "false";
    expect(isFreeRegistrationEnabled()).toBe(false);
  });

  it("defaults to disabled outside production when the flags are unset", () => {
    env.NODE_ENV = "staging";
    env.REGISTRATION_ENABLED = undefined;
    env.BILLING_REQUIRED = undefined;
    expect(isFreeRegistrationEnabled()).toBe(false);
  });

  it("requires REGISTRATION_ENABLED=true explicitly (not just any truthy string)", () => {
    env.NODE_ENV = "staging";
    env.REGISTRATION_ENABLED = "yes";
    env.BILLING_REQUIRED = "false";
    expect(isFreeRegistrationEnabled()).toBe(false);
  });

  it("blocks when BILLING_REQUIRED is explicitly true, even if registration is enabled", () => {
    env.NODE_ENV = "staging";
    env.REGISTRATION_ENABLED = "true";
    env.BILLING_REQUIRED = "true";
    expect(isFreeRegistrationEnabled()).toBe(false);
  });

  it("allows free registration in staging with the flags explicitly set", () => {
    env.NODE_ENV = "staging";
    env.REGISTRATION_ENABLED = "true";
    env.BILLING_REQUIRED = "false";
    expect(isFreeRegistrationEnabled()).toBe(true);
  });

  it("allows free registration in development with the flags explicitly set", () => {
    env.NODE_ENV = "development";
    env.REGISTRATION_ENABLED = "true";
    env.BILLING_REQUIRED = undefined;
    expect(isFreeRegistrationEnabled()).toBe(true);
  });
});

const activation = vi.hoisted(() => ({
  registerFree: vi.fn(async () => ({
    message: "Conta criada com sucesso.",
    company: { id: "company-a", name: "Imobiliaria A", status: "active" },
    owner: { id: "owner-a", name: "Owner A", email: "owner-a@example.test", role: "owner" },
    subscription: { id: "sub-a", status: "ACTIVE", plan_slug: "staging-free-registration" },
    session: { access_token: "jwt-a", refresh_token: "refresh-a" },
    access: { subscription: { status: "ACTIVE" } },
  })),
  activate: vi.fn(async () => ({
    message: "Conta ativada com sucesso.",
    session: { access_token: "jwt", refresh_token: "refresh" },
    access: { subscription: { status: "ACTIVE" } },
  })),
  validate: vi.fn(async () => ({
    email: "buyer@example.test",
    plan: { slug: "pro-monthly", name: "Pro" },
    expires_at: new Date("2099-01-01").toISOString(),
    synthetic: false,
  })),
}));

vi.mock("../src/services/account-activation.js", () => ({
  registerFreeAccount: activation.registerFree,
  activatePaidAccount: activation.activate,
  validateAccountActivation: activation.validate,
}));

import { authRouter } from "../src/routes/auth.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const servers: Server[] = [];
afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("free registration HTTP boundary", () => {
  it("still blocks /auth/register with the commercial 403 when the flags are off (regression)", async () => {
    env.NODE_ENV = "staging";
    env.REGISTRATION_ENABLED = undefined;
    env.BILLING_REQUIRED = undefined;
    const response = await request("/auth/register", {
      name: "Free Owner",
      email: "free@example.test",
      password: "Strong-Free@123",
      company_name: "Free Company",
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("PAID_ACTIVATION_REQUIRED");
    expect(activation.registerFree).not.toHaveBeenCalled();
  });

  it("blocks /auth/register in production even when the flags claim it is enabled", async () => {
    env.NODE_ENV = "production";
    env.REGISTRATION_ENABLED = "true";
    env.BILLING_REQUIRED = "false";
    const response = await request("/auth/register", {
      name: "Free Owner",
      email: "free@example.test",
      password: "Strong-Free@123",
      company_name: "Free Company",
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("PAID_ACTIVATION_REQUIRED");
    expect(activation.registerFree).not.toHaveBeenCalled();
  });

  it("creates a new company through the normal UI flow when staging flags are on", async () => {
    env.NODE_ENV = "staging";
    env.REGISTRATION_ENABLED = "true";
    env.BILLING_REQUIRED = "false";
    const response = await request("/auth/register", {
      name: "Owner A",
      email: "owner-a@example.test",
      password: "Strong-Owner@123",
      company_name: "Imobiliaria A",
    });
    expect(response.status).toBe(201);
    expect(response.body.company).toMatchObject({ name: "Imobiliaria A" });
    expect(activation.registerFree).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner-a@example.test",
        ownerName: "Owner A",
        companyName: "Imobiliaria A",
      }),
      expect.any(Object),
    );
  });

  it("rejects attempts to smuggle plan/company/payment overrides into the free registration payload", async () => {
    env.NODE_ENV = "staging";
    env.REGISTRATION_ENABLED = "true";
    env.BILLING_REQUIRED = "false";
    const response = await request("/auth/register", {
      name: "Owner A",
      email: "owner-a@example.test",
      password: "Strong-Owner@123",
      company_name: "Imobiliaria A",
      plan_id: "attacker-plan",
      company_id: "company-b",
      payment_status: "ACTIVE",
    });
    // zod schema for free registration has no plan_id/company_id/payment_status fields;
    // extra fields are simply ignored (not strict), so this still succeeds but MUST NOT
    // forward the attacker-supplied fields to registerFreeAccount.
    expect(response.status).toBe(201);
    const [[calledWith]] = activation.registerFree.mock.calls;
    expect(calledWith).not.toHaveProperty("plan_id");
    expect(calledWith).not.toHaveProperty("company_id");
    expect(calledWith).not.toHaveProperty("payment_status");
  });
});

async function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server unavailable");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}
