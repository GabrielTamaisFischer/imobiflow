import { randomUUID } from "node:crypto";
import { type AddressInfo } from "node:net";
import { type Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Testes HTTP do router canônico /real-estate/inspections. O Prisma é um banco
// em memória que avalia os mesmos filtros `where` produzidos pelo código real
// (inclusive buildInspectionScopeFilter), então o isolamento A × B testado aqui
// é o da implementação, não um mock que sempre libera.

type Row = Record<string, any>;
const { state } = vi.hoisted(() => ({
  state: {
    tables: {} as Record<string, Row[]>,
    log: [] as string[],
    storageDeletes: [] as string[],
    storageUploads: [] as Array<{ companyId: string; purpose: string }>,
    failStorageDelete: false,
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
      return (
        Boolean(property) && matches("property", property!, (condition as Row).is ?? condition)
      );
    }
    if (key === "room") {
      const room = state.tables.inspectionRoom.find((item) => item.id === row.roomId);
      return Boolean(room) && matches("inspectionRoom", room!, condition as Row);
    }
    if (key === "roleRecord") return true; // permissões do responsável não fazem parte destes cenários
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return (condition as { in: unknown[] }).in.includes(row[key]);
      throw new Error(`Filtro não suportado no fake: ${table}.${key}`);
    }
    return row[key] === condition;
  });
}

function withInclude(table: string, row: Row, include?: Row): Row {
  if (!include) return { ...row };
  const result: Row = { ...row };
  if (table === "inspection") {
    if (include.property)
      result.property = state.tables.property.find((item) => item.id === row.propertyId) ?? null;
    if (include.assignedUser)
      result.assignedUser =
        state.tables.appUser.find((item) => item.id === row.assignedUserId) ?? null;
    if (include.rooms) {
      result.rooms = state.tables.inspectionRoom
        .filter((room) => room.inspectionId === row.id)
        .sort((a, b) => a.position - b.position)
        .map((room) => ({
          ...room,
          items: state.tables.inspectionItem
            .filter((item) => item.roomId === room.id)
            .sort((a, b) => a.position - b.position),
        }));
    }
  }
  if (table === "inspectionEvidence" && include.storedFile) {
    result.storedFile =
      state.tables.storedFile.find((file) => file.id === row.storedFileId) ?? null;
  }
  return result;
}

function applyData(row: Row, data: Row) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value)
      row[key] = (row[key] ?? 0) + (value as { increment: number }).increment;
    else if (value !== undefined) row[key] = value;
  }
  row.updatedAt = new Date();
}

function model(table: string) {
  const rows = () => state.tables[table];
  const api = {
    async findFirst(args: Row = {}) {
      const row = rows().find((item) => matches(table, item, args.where));
      return row ? withInclude(table, row, args.include) : null;
    },
    async findFirstOrThrow(args: Row = {}) {
      const row = await api.findFirst(args);
      if (!row) throw new Error(`${table} não encontrado`);
      return row;
    },
    async findUniqueOrThrow(args: Row = {}) {
      return api.findFirstOrThrow(args);
    },
    async findMany(args: Row = {}) {
      const found = rows()
        .filter((item) => matches(table, item, args.where))
        .map((item) => withInclude(table, item, args.include));
      const skip = args.skip ?? 0;
      return args.take ? found.slice(skip, skip + args.take) : found.slice(skip);
    },
    async count(args: Row = {}) {
      return rows().filter((item) => matches(table, item, args.where)).length;
    },
    async create(args: Row) {
      const row: Row = {
        id: randomUUID(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(table === "inspection"
          ? { version: 1, status: "draft", completedAt: null, archivedAt: null }
          : {}),
        ...args.data,
      };
      rows().push(row);
      state.log.push(`db:create:${table}`);
      return withInclude(table, row, args.include);
    },
    async update(args: Row) {
      const row = rows().find((item) => matches(table, item, args.where));
      if (!row) throw new Error(`${table} não encontrado para update`);
      applyData(row, args.data);
      return withInclude(table, row, args.include);
    },
    async updateMany(args: Row) {
      const found = rows().filter((item) => matches(table, item, args.where));
      for (const row of found) applyData(row, args.data);
      return { count: found.length };
    },
    async delete(args: Row) {
      const index = rows().findIndex((item) => matches(table, item, args.where));
      if (index < 0) throw new Error(`${table} não encontrado para delete`);
      const [row] = rows().splice(index, 1);
      state.log.push(`db:delete:${table}`);
      return row;
    },
  };
  return api;
}

const tableNames = [
  "property",
  "appUser",
  "inspection",
  "inspectionRoom",
  "inspectionItem",
  "inspectionEvidence",
  "inspectionEvent",
  "storedFile",
] as const;
const fakeDb: Row = Object.fromEntries(tableNames.map((name) => [name, model(name)]));
fakeDb.$transaction = async (input: unknown) =>
  typeof input === "function"
    ? (input as (tx: Row) => unknown)(fakeDb)
    : Promise.all(input as Promise<unknown>[]);

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => fakeDb }));

