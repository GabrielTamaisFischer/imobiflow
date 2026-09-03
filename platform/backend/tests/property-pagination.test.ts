import { type Server } from "node:http";
import type { PrismaClient } from "@prisma/client";
import express, { type RequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGetPropertyByCodeHandler,
  createGetPropertyByExternalIdHandler,
  createGetPropertyHandler,
  createListPropertiesHandler,
  parsePropertyListQuery,
} from "../src/routes/real-estate.js";
import {
  buildPropertyListWhere,
  getMysqlProperty,
  getMysqlPropertyByCode,
  getMysqlPropertyByExternalId,
  listMysqlProperties,
  listMysqlPropertyContent,
  type PropertyListInput,
} from "../src/services/mysql-real-estate.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("property list query policy", () => {
  it("uses page 1 and the default limit of 25", () => {
    expect(parsePropertyListQuery({})).toMatchObject({ page: 1, pageSize: 25 });
  });

  it("accepts the absolute maximum of 100", () => {
    expect(parsePropertyListQuery({ page: "2", page_size: "100" })).toMatchObject({ page: 2, pageSize: 100 });
  });

  it.each([
    [{ page_size: "101" }],
    [{ page_size: "-1" }],
    [{ page_size: "0" }],
    [{ page: "0" }],
    [{ page: "invalid" }],
  ])("rejects invalid pagination %#", (query) => {
    expect(() => parsePropertyListQuery(query)).toThrowError(/inválidos/i);
  });

  it("ignores a company_id supplied by the client", () => {
    expect(parsePropertyListQuery({ company_id: "company-b", page: "3" })).toMatchObject({ page: 3, pageSize: 25 });
  });

  it("maps supported filters without building raw SQL", () => {
    expect(parsePropertyListQuery({
      operation: "sale",
      property_type: "house",
      status: "available",
      code: "A-1",
      import_source: "csv",
      import_external_id: "EXT-1",
      search: "Centro",
    })).toMatchObject({
      operation: "sale",
      propertyType: "house",
      status: "available",
      code: "A-1",
      importSource: "csv",
      importExternalId: "EXT-1",
      search: "Centro",
    });
  });
});

describe("property HTTP handlers", () => {
  it("returns the paginated envelope and uses the authenticated company", async () => {
    const service = vi.fn(async () => pageResult(25, 50, 1));
    const response = await request(createListPropertiesHandler(service as never), "/properties", "company-a");
    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(25);
    expect(response.body.pagination).toMatchObject({ page: 1, page_size: 25, total: 50, has_next: true });
    expect(service).toHaveBeenCalledWith(
      "company-a",
      expect.objectContaining({ page: 1, pageSize: 25 }),
      undefined,
      { companyId: "company-a" },
    );
  });

  it("does not let a malicious company_id replace the session company", async () => {
    const service = vi.fn(async () => pageResult(0, 0, 1));
    const response = await request(
      createListPropertiesHandler(service as never),
      "/properties?company_id=company-b",
      "company-a",
    );
    expect(response.status).toBe(200);
    expect(service.mock.calls[0]?.[0]).toBe("company-a");
  });

  it("returns HTTP 400 for an excessive page size", async () => {
    const response = await request(createListPropertiesHandler(vi.fn() as never), "/properties?page_size=500", "company-a");
    expect(response.status).toBe(400);
  });

  it("returns HTTP 404 when another company requests a property detail", async () => {
    const notFound = Object.assign(new Error("Imóvel não encontrado."), { statusCode: 404 });
    const service = vi.fn(async () => { throw notFound; });
    const response = await request(createGetPropertyHandler(service as never), "/properties/property-a", "company-b", "/properties/:id");
    expect(response.status).toBe(404);
    expect(service).toHaveBeenCalledWith("company-b", "property-a", undefined, { companyId: "company-b" });
  });

  it("reads code inside the company context", async () => {
    const service = vi.fn(async () => ({ id: "property-a" }));
    const response = await request(createGetPropertyByCodeHandler(service as never), "/properties/by-code/A-10", "company-a", "/properties/by-code/:code");
    expect(response.status).toBe(200);
    expect(service).toHaveBeenCalledWith("company-a", "A-10", undefined, { companyId: "company-a" });
  });

  it("passes import_source when looking up an external id", async () => {
    const service = vi.fn(async () => ({ id: "property-a" }));
    const response = await request(
      createGetPropertyByExternalIdHandler(service as never),
      "/properties/by-external-id/EXT-10?import_source=csv",
      "company-a",
      "/properties/by-external-id/:externalId",
    );
    expect(response.status).toBe(200);
    expect(service).toHaveBeenCalledWith("company-a", "EXT-10", "csv", undefined, { companyId: "company-a" });
  });
});

