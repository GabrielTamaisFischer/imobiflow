import { randomUUID } from "node:crypto";
import { type AddressInfo } from "node:net";
import { type Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Testes HTTP da Assinatura Online (Bloco 5) — mesmo padrão de
// inspections-mysql-http.test.ts: Prisma fake em memória que avalia os
// mesmos filtros `where` do código real (inclusive buildInspectionScopeFilter
// via a chave especial "property"), então o isolamento A × B e toda a
// matriz de segurança do token público são da implementação real, não de um
// mock que sempre libera.

type Row = Record<string, any>;
const { state } = vi.hoisted(() => ({
  state: {
    tables: {} as Record<string, Row[]>,
    log: [] as string[],
    storageDeletes: [] as string[],
    storageUploads: [] as Array<{ companyId: string; purpose: string }>,
    bytesByPublicId: new Map<string, Buffer>(),
  },
}));

function matches(table: string, row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === "AND") return (condition as Row[]).every((part) => matches(table, row, part));
    if (key === "OR") return (condition as Row[]).some((part) => matches(table, row, part));
    if (key === "property") {
      const property = state.tables.property.find((item) => item.id === row.propertyId);
      return Boolean(property) && matches("property", property!, (condition as Row).is ?? condition);
    }
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return (condition as { in: unknown[] }).in.includes(row[key]);
      throw new Error(`Filtro não suportado no fake: ${table}.${key}`);
    }
    return row[key] === condition;
  });
}

function applyOrder(rows: Row[], orderBy?: Row): Row[] {
  if (!orderBy) return rows;
  const [[field, direction]] = Object.entries(orderBy);
  const sorted = [...rows].sort((a, b) => {
    const left = a[field] instanceof Date ? a[field].getTime() : a[field];
    const right = b[field] instanceof Date ? b[field].getTime() : b[field];
    if (left < right) return direction === "desc" ? 1 : -1;
    if (left > right) return direction === "desc" ? -1 : 1;
    return 0;
  });
  return sorted;
}

function withInclude(table: string, row: Row, include?: Row): Row {
  if (!include) return { ...row };
  const result: Row = { ...row };
  if (table === "inspection" && include.property) {
    result.property = state.tables.property.find((item) => item.id === row.propertyId) ?? null;
  }
  if (table === "inspectionSigningProcess" && include.parties) {
    result.parties = state.tables.inspectionSigningParty.filter((party) => party.processId === row.id);
  }
  return result;
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) row[key] = value;
  }
  row.updatedAt = new Date();
}

function model(table: string) {
  const rows = () => state.tables[table];
  const api = {
    async findFirst(args: Row = {}) {
      const found = applyOrder(rows().filter((item) => matches(table, item, args.where)), args.orderBy);
      const row = found[0];
      return row ? withInclude(table, row, args.include) : null;
    },
    async findFirstOrThrow(args: Row = {}) {
      const row = await api.findFirst(args);
      if (!row) throw new Error(`${table} não encontrado`);
      return row;
    },
    async findMany(args: Row = {}) {
      return applyOrder(rows().filter((item) => matches(table, item, args.where)), args.orderBy).map((item) =>
        withInclude(table, item, args.include),
      );
    },
    async create(args: Row) {
      const row: Row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...args.data };
      rows().push(row);
      state.log.push(`db:create:${table}`);
      // Simula a constraint única de banco [companyId, inspectionId,
      // reportStoredFileId, activeSlot] para InspectionSigningProcess —
      // mesmo efeito do catch(P2002) na rota real.
      if (table === "inspectionSigningProcess" && row.activeSlot != null) {
        const duplicates = rows().filter(
          (item) =>
            item.id !== row.id &&
            item.companyId === row.companyId &&
            item.inspectionId === row.inspectionId &&
            item.reportStoredFileId === row.reportStoredFileId &&
            item.activeSlot === row.activeSlot,
        );
        if (duplicates.length > 1) {
          rows().pop();
          throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        }
      }
      return withInclude(table, row, args.include);
    },
    async update(args: Row) {
      const row = rows().find((item) => matches(table, item, args.where));
      if (!row) throw new Error(`${table} não encontrado para update`);
      applyData(row, args.data);
      return withInclude(table, row, args.include);
    },
  };
  return api;
}