vi.mock("../src/middleware/auth.js", () => {
  const pass = (_req: Request, _res: Response, next: NextFunction) => next();
  return {
    requireAuth: pass,
    requireCompany: pass,
    requireActiveSubscription: pass,
    // Igual ao middleware real: decide só pela lista de permissões da sessão.
    requirePermission:
      (permission: string) =>
      (req: Request & { access?: any }, res: Response, next: NextFunction) => {
        if (!(req.access?.appUser.permissions ?? []).includes(permission)) {
          return res
            .status(403)
            .json({ error: "PERMISSION_DENIED", message: "Usuario sem permissao para esta acao." });
        }
        return next();
      },
  };
});

vi.mock("../src/services/idempotency.js", () => ({
  IdempotencyConflictError: class extends Error {},
  resolveIdempotencyKey: (_req: unknown, fallback: string) => fallback,
  withIdempotency: async (
    _companyId: string,
    _scope: string,
    _key: string,
    run: () => Promise<unknown>,
  ) => ({ result: await run(), replayed: false }),
}));

vi.mock("../src/services/storage/index.js", () => {
  // Sub-bloco 5B - guarda os bytes de upload por publicId para que
  // getFileBuffer (download autenticado canônico) devolva o conteúdo real
  // nos testes, igual aos 3 providers reais fazem em produção.
  const bytesByPublicId = new Map<string, Buffer>();
  const provider = {
    async uploadFile(input: Row) {
      state.storageUploads.push({ companyId: input.companyId, purpose: input.purpose });
      const publicId = `${input.folder}/${input.entityId}`;
      bytesByPublicId.set(publicId, Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body));
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
      if (state.failStorageDelete) throw new Error("provider indisponível");
      state.storageDeletes.push(input.publicId);
    },
    async getAuthenticatedDownloadUrl() {
      return "https://fake.invalid/signed";
    },
    async getFileBuffer(input: Row) {
      const bytes = bytesByPublicId.get(input.publicId);
      if (!bytes) throw Object.assign(new Error("Arquivo não encontrado no storage fake."), { statusCode: 404 });
      return bytes;
    },
  };
  return {
    getStorageProvider: () => provider,
    getStorageProviderForName: () => provider,
    buildStorageFolder: (input: Row) =>
      `imobiflow/${input.companyId}/${input.purpose}/${input.inspectionId}`,
  };
});

import { errorHandler } from "../src/middleware/error-handler.js";
import { mysqlInspectionsRouter } from "../src/routes/inspections-mysql.js";