describe("property pagination service", () => {
  it.each([
    [1, 25, 25, 0],
    [2, 25, 25, 25],
    [3, 25, 11, 50],
    [4, 25, 0, 75],
  ])("returns a bounded page without overlap: page %i", async (page, pageSize, expected, skip) => {
    const database = fakeDatabase(61);
    const result = await listMysqlProperties("company-a", input({ page, pageSize }), database);
    expect(result.items).toHaveLength(expected);
    expect(database.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: pageSize, skip }));
  });

  it("uses stable created_at and id ordering", async () => {
    const database = fakeDatabase(2);
    await listMysqlProperties("company-a", input({}), database);
    expect(database.property.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }));
  });

  it("selects only card fields, one media item and no heavy JSON", async () => {
    const database = fakeDatabase(1);
    const result = await listMysqlProperties("company-a", input({}), database);
    const query = database.property.findMany.mock.calls[0]?.[0];
    expect(query.select).not.toHaveProperty("description");
    expect(query.select).not.toHaveProperty("captureJson");
    expect(query.select).not.toHaveProperty("featuresJson");
    expect(query.select.media).toMatchObject({ take: 1 });
    expect(result.items[0]).not.toHaveProperty("description");
    expect(result.items[0]?.property_media).toHaveLength(1);
  });

  // Fase 2.2D — correção do blocker de homologação: GET /real-estate/properties
  // (listagem) devolvia responsible_user: null mesmo com responsibleUserId
  // preenchido, porque propertyListSelect não selecionava a relação
  // responsibleUser (só o select de detalhe, propertyInclude, selecionava).
  // O frontend (badge "Meu"/"Compartilhado" e o botão "Compartilhar imóvel"
  // em app.imoveis.tsx) depende de responsible_user vir da LISTAGEM, não só
  // do detalhe — daí o blocker.
  it("selects responsibleUser (id, name) in the list query, mirroring the detail select (#1)", async () => {
    const database = fakeDatabase(1);
    await listMysqlProperties("company-a", input({}), database);
    const query = database.property.findMany.mock.calls[0]?.[0];
    expect(query.select.responsibleUser).toEqual({ select: { id: true, name: true } });
  });

  it("returns responsible_user: null for a property without a responsible broker (#1)", async () => {
    const database = fakeDatabase(1);
    const result = await listMysqlProperties("company-a", input({}), database);
    // propertyRow() não define responsibleUser (responsibleUserId: null).
    expect(result.items[0]?.responsible_user).toBeNull();
  });

  it("returns responsible_user: { id, name } for a property with a responsible broker (#2)", async () => {
    const database = fakeDatabaseWithResponsible({
      id: "broker-a1",
      name: "[SYNTHETIC] Broker A1",
    });
    const result = await listMysqlProperties("company-a", input({}), database);
    expect(result.items[0]?.responsible_user).toEqual({
      id: "broker-a1",
      name: "[SYNTHETIC] Broker A1",
    });
  });

  it("keeps company scoping and pagination shape unchanged by the responsibleUser fix (#7)", async () => {
    // Regressão: a correção não deve alterar where/orderBy/paginação - mesmas
    // asserções já cobertas acima para a query sem responsibleUser.
    const database = fakeDatabaseWithResponsible({ id: "broker-a1", name: "Broker A1" });
    await listMysqlProperties("company-a", input({ page: 2, pageSize: 10 }), database);
    const query = database.property.findMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({
      skip: 10,
      take: 10,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  });

  it("keeps listMysqlPropertyContent (already uses propertyInclude) unaffected by the listSelect fix (#7)", async () => {
    const database = fakeDatabase(1);
    const result = await listMysqlPropertyContent("company-a", input({}), database);
    expect(result.items[0]).toHaveProperty("id");
  });

  it("keeps the dedicated content collection paginated for builder compatibility", async () => {
    const database = fakeDatabase(130);
    const result = await listMysqlPropertyContent("company-a", input({ page: 2, pageSize: 100 }), database);
    expect(result.items).toHaveLength(30);
    expect(database.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 100 }));
  });

  it("reports first, intermediate, last and beyond-total pagination correctly", async () => {
    const database = fakeDatabase(61);
    const results = await Promise.all([1, 2, 3, 4].map((page) => listMysqlProperties("company-a", input({ page }), database)));
    expect(results.map((result) => result.pagination)).toEqual([
      expect.objectContaining({ page: 1, total_pages: 3, has_next: true, has_previous: false }),
      expect.objectContaining({ page: 2, has_next: true, has_previous: true }),
      expect.objectContaining({ page: 3, has_next: false, has_previous: true }),
      expect.objectContaining({ page: 4, has_next: false, has_previous: true }),
    ]);
    const ids = results.slice(0, 3).flatMap((result) => result.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(61);
  });
});

