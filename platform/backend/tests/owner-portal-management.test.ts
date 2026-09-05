import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fase 4B.1 — regeneração/habilitação/desabilitação do token do Portal do
// Proprietário. Cobre: permissão exigida (owners.manage; um Corretor com
// apenas owners.view deve receber 403), isolamento tenant-safe (owner de
// outra empresa -> 404, nunca 200/403 revelando existência), rotação
// atômica do token (token antigo para de funcionar, novo funciona),
// enable/disable sem exigir arquivar o proprietário, e auditoria via
// AuthAuditLog (mecanismo canônico Prisma) sem nunca gravar o token
// completo.

const { database, permissionState } = vi.hoisted(() => ({
  database: {
    propertyOwner: { findFirst: vi.fn(), update: vi.fn() },
    authAuditLog: { create: vi.fn() },
  },
  permissionState: { permissions: ["owners.manage"] as string[] },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));

vi.mock("../src/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireCompany: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireActiveSubscription: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission:
    (permission: string) => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => {
      if (permissionState.permissions.includes(permission)) return next();
      return next(
        Object.assign(new Error("Permissão insuficiente."), { statusCode: 403, code: "FORBIDDEN" }),
      );
    },
}));

import { realEstateRouter } from "../src/routes/real-estate.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const servers: Server[] = [];

function ownerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "owner-a",
    companyId: "company-a",
    ownerType: "individual",
    clientType: "proprietario",
    name: "Maria Proprietária",
    document: "52998224725",
    email: null,
    phone: null,
    whatsapp: null,
    residentialPhone: null,
    commercialPhone: null,
    addressJson: {},
    notes: null,
    status: "active",
    portalToken: "aaaaaaaa-1111-4111-8111-111111111111",
    portalEnabled: true,
    portalLastAccessAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  permissionState.permissions = ["owners.manage"];
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function request(
  method: "PATCH" | "POST",
  path: string,
  body?: Record<string, unknown>,
  companyId = "company-a",
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      access: {
        company: { id: companyId },
        appUser: { id: "user-a", role: "manager", permissions: permissionState.permissions },
      },
    });
    next();
  });
  app.use(realEstateRouter);
  app.use(errorHandler);

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind to a TCP port.");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("POST /real-estate/owners/:id/portal/regenerate", () => {
  it("regenerates the token: old token is replaced atomically and audit is written without the token value", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    const oldToken = "aaaaaaaa-1111-4111-8111-111111111111";
    database.propertyOwner.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        ownerRow({ portalToken: data.portalToken }),
    );

    const response = await request("POST", "/owners/owner-a/portal/regenerate");

    expect(response.status).toBe(200);
    expect(response.body.owner.portal_token).toBeDefined();
    expect(response.body.owner.portal_token).not.toBe(oldToken);
    expect(database.propertyOwner.update).toHaveBeenCalledTimes(1);

    expect(database.authAuditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = database.authAuditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe("owner.portal_token_regenerated");
    expect(auditCall.data.companyId).toBe("company-a");
    expect(JSON.stringify(auditCall.data.metadataJson)).not.toContain(oldToken);
    expect(JSON.stringify(auditCall.data.metadataJson)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
  });

  it("does not silently re-enable a disabled portal", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.propertyOwner.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        ownerRow({ portalToken: data.portalToken, portalEnabled: false }),
    );

    const response = await request("POST", "/owners/owner-a/portal/regenerate");
    expect(response.status).toBe(200);
    expect(response.body.owner.portal_enabled).toBe(false);
    expect(database.propertyOwner.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ portalEnabled: expect.anything() }),
      }),
    );
  });

  it("returns tenant-safe 404 for an owner belonging to another company", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(null);
    const response = await request("POST", "/owners/owner-b/portal/regenerate");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("OWNER_NOT_FOUND");
    expect(database.propertyOwner.update).not.toHaveBeenCalled();
  });

  it("rejects a Broker (owners.view only, no owners.manage) with 403", async () => {
    permissionState.permissions = ["owners.view"];
    const response = await request("POST", "/owners/owner-a/portal/regenerate");
    expect(response.status).toBe(403);
    expect(database.propertyOwner.findFirst).not.toHaveBeenCalled();
    expect(database.propertyOwner.update).not.toHaveBeenCalled();
  });

  it("never accepts a client-supplied token", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.propertyOwner.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        ownerRow({ portalToken: data.portalToken }),
    );

    const attackerToken = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const response = await request("POST", "/owners/owner-a/portal/regenerate", {
      portal_token: attackerToken,
    } as unknown as Record<string, unknown>);

    expect(response.status).toBe(200);
    expect(response.body.owner.portal_token).not.toBe(attackerToken);
  });
});

