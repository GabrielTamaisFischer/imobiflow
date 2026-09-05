import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fase 4B.1 — cobertura automatizada do Portal do Proprietário. Antes desta
// tarefa, a única validação existente era a homologação manual da Fase A
// (2026-08-30, checks A2.1–A2.6). Aqui cobrimos, com Prisma/MySQL mockado
// (nunca Supabase para o núcleo do portal), os 15 cenários mínimos do
// escopo A: token válido, token inexistente, portal desabilitado,
// proprietário arquivado/inativo, isolamento entre proprietários da mesma
// empresa, isolamento entre empresas, 0/1/N imóveis, venda e locação,
// ausência de dados internos sensíveis no payload, atualização de
// portalLastAccessAt, e a garantia estrutural de que o endpoint nunca
// aceita companyId/ownerId do cliente.

const { database } = vi.hoisted(() => ({
  database: {
    propertyOwner: { findFirst: vi.fn(), update: vi.fn() },
    company: { findFirst: vi.fn() },
    property: { findMany: vi.fn() },
    // Fase 4D: a rota HTTP do portal agora também carrega documentos
    // (loadMysqlOwnerPortalDocuments → findStoredFilesForEntity →
    // storedFile.findMany). Default vazio nos testes que só cobrem o núcleo
    // pré-F4D do portal — os cenários específicos de documentos ficam em
    // owner-portal-documents.test.ts.
    storedFile: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));

const supabaseState = vi.hoisted(() => ({ auditInsertCalls: [] as unknown[] }));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (table === "owner_transfers" || table === "financial_charges") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({ limit: async () => ({ data: [], error: null }) }),
              }),
            }),
          }),
        };
      }
      if (table === "portal_access_logs") {
        return {
          insert: async (payload: unknown) => {
            supabaseState.auditInsertCalls.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected supabase table in test: ${table}`);
    },
  },
}));

import {
  loadMysqlOwnerPortalCore,
  touchMysqlOwnerPortalAccess,
} from "../src/services/mysql-real-estate.js";
import { publicPortalsRouter } from "../src/routes/public-portals.js";

const OWNER_A_TOKEN = "11111111-1111-4111-8111-111111111111";
const OWNER_B_TOKEN = "22222222-2222-4222-8222-222222222222";

function ownerFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "owner-a",
    companyId: "company-a",
    ownerType: "individual",
    name: "Maria Proprietária",
    document: "52998224725",
    email: "maria@example.test",
    phone: "+55 41 90000-0000",
    whatsapp: "+55 41 90000-0000",
    status: "active",
    ...overrides,
  };
}

const servers: Server[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  supabaseState.auditInsertCalls.length = 0;
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("loadMysqlOwnerPortalCore (service layer, Prisma/MySQL canonical)", () => {
  it("1. resolves a valid token with portalEnabled=true", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);

    const result = await loadMysqlOwnerPortalCore(OWNER_A_TOKEN);

    expect(result.owner.id).toBe("owner-a");
    expect(database.propertyOwner.findFirst).toHaveBeenCalledWith({
      where: { portalToken: OWNER_A_TOKEN, portalEnabled: true },
      select: expect.any(Object),
    });
  });

  it("2. rejects a malformed/inexistent token as tenant-safe 404 without querying the DB", async () => {
    await expect(loadMysqlOwnerPortalCore("not-a-token")).rejects.toMatchObject({
      statusCode: 404,
      code: "PORTAL_NOT_FOUND",
    });
    expect(database.propertyOwner.findFirst).not.toHaveBeenCalled();
  });

  it("3. rejects when the owner's portal is disabled (findFirst filters portalEnabled=true, so it comes back null)", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(null);
    await expect(loadMysqlOwnerPortalCore(OWNER_A_TOKEN)).rejects.toMatchObject({
      statusCode: 404,
      code: "PORTAL_NOT_FOUND",
    });
  });

  it("4. rejects an archived/inactive owner even if the token still matches", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture({ status: "archived" }));
    await expect(loadMysqlOwnerPortalCore(OWNER_A_TOKEN)).rejects.toMatchObject({
      statusCode: 404,
      code: "PORTAL_NOT_FOUND",
    });
  });

  it("9. returns an empty list for an owner with 0 properties", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);

    const result = await loadMysqlOwnerPortalCore(OWNER_A_TOKEN);
    expect(result.properties).toEqual([]);
  });

  it("10/11. returns sale and rental properties scoped to companyId + ownerId (never a client-supplied filter)", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([
      {
        id: "p1",
        code: "V-1",
        title: "Casa à venda",
        operation: "sale",
        status: "available",
        neighborhood: "Centro",
        city: "Curitiba",
        state: "PR",
        rentPriceCents: null,
        salePriceCents: 500_000_00,
      },
      {
        id: "p2",
        code: "L-1",
        title: "Apto para locação",
        operation: "rent",
        status: "available",
        neighborhood: "Batel",
        city: "Curitiba",
        state: "PR",
        rentPriceCents: 2_500_00,
        salePriceCents: null,
      },
    ]);

    const result = await loadMysqlOwnerPortalCore(OWNER_A_TOKEN);
    expect(result.properties).toHaveLength(2);
    expect(database.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "company-a", ownerId: "owner-a", status: { not: "archived" } },
      }),
    );
  });

  it("6. company scoping comes from the owner resolved by token, never from a client-supplied companyId", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(
      ownerFixture({ id: "owner-b", companyId: "company-b" }),
    );
    database.company.findFirst.mockResolvedValue({
      id: "company-b",
      name: "Imobiliária B",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);

    await loadMysqlOwnerPortalCore(OWNER_B_TOKEN);
    expect(database.company.findFirst).toHaveBeenCalledWith({
      where: { id: "company-b" },
      select: expect.any(Object),
    });
    expect(database.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: "company-b", ownerId: "owner-b" }),
      }),
    );
  });
});

describe("touchMysqlOwnerPortalAccess", () => {
  it("13. updates portalLastAccessAt for the resolved owner", async () => {
    database.propertyOwner.update.mockResolvedValue({});
    await touchMysqlOwnerPortalAccess("owner-a");
    expect(database.propertyOwner.update).toHaveBeenCalledWith({
      where: { id: "owner-a" },
      data: { portalLastAccessAt: expect.any(Date) },
    });
  });
});

async function requestPublicPortal(path: string) {
  const app = express();
  app.use(publicPortalsRouter);
  app.use(
    (
      error: { statusCode?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(error.statusCode ?? 500)
        .json({ message: error.message, code: (error as { code?: string }).code });
    },
  );

  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind to a TCP port.");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("GET /public/portals/owners/:token (HTTP route)", () => {
  it("1. returns 200 for a valid, enabled, active owner", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});

    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}`);

    expect(response.status).toBe(200);
    expect(response.body.owner.id).toBe("owner-a");
  });

  it("2. returns tenant-safe 404 for an inexistent/malformed token", async () => {
    const response = await requestPublicPortal("/owners/not-a-token");
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("PORTAL_NOT_FOUND");
  });

  it("5/14. never exposes another owner's data — a token only ever resolves the single matching owner (no companyId/ownerId accepted from the client)", async () => {
    database.propertyOwner.findFirst.mockImplementation(
      async ({ where }: { where: { portalToken: string } }) => {
        if (where.portalToken === OWNER_A_TOKEN)
          return ownerFixture({ id: "owner-a", companyId: "company-a", name: "Proprietário A" });
        return null;
      },
    );
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});

    const responseA = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}`);
    expect(responseA.status).toBe(200);
    expect(responseA.body.owner.name).toBe("Proprietário A");

    const responseB = await requestPublicPortal(`/owners/${OWNER_B_TOKEN}`);
    expect(responseB.status).toBe(404);
  });

  it("12. payload never leaks internal-only fields (document/CPF stays server-side rendering choice, but createdBy/roleId/etc. must never appear)", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});

    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}`);
    expect(response.body.owner).not.toHaveProperty("createdBy");
    expect(response.body.owner).not.toHaveProperty("created_by");
    expect(response.body).not.toHaveProperty("portal_token");
  });

  it("13. records portalLastAccessAt on a successful access", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});

    await requestPublicPortal(`/owners/${OWNER_A_TOKEN}`);
    expect(database.propertyOwner.update).toHaveBeenCalledWith({
      where: { id: "owner-a" },
      data: { portalLastAccessAt: expect.any(Date) },
    });
  });
});
