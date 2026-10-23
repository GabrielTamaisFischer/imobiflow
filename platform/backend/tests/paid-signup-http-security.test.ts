import type { Server } from "node:http";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const activation = vi.hoisted(() => ({
  validate: vi.fn(async () => ({
    email: "buyer@example.test",
    plan: { slug: "pro-monthly", name: "Pro" },
    expires_at: new Date("2099-01-01").toISOString(),
    synthetic: false,
  })),
  activate: vi.fn(async () => ({
    message: "Conta ativada com sucesso.",
    session: { access_token: "jwt", refresh_token: "refresh" },
    access: { subscription: { status: "ACTIVE" } },
  })),
}));
const billing = vi.hoisted(() => ({
  checkout: vi.fn(async () => ({
    id: "checkout-a",
    checkoutUrl: "https://checkout.example.test",
    status: "PENDING",
  })),
  synthetic: vi.fn(async () => ({
    checkout: { id: "checkout-s" },
    provisioning: { id: "provisioning-s", expiresAt: new Date("2099-01-01") },
    activationUrl: "http://localhost:5173/ativar-conta?token=redacted-for-test",
  })),
  plans: vi.fn(async () => []),
}));

// Este branch de staging habilita cadastro aberto (REGISTRATION_ENABLED=true)
// para QA (ver comentario em routes/auth.ts e Diretriz Mestre do MVP). Esse
// teste valida o comportamento comercial de producao - o endpoint antigo
// bloqueado com 403 - que independe de qual flag de ambiente este branch usa
// para QA. Sem este mock, isFreeRegistrationEnabled() lia o ambiente real do
// branch (aberto) e o fluxo caia na validacao do schema (400) em vez do
// bloqueio comercial (403): nao e uma regressao de codigo, e o teste
// precisando simular o estado de producao independente do branch.
vi.mock("../src/config/env.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/env.js")>();
  return { ...actual, isFreeRegistrationEnabled: () => false };
});

vi.mock("../src/services/account-activation.js", () => ({
  validateAccountActivation: activation.validate,
  activatePaidAccount: activation.activate,
}));
vi.mock("../src/services/billing-provisioning.js", () => ({
  createCanonicalCheckout: billing.checkout,
  createSyntheticProvisioning: billing.synthetic,
  listCanonicalPlans: billing.plans,
}));

import { authRouter } from "../src/routes/auth.js";
import { billingRouter } from "../src/routes/billing.js";
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

describe("paid signup HTTP boundary", () => {
  it("blocks the old public registration endpoint", async () => {
    const response = await request("/auth/register", {
      name: "Free Owner",
      email: "free@example.test",
      password: "Strong-Free@123",
      companyName: "Free Company",
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("PAID_ACTIVATION_REQUIRED");
    expect(response.body.plans_path).toBe("/planos");
  });

  it("rejects plan, company, email and payment overrides during activation", async () => {
    const response = await request("/auth/activate-account", {
      token: "t".repeat(43),
      name: "Buyer",
      password: "Strong-Owner@123",
      company_name: "Paid Company",
      email: "attacker@example.test",
      plan_id: "attacker-plan",
      company_id: "company-b",
      payment_status: "ACTIVE",
    });
    expect(response.status).toBe(400);
    expect(activation.activate).not.toHaveBeenCalled();
  });

  it("activates only with the token and owner/company fields", async () => {
    const response = await request("/auth/activate-account", {
      token: "t".repeat(43),
      name: "Buyer",
      password: "Strong-Owner@123",
      company_name: "Paid Company",
    });
    expect(response.status).toBe(201);
    expect(activation.activate).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "t".repeat(43),
        ownerName: "Buyer",
        companyName: "Paid Company",
      }),
      expect.any(Object),
    );
  });

  it("rejects browser-supplied commercial truth on checkout", async () => {
    const response = await request("/billing/checkout", {
      plan_slug: "pro-monthly",
      email: "buyer@example.test",
      plan_id: "cheap-plan",
      amount_cents: 1,
      payment_status: "paid",
    });
    expect(response.status).toBe(400);
    expect(billing.checkout).not.toHaveBeenCalled();
  });

  it("passes only the administrative secret header to synthetic provisioning", async () => {
    const response = await request(
      "/billing/internal/synthetic-provisioning",
      { email: "buyer@example.test" },
      { "x-imobiflow-admin-secret": "s".repeat(48) },
    );
    expect(response.status).toBe(201);
    expect(response.body.synthetic).toBe(true);
    expect(billing.synthetic).toHaveBeenCalledWith(
      { purchaserEmail: "buyer@example.test", planSlug: undefined },
      "s".repeat(48),
    );
  });
});

async function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  app.use("/billing", billingRouter);
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