describe("company-scoped property filters and lookups", () => {
  it.each([
    ["operation", { operation: "sale" }, { operation: "sale" }],
    ["property type", { propertyType: "house" }, { propertyType: "house" }],
    ["status", { status: "available" }, { status: "available" }],
    ["code", { code: "A-1" }, { code: "A-1" }],
    ["import source", { importSource: "csv" }, { importSource: "csv" }],
    ["external id", { importExternalId: "EXT-1" }, { importExternalId: "EXT-1" }],
  ])("always scopes the %s filter by company", (_label, overrides, expected) => {
    expect(buildPropertyListWhere("company-a", input(overrides))).toMatchObject({ companyId: "company-a", ...expected });
  });

  it("builds a bounded parameterized text search through Prisma", () => {
    const where = buildPropertyListWhere("company-a", input({ search: "Centro" }));
    expect(where).toMatchObject({ companyId: "company-a", AND: [expect.objectContaining({ OR: expect.any(Array) })] });
    expect(JSON.stringify(where)).toContain("Centro");
  });

  it("gets detail by id and company simultaneously", async () => {
    const database = lookupDatabase([propertyRow(1)]);
    await getMysqlProperty("company-a", "property-1", database);
    expect(database.property.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "property-1", companyId: "company-a" } }));
  });

  it("gets code only inside the authenticated company", async () => {
    const database = lookupDatabase([propertyRow(1)]);
    await getMysqlPropertyByCode("company-a", "A-1", database);
    expect(database.property.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: "company-a", code: "A-1" } }));
  });

  it("gets external id using company and source", async () => {
    const database = lookupDatabase([propertyRow(1)]);
    await getMysqlPropertyByExternalId("company-a", "EXT-1", "csv", database);
    expect(database.property.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: "company-a", importExternalId: "EXT-1", importSource: "csv" },
      take: 1,
    }));
  });

  it("requires import_source when an external id is ambiguous", async () => {
    const database = lookupDatabase([propertyRow(1), propertyRow(2)]);
    await expect(getMysqlPropertyByExternalId("company-a", "EXT-1", undefined, database)).rejects.toMatchObject({
      statusCode: 400,
      code: "IMPORT_SOURCE_REQUIRED",
    });
  });

  it("returns the same 404 for absent and cross-company properties", async () => {
    const database = lookupDatabase([]);
    await expect(getMysqlProperty("company-b", "property-1", database)).rejects.toMatchObject({
      statusCode: 404,
      code: "PROPERTY_NOT_FOUND",
    });
  });
});

function input(overrides: Partial<PropertyListInput>): PropertyListInput {
  return { page: 1, pageSize: 25, status: "not_archived", ...overrides };
}