const COMPANY_A = "a0000000-0000-4000-8000-000000000000";
const COMPANY_B = "b0000000-0000-4000-8000-000000000000";
const ids = {
  adminA: "a1000000-0000-4000-8000-000000000001",
  adminB: "b1000000-0000-4000-8000-000000000001",
  propA: "a2000000-0000-4000-8000-000000000001",
  propA2: "a2000000-0000-4000-8000-000000000002",
  propB: "b2000000-0000-4000-8000-000000000001",
  entryA: "a3000000-0000-4000-8000-000000000001",
  entryA2: "a3000000-0000-4000-8000-000000000002",
  exitA: "a3000000-0000-4000-8000-000000000003",
  draftA: "a3000000-0000-4000-8000-000000000004",
  exitOtherPropA: "a3000000-0000-4000-8000-000000000005",
  entryB: "b3000000-0000-4000-8000-000000000001",
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
    company: {
      id: companyId,
      name: companyId === COMPANY_A ? "Empresa A" : "Empresa B",
      status: "active",
    },
    subscription: {
      id: "sub",
      status: "ACTIVE",
      plan_slug: "qa",
      expires_at: null,
      grace_ends_at: null,
    },
  };
}
const sessions: Record<string, ReturnType<typeof access>> = {
  adminA: access(COMPANY_A, ids.adminA, ["inspections.view", "inspections.manage"]),
  viewerA: access(COMPANY_A, ids.adminA, ["inspections.view"]),
  adminB: access(COMPANY_B, ids.adminB, ["inspections.view", "inspections.manage"]),
  // F5G — cenários de cargo administrativo x inspections.manage. owner/admin/
  // manager são os únicos autorizados a editar o registro principal e
  // arquivar; broker, inspector e um role customizado não-administrativo
  // (ex.: "Suporte Vistorias") têm inspections.manage mas não são admin, e
  // devem continuar liberados só para o trabalho operacional.
  ownerA: access(COMPANY_A, ids.adminA, ["inspections.view", "inspections.manage"], "owner"),
  managerA: access(COMPANY_A, ids.adminA, ["inspections.view", "inspections.manage"], "manager"),
  brokerA: access(COMPANY_A, ids.adminA, ["inspections.view", "inspections.manage"], "broker"),
  inspectorA: access(COMPANY_A, ids.adminA, ["inspections.view", "inspections.manage"], "inspector"),
  customNonAdminA: access(
    COMPANY_A,
    ids.adminA,
    ["inspections.view", "inspections.manage"],
    "Suporte Vistorias",
  ),
};