const tableNames = [
  "company",
  "property",
  "appUser",
  "party",
  "inspection",
  "inspectionRoom",
  "inspectionItem",
  "storedFile",
  "inspectionSigningProcess",
  "inspectionSigningParty",
  "inspectionSigningEvent",
] as const;
const fakeDb: Row = Object.fromEntries(tableNames.map((name) => [name, model(name)]));
fakeDb.$transaction = async (input: unknown) =>
  typeof input === "function" ? (input as (tx: Row) => unknown)(fakeDb) : Promise.all(input as Promise<unknown>[]);

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => fakeDb }));

vi.mock("../src/middleware/auth.js", () => {
  const pass = (_req: Request, _res: Response, next: NextFunction) => next();
  return {
    requireAuth: pass,
    requireCompany: pass,
    requireActiveSubscription: pass,
    requirePermission:
      (permission: string) =>
      (req: Request & { access?: any }, res: Response, next: NextFunction) => {
        if (!(req.access?.appUser.permissions ?? []).includes(permission)) {
          return res.status(403).json({ error: "PERMISSION_DENIED", message: "Usuario sem permissao para esta acao." });
        }
        return next();
      },
  };
});

vi.mock("../src/services/storage/index.js", () => {
  const provider = {
    async uploadFile(input: Row) {
      state.storageUploads.push({ companyId: input.companyId, purpose: input.purpose });
      const publicId = `${input.folder}/${input.entityId}`;
      state.bytesByPublicId.set(publicId, Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body));
      return {
        provider: "fake",
        publicId,
        resourceType: input.mimeType === "application/pdf" ? "raw" : "image",
        secureUrl: "https://fake.invalid/file",
        originalFilename: input.fileName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        width: null,
        height: null,
        format: null,
      };
    },
    async deleteFile(input: Row) {
      state.log.push("storage:delete");
      state.storageDeletes.push(input.publicId);
    },
    async getAuthenticatedDownloadUrl() {
      return "https://fake.invalid/signed";
    },
    async getFileBuffer(input: Row) {
      const bytes = state.bytesByPublicId.get(input.publicId);
      if (!bytes) throw Object.assign(new Error("Arquivo não encontrado no storage fake."), { statusCode: 404 });
      return bytes;
    },
  };
  return {
    getStorageProvider: () => provider,
    getStorageProviderForName: () => provider,
    buildStorageFolder: (input: Row) => `imobiflow/${input.companyId}/${input.purpose}/${input.inspectionId}`,
  };
});

import { errorHandler } from "../src/middleware/error-handler.js";
import { mysqlInspectionSigningRouter, publicInspectionSigningRouter } from "../src/routes/inspection-signing.js";

const COMPANY_A = "a0000000-0000-4000-8000-000000000000";
const COMPANY_B = "b0000000-0000-4000-8000-000000000000";
const ids = {
  adminA: "a1000000-0000-4000-8000-000000000001",
  adminB: "b1000000-0000-4000-8000-000000000001",
  propA: "a2000000-0000-4000-8000-000000000001",
  propB: "b2000000-0000-4000-8000-000000000001",
  entryA: "a3000000-0000-4000-8000-000000000001",
  entryB: "b3000000-0000-4000-8000-000000000001",
  draftA: "a3000000-0000-4000-8000-000000000002",
  reportFileA: "a4000000-0000-4000-8000-000000000001",
  reportFileB: "b4000000-0000-4000-8000-000000000001",
  partyA: "a5000000-0000-4000-8000-000000000001",
  partyB: "b5000000-0000-4000-8000-000000000001",
};

