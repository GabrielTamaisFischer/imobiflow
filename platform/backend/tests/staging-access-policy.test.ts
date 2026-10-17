import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { env, isStagingFreeAccessEnabled } from "../src/config/env.js";
import { resolveApplicationEntitlement } from "../src/services/subscription-access.js";
import { requireActiveSubscription, requireAuth, requireCompany } from "../src/middleware/auth.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const original = {
  nodeEnv: env.NODE_ENV,
  appUrl: env.APP_URL,
  flag: env.STAGING_FREE_ACCESS_ENABLED,
  vercel: env.VERCEL,
  projectUrl: env.VERCEL_PROJECT_PRODUCTION_URL,
};

afterEach(() => {
  env.NODE_ENV = original.nodeEnv;
  env.APP_URL = original.appUrl;
  env.STAGING_FREE_ACCESS_ENABLED = original.flag;
  env.VERCEL = original.vercel;
  env.VERCEL_PROJECT_PRODUCTION_URL = original.projectUrl;
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function enableStagingGate() {
  env.NODE_ENV = "production";
  env.APP_URL = "https://imobiflow-staging.vercel.app";
  env.STAGING_FREE_ACCESS_ENABLED = "true";
  env.VERCEL = "1";
  env.VERCEL_PROJECT_PRODUCTION_URL = "imobiflow-staging.vercel.app";
}

describe("C0.1 staging_qa entitlement", () => {
  it("allows an authenticated company without a paid subscription only on the exact staging project", () => {
    enableStagingGate();
    expect(isStagingFreeAccessEnabled()).toBe(true);
    expect(resolveApplicationEntitlement(null)).toBe("STAGING_QA");
  });

  it("keeps unauthenticated callers outside the policy boundary", async () => {
    enableStagingGate();
    const app = express();
    app.get("/protected", requireAuth, requireCompany, requireActiveSubscription, (_req, res) => {
      res.json({ ok: true });
    });
    app.use(errorHandler);
    const server = app.listen(0);
    servers.push(server);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("server unavailable");
    const response = await fetch(`http://127.0.0.1:${address.port}/protected`);
    expect(response.status).toBe(401);
  });

  it("fails closed when flag, Vercel marker, project identity, or official URL differs", () => {
    enableStagingGate();
    for (const mutate of [
      () => (env.STAGING_FREE_ACCESS_ENABLED = "false"),
      () => (env.VERCEL = undefined),
      () => (env.VERCEL_PROJECT_PRODUCTION_URL = "other-project.vercel.app"),
      () => (env.APP_URL = "https://imobiflow.example.com"),
    ]) {
      enableStagingGate();
      mutate();
      expect(isStagingFreeAccessEnabled()).toBe(false);
      expect(resolveApplicationEntitlement(null)).toBe("DENIED");
    }
  });

  it("does not override a valid paid subscription", () => {
    enableStagingGate();
    expect(
      resolveApplicationEntitlement({ status: "ACTIVE", expires_at: null, grace_ends_at: null }),
    ).toBe("PAID");
  });
});