function propertyRow(index: number) {
  const timestamp = new Date(Date.UTC(2026, 7, 5, 12, 0, index));
  return {
    id: `property-${index}`,
    companyId: "company-a",
    ownerId: null,
    code: `A-${index}`,
    title: `Imóvel ${index}`,
    description: "large text",
    propertyType: index % 2 ? "house" : "apartment",
    operation: index % 2 ? "sale" : "rent",
    status: "available",
    street: "Rua QA",
    number: String(index),
    complement: null,
    neighborhood: "Centro",
    city: "Curitiba",
    state: "PR",
    country: "Brasil",
    zipCode: null,
    condominiumName: null,
    nearbyHighways: [],
    responsibleUserId: null,
    captureJson: { heavy: true },
    primaryDetailsJson: {},
    measurementsJson: {},
    bedrooms: 2,
    bathrooms: 1,
    suites: 0,
    parkingSpaces: 1,
    privateArea: 70,
    totalArea: 80,
    salePriceCents: 300_000_00,
    rentPriceCents: null,
    condominiumFeeCents: null,
    iptuCents: null,
    commercialTermsJson: {},
    featuresJson: { pool: true },
    amenityGroupsJson: {},
    videosJson: [],
    publicationSettingsJson: {},
    descriptionTemplateKey: null,
    publishedAt: null,
    importSource: "csv",
    importExternalId: `EXT-${index}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    owner: { id: "owner-a", name: "Owner A", phone: null, whatsapp: null, email: null },
    media: [{
      id: `media-${index}`,
      companyId: "company-a",
      propertyId: `property-${index}`,
      mediaType: "photo",
      url: "https://example.test/cover.jpg",
      caption: null,
      position: 0,
      storageBucket: null,
      storagePath: null,
      mimeType: "image/jpeg",
      fileSize: 100,
      isCover: true,
      createdAt: timestamp,
    }],
  };
}

function fakeDatabase(total: number) {
  const rows = Array.from({ length: total }, (_, index) => propertyRow(index + 1));
  const property = {
    count: vi.fn(async () => total),
    findMany: vi.fn(async (query: { skip: number; take: number }) => rows.slice(query.skip, query.skip + query.take)),
  };
  return {
    property,
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  } as unknown as PrismaClient & { property: typeof property };
}

// Fase 2.2D — mesma fakeDatabase(), mas com a linha 1 carregando um
// responsibleUser (relação), para provar que listMysqlProperties devolve
// responsible_user corretamente quando o Prisma o retorna (ver select
// asserido em "selects responsibleUser..." acima).
function fakeDatabaseWithResponsible(responsibleUser: { id: string; name: string }) {
  const rows = [{ ...propertyRow(1), responsibleUserId: responsibleUser.id, responsibleUser }];
  const property = {
    count: vi.fn(async () => rows.length),
    findMany: vi.fn(async (query: { skip: number; take: number }) =>
      rows.slice(query.skip, query.skip + query.take),
    ),
  };
  return {
    property,
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  } as unknown as PrismaClient & { property: typeof property };
}

function lookupDatabase(rows: ReturnType<typeof propertyRow>[]) {
  const property = {
    findFirst: vi.fn(async () => rows[0] ?? null),
    findMany: vi.fn(async () => rows),
  };
  return { property } as unknown as PrismaClient & { property: typeof property };
}

function pageResult(count: number, total: number, page: number) {
  return {
    items: Array.from({ length: count }, (_, index) => ({ id: `property-${index + 1}` })),
    pagination: {
      page,
      page_size: 25,
      total,
      total_pages: Math.ceil(total / 25),
      has_next: page * 25 < total,
      has_previous: page > 1,
    },
  };
}

async function request(handler: RequestHandler, path: string, companyId: string, route = "/properties") {
  const app = express();
  app.use((req, _res, next) => {
    Object.assign(req, {
      access: {
        company: { id: companyId, name: "QA", status: "active" },
        appUser: {
          id: "admin-a",
          company_id: companyId,
          role: "admin",
          permissions: ["properties.view", "properties.manage"],
          permissionScopes: { "properties.view": "company", "properties.manage": "company" },
        },
      },
    });
    next();
  });
  app.get(route, handler);
  app.use((error: { statusCode?: number; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? 500).json({ message: error.message });
  });
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind to a TCP port.");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  return { status: response.status, body: await response.json() as any };
}
