import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  database: {
    propertyOwner: { findFirst: vi.fn() },
    ownerProfile: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    ownerDocumentRecord: { findMany: vi.fn() },
    authAuditLog: { create: vi.fn() },
  },
  permissions: ["owners.manage", "owners.sensitive.view", "owners.financial.view"] as string[],
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => state.database }));
vi.mock("../src/services/mysql-auth.js", () => ({ writeAuthAudit: vi.fn(async () => undefined) }));
vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCompany: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireActiveSubscription: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: (_permission: string) => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { errorHandler } from "../src/middleware/error-handler.js";
import { realEstateRouter } from "../src/routes/real-estate.js";
import { runtimeDiagnosticsRouter } from "../src/routes/runtime-diagnostics.js";
import { isStagingRuntimeDiagnosticsEnabled } from "../src/services/runtime-diagnostics.js";
import { updateOwnerProfile } from "../src/services/owner-profile.js";

const ownerId = "owner-started-at";
const companyId = "company-started-at";

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "profile-started-at",
    companyId,
    ownerId,
    identityJson: {},
    contactJson: {},
    addressJson: {},
    professionalJson: {},
    financialJson: {},
    creditJson: {},
    legalJson: {},
    fiscalJson: {},
    provenanceJson: {},
    confidenceJson: {},
    treatmentConsentJson: {},
    updatedAt: new Date("2026-09-14T00:00:00.000Z"),
    ...overrides,
  };
}

const permissions = () => new Set(state.permissions);

beforeEach(() => {
  vi.clearAllMocks();
  state.permissions = ["owners.manage", "owners.sensitive.view", "owners.financial.view"];
  state.database.propertyOwner.findFirst.mockResolvedValue({ id: ownerId, companyId, name: "Owner QA started-at", email: "owner.started-at@example.test" });
  state.database.ownerProfile.findFirst.mockResolvedValue(profileRow());
  state.database.ownerProfile.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => profileRow(data));
  state.database.ownerProfile.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => profileRow(data));
  state.database.ownerDocumentRecord.findMany.mockResolvedValue([]);
});

describe("Owner professional started_at integration", () => {
  it("disables runtime diagnostics outside staging hosts", () => {
    const previous = {
      node: process.env.NODE_ENV,
      app: process.env.APP_URL,
      frontend: process.env.FRONTEND_URL,
      projectDomain: process.env.VERCEL_PROJECT_PRODUCTION_DOMAIN,
      vercel: process.env.VERCEL_URL,
      vercelEnv: process.env.VERCEL_ENV,
    };
    process.env.NODE_ENV = "production";
    delete process.env.APP_URL;
    delete process.env.FRONTEND_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_DOMAIN;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    expect(isStagingRuntimeDiagnosticsEnabled()).toBe(false);
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore("NODE_ENV", previous.node);
    restore("APP_URL", previous.app);
    restore("FRONTEND_URL", previous.frontend);
    restore("VERCEL_PROJECT_PRODUCTION_DOMAIN", previous.projectDomain);
    restore("VERCEL_URL", previous.vercel);
    restore("VERCEL_ENV", previous.vercelEnv);
  });

  it("exposes only the staging revision payload on the protected diagnostics route", async () => {
    const app = express();
    app.use((req, _res, next) => {
      Object.assign(req, {
        access: {
          company: { id: companyId },
          appUser: { id: "actor-started-at", role: "owner", permissions: permissions() },
        },
      });
      next();
    });
    app.use("/internal", runtimeDiagnosticsRouter);
    const server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/internal/runtime-revision`);
      const body = await response.json() as Record<string, unknown>;
      expect(response.status).toBe(200);
      expect(Object.keys(body).sort()).toEqual(["environment", "revision"]);
      expect(body).not.toHaveProperty("DATABASE_URL");
      expect(body).not.toHaveProperty("token");
      expect(body).not.toHaveProperty("secret");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("preserves started_at in Prisma data and serialized service response", async () => {
    const diagnostic = { enabled: true, revision: "cb0e377-test" };
    state.database.ownerProfile.findFirst
      .mockResolvedValueOnce(profileRow())
      .mockResolvedValueOnce(profileRow({ professionalJson: { profession: "Analista", started_at: "2024-02-20" } }));
    const result = await updateOwnerProfile({
      companyId,
      ownerId,
      actorUserId: "actor-started-at",
      permissions: permissions(),
      patch: {
        professional: {
          profession: "Analista",
          employment_type: "CLT",
          started_at: "2024-02-20",
        },
      },
      diagnostic,
    });

    const prismaData = state.database.ownerProfile.update.mock.calls[0]?.[0]?.data as { professionalJson: Record<string, unknown> };
    expect(prismaData.professionalJson.started_at).toBe("2024-02-20");
    expect(result.professional.started_at).toBe("2024-02-20");
    expect(diagnostic).toMatchObject({
      revision: "cb0e377-test",
      received_started_at: "2024-02-20",
      normalized_started_at: "2024-02-20",
      prisma_returned_started_at: "2024-02-20",
      reread_started_at: "2024-02-20",
      serialized_started_at: "2024-02-20",
    });
  });

  it("preserves started_at through the authenticated PATCH route", async () => {
    state.database.ownerProfile.findFirst
      .mockResolvedValueOnce(profileRow())
      .mockResolvedValueOnce(profileRow({ professionalJson: { profession: "Analista", started_at: "2024-02-20" } }));
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, {
        access: {
          company: { id: companyId },
          appUser: { id: "actor-started-at", role: "owner", permissions: permissions() },
        },
      });
      next();
    });
    app.use(realEstateRouter);
    app.use(errorHandler);

    const server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/owners/${ownerId}/profile`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ professional: { profession: "Analista", employment_type: "CLT", started_at: "2024-02-20" } }),
      });
      const body = await response.json() as { profile: { professional: Record<string, unknown> }; diagnostic?: Record<string, unknown> };
      expect(response.status).toBe(200);
      expect(body.profile.professional.started_at).toBe("2024-02-20");
      expect(body.diagnostic).toMatchObject({
        received_started_at: "2024-02-20",
        normalized_started_at: "2024-02-20",
        prisma_returned_started_at: "2024-02-20",
        reread_started_at: "2024-02-20",
        serialized_started_at: "2024-02-20",
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