function inspection(
  id: string,
  companyId: string,
  propertyId: string,
  type: string,
  status: string,
  assignedUserId: string,
): Row {
  return {
    id,
    companyId,
    propertyId,
    assignedUserId,
    createdBy: assignedUserId,
    type,
    status,
    notes: null,
    version: 3,
    completedAt: status === "completed" ? new Date() : null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function seedRoomWithItem(inspectionId: string, companyId: string, condition: string) {
  const roomId = randomUUID();
  state.tables.inspectionRoom.push({
    id: roomId,
    companyId,
    inspectionId,
    name: "Sala",
    position: 0,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  state.tables.inspectionItem.push({
    id: randomUUID(),
    companyId,
    roomId,
    name: "Piso",
    condition,
    position: 0,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return roomId;
}

beforeEach(() => {
  state.tables = Object.fromEntries(tableNames.map((name) => [name, []]));
  state.log = [];
  state.storageDeletes = [];
  state.storageUploads = [];
  state.failStorageDelete = false;
  state.tables.appUser.push(
    { id: ids.adminA, companyId: COMPANY_A, name: "Ana", status: "active" },
    { id: ids.adminB, companyId: COMPANY_B, name: "Bruno", status: "active" },
  );
  state.tables.property.push(
    {
      id: ids.propA,
      companyId: COMPANY_A,
      code: "A-1",
      title: "Apto A",
      responsibleUserId: ids.adminA,
    },
    {
      id: ids.propA2,
      companyId: COMPANY_A,
      code: "A-2",
      title: "Casa A",
      responsibleUserId: ids.adminA,
    },
    {
      id: ids.propB,
      companyId: COMPANY_B,
      code: "B-1",
      title: "Apto B",
      responsibleUserId: ids.adminB,
    },
  );
  state.tables.inspection.push(
    inspection(ids.entryA, COMPANY_A, ids.propA, "entry", "completed", ids.adminA),
    inspection(ids.entryA2, COMPANY_A, ids.propA, "entry", "completed", ids.adminA),
    inspection(ids.exitA, COMPANY_A, ids.propA, "exit", "completed", ids.adminA),
    inspection(ids.draftA, COMPANY_A, ids.propA, "entry", "in_progress", ids.adminA),
    inspection(ids.exitOtherPropA, COMPANY_A, ids.propA2, "exit", "completed", ids.adminA),
    inspection(ids.entryB, COMPANY_B, ids.propB, "entry", "completed", ids.adminB),
  );
  seedRoomWithItem(ids.entryA, COMPANY_A, "good");
  seedRoomWithItem(ids.entryA2, COMPANY_A, "excellent");
  seedRoomWithItem(ids.exitA, COMPANY_A, "damaged");
  seedRoomWithItem(ids.entryB, COMPANY_B, "good");
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function call(session: keyof typeof sessions, method: string, path: string, body?: unknown) {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use((req: Request & { access?: unknown }, _res, next) => {
    req.access = sessions[session];
    next();
  });
  app.use("/real-estate/inspections", mysqlInspectionsRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/real-estate/inspections${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Row };
}

const inspectionOf = (id: string) => state.tables.inspection.find((row) => row.id === id)!;

describe("router canônico de vistorias — isolamento A × B", () => {
  it("lista apenas vistorias da empresa da sessão", async () => {
    const { status, body } = await call("adminA", "GET", "/");
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    expect(listed).not.toContain(ids.entryB);
    expect(listed).toEqual(expect.arrayContaining([ids.entryA, ids.exitA, ids.draftA]));
  });

  it.each([
    ["GET", ""],
    ["GET", "/evidence"],
    ["GET", "/reports"],
    ["PATCH", "", { expected_version: 3, notes: "invasão" }],
    ["POST", "/rooms", { id: randomUUID(), expected_version: 3, name: "Invasão", position: 0 }],
    ["POST", "/report", {}],
    ["GET", "/report/download"],
    ["DELETE", `/evidence/${randomUUID()}`, { expected_version: 3 }],
  ])(
    "empresa A recebe 404 em %s da vistoria da empresa B (%s)",
    async (method, suffix, body?: unknown) => {
      const before = structuredClone(inspectionOf(ids.entryB));
      const { status, body: response } = await call(
        "adminA",
        method,
        `/${ids.entryB}${suffix}`,
        body,
      );
      expect(status).toBe(404);
      expect(response.error).toBe("INSPECTION_NOT_FOUND");
      expect(inspectionOf(ids.entryB).version).toBe(before.version);
      expect(inspectionOf(ids.entryB).notes).toBe(before.notes);
      expect(state.tables.inspectionEvent).toHaveLength(0);
      expect(state.storageUploads).toHaveLength(0);
    },
  );

  it("empresa B também não enxerga a vistoria da empresa A", async () => {
    const { status } = await call("adminB", "GET", `/${ids.entryA}`);
    expect(status).toBe(404);
  });
});

describe("expected_version — proteção contra overwrite silencioso", () => {
  it("rejeita criação de ambiente sem expected_version (400)", async () => {
    const { status, body } = await call("adminA", "POST", `/${ids.draftA}/rooms`, {
      id: randomUUID(),
      name: "Cozinha",
      position: 1,
    });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
  });

  it("responde 409 INSPECTION_VERSION_CONFLICT com versão desatualizada e não grava", async () => {
    const roomId = randomUUID();
    const { status, body } = await call("adminA", "POST", `/${ids.draftA}/rooms`, {
      id: roomId,
      expected_version: 2,
      name: "Cozinha",
      position: 1,
    });
    expect(status).toBe(409);
    expect(body.error).toBe("INSPECTION_VERSION_CONFLICT");
    expect(state.tables.inspectionRoom.find((row) => row.id === roomId)).toBeUndefined();
    expect(inspectionOf(ids.draftA).version).toBe(3);
  });

  it("aceita a versão atual e incrementa a versão do agregado", async () => {
    const { status } = await call("adminA", "POST", `/${ids.draftA}/rooms`, {
      id: randomUUID(),
      expected_version: 3,
      name: "Cozinha",
      position: 1,
    });
    expect(status).toBe(201);
    expect(inspectionOf(ids.draftA).version).toBe(4);
  });
});

describe("exclusão de foto — banco antes do storage", () => {
  function seedEvidence() {
    const storedFileId = randomUUID();
    const evidenceId = randomUUID();
    state.tables.storedFile.push({
      id: storedFileId,
      companyId: COMPANY_A,
      entityType: "inspection_evidence",
      entityId: evidenceId,
      provider: "fake",
      publicId: "imobiflow/a/foto-1",
      resourceType: "image",
      format: "jpg",
      purpose: "inspection_evidence",
      originalFilename: "foto.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      createdAt: new Date(),
    });
    state.tables.inspectionEvidence.push({
      id: evidenceId,
      companyId: COMPANY_A,
      inspectionId: ids.draftA,
      roomId: null,
      itemId: null,
      storedFileId,
      position: 0,
      caption: null,
      createdAt: new Date(),
    });
    return { evidenceId, storedFileId };
  }

  it("remove as linhas no banco e só depois o arquivo no provider", async () => {
    const { evidenceId } = seedEvidence();
    const { status, body } = await call(
      "adminA",
      "DELETE",
      `/${ids.draftA}/evidence/${evidenceId}`,
      { expected_version: 3 },
    );
    expect(status).toBe(200);
    expect(body.storage_cleanup).toBe("deleted");
    expect(state.tables.inspectionEvidence).toHaveLength(0);
    expect(state.tables.storedFile).toHaveLength(0);
    expect(state.log.indexOf("db:delete:storedFile")).toBeLessThan(
      state.log.indexOf("storage:delete"),
    );
  });

  it("com versão desatualizada não toca no arquivo nem nas linhas", async () => {
    const { evidenceId } = seedEvidence();
    const { status } = await call("adminA", "DELETE", `/${ids.draftA}/evidence/${evidenceId}`, {
      expected_version: 2,
    });
    expect(status).toBe(409);
    expect(state.log).not.toContain("storage:delete");
    expect(state.tables.inspectionEvidence).toHaveLength(1);
    expect(state.tables.storedFile).toHaveLength(1);
  });

  it("se o provider falhar depois, o banco já está consistente e a resposta sinaliza limpeza pendente", async () => {
    const { evidenceId } = seedEvidence();
    state.failStorageDelete = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { status, body } = await call(
      "adminA",
      "DELETE",
      `/${ids.draftA}/evidence/${evidenceId}`,
      { expected_version: 3 },
    );
    warn.mockRestore();
    expect(status).toBe(200);
    expect(body.storage_cleanup).toBe("pending");
    expect(state.tables.inspectionEvidence).toHaveLength(0);
    expect(state.tables.storedFile).toHaveLength(0);
  });
});

describe("comparação entrada × saída", () => {
  it("exige inspections.manage (viewer recebe 403)", async () => {
    const { status, body } = await call("viewerA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(status).toBe(403);
    expect(body.error).toBe("PERMISSION_DENIED");
    expect(state.storageUploads).toHaveLength(0);
  });

  it("não compara com vistoria de outra empresa (404, nada gravado)", async () => {
    const { status, body } = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryB,
    });
    expect(status).toBe(404);
    expect(body.error).toBe("INSPECTION_NOT_FOUND");
    expect(state.storageUploads).toHaveLength(0);
    expect(state.tables.storedFile).toHaveLength(0);
  });

  it("rejeita vistoria inexistente (baseline ou saída) com 404 e nada gravado", async () => {
    const missing = randomUUID();
    const baseline = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: missing,
    });
    expect(baseline.status).toBe(404);
    expect(baseline.body.error).toBe("INSPECTION_NOT_FOUND");
    const exit = await call("adminA", "POST", `/${missing}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(exit.status).toBe(404);
    expect(state.storageUploads).toHaveLength(0);
  });

  it("rejeita inspectionId inválido (não-UUID) com 400 de validação", async () => {
    for (const invalid of ["abc", "1; DROP TABLE inspections", "", 123]) {
      const { status, body } = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
        baseline_inspection_id: invalid,
      });
      expect(status).toBe(400);
      expect(body.error).toBe("VALIDATION_ERROR");
    }
    expect(state.storageUploads).toHaveLength(0);
  });

  it("rejeita imóvel diferente, mesma vistoria e tipos invertidos", async () => {
    const otherProperty = await call("adminA", "POST", `/${ids.exitOtherPropA}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(otherProperty.status).toBe(400);
    expect(otherProperty.body.error).toBe("COMPARISON_SCOPE_INVALID");
    const same = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.exitA,
    });
    expect(same.status).toBe(400);
    expect(same.body.error).toBe("COMPARISON_SAME_INSPECTION");
    const inverted = await call("adminA", "POST", `/${ids.entryA}/comparison`, {
      baseline_inspection_id: ids.entryA2,
    });
    expect(inverted.status).toBe(400);
    expect(inverted.body.error).toBe("COMPARISON_TYPE_INVALID");
    expect(state.storageUploads).toHaveLength(0);
  });

  it("gera comparação determinística, sem atribuir responsabilidade, e reaproveita só para a mesma entrada", async () => {
    const first = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(first.status).toBe(201);
    const item = (first.body.comparison.rooms as Row[])[0].items[0];
    expect(item).toMatchObject({ name: "Piso", entry: "good", exit: "damaged", outcome: "worse" });
    expect(JSON.stringify(first.body.comparison)).not.toMatch(/respons|culp|locat|inquilin/i);
    expect(first.body.disclaimer).toMatch(/não atribui responsabilidade/);
    expect(state.tables.storedFile[0]).toMatchObject({
      companyId: COMPANY_A,
      purpose: "inspection_comparison",
    });
    expect(state.tables.storedFile[0].metadataJson.baseline_inspection_id).toBe(ids.entryA);

    const again = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(again.body.replayed).toBe(true);
    expect(state.storageUploads).toHaveLength(1);

    const otherBaseline = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryA2,
    });
    expect(otherBaseline.status).toBe(201);
    expect(otherBaseline.body.replayed).toBeUndefined();
    expect((otherBaseline.body.comparison.rooms as Row[])[0].items[0]).toMatchObject({
      entry: "excellent",
      exit: "damaged",
    });
    expect(state.storageUploads).toHaveLength(2);
  });
});

async function callRaw(session: keyof typeof sessions, method: string, path: string) {
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  app.use((req: Request & { access?: unknown }, _res, next) => {
    req.access = sessions[session];
    next();
  });
  app.use("/real-estate/inspections", mysqlInspectionsRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/real-estate/inspections${path}`, { method });
  const buffer = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, buffer };
}

describe("laudo", () => {
  it("recusa gerar laudo de vistoria em andamento (o botão fica desabilitado no front)", async () => {
    const { status, body } = await call("adminA", "POST", `/${ids.draftA}/report`, {});
    expect(status).toBe(400);
    expect(body.error).toBe("INSPECTION_REPORT_REQUIRES_COMPLETED");
  });

  it("gera o laudo profissional (pdf-lib) de uma vistoria concluída e permite o download autenticado", async () => {
    const generated = await call("adminA", "POST", `/${ids.entryA}/report`, {});
    expect(generated.status).toBe(201);
    expect(generated.body.report.mime_type).toBe("application/pdf");
    expect(generated.body.report.file_name).toMatch(/^laudo-vistoria-.*\.pdf$/);

    const download = await callRaw("adminA", "GET", `/${ids.entryA}/report/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(download.headers.get("content-disposition")).toContain(generated.body.report.file_name);
    expect(download.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(download.buffer.byteLength).toBeGreaterThan(100);

    // Empresa B não consegue baixar o laudo da empresa A mesmo sabendo o ID da vistoria.
    const crossTenant = await callRaw("adminB", "GET", `/${ids.entryA}/report/download`);
    expect(crossTenant.status).toBe(404);
  });

  it("embute evidência WebP no laudo como imagem real (não cai no placeholder)", async () => {
    // Regressão: toReportEvidence só lia o buffer do storage para
    // image/jpeg e image/png, então evidência WebP nunca chegava ao
    // otimizador (Sharp) — mesmo esse já suportando WebP — e o laudo
    // sempre caía no aviso/placeholder de "formato não suportado".
    // WebP de 4x4px gerado via Sharp (backend já usa Sharp como dependência).
    const webpBase64 =
      "UklGRjoAAABXRUJQVlA4IC4AAACQAQCdASoEAAQAAUAmJaACdLoAA5gA/vp5X/9+0v++0v++0v9e34rfUDNIAAAA";
    const webpBuffer = Buffer.from(webpBase64, "base64");

    const evidence = await call("adminA", "POST", `/${ids.entryA2}/evidence`, {
      id: randomUUID(),
      file_name: "qa-webp.webp",
      mime_type: "image/webp",
      size_bytes: webpBuffer.byteLength,
      content_base64: webpBase64,
    });
    expect(evidence.status).toBe(201);
    expect(evidence.body.evidence.mime_type).toBe("image/webp");

    const generated = await call("adminA", "POST", `/${ids.entryA2}/report`, {});
    expect(generated.status).toBe(201);

    const download = await callRaw("adminA", "GET", `/${ids.entryA2}/report/download`);
    expect(download.status).toBe(200);
    const pdfText = download.buffer.toString("latin1");
    // Imagem real embutida via pdf-lib (Sharp reencoda WebP -> JPEG antes do embed).
    expect(pdfText).toContain("/Subtype /Image");
    expect(pdfText).toContain("/Filter /DCTDecode");
    // O caminho de placeholder (regressão) nunca gera /XObject com imagem -
    // só desenha um retângulo + texto no content stream. A presença de
    // /Subtype /Image acima já comprova que a evidência WebP foi embutida
    // como foto real, e não substituída pelo aviso.
  });
});

describe("F5G — editar registro principal e arquivar exigem cargo administrativo", () => {
  function seedInspection(status: string) {
    const id = randomUUID();
    state.tables.inspection.push(inspection(id, COMPANY_A, ids.propA, "entry", status, ids.adminA));
    return id;
  }

  it.each([["ownerA"], ["adminA"], ["managerA"]] as const)(
    "%s (administrativo) pode editar o registro principal (responsável/observações)",
    async (session) => {
      const { status, body } = await call(session, "PATCH", `/${ids.draftA}`, {
        expected_version: inspectionOf(ids.draftA).version,
        notes: "observação administrativa",
      });
      expect(status).toBe(200);
      expect(body.inspection.notes).toBe("observação administrativa");
    },
  );

  it.each([["brokerA"], ["inspectorA"], ["customNonAdminA"]] as const)(
    "%s com inspections.manage mas sem cargo administrativo é bloqueado ao editar o registro principal (403)",
    async (session) => {
      const before = structuredClone(inspectionOf(ids.draftA));
      const { status, body } = await call(session, "PATCH", `/${ids.draftA}`, {
        expected_version: before.version,
        notes: "tentativa não administrativa",
      });
      expect(status).toBe(403);
      expect(body.error).toBe("INSPECTION_ADMIN_ROLE_REQUIRED");
      expect(inspectionOf(ids.draftA).notes).toBe(before.notes);
      expect(inspectionOf(ids.draftA).version).toBe(before.version);
    },
  );

  it.each([["brokerA"], ["inspectorA"]] as const)(
    "%s continua liberado para trabalho operacional: iniciar/concluir vistoria sem cargo administrativo",
    async (session) => {
      const id = seedInspection("draft");
      const started = await call(session, "PATCH", `/${id}`, {
        expected_version: 3,
        status: "in_progress",
      });
      expect(started.status).toBe(200);
      expect(started.body.inspection.status).toBe("in_progress");

      const completed = await call(session, "PATCH", `/${id}`, {
        expected_version: started.body.inspection.version,
        status: "completed",
      });
      expect(completed.status).toBe(200);
      expect(completed.body.inspection.status).toBe("completed");
    },
  );

  it.each([["brokerA"], ["inspectorA"]] as const)(
    "%s continua liberado para criar ambientes e itens (trabalho operacional) sem cargo administrativo",
    async (session) => {
      const id = seedInspection("in_progress");
      const room = await call(session, "POST", `/${id}/rooms`, {
        id: randomUUID(),
        expected_version: 3,
        name: "Sala",
        position: 0,
      });
      expect(room.status).toBe(201);
      const item = await call(session, "POST", `/${id}/rooms/${room.body.room.id}/items`, {
        id: randomUUID(),
        expected_version: inspectionOf(id).version,
        name: "Piso",
        condition: "good",
        position: 0,
      });
      expect(item.status).toBe(201);
    },
  );

  it.each([["draft"], ["in_progress"], ["completed"]] as const)(
    "owner/admin/manager pode arquivar vistoria em status %s",
    async (status) => {
      const id = seedInspection(status);
      const { status: httpStatus, body } = await call("ownerA", "PATCH", `/${id}`, {
        expected_version: 3,
        status: "archived",
      });
      expect(httpStatus).toBe(200);
      expect(body.inspection.status).toBe("archived");
      expect(inspectionOf(id).archivedAt).not.toBeNull();
    },
  );

  it("archived é terminal: não pode ser arquivada novamente (nem por owner/admin/manager)", async () => {
    const id = seedInspection("draft");
    const first = await call("ownerA", "PATCH", `/${id}`, { expected_version: 3, status: "archived" });
    expect(first.status).toBe(200);
    expect(first.body.inspection.status).toBe("archived");
    // Vistoria já arquivada é terminal: uma nova tentativa (mesmo por um
    // cargo administrativo) é rejeitada como não-mutável, nunca reprocessada
    // como uma transição válida nem fisicamente removida.
    const second = await call("ownerA", "PATCH", `/${id}`, {
      expected_version: first.body.inspection.version,
      status: "archived",
    });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("INSPECTION_NOT_MUTABLE");
    expect(inspectionOf(id).status).toBe("archived");
  });

  it.each([["brokerA"], ["inspectorA"], ["customNonAdminA"]] as const)(
    "%s com inspections.manage mas sem cargo administrativo é bloqueado ao arquivar (403), mesmo tendo acesso operacional",
    async (session) => {
      const id = seedInspection("draft");
      const before = structuredClone(inspectionOf(id));
      const { status, body } = await call(session, "PATCH", `/${id}`, {
        expected_version: before.version,
        status: "archived",
      });
      expect(status).toBe(403);
      expect(body.error).toBe("INSPECTION_ADMIN_ROLE_REQUIRED");
      expect(inspectionOf(id).status).toBe(before.status);
      expect(inspectionOf(id).version).toBe(before.version);
    },
  );

  it("empresa A recebe 404 (não 403) ao tentar arquivar vistoria da empresa B, mesmo sendo owner", async () => {
    const before = structuredClone(inspectionOf(ids.entryB));
    const { status, body } = await call("ownerA", "PATCH", `/${ids.entryB}`, {
      expected_version: before.version,
      status: "archived",
    });
    expect(status).toBe(404);
    expect(body.error).toBe("INSPECTION_NOT_FOUND");
    expect(inspectionOf(ids.entryB).status).toBe(before.status);
    expect(inspectionOf(ids.entryB).version).toBe(before.version);
  });
});
