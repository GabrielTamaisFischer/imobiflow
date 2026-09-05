import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Guardamos a fetch real ANTES de qualquer vi.stubGlobal: o próprio helper
// de teste (requestPublicPortal) usa `fetch` para bater no servidor HTTP
// local efêmero — se stubássemos fetch globalmente sem preservar isso, o
// stub interceptaria também essa chamada local, não só a chamada de
// upstream ao secureUrl do provider (que é a única que deve ser mockada).
const realFetch = globalThis.fetch.bind(globalThis);

// Fase 4D — Documentos do Proprietário no Portal. Cobre os itens 1-15 do
// escopo obrigatório de testes (backend): payload do portal
// (GET /public/portals/owners/:token, campo `documents`) e o endpoint de
// download/visualização (GET /public/portals/owners/:token/documents/:id).
// Prisma/MySQL sempre mockado (nunca banco real); `fetch` também mockado no
// endpoint de download (nunca bate no Cloudinary de verdade em teste).

const { database } = vi.hoisted(() => ({
  database: {
    propertyOwner: { findFirst: vi.fn(), update: vi.fn() },
    company: { findFirst: vi.fn() },
    property: { findMany: vi.fn() },
    storedFile: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));

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
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`Unexpected supabase table in test: ${table}`);
    },
  },
}));

import {
  loadMysqlOwnerPortalDocumentFile,
  loadMysqlOwnerPortalDocuments,
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

function storedFileFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    companyId: "company-a",
    entityType: "property_owner",
    entityId: "owner-a",
    provider: "cloudinary",
    publicId: "imobiflow/company-a/owners/owner-a/documents/mock",
    resourceType: "raw",
    secureUrl:
      "https://res.cloudinary.example/imobiflow/company-a/owners/owner-a/documents/mock.pdf",
    originalFilename: "Contrato de locação.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    width: null,
    height: null,
    format: "pdf",
    purpose: "owner_document",
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    uploadedBy: "user-a",
    isTestData: false,
    testBatchId: null,
    sourceUrl: null,
    importJobId: null,
    importSource: null,
    metadataJson: null,
    ...overrides,
  };
}

