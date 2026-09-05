import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fase 4D — gestão interna de documentos do proprietário
// (/real-estate/owners/:id/documents). Cobre upload (permissão
// owners.manage, validação de arquivo, vínculo opcional a imóvel só quando
// o imóvel de fato pertence ao mesmo proprietário/empresa), listagem
// (owners.view), remoção (owners.manage + remoção também no provider de
// storage) e os vetores de segurança pedidos no escopo (IDOR/tenant
// isolation ao nível da rota interna).

const { database, permissionState, storageState } = vi.hoisted(() => ({
  database: {
    propertyOwner: { findFirst: vi.fn() },
    property: { findFirst: vi.fn(), findMany: vi.fn() },
    storedFile: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    authAuditLog: { create: vi.fn() },
  },
  permissionState: { permissions: ["owners.view", "owners.manage"] as string[] },
  storageState: { deletedPublicIds: [] as string[] },
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

// Fase 4D: nunca bate no Cloudinary real em teste — provider em memória com
// a mesma interface (uploadFile/deleteFile), só a árvore de dependências
// (buildStorageFolder real, sem necessidade de mock) é reaproveitada.
vi.mock("../src/services/storage/index.js", async () => {
  const actual = await vi.importActual<typeof import("../src/services/storage/index.js")>(
    "../src/services/storage/index.js",
  );
  return {
    ...actual,
    getStorageProvider: () => ({
      name: "cloudinary",
      async uploadFile(input: {
        fileName: string;
        mimeType: string;
        body: Buffer;
        folder: string;
      }) {
        return {
          provider: "cloudinary",
          publicId: `${input.folder}/mock-${input.fileName}`,
          resourceType: input.mimeType.startsWith("image/") ? "image" : "raw",
          secureUrl: `https://res.cloudinary.example/${input.folder}/mock-${input.fileName}`,
          originalFilename: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.body.byteLength,
          width: null,
          height: null,
          format: input.fileName.split(".").pop() ?? null,
        };
      },
    }),
    getStorageProviderForName: () => ({
      name: "cloudinary",
      async deleteFile(input: { publicId: string }) {
        storageState.deletedPublicIds.push(input.publicId);
      },
    }),
  };
});

import { realEstateRouter } from "../src/routes/real-estate.js";
import { errorHandler } from "../src/middleware/error-handler.js";

const servers: Server[] = [];
const PDF_BASE64 = Buffer.from("%PDF-1.4 conteudo de teste").toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
  permissionState.permissions = ["owners.view", "owners.manage"];
  storageState.deletedPublicIds = [];
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function request(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  companyId = "company-a",
) {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
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

function storedFileFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    companyId: "company-a",
    entityType: "property_owner",
    entityId: "owner-a",
    provider: "cloudinary",
    publicId: "imobiflow/company-a/owners/owner-a/documents/mock",
    resourceType: "raw",
    secureUrl: "https://res.cloudinary.example/mock.pdf",
    originalFilename: "Documento.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    purpose: "owner_document",
    createdAt: new Date("2026-09-01T10:00:00.000Z"),
    metadataJson: null,
    ...overrides,
  };
}

describe("POST /real-estate/owners/:id/documents", () => {
  it("envia um documento válido e grava purpose=owner_document / entityType=property_owner", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.storedFile.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...storedFileFixture(),
        ...data,
        createdAt: new Date("2026-09-05T12:00:00.000Z"),
      }),
    );

    const response = await request("POST", "/owners/owner-a/documents", {
      file_name: "contrato.pdf",
      mime_type: "application/pdf",
      size_bytes: Buffer.from("%PDF-1.4 conteudo de teste").byteLength,
      content_base64: PDF_BASE64,
    });

    expect(response.status).toBe(201);
    expect((response.body.document as Record<string, unknown>).category).toBe("pdf");
    expect(database.storedFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "property_owner",
          entityId: "owner-a",
          purpose: "owner_document",
        }),
      }),
    );
    expect(database.authAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "owner.document_uploaded" }),
      }),
    );
  });

  it("vincula a um imóvel apenas quando o imóvel pertence ao mesmo proprietário/empresa", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.property.findFirst.mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444" });
    database.storedFile.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...storedFileFixture(),
        ...data,
        createdAt: new Date(),
      }),
    );

    const response = await request("POST", "/owners/owner-a/documents", {
      file_name: "contrato.pdf",
      mime_type: "application/pdf",
      size_bytes: Buffer.from("%PDF-1.4 x").byteLength,
      content_base64: Buffer.from("%PDF-1.4 x").toString("base64"),
      property_id: "44444444-4444-4444-8444-444444444444",
    });

    expect(response.status).toBe(201);
    expect(database.property.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "44444444-4444-4444-8444-444444444444",
          companyId: "company-a",
          ownerId: "owner-a",
        },
      }),
    );
    expect((response.body.document as Record<string, unknown>).property_id).toBe(
      "44444444-4444-4444-8444-444444444444",
    );
  });

  it("rejeita vincular a um imóvel que não pertence a este proprietário (nunca aceita propertyId às cegas)", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.property.findFirst.mockResolvedValue(null);

    const response = await request("POST", "/owners/owner-a/documents", {
      file_name: "contrato.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
      content_base64: Buffer.from("%PDF-1.4 x").toString("base64"),
      property_id: "55555555-5555-4555-8555-555555555555",
    });

    expect(response.status).toBe(422);
    expect(database.storedFile.create).not.toHaveBeenCalled();
  });

  it("rejeita formato não suportado (validação real de magic bytes, não só extensão/mime declarado)", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    const fakeContent = Buffer.from("nao e um pdf de verdade").toString("base64");

    const response = await request("POST", "/owners/owner-a/documents", {
      file_name: "contrato.pdf",
      mime_type: "application/pdf",
      size_bytes: 30,
      content_base64: fakeContent,
    });

    expect(response.status).toBe(415);
    expect(database.storedFile.create).not.toHaveBeenCalled();
  });

  it("rejeita um Corretor sem owners.manage (403), sem consultar o proprietário", async () => {
    permissionState.permissions = ["owners.view"];
    const response = await request("POST", "/owners/owner-a/documents", {
      file_name: "contrato.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
      content_base64: PDF_BASE64,
    });
    expect(response.status).toBe(403);
    expect(database.propertyOwner.findFirst).not.toHaveBeenCalled();
  });

  it("404 tenant-safe para proprietário de outra empresa", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(null);
    const response = await request("POST", "/owners/owner-b/documents", {
      file_name: "contrato.pdf",
      mime_type: "application/pdf",
      size_bytes: 10,
      content_base64: PDF_BASE64,
    });
    expect(response.status).toBe(404);
  });
});

