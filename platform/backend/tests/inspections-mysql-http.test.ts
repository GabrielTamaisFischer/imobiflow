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
    if (key === "assignedUser") {
      const assignedUser = state.tables.appUser.find((item) => item.id === row.assignedUserId);
      return Boolean(assignedUser) && matches("appUser", assignedUser!, (condition as Row).is ?? condition);
    }
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return (condition as { in: unknown[] }).in.includes(row[key]);
      // Busca server-side (/app/vistorias): comparação case-insensitive por
      // substring, igual ao comportamento do MySQL com a collation
      // utf8mb4_unicode_ci do projeto (CONTAINS não diferencia caixa).
      if ("contains" in condition) {
        const value = row[key];
        return typeof value === "string" && value.toLowerCase().includes((condition as { contains: string }).contains.toLowerCase());
      }
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
  // F5-D (contraparte) — GET /participants/search inclui party.roles (só
  // tenant/buyer ativos) para sinalizar available_roles no resultado.
  if (table === "party" && include.roles) {
    const roleWhere = (include.roles as Row).where;
    result.roles = state.tables.partyRole
      .filter((roleRow) => roleRow.partyId === row.id)
      .filter((roleRow) => matches("partyRole", roleRow, roleWhere));
  }
  return result;
}

function toOrderByList(orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return [];
  return Array.isArray(orderBy) ? orderBy : [orderBy];
}