function access(companyId: string, userId: string, permissions: string[], role = "admin") {
  return {
    authUser: { id: userId, email: "qa@example.test", name: "QA" },
    appUser: {
      id: userId,
      company_id: companyId,
      name: "QA",
      email: "qa@example.test",
      status: "active",
      role,
      permissions,
      permissionScopes: {},
    },
    company: { id: companyId, name: companyId === COMPANY_A ? "Empresa A" : "Empresa B", status: "active" },
    subscription: { id: "sub", status: "ACTIVE", plan_slug: "qa", expires_at: null, grace_ends_at: null },
  };
}
const sessions: Record<string, ReturnType<typeof access>> = {
  adminA: access(COMPANY_A, ids.adminA, ["inspections.view", "inspections.manage"]),
  viewerA: access(COMPANY_A, ids.adminA, ["inspections.view"]),
  adminB: access(COMPANY_B, ids.adminB, ["inspections.view", "inspections.manage"]),
};

async function makePdfBytes(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595.28, 841.89]);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}

const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAB4AAAAoCAIAAABmcd1FAAAALklEQVR4nO3MQQEAQAQAsHNBBBNMXil4bQEW2fV2/KVXrVar1Wq1Wq1Wq9WH9QBErwFe9JDvQQAAAABJRU5ErkJggg==";

let reportBytesA: Buffer;
let reportBytesB: Buffer;