describe("PATCH /real-estate/owners/:id/portal", () => {
  it("disables the portal without archiving the owner, keeping the token stored", async () => {
    const storedToken = "aaaaaaaa-1111-4111-8111-111111111111";
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a", portalToken: storedToken });
    database.propertyOwner.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        ownerRow({ portalEnabled: data.portalEnabled as boolean, portalToken: storedToken }),
    );

    const response = await request("PATCH", "/owners/owner-a/portal", { enabled: false });

    expect(response.status).toBe(200);
    expect(response.body.owner.status).toBe("active");
    expect(response.body.owner.portal_enabled).toBe(false);
    expect(response.body.owner.portal_token).toBe(storedToken);
    expect(database.propertyOwner.update).toHaveBeenCalledWith({
      where: { id: "owner-a" },
      data: { portalEnabled: false },
    });

    const auditCall = database.authAuditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe("owner.portal_disabled");
  });

  it("re-enabling reuses the existing token instead of silently rotating it", async () => {
    const storedToken = "aaaaaaaa-1111-4111-8111-111111111111";
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a", portalToken: storedToken });
    database.propertyOwner.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        ownerRow({ portalEnabled: true, portalToken: storedToken }),
    );

    const response = await request("PATCH", "/owners/owner-a/portal", { enabled: true });

    expect(response.status).toBe(200);
    expect(response.body.owner.portal_token).toBe(storedToken);
    expect(database.propertyOwner.update).toHaveBeenCalledWith({
      where: { id: "owner-a" },
      data: { portalEnabled: true },
    });

    const auditCall = database.authAuditLog.create.mock.calls[0][0];
    expect(auditCall.data.action).toBe("owner.portal_enabled");
  });

  it("generates a token on enable only if the legacy owner never had one", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a", portalToken: null });
    database.propertyOwner.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        ownerRow({ portalEnabled: true, portalToken: data.portalToken as string }),
    );

    const response = await request("PATCH", "/owners/owner-a/portal", { enabled: true });

    expect(response.status).toBe(200);
    expect(response.body.owner.portal_token).toBeTruthy();
    expect(database.propertyOwner.update).toHaveBeenCalledWith({
      where: { id: "owner-a" },
      data: { portalEnabled: true, portalToken: expect.any(String) },
    });
  });

  it("returns tenant-safe 404 for an owner in another company", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(null);
    const response = await request("PATCH", "/owners/owner-b/portal", { enabled: false });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("OWNER_NOT_FOUND");
  });

  it("rejects an invalid payload with 400 (zod validation), not a raw 500", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a", portalToken: "x" });
    const response = await request("PATCH", "/owners/owner-a/portal", {
      enabled: "yes",
    } as unknown as Record<string, unknown>);
    expect(response.status).toBe(400);
    expect(database.propertyOwner.update).not.toHaveBeenCalled();
  });

  it("rejects a Broker (owners.view only) with 403", async () => {
    permissionState.permissions = ["owners.view"];
    const response = await request("PATCH", "/owners/owner-a/portal", { enabled: false });
    expect(response.status).toBe(403);
  });

  it("401/403-equivalent: no session/permission at all is rejected before touching the DB", async () => {
    permissionState.permissions = [];
    const response = await request("PATCH", "/owners/owner-a/portal", { enabled: false });
    expect(response.status).toBe(403);
    expect(database.propertyOwner.findFirst).not.toHaveBeenCalled();
  });
});