describe("GET /real-estate/owners/:id/documents", () => {
  it("lista os documentos do proprietário (owners.view já é suficiente, não exige owners.manage)", async () => {
    permissionState.permissions = ["owners.view"];
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.storedFile.findMany.mockResolvedValue([storedFileFixture()]);
    database.property.findMany.mockResolvedValue([]);

    const response = await request("GET", "/owners/owner-a/documents");
    expect(response.status).toBe(200);
    expect(response.body.documents).toHaveLength(1);
  });

  it("nunca expõe publicId/secureUrl/provider ao usuário interno", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.storedFile.findMany.mockResolvedValue([storedFileFixture()]);
    database.property.findMany.mockResolvedValue([]);

    const response = await request("GET", "/owners/owner-a/documents");
    const serialized = JSON.stringify(response.body.documents);
    expect(serialized).not.toMatch(/publicId|secureUrl|provider/i);
  });
});

describe("DELETE /real-estate/owners/:id/documents/:documentId", () => {
  it("remove o documento do banco e do provider de storage, e audita a ação", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.storedFile.findFirst.mockResolvedValue(storedFileFixture());
    database.storedFile.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request("DELETE", "/owners/owner-a/documents/doc-1");
    expect(response.status).toBe(200);
    expect(storageState.deletedPublicIds).toEqual([
      "imobiflow/company-a/owners/owner-a/documents/mock",
    ]);
    expect(database.storedFile.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "doc-1",
          companyId: "company-a",
          entityType: "property_owner",
          entityId: "owner-a",
        },
      }),
    );
    expect(database.authAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "owner.document_removed" }),
      }),
    );
  });

  it("IDOR: documentId de outro proprietário não é encontrado (findFirst filtra por entityId=ownerId) — 404, nada é deletado", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.storedFile.findFirst.mockResolvedValue(null);

    const response = await request("DELETE", "/owners/owner-a/documents/doc-of-owner-b");
    expect(response.status).toBe(404);
    expect(database.storedFile.deleteMany).not.toHaveBeenCalled();
    expect(storageState.deletedPublicIds).toEqual([]);
  });

  it("purpose isolation: mesmo company/owner/entityType, mas purpose diferente de owner_document — 404, nada é deletado, nada é auditado", async () => {
    // Mesma company, mesmo owner, mesmo entityType=property_owner, mesmo
    // documentId — o único diferencial é o purpose. A query do banco
    // (findFirst) não filtra por purpose, então a proteção real precisa vir
    // da checagem explícita da rota antes de deletar.
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.storedFile.findFirst.mockResolvedValue(
      storedFileFixture({ purpose: "property_media" }),
    );

    const response = await request("DELETE", "/owners/owner-a/documents/doc-1");
    expect(response.status).toBe(404);
    expect((response.body as { error?: string }).error).toBe("OWNER_DOCUMENT_NOT_FOUND");
    expect(database.storedFile.deleteMany).not.toHaveBeenCalled();
    expect(storageState.deletedPublicIds).toEqual([]);
    expect(database.authAuditLog.create).not.toHaveBeenCalled();
  });

  it("regressão: purpose=owner_document válido continua sendo removido normalmente", async () => {
    database.propertyOwner.findFirst.mockResolvedValue({ id: "owner-a" });
    database.storedFile.findFirst.mockResolvedValue(
      storedFileFixture({ purpose: "owner_document" }),
    );
    database.storedFile.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request("DELETE", "/owners/owner-a/documents/doc-1");
    expect(response.status).toBe(200);
    expect(database.storedFile.deleteMany).toHaveBeenCalled();
    expect(storageState.deletedPublicIds).toEqual([
      "imobiflow/company-a/owners/owner-a/documents/mock",
    ]);
    expect(database.authAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "owner.document_removed" }),
      }),
    );
  });

  it("rejeita um Corretor sem owners.manage", async () => {
    permissionState.permissions = ["owners.view"];
    const response = await request("DELETE", "/owners/owner-a/documents/doc-1");
    expect(response.status).toBe(403);
    expect(database.storedFile.findFirst).not.toHaveBeenCalled();
  });
});