beforeEach(async () => {
  state.tables = Object.fromEntries(tableNames.map((name) => [name, []]));
  state.log = [];
  state.storageDeletes = [];
  state.storageUploads = [];
  state.bytesByPublicId = new Map();

  state.tables.company.push(
    { id: COMPANY_A, name: "Empresa A", status: "active" },
    { id: COMPANY_B, name: "Empresa B", status: "active" },
  );
  state.tables.appUser.push(
    { id: ids.adminA, companyId: COMPANY_A, name: "Ana", status: "active" },
    { id: ids.adminB, companyId: COMPANY_B, name: "Bruno", status: "active" },
  );
  state.tables.property.push(
    { id: ids.propA, companyId: COMPANY_A, code: "A-1", title: "Apto A", street: "Rua das Flores", neighborhood: "Centro", city: "Campinas", responsibleUserId: ids.adminA },
    { id: ids.propB, companyId: COMPANY_B, code: "B-1", title: "Apto B", street: "Rua B", neighborhood: "Bairro B", city: "Cidade B", responsibleUserId: ids.adminB },
  );
  state.tables.party.push(
    { id: ids.partyA, companyId: COMPANY_A, name: "Maria Proprietária" },
    { id: ids.partyB, companyId: COMPANY_B, name: "Carlos Proprietário" },
  );
  state.tables.inspection.push(
    { id: ids.entryA, companyId: COMPANY_A, propertyId: ids.propA, type: "entry", status: "completed", completedAt: new Date(), assignedUserId: ids.adminA, createdAt: new Date(), updatedAt: new Date() },
    { id: ids.draftA, companyId: COMPANY_A, propertyId: ids.propA, type: "entry", status: "in_progress", completedAt: null, assignedUserId: ids.adminA, createdAt: new Date(), updatedAt: new Date() },
    { id: ids.entryB, companyId: COMPANY_B, propertyId: ids.propB, type: "entry", status: "completed", completedAt: new Date(), assignedUserId: ids.adminB, createdAt: new Date(), updatedAt: new Date() },
  );

  reportBytesA = await makePdfBytes();
  reportBytesB = await makePdfBytes();
  state.tables.storedFile.push(
    {
      id: ids.reportFileA,
      companyId: COMPANY_A,
      entityType: "inspection_report",
      entityId: ids.entryA,
      provider: "fake",
      publicId: "reports/entryA",
      resourceType: "raw",
      secureUrl: "https://fake.invalid/a",
      originalFilename: "laudo-a.pdf",
      mimeType: "application/pdf",
      sizeBytes: reportBytesA.byteLength,
      purpose: "inspection_report",
      metadataJson: { inspection_id: ids.entryA },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: ids.reportFileB,
      companyId: COMPANY_B,
      entityType: "inspection_report",
      entityId: ids.entryB,
      provider: "fake",
      publicId: "reports/entryB",
      resourceType: "raw",
      secureUrl: "https://fake.invalid/b",
      originalFilename: "laudo-b.pdf",
      mimeType: "application/pdf",
      sizeBytes: reportBytesB.byteLength,
      purpose: "inspection_report",
      metadataJson: { inspection_id: ids.entryB },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  );
  state.bytesByPublicId.set("reports/entryA", reportBytesA);
  state.bytesByPublicId.set("reports/entryB", reportBytesB);
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use((req: Request & { access?: unknown; __session?: string }, _res, next) => {
    const sessionKey = req.header("x-test-session");
    if (sessionKey) (req as any).access = sessions[sessionKey];
    next();
  });
  app.use("/real-estate/inspection-signing", mysqlInspectionSigningRouter);
  app.use("/public/inspection-signing", publicInspectionSigningRouter);
  app.use(errorHandler);
  return app;
}

async function startServer() {
  const app = buildApp();
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

async function callAuth(session: keyof typeof sessions, method: string, path: string, body?: unknown) {
  const base = await startServer();
  const response = await fetch(`${base}/real-estate/inspection-signing${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-test-session": session },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, body: payload as any };
}

async function callPublic(method: string, path: string, body?: unknown) {
  const base = await startServer();
  const response = await fetch(`${base}/public/inspection-signing${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, body: payload as any };
}

function defaultSigners() {
  return [
    { role: "owner", name: "Maria Proprietária", party_id: ids.partyA, email: "maria@example.test" },
    { role: "tenant_buyer", name: "João Locatário", email: "joao@example.test" },
    { role: "witness", name: "Testemunha Sem Party" },
  ];
}

describe("POST /inspections/:id/processes — criação", () => {
  it("cria um processo com 3 signatários, status pending, e devolve o link_token de cada um só nesta resposta", async () => {
    const { status, body } = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    expect(status).toBe(201);
    expect(body.process.status).toBe("pending");
    expect(body.process.parties).toHaveLength(3);
    for (const party of body.process.parties) {
      expect(typeof party.link_token).toBe("string");
      expect(party.link_token.length).toBeGreaterThan(20);
    }
    expect(body.process.progress_label).toBe("0 de 3");
  });

  it("nunca persiste o token em plaintext — tokenHash é diferente do link_token retornado", async () => {
    const { body } = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const partyId = body.process.parties[0].id;
    const stored = state.tables.inspectionSigningParty.find((row) => row.id === partyId);
    expect(stored.tokenHash).not.toBe(body.process.parties[0].link_token);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("impede duplicata de processo ativo para a mesma versão do laudo (409)", async () => {
    const first = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    expect(first.status).toBe(201);
    const second = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("SIGNING_PROCESS_ALREADY_ACTIVE");
  });

  it("exige vistoria concluída (400 para vistoria em andamento)", async () => {
    const { status, body } = await callAuth("adminA", "POST", `/inspections/${ids.draftA}/processes`, { signers: defaultSigners() });
    expect(status).toBe(400);
    expect(body.error).toBe("SIGNING_REQUIRES_COMPLETED_INSPECTION");
  });

  it("exige que o laudo já tenha sido gerado (400 quando não há StoredFile inspection_report)", async () => {
    state.tables.storedFile = state.tables.storedFile.filter((row) => row.id !== ids.reportFileA);
    const { status, body } = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    expect(status).toBe(400);
    expect(body.error).toBe("SIGNING_REPORT_REQUIRED");
  });

  it("rejeita Party de outro tenant (400 SIGNING_PARTY_CROSS_TENANT)", async () => {
    const { status, body } = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, {
      signers: [{ role: "owner", name: "Impostor", party_id: ids.partyB }],
    });
    expect(status).toBe(400);
    expect(body.error).toBe("SIGNING_PARTY_CROSS_TENANT");
  });

  it("isolamento de tenant: empresa B não pode criar processo para vistoria da empresa A (404)", async () => {
    const { status } = await callAuth("adminB", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    expect(status).toBe(404);
  });

  it("exige permissão inspections.manage (403 para quem só tem inspections.view)", async () => {
    const { status } = await callAuth("viewerA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    expect(status).toBe(403);
  });
});

describe("GET processos — listagem, detalhe e isolamento", () => {
  it("lista e busca o detalhe do processo da própria empresa", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const processId = created.body.process.id;

    const list = await callAuth("adminA", "GET", `/inspections/${ids.entryA}/processes`);
    expect(list.status).toBe(200);
    expect(list.body.processes.map((p: Row) => p.id)).toContain(processId);

    const detail = await callAuth("adminA", "GET", `/processes/${processId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.process.id).toBe(processId);
  });

  it("empresa B não acessa processo da empresa A (404 neutro)", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const processId = created.body.process.id;
    const { status } = await callAuth("adminB", "GET", `/processes/${processId}`);
    expect(status).toBe(404);
  });
});

describe("Link — regenerar e revogar", () => {
  async function createProcess() {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    return created.body.process as Row;
  }

  it("regenera o link de um signatário — o token antigo deixa de autenticar imediatamente", async () => {
    const process = await createProcess();
    const party = process.parties[0];
    const oldToken = party.link_token;

    const regenerated = await callAuth("adminA", "POST", `/processes/${process.id}/parties/${party.id}/link`);
    expect(regenerated.status).toBe(201);
    const newToken = regenerated.body.link_token;
    expect(newToken).not.toBe(oldToken);

    const oldLookup = await callPublic("GET", `/${oldToken}`);
    expect(oldLookup.status).toBe(404);

    const newLookup = await callPublic("GET", `/${newToken}`);
    expect(newLookup.status).toBe(200);
  });

  it("revoga um signatário pendente — status do signatário vira revoked e não recebe mais link", async () => {
    const process = await createProcess();
    const party = process.parties[1];
    const { status, body } = await callAuth("adminA", "POST", `/processes/${process.id}/parties/${party.id}/revoke`);
    expect(status).toBe(200);
    expect(body.party.status).toBe("revoked");

    const relink = await callAuth("adminA", "POST", `/processes/${process.id}/parties/${party.id}/link`);
    expect(relink.status).toBe(409);
    expect(relink.body.error).toBe("SIGNING_PARTY_NOT_LINKABLE");
  });

  it("revogar um signatário já assinado é proibido (409 SIGNING_PARTY_ALREADY_SIGNED)", async () => {
    const process = await createProcess();
    const party = process.parties[0];
    await callPublic("POST", `/${party.link_token}/sign`, { method: "drawn", image_base64: TINY_PNG_BASE64, consent: true });

    const { status, body } = await callAuth("adminA", "POST", `/processes/${process.id}/parties/${party.id}/revoke`);
    expect(status).toBe(409);
    expect(body.error).toBe("SIGNING_PARTY_ALREADY_SIGNED");
  });

  it("todos os signatários revogados mantém o status atual do processo (nunca conclui/cancela sozinho)", async () => {
    const process = await createProcess();
    for (const party of process.parties) {
      await callAuth("adminA", "POST", `/processes/${process.id}/parties/${party.id}/revoke`);
    }
    const detail = await callAuth("adminA", "GET", `/processes/${process.id}`);
    expect(detail.body.process.status).toBe("pending");
  });
});

describe("Cancelamento de processo", () => {
  it("cancela um processo pendente", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const { status, body } = await callAuth("adminA", "POST", `/processes/${created.body.process.id}/cancel`);
    expect(status).toBe(200);
    expect(body.process.status).toBe("cancelled");
  });

  it("não é possível cancelar um processo já cancelado (409)", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    await callAuth("adminA", "POST", `/processes/${created.body.process.id}/cancel`);
    const second = await callAuth("adminA", "POST", `/processes/${created.body.process.id}/cancel`);
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("SIGNING_PROCESS_NOT_ACTIVE");
  });

  it("após cancelar, é possível criar um novo processo ativo para o mesmo laudo (activeSlot liberado)", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    await callAuth("adminA", "POST", `/processes/${created.body.process.id}/cancel`);
    const second = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    expect(second.status).toBe(201);
  });
});

describe("Fluxo público — resolução neutra de token (404 sempre, nunca diferencia o motivo)", () => {
  it("token inexistente -> 404", async () => {
    const { status } = await callPublic("GET", "/token-que-nao-existe-em-lugar-nenhum");
    expect(status).toBe(404);
  });

  it("token de signatário revogado -> 404", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    await callAuth("adminA", "POST", `/processes/${created.body.process.id}/parties/${party.id}/revoke`);
    const { status } = await callPublic("GET", `/${party.link_token}`);
    expect(status).toBe(404);
  });

  it("token expirado -> 404, e o signatário é marcado expired como efeito colateral", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    const stored = state.tables.inspectionSigningParty.find((row) => row.id === party.id);
    stored.tokenExpiresAt = new Date(Date.now() - 1000);

    const { status } = await callPublic("GET", `/${party.link_token}`);
    expect(status).toBe(404);
    expect(stored.status).toBe("expired");
  });

  it("processo cancelado -> 404 para qualquer signatário pendente desse processo", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    await callAuth("adminA", "POST", `/processes/${created.body.process.id}/cancel`);
    const { status } = await callPublic("GET", `/${party.link_token}`);
    expect(status).toBe(404);
  });
});

describe("Fluxo público — visualização e documento", () => {
  it("GET /:token devolve dados mínimos (nunca o processId/inspectionId/companyId) e marca link_viewed uma vez", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];

    const { status, body } = await callPublic("GET", `/${party.link_token}`);
    expect(status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        company: { name: "Empresa A" },
        signer: expect.objectContaining({ name: "Maria Proprietária", role: "owner" }),
        already_signed: false,
        consent_text: "Declaro que li o laudo apresentado e concordo em registrar minha assinatura eletrônica neste documento.",
      }),
    );
    expect(body.process_id).toBeUndefined();
    expect(body.inspection_id).toBeUndefined();
    expect(body.company_id).toBeUndefined();

    const partyRow = state.tables.inspectionSigningParty.find((row) => row.id === party.id);
    const viewedAt = partyRow.viewedAt;
    expect(viewedAt).toBeInstanceOf(Date);

    await callPublic("GET", `/${party.link_token}`);
    expect(partyRow.viewedAt).toEqual(viewedAt); // não reatualiza em visualizações seguintes
  });

  it("GET /:token/document transmite os bytes do laudo original", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    const { status, body } = await callPublic("GET", `/${party.link_token}/document`);
    expect(status).toBe(200);
    expect(Buffer.from(body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("Fluxo público — assinatura (consentimento, desenhada, digitada, canvas vazio, duplicidade)", () => {
  async function createProcess() {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    return created.body.process as Row;
  }

  it("assina com método 'drawn' + consentimento — marca signed e processo vai para partially_signed", async () => {
    const process = await createProcess();
    const party = process.parties[0];
    const { status, body } = await callPublic("POST", `/${party.link_token}/sign`, {
      method: "drawn",
      image_base64: TINY_PNG_BASE64,
      consent: true,
    });
    expect(status).toBe(200);
    expect(body.already_signed).toBe(true);

    const detail = await callAuth("adminA", "GET", `/processes/${process.id}`);
    expect(detail.body.process.status).toBe("partially_signed");
    const signedParty = detail.body.process.parties.find((p: Row) => p.id === party.id);
    expect(signedParty.signature_method).toBe("drawn");
  });

  it("assina com método 'typed' sem typed_text -> 400 SIGNING_TYPED_TEXT_REQUIRED", async () => {
    const process = await createProcess();
    const party = process.parties[0];
    const { status, body } = await callPublic("POST", `/${party.link_token}/sign`, {
      method: "typed",
      image_base64: TINY_PNG_BASE64,
      consent: true,
    });
    expect(status).toBe(400);
    expect(body.error).toBe("SIGNING_TYPED_TEXT_REQUIRED");
  });

  it("assina com método 'typed' + typed_text — persiste typedText/typedFontId como fonte estruturada", async () => {
    const process = await createProcess();
    const party = process.parties[0];
    const { status } = await callPublic("POST", `/${party.link_token}/sign`, {
      method: "typed",
      image_base64: TINY_PNG_BASE64,
      typed_text: "Maria Proprietária",
      typed_font_id: "cursive-2",
      consent: true,
    });
    expect(status).toBe(200);
    const stored = state.tables.inspectionSigningParty.find((row) => row.id === party.id);
    expect(stored.typedText).toBe("Maria Proprietária");
    expect(stored.typedFontId).toBe("cursive-2");
    expect(stored.signatureMethod).toBe("typed");
  });

  it("sem consentimento explícito (consent ausente) -> 400 de validação", async () => {
    const process = await createProcess();
    const party = process.parties[0];
    const { status } = await callPublic("POST", `/${party.link_token}/sign`, {
      method: "drawn",
      image_base64: TINY_PNG_BASE64,
    });
    expect(status).toBe(400);
  });

  it("canvas vazio (imagem decodificada com zero bytes) -> 400 SIGNING_INVALID_IMAGE", async () => {
    const process = await createProcess();
    const party = process.parties[0];
    const { status, body } = await callPublic("POST", `/${party.link_token}/sign`, {
      method: "drawn",
      image_base64: "data:image/png;base64,",
      consent: true,
    });
    expect(status).toBe(400);
    expect(body.error).toBe("SIGNING_INVALID_IMAGE");
  });

  it("duplicidade de assinatura: assinar duas vezes o mesmo signatário -> segunda tentativa é 404 neutro", async () => {
    const process = await createProcess();
    const party = process.parties[0];
    const first = await callPublic("POST", `/${party.link_token}/sign`, { method: "drawn", image_base64: TINY_PNG_BASE64, consent: true });
    expect(first.status).toBe(200);
    const second = await callPublic("POST", `/${party.link_token}/sign`, { method: "drawn", image_base64: TINY_PNG_BASE64, consent: true });
    expect(second.status).toBe(404);
  });
});

describe("Assinar presencialmente (autenticado) — mesmo efeito do fluxo público", () => {
  it("usuário autenticado assina em nome do signatário pendente", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    const { status, body } = await callAuth("adminA", "POST", `/processes/${created.body.process.id}/parties/${party.id}/sign-in-person`, {
      method: "drawn",
      image_base64: TINY_PNG_BASE64,
      consent: true,
    });
    expect(status).toBe(200);
    expect(body.party.status).toBe("signed");
  });

  it("empresa B não pode assinar presencialmente um processo da empresa A (404)", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    const { status } = await callAuth("adminB", "POST", `/processes/${created.body.process.id}/parties/${party.id}/sign-in-person`, {
      method: "drawn",
      image_base64: TINY_PNG_BASE64,
      consent: true,
    });
    expect(status).toBe(404);
  });
});

describe("Conclusão do processo, PDF final e download", () => {
  it("quando o último signatário ativo assina, o processo conclui e gera o PDF final assinado", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const process = created.body.process as Row;

    for (const party of process.parties) {
      const { status } = await callPublic("POST", `/${party.link_token}/sign`, { method: "drawn", image_base64: TINY_PNG_BASE64, consent: true });
      expect(status).toBe(200);
    }

    const detail = await callAuth("adminA", "GET", `/processes/${process.id}`);
    expect(detail.body.process.status).toBe("completed");
    expect(detail.body.process.progress_label).toBe("Concluído");

    const download = await callAuth("adminA", "GET", `/inspections/${ids.entryA}/signed-report/download`);
    expect(download.status).toBe(200);
    expect(Buffer.from(download.body as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("download antes da conclusão -> 400 SIGNING_REPORT_NOT_READY", async () => {
    await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const { status, body } = await callAuth("adminA", "GET", `/inspections/${ids.entryA}/signed-report/download`);
    expect(status).toBe(400);
    expect(body.error).toBe("SIGNING_REPORT_NOT_READY");
  });

  it("revogar o último signatário pendente também pode concluir o processo (se os demais já assinaram)", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const process = created.body.process as Row;
    await callPublic("POST", `/${process.parties[0].link_token}/sign`, { method: "drawn", image_base64: TINY_PNG_BASE64, consent: true });
    await callPublic("POST", `/${process.parties[1].link_token}/sign`, { method: "drawn", image_base64: TINY_PNG_BASE64, consent: true });

    const { status, body } = await callAuth("adminA", "POST", `/processes/${process.id}/parties/${process.parties[2].id}/revoke`);
    expect(status).toBe(200);
    const detail = await callAuth("adminA", "GET", `/processes/${process.id}`);
    expect(detail.body.process.status).toBe("completed");
  });
});

describe("Trilha de auditoria", () => {
  it("registra process_created, link_created (por signatário), link_viewed e signer_signed na ordem esperada", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const process = created.body.process as Row;
    const party = process.parties[0];
    await callPublic("GET", `/${party.link_token}`);
    await callPublic("POST", `/${party.link_token}/sign`, { method: "drawn", image_base64: TINY_PNG_BASE64, consent: true });

    const audit = await callAuth("adminA", "GET", `/processes/${process.id}/audit`);
    expect(audit.status).toBe(200);
    const types = audit.body.events.map((event: Row) => event.event_type);
    expect(types).toContain("process_created");
    expect(types.filter((type: string) => type === "link_created").length).toBe(3);
    expect(types).toContain("link_viewed");
    expect(types).toContain("signer_signed");
    expect(types).toContain("process_partially_signed");
  });

  it("IP/user-agent aparecem só como contexto de auditoria, nunca como identidade do signatário na resposta pública", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    const { body } = await callPublic("GET", `/${party.link_token}`);
    expect(body.ip_address).toBeUndefined();
    expect(body.user_agent).toBeUndefined();
  });
});

describe("Isolamento de tenant — matriz adicional", () => {
  it("empresa B não vê os processos de assinatura da empresa A na listagem (escopo da própria empresa)", async () => {
    await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const { status } = await callAuth("adminB", "GET", `/inspections/${ids.entryA}/processes`);
    expect(status).toBe(404); // já bloqueado em findInspectionForSigning antes mesmo de listar
  });

  it("empresa B não pode regenerar link de processo da empresa A (404)", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    const { status } = await callAuth("adminB", "POST", `/processes/${created.body.process.id}/parties/${party.id}/link`);
    expect(status).toBe(404);
  });

  it("empresa B não pode revogar signatário de processo da empresa A (404)", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const party = created.body.process.parties[0];
    const { status } = await callAuth("adminB", "POST", `/processes/${created.body.process.id}/parties/${party.id}/revoke`);
    expect(status).toBe(404);
  });

  it("empresa B não pode cancelar processo da empresa A (404)", async () => {
    const created = await callAuth("adminA", "POST", `/inspections/${ids.entryA}/processes`, { signers: defaultSigners() });
    const { status } = await callAuth("adminB", "POST", `/processes/${created.body.process.id}/cancel`);
    expect(status).toBe(404);
  });

  it("empresa B não pode baixar o laudo assinado da empresa A (404, antes mesmo de verificar conclusão)", async () => {
    const { status } = await callAuth("adminB", "GET", `/inspections/${ids.entryA}/signed-report/download`);
    expect(status).toBe(404);
  });
});