const servers: Server[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
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
  const response = await realFetch(`http://127.0.0.1:${address.port}${path}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return {
      status: response.status,
      headers: response.headers,
      body: (await response.json()) as Record<string, unknown>,
    };
  }
  return { status: response.status, headers: response.headers, body: await response.arrayBuffer() };
}

describe("loadMysqlOwnerPortalDocuments (service layer)", () => {
  it("1. owner sem documentos retorna lista vazia", async () => {
    database.storedFile.findMany.mockResolvedValue([]);
    const documents = await loadMysqlOwnerPortalDocuments("company-a", "owner-a", []);
    expect(documents).toEqual([]);
  });

  it("2. owner com 1 documento retorna 1 item privacy-safe", async () => {
    database.storedFile.findMany.mockResolvedValue([storedFileFixture()]);
    const documents = await loadMysqlOwnerPortalDocuments("company-a", "owner-a", []);
    expect(documents).toEqual([
      {
        id: "doc-1",
        name: "Contrato de locação.pdf",
        category: "pdf",
        mime_type: "application/pdf",
        created_at: "2026-09-01T10:00:00.000Z",
        property_id: null,
      },
    ]);
  });

  it("3. owner com vários documentos retorna todos", async () => {
    database.storedFile.findMany.mockResolvedValue([
      storedFileFixture({ id: "doc-1" }),
      storedFileFixture({ id: "doc-2", originalFilename: "RG.jpg", mimeType: "image/jpeg" }),
    ]);
    const documents = await loadMysqlOwnerPortalDocuments("company-a", "owner-a", []);
    expect(documents).toHaveLength(2);
    expect(documents.map((document) => document.id)).toEqual(["doc-1", "doc-2"]);
    expect(documents[1].category).toBe("image");
  });

  it("4. filtra por purpose=owner_document na query (nunca lista qualquer StoredFile da entidade)", async () => {
    database.storedFile.findMany.mockResolvedValue([]);
    await loadMysqlOwnerPortalDocuments("company-a", "owner-a", []);
    expect(database.storedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: "company-a",
          entityType: "property_owner",
          entityId: "owner-a",
          purpose: "owner_document",
        },
      }),
    );
  });

  it("5. filtra por company (companyId sempre vem do token já resolvido, nunca do cliente)", async () => {
    database.storedFile.findMany.mockResolvedValue([]);
    await loadMysqlOwnerPortalDocuments("company-b", "owner-a", []);
    expect(database.storedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: "company-b" }) }),
    );
  });

  it("6. filtra por owner (entityId)", async () => {
    database.storedFile.findMany.mockResolvedValue([]);
    await loadMysqlOwnerPortalDocuments("company-a", "owner-x", []);
    expect(database.storedFile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entityId: "owner-x" }) }),
    );
  });

  it("7. não vaza property_id de um imóvel de outro proprietário — metadata inconsistente cai para null em vez de vazar o id", async () => {
    database.storedFile.findMany.mockResolvedValue([
      storedFileFixture({ metadataJson: { property_id: "property-of-another-owner" } }),
    ]);
    // propertyIds vazio: nenhum imóvel deste proprietário inclui esse id.
    const documents = await loadMysqlOwnerPortalDocuments("company-a", "owner-a", []);
    expect(documents[0].property_id).toBeNull();
  });

  it("opcional: expõe property_id quando ele de fato pertence ao proprietário resolvido", async () => {
    database.storedFile.findMany.mockResolvedValue([
      storedFileFixture({ metadataJson: { property_id: "property-1" } }),
    ]);
    const documents = await loadMysqlOwnerPortalDocuments("company-a", "owner-a", ["property-1"]);
    expect(documents[0].property_id).toBe("property-1");
  });
});

describe("loadMysqlOwnerPortalDocumentFile (service layer — resolução segura para download)", () => {
  it("11. resolve um documento autorizado do proprietário certo", async () => {
    database.storedFile.findFirst.mockResolvedValue(storedFileFixture());
    const file = await loadMysqlOwnerPortalDocumentFile("company-a", "owner-a", "doc-1");
    expect(file?.id).toBe("doc-1");
  });

  it("12. bloqueia cross-owner: documento de outro proprietário não é resolvido (findFirst já filtra por entityId=ownerId)", async () => {
    database.storedFile.findFirst.mockResolvedValue(null);
    const file = await loadMysqlOwnerPortalDocumentFile("company-a", "owner-a", "doc-of-owner-b");
    expect(file).toBeNull();
    expect(database.storedFile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "doc-of-owner-b",
          companyId: "company-a",
          entityType: "property_owner",
          entityId: "owner-a",
        },
      }),
    );
  });

  it("13. bloqueia cross-company: mesmo id de documento, companyId errado não resolve", async () => {
    database.storedFile.findFirst.mockResolvedValue(null);
    const file = await loadMysqlOwnerPortalDocumentFile("company-b", "owner-a", "doc-1");
    expect(file).toBeNull();
  });

  it("purpose isolation: um StoredFile com purpose diferente de owner_document nunca é servido, mesmo se o resto bater", async () => {
    database.storedFile.findFirst.mockResolvedValue(
      storedFileFixture({ purpose: "financial_document" }),
    );
    const file = await loadMysqlOwnerPortalDocumentFile("company-a", "owner-a", "doc-1");
    expect(file).toBeNull();
  });
});

describe("GET /public/portals/owners/:token (payload aditivo)", () => {
  it("8/9. token inválido e portal disabled continuam 404 tenant-safe (comportamento herdado, não regride)", async () => {
    const response = await requestPublicPortal("/owners/not-a-token");
    expect(response.status).toBe(404);
    expect((response.body as Record<string, unknown>).code).toBe("PORTAL_NOT_FOUND");
  });

  it("10. DTO de documento nunca expõe publicId/secureUrl/provider/metadata internos", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});
    database.storedFile.findMany.mockResolvedValue([storedFileFixture()]);

    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}`);
    expect(response.status).toBe(200);
    const documents = (response.body as { documents: Record<string, unknown>[] }).documents;
    expect(documents).toHaveLength(1);
    const serialized = JSON.stringify(documents[0]);
    expect(serialized).not.toMatch(/publicId|secureUrl|provider|storage|metadata/i);
    expect(Object.keys(documents[0]).sort()).toEqual(
      ["category", "created_at", "id", "mime_type", "name", "property_id"].sort(),
    );
  });

  it("15. compatibilidade com payload antigo: `documents` é aditivo, o restante do payload da F4B/F4C continua idêntico", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});
    database.storedFile.findMany.mockResolvedValue([]);

    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}`);
    expect(response.status).toBe(200);
    const body = response.body as Record<string, unknown>;
    expect(body).toHaveProperty("owner");
    expect(body).toHaveProperty("company");
    expect(body).toHaveProperty("properties");
    expect(body).toHaveProperty("transfers");
    expect(body).toHaveProperty("charges");
    expect(body.documents).toEqual([]);
  });
});

describe("GET /public/portals/owners/:token/documents/:documentId (download)", () => {
  it("11. baixa um documento autorizado com headers seguros", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.storedFile.findFirst.mockResolvedValue(storedFileFixture());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("%PDF-1.4 conteudo").buffer,
      }),
    );

    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}/documents/doc-1`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("inline");
    expect(response.headers.get("content-disposition")).toContain("Contrato de loca");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("12. download cross-owner bloqueado (documentId existe, mas não para o owner do token) — 404 tenant-safe", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.storedFile.findFirst.mockResolvedValue(null);
    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}/documents/doc-of-owner-b`);
    expect(response.status).toBe(404);
    expect((response.body as Record<string, unknown>).code).toBe("PORTAL_NOT_FOUND");
  });

  it("13. download cross-company bloqueado — mesmo padrão 404 tenant-safe, nunca revela existência", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(
      ownerFixture({ id: "owner-b", companyId: "company-b" }),
    );
    database.storedFile.findFirst.mockResolvedValue(null);
    const response = await requestPublicPortal(`/owners/${OWNER_B_TOKEN}/documents/doc-1`);
    expect(response.status).toBe(404);
  });

  it("token inválido no endpoint de download também cai em 404 tenant-safe sem consultar StoredFile", async () => {
    const response = await requestPublicPortal("/owners/not-a-token/documents/doc-1");
    expect(response.status).toBe(404);
    expect(database.storedFile.findFirst).not.toHaveBeenCalled();
  });

  it("id de documento arbitrário/inexistente nunca vaza um arquivo — cai no mesmo 404", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.storedFile.findFirst.mockResolvedValue(null);
    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}/documents/arbitrary-id`);
    expect(response.status).toBe(404);
  });

  it("14. filename sanitizado: aspas/controle removidos do header Content-Disposition", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.storedFile.findFirst.mockResolvedValue(
      storedFileFixture({ originalFilename: 'malicious".pdf\r\nX-Injected: 1' }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }),
    );

    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}/documents/doc-1`);
    expect(response.status).toBe(200);
    const disposition = response.headers.get("content-disposition") ?? "";
    // A única aspa dupla válida no header é o par que delimita o próprio
    // filename= (2 ocorrências) — nenhuma aspa adicional pode ter vindo do
    // nome de arquivo malicioso (que tentava fechar a string antecipadamente).
    expect(disposition.split('"').length - 1).toBe(2);
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
  });

  it("documento com mime não-inline (arquivo genérico) usa Content-Disposition attachment", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.storedFile.findFirst.mockResolvedValue(
      storedFileFixture({ mimeType: "application/octet-stream" }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }),
    );

    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}/documents/doc-1`);
    expect(response.headers.get("content-disposition")).toContain("attachment");
  });

  it("nunca ecoa a secureUrl bruta do provider na resposta HTTP (nem no corpo, nem em headers)", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.storedFile.findFirst.mockResolvedValue(storedFileFixture());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }),
    );

    const response = await requestPublicPortal(`/owners/${OWNER_A_TOKEN}/documents/doc-1`);
    const headerDump = JSON.stringify([...response.headers.entries()]);
    expect(headerDump).not.toContain("res.cloudinary.example");
  });
});