// Suporte mínimo a orderBy (createdAt/id asc|desc) — usado pelo padrão
// "evento mais recente vence" (ex.: latestInspectionCounterparty,
// latestInspectionGeneralInfo), que depende de ordenação real, não da ordem
// de inserção no array.
function sortByOrderBy<T extends Row>(items: T[], orderBy: Row | Row[] | undefined): T[] {
  const clauses = toOrderByList(orderBy);
  if (clauses.length === 0) return items;
  return [...items].sort((a, b) => {
    for (const clause of clauses) {
      for (const [field, direction] of Object.entries(clause)) {
        const av = a[field];
        const bv = b[field];
        let cmp = 0;
        if (av instanceof Date || bv instanceof Date) {
          cmp = (av instanceof Date ? av.getTime() : 0) - (bv instanceof Date ? bv.getTime() : 0);
        } else if (av < bv) cmp = -1;
        else if (av > bv) cmp = 1;
        if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
      }
    }
    return 0;
  });
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
      const found = sortByOrderBy(rows().filter((item) => matches(table, item, args.where)), args.orderBy);
      const row = found[0];
      // Prisma usa `select` (não só `include`) para expandir relações
      // aninhadas (ex.: GET /participants/search seleciona party.roles via
      // `select: { roles: {...} }`) — o fake precisa honrar os dois.
      return row ? withInclude(table, row, args.include ?? args.select) : null;
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
      const found = sortByOrderBy(rows().filter((item) => matches(table, item, args.where)), args.orderBy)
        .map((item) => withInclude(table, item, args.include ?? args.select));
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
  "party",
  "partyRole",
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
  // F5-D (contraparte) — cadastros centrais (Party) usados como inquilino/
  // comprador: um ativo com role tenant pré-cadastrado, um ativo SEM role
  // (remoto decidiu aceitar qualquer Party ativa, não exige PartyRole), um
  // inativo e um de outra empresa (isolamento de tenant).
  tenantPartyA: "a4000000-0000-4000-8000-000000000001",
  partyNoRoleA: "a4000000-0000-4000-8000-000000000002",
  inactivePartyA: "a4000000-0000-4000-8000-000000000003",
  partyB: "b4000000-0000-4000-8000-000000000001",
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
      street: "Rua das Flores",
      neighborhood: "Centro",
      city: "Campinas",
      responsibleUserId: ids.adminA,
    },
    {
      id: ids.propA2,
      companyId: COMPANY_A,
      code: "A-2",
      title: "Casa A",
      street: "Avenida Brasil",
      neighborhood: "Jardim América",
      city: "Valinhos",
      responsibleUserId: ids.adminA,
    },
    {
      id: ids.propB,
      companyId: COMPANY_B,
      code: "B-1",
      title: "Apto B",
      street: "Rua B",
      neighborhood: "Bairro B",
      city: "Cidade B",
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

  // F5-D (contraparte) — cadastro central reaproveitado (Party), nunca
  // duplicado pela vistoria.
  state.tables.party.push(
    {
      id: ids.tenantPartyA,
      companyId: COMPANY_A,
      name: "Elisa Tamais",
      taxId: "111.111.111-11",
      taxIdNormalized: "11111111111",
      rg: null,
      email: "elisa@example.test",
      phone: "(11) 94722-2825",
      whatsapp: null,
      addressJson: {},
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: ids.partyNoRoleA,
      companyId: COMPANY_A,
      name: "João Comprador",
      taxId: "222.222.222-22",
      taxIdNormalized: "22222222222",
      rg: null,
      email: "joao@example.test",
      phone: "(21) 98888-1111",
      whatsapp: null,
      addressJson: {},
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: ids.inactivePartyA,
      companyId: COMPANY_A,
      name: "Pedro Inativo",
      taxId: "333.333.333-33",
      taxIdNormalized: "33333333333",
      rg: null,
      email: null,
      phone: null,
      whatsapp: null,
      addressJson: {},
      status: "inactive",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: ids.partyB,
      companyId: COMPANY_B,
      name: "Bruna Outra Empresa",
      taxId: "444.444.444-44",
      taxIdNormalized: "44444444444",
      rg: null,
      email: null,
      phone: null,
      whatsapp: null,
      addressJson: {},
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  );
  state.tables.partyRole.push({
    id: randomUUID(),
    companyId: COMPANY_A,
    partyId: ids.tenantPartyA,
    role: "tenant",
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
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

// UX /app/vistorias — busca e filtros server-side adicionados à listagem
// existente (GET /). Não depende do domínio novo de Assinatura Online.
describe("GET / — busca e filtro de tipo", () => {
  it("filtra por type=entry e devolve só vistorias de entrada da empresa", async () => {
    const { status, body } = await call("adminA", "GET", "/?type=entry");
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    expect(listed).toEqual(expect.arrayContaining([ids.entryA, ids.entryA2, ids.draftA]));
    expect(listed).not.toContain(ids.exitA);
    expect(listed).not.toContain(ids.exitOtherPropA);
  });

  it("rejeita type inválido com 400 INVALID_INSPECTION_TYPE", async () => {
    const { status, body } = await call("adminA", "GET", "/?type=mudanca");
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_INSPECTION_TYPE");
  });

  it("busca por código do imóvel (property.code)", async () => {
    const { status, body } = await call("adminA", "GET", "/?search=A-2");
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    expect(listed).toEqual([ids.exitOtherPropA]);
  });

  it("busca por cidade do imóvel (property.city), case-insensitive", async () => {
    const { status, body } = await call("adminA", "GET", "/?search=valinhos");
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    expect(listed).toEqual([ids.exitOtherPropA]);
  });

  it("busca por nome do responsável (assignedUser.name)", async () => {
    const { status, body } = await call("adminA", "GET", "/?search=Ana");
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    // Todas as vistorias da empresa A estão atribuídas a Ana neste fixture.
    expect(listed).toEqual(expect.arrayContaining([ids.entryA, ids.exitA, ids.draftA]));
    expect(listed).not.toContain(ids.entryB);
  });

  it("busca pelo UUID completo da vistoria (id)", async () => {
    // Os fixtures deste arquivo usam UUIDs com o mesmo prefixo (ex.:
    // a3000000-...-0001, ...-0002) só variando o sufixo, então um prefixo
    // curto bateria em várias de propósito - a busca real por id serve para
    // quando alguém cola o UUID inteiro copiado de outra tela/suporte.
    const { status, body } = await call("adminA", "GET", `/?search=${ids.exitA}`);
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    expect(listed).toEqual([ids.exitA]);
  });

  it("busca sem resultado devolve lista vazia, não erro", async () => {
    const { status, body } = await call("adminA", "GET", "/?search=nao-existe-nenhuma-vistoria-assim");
    expect(status).toBe(200);
    expect(body.inspections).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });

  it("combina status + type + search", async () => {
    const { status, body } = await call("adminA", "GET", "/?status=completed&type=exit&search=A-1");
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    expect(listed).toEqual([ids.exitA]);
  });

  it("nunca extravasa para a empresa B mesmo quando o termo buscado bate com dados da empresa B", async () => {
    const { status, body } = await call("adminA", "GET", "/?search=Bruno");
    expect(status).toBe(200);
    expect(body.inspections).toEqual([]);
  });

  // Bloco 5 — filtro property_id, usado por /app/vistorias/nova para listar
  // Entradas compatíveis como referência de estrutura ao criar uma Saída.
  it("filtra por property_id e devolve só vistorias daquele imóvel, mesmo havendo outras da mesma empresa", async () => {
    const { status, body } = await call("adminA", "GET", `/?property_id=${ids.propA}`);
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    expect(listed).toEqual(expect.arrayContaining([ids.entryA, ids.entryA2, ids.exitA, ids.draftA]));
    expect(listed).not.toContain(ids.exitOtherPropA);
  });

  it("combina property_id + type=entry + status=completed — exatamente o filtro usado para listar candidatas à referência de estrutura", async () => {
    const { status, body } = await call("adminA", "GET", `/?property_id=${ids.propA}&type=entry&status=completed`);
    expect(status).toBe(200);
    const listed = (body.inspections as Row[]).map((row) => row.id);
    expect(listed.sort()).toEqual([ids.entryA, ids.entryA2].sort());
  });

  it("property_id de outra empresa nunca extravasa dados — filtro de escopo de tenant prevalece sobre o parâmetro", async () => {
    const { status, body } = await call("adminA", "GET", `/?property_id=${ids.propB}`);
    expect(status).toBe(200);
    expect(body.inspections).toEqual([]);
  });

  it("rejeita property_id com formato inválido (não-UUID) com 400 INVALID_PROPERTY_ID", async () => {
    const { status, body } = await call("adminA", "GET", "/?property_id=nao-e-um-uuid");
    expect(status).toBe(400);
    expect(body.error).toBe("INVALID_PROPERTY_ID");
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

  function seedComparisonEvidence() {
    const entryRoomId = state.tables.inspectionRoom.find((row) => row.inspectionId === ids.entryA)!.id;
    const entryItemId = state.tables.inspectionItem.find((row) => row.roomId === entryRoomId)!.id;
    const exitRoomId = state.tables.inspectionRoom.find((row) => row.inspectionId === ids.exitA)!.id;
    const exitItemId = state.tables.inspectionItem.find((row) => row.roomId === exitRoomId)!.id;
    function addEvidence(companyId: string, inspectionId: string, roomId: string, itemId: string | null, fileName: string) {
      const storedFileId = randomUUID();
      const evidenceId = randomUUID();
      state.tables.storedFile.push({
        id: storedFileId, companyId, entityType: "inspection_evidence", entityId: evidenceId,
        provider: "fake", publicId: `imobiflow/evidence/${evidenceId}`, resourceType: "image", format: "jpg",
        purpose: "inspection_evidence", originalFilename: fileName, mimeType: "image/jpeg", sizeBytes: 10, createdAt: new Date(),
      });
      state.tables.inspectionEvidence.push({
        id: evidenceId, companyId, inspectionId, roomId, itemId, storedFileId, position: 0, caption: null, createdAt: new Date(),
      });
      return evidenceId;
    }
    // Evidência geral do ambiente (item_id null) na entrada, evidência do item na saída —
    // cobre os dois casos de associação determinística por id.
    const entryGeneralId = addEvidence(COMPANY_A, ids.entryA, entryRoomId, null, "entrada-sala.jpg");
    const exitItemEvidenceId = addEvidence(COMPANY_A, ids.exitA, exitRoomId, exitItemId, "saida-piso.jpg");
    return { entryItemId, exitItemId, entryGeneralId, exitItemEvidenceId };
  }

  it("Bloco 5 — anexa fotos de entrada/saída por ambiente e por item (associação determinística por id)", async () => {
    const { entryGeneralId, exitItemEvidenceId } = seedComparisonEvidence();
    const { status, body } = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(status).toBe(201);
    const room = (body.comparison.rooms as Row[])[0];
    expect(room.entry_evidence.map((e: Row) => e.id)).toEqual([entryGeneralId]);
    expect(room.exit_evidence).toEqual([]);
    const item = room.items[0];
    expect(item.entry_evidence).toEqual([]);
    expect(item.exit_evidence.map((e: Row) => e.id)).toEqual([exitItemEvidenceId]);
    // summary conta por outcome de item, não de ambiente.
    expect(body.summary).toMatchObject({ total: 1, worse: 1, same: 0, better: 0, new: 0, absent: 0, not_comparable: 0 });
  });

  it("Bloco 5 — GET /:id/comparison antes de gerar responde 404 sem efeito colateral", async () => {
    const { status, body } = await call("adminA", "GET", `/${ids.exitA}/comparison`);
    expect(status).toBe(404);
    expect(body.error).toBe("COMPARISON_NOT_FOUND");
    expect(state.storageUploads).toHaveLength(0);
  });

  it("Bloco 5 — GET /:id/comparison depois do POST devolve a mesma comparação decorada, sem gerar de novo", async () => {
    seedComparisonEvidence();
    const generated = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(generated.status).toBe(201);
    const read = await call("adminA", "GET", `/${ids.exitA}/comparison`);
    expect(read.status).toBe(200);
    expect(read.body.summary).toEqual(generated.body.summary);
    expect((read.body.comparison.rooms as Row[])[0].items[0]).toMatchObject({ name: "Piso", entry: "good", exit: "damaged", outcome: "worse" });
    expect(state.storageUploads).toHaveLength(1);
  });

  it("Bloco 5 — GET /:id/comparison de outra empresa responde 404 sem revelar existência", async () => {
    const generated = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(generated.status).toBe(201);
    const crossTenant = await call("adminB", "GET", `/${ids.exitA}/comparison`);
    expect(crossTenant.status).toBe(404);
  });

  it("Bloco 5 — download do PDF comparativo: 404 antes de gerar, bytes reais depois, 404 cross-tenant", async () => {
    const before = await callRaw("adminA", "GET", `/${ids.exitA}/comparison/download`);
    expect(before.status).toBe(404);

    const generated = await call("adminA", "POST", `/${ids.exitA}/comparison`, {
      baseline_inspection_id: ids.entryA,
    });
    expect(generated.status).toBe(201);

    const download = await callRaw("adminA", "GET", `/${ids.exitA}/comparison/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(download.buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(download.buffer.byteLength).toBeGreaterThan(50);

    const crossTenant = await callRaw("adminB", "GET", `/${ids.exitA}/comparison/download`);
    expect(crossTenant.status).toBe(404);
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

    // IMPORTANTE: evidência só pode ser adicionada a uma vistoria mutável
    // (draft/in_progress) - ensureMutable() rejeita com 409
    // INSPECTION_NOT_MUTABLE para uma vistoria "completed" como ids.entryA2
    // (seedada já concluída no beforeEach, igual ids.entryA/exitA). Por isso
    // este teste cria sua própria vistoria draft, anexa a evidência enquanto
    // ainda é mutável e só então avança o status até completed - mesma
    // sequência que a rota exige em produção (draft -> in_progress ->
    // completed, conferido também na homologação manual em staging real).
    const webpInspectionId = randomUUID();
    state.tables.inspection.push(
      inspection(webpInspectionId, COMPANY_A, ids.propA, "entry", "draft", ids.adminA),
    );
    // A evidência precisa estar associada a um ambiente/item: o laudo só
    // percorre evidências agrupadas por room_id/item_id (ver evidenceByRoom
    // / evidenceByItem em buildReportInput) - evidência "solta" (sem room_id
    // nem item_id) nunca entra em rooms[] e é silenciosamente ignorada no
    // PDF, independente do formato. Mesmo padrão usado na reprodução manual
    // em staging real.
    seedRoomWithItem(webpInspectionId, COMPANY_A, "good");
    const [room] = state.tables.inspectionRoom.filter((row) => row.inspectionId === webpInspectionId);
    const [item] = state.tables.inspectionItem.filter((row) => row.roomId === room.id);

    const evidence = await call("adminA", "POST", `/${webpInspectionId}/evidence`, {
      id: randomUUID(),
      room_id: room.id,
      item_id: item.id,
      file_name: "qa-webp.webp",
      mime_type: "image/webp",
      size_bytes: webpBuffer.byteLength,
      content_base64: webpBase64,
    });
    expect(evidence.status).toBe(201);
    expect(evidence.body.evidence.mime_type).toBe("image/webp");

    // version 3 (fixture inicial) -> 4 após o POST /evidence acima.
    const started = await call("adminA", "PATCH", `/${webpInspectionId}`, {
      status: "in_progress",
      expected_version: 4,
    });
    expect(started.status).toBe(200);
    const completed = await call("adminA", "PATCH", `/${webpInspectionId}`, {
      status: "completed",
      expected_version: 5,
    });
    expect(completed.status).toBe(200);

    const generated = await call("adminA", "POST", `/${webpInspectionId}/report`, {});
    expect(generated.status).toBe(201);

    const download = await callRaw("adminA", "GET", `/${webpInspectionId}/report/download`);
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


// Bloco 5 — "Criar vistoria de saída a partir da Entrada": o frontend
// (app.vistorias.nova.tsx) não tem uma rota dedicada — ele lê a Entrada via
// GET /:id e replica a estrutura chamando POST /:id/rooms e
// POST /:id/rooms/:roomId/items sequencialmente. Este bloco cobre esse
// fluxo na camada HTTP: mesma empresa/mesmo imóvel funciona e nunca copia
// condition/notes/evidência; empresa B e imóvel diferente são bloqueados
// pelos mesmos mecanismos de escopo já usados em toda a rota.
describe("Bloco 5 — criar vistoria de saída a partir da Entrada (cópia de estrutura via rooms/items)", () => {
  it("copia nome e posição de ambientes/itens da Entrada para uma Saída nova, sempre com condition not_inspected e sem notes", async () => {
    const newExitId = randomUUID();
    const createdExit = await call("adminA", "POST", "/", {
      id: newExitId,
      property_id: ids.propA,
      type: "exit",
    });
    expect(createdExit.status).toBe(201);
    let version = createdExit.body.inspection.version;

    const reference = await call("adminA", "GET", `/${ids.entryA}`);
    expect(reference.status).toBe(200);
    const sourceRoom = reference.body.inspection.rooms[0];
    expect(sourceRoom.name).toBe("Sala");
    const sourceItem = sourceRoom.items[0];
    expect(sourceItem.name).toBe("Piso");
    expect(sourceItem.condition).toBe("good"); // confirma que a Entrada tem estado preenchido — é isso que NÃO deve ser copiado.

    const roomCreated = await call("adminA", "POST", `/${newExitId}/rooms`, {
      id: randomUUID(),
      expected_version: version,
      name: sourceRoom.name,
      position: 0,
    });
    expect(roomCreated.status).toBe(201);
    version += 1;

    const itemCreated = await call("adminA", "POST", `/${newExitId}/rooms/${roomCreated.body.room.id}/items`, {
      id: randomUUID(),
      expected_version: version,
      name: sourceItem.name,
      condition: "not_inspected",
      position: 0,
    });
    expect(itemCreated.status).toBe(201);
    version += 1;

    const final = await call("adminA", "GET", `/${newExitId}`);
    expect(final.status).toBe(200);
    expect(final.body.inspection.rooms).toHaveLength(1);
    expect(final.body.inspection.rooms[0]).toMatchObject({ name: "Sala", position: 0, notes: null });
    expect(final.body.inspection.rooms[0].items).toHaveLength(1);
    expect(final.body.inspection.rooms[0].items[0]).toMatchObject({ name: "Piso", condition: "not_inspected", position: 0, notes: null });
    // A Saída é uma vistoria própria e independente: seu id nunca coincide
    // com o da Entrada, e seus ambientes/itens têm ids novos (nunca os
    // mesmos da Entrada).
    expect(final.body.inspection.id).toBe(newExitId);
    expect(final.body.inspection.id).not.toBe(ids.entryA);
    expect(final.body.inspection.rooms[0].id).not.toBe(sourceRoom.id);
    expect(final.body.inspection.rooms[0].items[0].id).not.toBe(sourceItem.id);
  });

  it("empresa B não consegue ler a Entrada da empresa A para copiar estrutura (404, sem revelar existência)", async () => {
    const read = await call("adminB", "GET", `/${ids.entryA}`);
    expect(read.status).toBe(404);
  });

  it("empresa B não consegue criar ambiente numa Saída da empresa A mesmo sabendo o id (404)", async () => {
    const { status } = await call("adminB", "POST", `/${ids.exitA}/rooms`, {
      id: randomUUID(),
      expected_version: 3,
      name: "Sala",
      position: 0,
    });
    expect(status).toBe(404);
  });

  it("uma Entrada de outro imóvel da MESMA empresa não aparece como candidata (filtro property_id exclui), prevenindo cópia cross-property por engano", async () => {
    const { status, body } = await call("adminA", "GET", `/?property_id=${ids.propA2}&type=entry&status=completed`);
    expect(status).toBe(200);
    expect((body.inspections as Row[]).map((row) => row.id)).toEqual([]);
  });
});
// F5-D — contraparte (inquilino/comprador) vinculada ao cadastro central
// (Party). Arquitetura real: vínculo armazenado como evento de auditoria
// (inspectionEvent "inspection.counterparty_linked"/"_removed", "o mais
// recente vence"), não como coluna nova — por isso nenhuma migration nem
// prisma generate são necessários para este fluxo. Qualquer Party ativa da
// empresa pode ser vinculada (não exige PartyRole tenant/buyer
// pré-cadastrado); o papel (tenant/buyer) é escolhido no momento do vínculo.
describe("F5-D — contraparte (inquilino/comprador) vinculada ao cadastro central (Party)", () => {
  it("cria a vistoria já com contraparte vinculada (pessoa + papel) e GET /:id/counterparty devolve os dados do cadastro central", async () => {
    const id = randomUUID();
    const created = await call("adminA", "POST", "/", {
      id,
      property_id: ids.propA,
      type: "entry",
      counterparty_party_id: ids.tenantPartyA,
      counterparty_role: "tenant",
    });
    expect(created.status).toBe(201);

    const read = await call("adminA", "GET", `/${id}/counterparty`);
    expect(read.status).toBe(200);
    expect(read.body.counterparty).toMatchObject({
      party_id: ids.tenantPartyA,
      role: "tenant",
      name: "Elisa Tamais",
      document: "111.111.111-11",
    });
  });

  it("recusa criar com pessoa sem o papel (ou papel sem pessoa) — refine do schema", async () => {
    const withoutRole = await call("adminA", "POST", "/", {
      id: randomUUID(),
      property_id: ids.propA,
      type: "entry",
      counterparty_party_id: ids.tenantPartyA,
    });
    expect(withoutRole.status).toBe(400);

    const withoutParty = await call("adminA", "POST", "/", {
      id: randomUUID(),
      property_id: ids.propA,
      type: "entry",
      counterparty_role: "tenant",
    });
    expect(withoutParty.status).toBe(400);
  });

  it("compatibilidade — criar sem contraparte continua funcionando normalmente (vistorias antigas nunca tiveram esse campo)", async () => {
    const id = randomUUID();
    const created = await call("adminA", "POST", "/", { id, property_id: ids.propA, type: "entry" });
    expect(created.status).toBe(201);
    const read = await call("adminA", "GET", `/${id}/counterparty`);
    expect(read.status).toBe(200);
    expect(read.body.counterparty).toBeNull();
  });

  it("isolamento de tenant — não permite vincular uma Party de outra empresa na criação (400)", async () => {
    const created = await call("adminA", "POST", "/", {
      id: randomUUID(),
      property_id: ids.propA,
      type: "entry",
      counterparty_party_id: ids.partyB,
      counterparty_role: "tenant",
    });
    expect(created.status).toBe(400);
    expect(created.body.error).toBe("INVALID_INSPECTION_COUNTERPARTY");
  });

  it("recusa vincular uma Party inativa (400)", async () => {
    const created = await call("adminA", "POST", "/", {
      id: randomUUID(),
      property_id: ids.propA,
      type: "entry",
      counterparty_party_id: ids.inactivePartyA,
      counterparty_role: "buyer",
    });
    expect(created.status).toBe(400);
    expect(created.body.error).toBe("INVALID_INSPECTION_COUNTERPARTY");
  });

  it("edição — PUT /:id/counterparty vincula, troca (o evento mais recente vence) e remove o vínculo", async () => {
    // draftA: in_progress, version 3 (fixture padrão).
    const linked = await call("adminA", "PUT", `/${ids.draftA}/counterparty`, {
      expected_version: 3,
      party_id: ids.tenantPartyA,
      role: "tenant",
    });
    expect(linked.status).toBe(200);
    expect(linked.body.counterparty).toMatchObject({ party_id: ids.tenantPartyA, role: "tenant" });

    // Troca para outra pessoa, com outro papel — precisa ser o vínculo ATUAL
    // (mais recente), não o primeiro encontrado.
    const swapped = await call("adminA", "PUT", `/${ids.draftA}/counterparty`, {
      expected_version: 4,
      party_id: ids.partyNoRoleA,
      role: "buyer",
    });
    expect(swapped.status).toBe(200);
    expect(swapped.body.counterparty).toMatchObject({ party_id: ids.partyNoRoleA, role: "buyer", name: "João Comprador" });

    const removed = await call("adminA", "PUT", `/${ids.draftA}/counterparty`, {
      expected_version: 5,
      party_id: null,
    });
    expect(removed.status).toBe(200);
    expect(removed.body.counterparty).toBeNull();
  });

  it("vinculação independente de contrato — aceita vincular mesmo sem nenhum Contract associado à vistoria", async () => {
    // draftA não tem nenhum Contract seedado neste arquivo de teste.
    const linked = await call("adminA", "PUT", `/${ids.draftA}/counterparty`, {
      expected_version: 3,
      party_id: ids.partyNoRoleA,
      role: "buyer",
    });
    expect(linked.status).toBe(200);
  });

  it("permissão — sessão só com inspections.view não pode alterar a contraparte (403)", async () => {
    const { status } = await call("viewerA", "PUT", `/${ids.draftA}/counterparty`, {
      expected_version: 3,
      party_id: ids.tenantPartyA,
      role: "tenant",
    });
    expect(status).toBe(403);
  });

  it("isolamento de tenant — empresa B não altera nem lê a contraparte de uma vistoria da empresa A (404)", async () => {
    const put = await call("adminB", "PUT", `/${ids.entryA}/counterparty`, {
      expected_version: 3,
      party_id: ids.tenantPartyA,
      role: "tenant",
    });
    expect(put.status).toBe(404);

    const get = await call("adminB", "GET", `/${ids.entryA}/counterparty`);
    expect(get.status).toBe(404);
  });

  it("vistoria concluída — bloqueia alteração da contraparte para cargo não administrativo (409), mas permite para owner/admin/manager", async () => {
    const blocked = await call("brokerA", "PUT", `/${ids.entryA}/counterparty`, {
      expected_version: 3,
      party_id: ids.tenantPartyA,
      role: "tenant",
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("INSPECTION_NOT_MUTABLE");

    const allowed = await call("ownerA", "PUT", `/${ids.entryA}/counterparty`, {
      expected_version: 3,
      party_id: ids.tenantPartyA,
      role: "tenant",
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body.counterparty).toMatchObject({ party_id: ids.tenantPartyA, role: "tenant" });
  });

  it("busca de contraparte (/participants/search) — filtra por nome/CPF, respeita isolamento de tenant e tamanho mínimo da consulta", async () => {
    const tooShort = await call("adminA", "GET", "/participants/search?q=a");
    expect(tooShort.status).toBe(200);
    expect(tooShort.body.participants).toEqual([]);

    const byName = await call("adminA", "GET", "/participants/search?q=Elisa");
    expect(byName.status).toBe(200);
    expect(byName.body.participants).toHaveLength(1);
    expect(byName.body.participants[0]).toMatchObject({ party_id: ids.tenantPartyA, name: "Elisa Tamais", available_roles: ["tenant"] });

    // Qualquer Party ativa pode ser encontrada, mesmo sem PartyRole
    // tenant/buyer pré-cadastrado — available_roles fica vazio.
    const byDocument = await call("adminA", "GET", "/participants/search?q=22222222222");
    expect(byDocument.status).toBe(200);
    expect(byDocument.body.participants[0]).toMatchObject({ party_id: ids.partyNoRoleA, available_roles: [] });

    // Isolamento: a empresa B nunca vê cadastros da empresa A.
    const crossTenant = await call("adminB", "GET", "/participants/search?q=Elisa");
    expect(crossTenant.status).toBe(200);
    expect(crossTenant.body.participants).toEqual([]);
  });

  it("geração do laudo — vincula a contraparte e gera o laudo normalmente (o vínculo direto é consultado sem erro)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const linked = await call("adminA", "PUT", `/${ids.draftA}/counterparty`, {
        expected_version: 3,
        party_id: ids.tenantPartyA,
        role: "tenant",
      });
      expect(linked.status).toBe(200);

      const completed = await call("adminA", "PATCH", `/${ids.draftA}`, { expected_version: 4, status: "completed" });
      expect(completed.status).toBe(200);

      const generated = await call("adminA", "POST", `/${ids.draftA}/report`, {});
      expect(generated.status).toBe(201);

      // O lookup do vínculo direto (latestInspectionCounterparty, via
      // safe("inquilino/comprador vinculado a vistoria", ...)) nunca
      // aparece como falha nos avisos — prova que o laudo conseguiu ler o
      // cadastro central sem erro. Os avisos de "empresa"/"contrato" que
      // ainda aparecem são de outras dependências não relacionadas a este
      // vínculo e já existiam antes desta feature neste harness de teste.
      const warned = warnSpy.mock.calls.map((args) => String(args[0])).join("\n");
      expect(warned).not.toContain("inquilino/comprador vinculado a vistoria");
    } finally {
      warnSpy.mockRestore();
    }
  });
});
