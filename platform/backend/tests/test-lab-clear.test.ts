import { randomUUID } from "node:crypto";
import { type AddressInfo } from "node:net";
import { type Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regressão: DELETE /test-lab/clear devolvia 500 (erro de FK) quando um
// imóvel QA ainda era referenciado por uma Inspection (Inspection.property
// usa onDelete: Restrict no schema.prisma). O gerador /generate não cria
// vistorias hoje, mas uma vistoria criada manualmente apontando para um
// imóvel QA (ex.: durante um teste manual) bloqueava a limpeza do próprio
// mecanismo de teste. Este arquivo cobre só a rota /clear; o plano de
// cenários (src/product/test-lab.ts) já tem testes próprios e não é afetado.

type Row = Record<string, any>;
const { state } = vi.hoisted(() => ({
  state: { tables: {} as Record<string, Row[]> },
}));

function matches(table: string, row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === "AND") return (condition as Row[]).every((part) => matches(table, row, part));
    if (key === "OR") return (condition as Row[]).some((part) => matches(table, row, part));
    if (key === "room") {
      const room = state.tables.inspectionRoom.find((item) => item.id === row.roomId);
      return Boolean(room) && matches("inspectionRoom", room!, condition as Row);
    }
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      if ("in" in condition) return (condition as { in: unknown[] }).in.includes(row[key]);
      if ("startsWith" in condition)
        return typeof row[key] === "string" && row[key].startsWith((condition as { startsWith: string }).startsWith);
      throw new Error(`Filtro não suportado no fake: ${table}.${key}`);
    }
    return row[key] === condition;
  });
}

function model(table: string) {
  const rows = () => state.tables[table];
  return {
    async findFirst(args: Row = {}) {
      return rows().find((item) => matches(table, item, args.where)) ?? null;
    },
    async findMany(args: Row = {}) {
      const found = rows().filter((item) => matches(table, item, args.where));
      return args.take ? found.slice(0, args.take) : found;
    },
    async count(args: Row = {}) {
      return rows().filter((item) => matches(table, item, args.where)).length;
    },
    async create(args: Row) {
      const row: Row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...args.data };
      rows().push(row);
      return row;
    },
    async createMany(args: Row) {
      const rowsToInsert = (args.data as Row[]).map((data) => ({ id: randomUUID(), ...data }));
      rows().push(...rowsToInsert);
      return { count: rowsToInsert.length };
    },
    async update(args: Row) {
      const row = rows().find((item) => matches(table, item, args.where));
      if (!row) throw new Error(`${table} não encontrado para update`);
      Object.assign(row, args.data);
      return row;
    },
    async deleteMany(args: Row = {}) {
      const keep = rows().filter((item) => !matches(table, item, args.where));
      const removed = rows().length - keep.length;
      state.tables[table] = keep;
      return { count: removed };
    },
  };
}

const tableNames = [
  "property",
  "appUser",
  "siteLead",
  "appointment",
  "propertyMedia",
  "propertyOwnerLink",
  "propertyOwner",
  "lead",
  "companySite",
  "inspection",
  "inspectionRoom",
  "inspectionItem",
  "inspectionEvidence",
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

import { errorHandler } from "../src/middleware/error-handler.js";
import { testLabRouter } from "../src/routes/test-lab.js";

const COMPANY_A = "a0000000-0000-4000-8000-000000000000";
const COMPANY_B = "b0000000-0000-4000-8000-000000000000";
const ids = {
  adminA: "a1000000-0000-4000-8000-000000000001",
  adminB: "b1000000-0000-4000-8000-000000000001",
  qaPropA: "a2000000-0000-4000-8000-000000000001",
  qaPropA2: "a2000000-0000-4000-8000-000000000002",
  realPropA: "a2000000-0000-4000-8000-000000000003",
  qaPropB: "b2000000-0000-4000-8000-000000000001",
};

function access(companyId: string, userId: string, permissions: string[]) {
  return {
    appUser: { id: userId, companyId, permissions },
    company: { id: companyId },
  };
}
const sessions = {
  adminA: access(COMPANY_A, ids.adminA, ["properties.manage"]),
  viewerA: access(COMPANY_A, ids.adminA, []),
  adminB: access(COMPANY_B, ids.adminB, ["properties.manage"]),
};

function seedInspectionWithChildren(id: string, companyId: string, propertyId: string) {
  state.tables.inspection.push({
    id,
    companyId,
    propertyId,
    status: "completed",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const roomId = randomUUID();
  state.tables.inspectionRoom.push({ id: roomId, companyId, inspectionId: id });
  const itemId = randomUUID();
  state.tables.inspectionItem.push({ id: itemId, companyId, roomId });
  state.tables.inspectionEvidence.push({ id: randomUUID(), companyId, inspectionId: id, storedFileId: randomUUID() });
}

beforeEach(() => {
  state.tables = Object.fromEntries(tableNames.map((name) => [name, []]));
  state.tables.property.push(
    { id: ids.qaPropA, companyId: COMPANY_A, code: "QA-BATCH1-001", ownerId: null },
    { id: ids.qaPropA2, companyId: COMPANY_A, code: "QA-BATCH1-002", ownerId: null },
    { id: ids.realPropA, companyId: COMPANY_A, code: "REAL-001", ownerId: null },
    { id: ids.qaPropB, companyId: COMPANY_B, code: "QA-BATCH1-001", ownerId: null },
  );
});

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function call(session: keyof typeof sessions, method: string, path: string) {
  const app = express();
  app.use(express.json());
  app.use((req: Request & { access?: unknown }, _res, next) => {
    req.access = sessions[session];
    next();
  });
  app.use("/test-lab", testLabRouter);
  app.use(errorHandler);
  const server = app.listen(0);
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${port}/test-lab${path}`, { method });
  return { status: response.status, body: (await response.json()) as Row };
}

describe("DELETE /test-lab/clear", () => {
  it("limpa imóveis QA sem vistoria vinculada (comportamento preexistente)", async () => {
    const { status, body } = await call("adminA", "DELETE", "/clear");
    expect(status).toBe(200);
    expect(body.properties).toBe(2);
    expect(state.tables.property.some((row) => row.id === ids.qaPropA)).toBe(false);
    expect(state.tables.property.some((row) => row.id === ids.realPropA)).toBe(true);
  });

  it("regressão: não devolve 500 quando uma vistoria referencia um imóvel QA, e remove a vistoria e seus filhos junto", async () => {
    const inspectionId = randomUUID();
    seedInspectionWithChildren(inspectionId, COMPANY_A, ids.qaPropA);

    const { status, body } = await call("adminA", "DELETE", "/clear");

    expect(status).toBe(200);
    expect(body.inspections).toBe(1);
    expect(body.rooms).toBe(1);
    expect(body.items).toBe(1);
    expect(body.inspection_evidence).toBe(1);
    expect(body.properties).toBe(2);

    expect(state.tables.inspection.some((row) => row.id === inspectionId)).toBe(false);
    expect(state.tables.property.some((row) => row.id === ids.qaPropA)).toBe(false);
    // Rooms/items/evidence cascata no nivel do banco via onDelete: Cascade a
    // partir de Inspection (schema.prisma) - o fake em memoria deste teste nao
    // simula FK cascade, por isso a verificacao aqui fica nos contadores
    // retornados pela rota (acima) e na propria vistoria/imovel removidos, que
    // sao a parte da logica de aplicacao que este teste cobre.
  });

  it("nunca remove vistoria ou imóvel de outra empresa (isolamento mantido mesmo com vistoria presa)", async () => {
    const inspectionBId = randomUUID();
    seedInspectionWithChildren(inspectionBId, COMPANY_B, ids.qaPropB);

    const { status } = await call("adminA", "DELETE", "/clear");

    expect(status).toBe(200);
    // A limpeza da empresa A não deve tocar nada da empresa B.
    expect(state.tables.property.some((row) => row.id === ids.qaPropB)).toBe(true);
    expect(state.tables.inspection.some((row) => row.id === inspectionBId)).toBe(true);
  });

  it("nunca remove uma vistoria presa a um imóvel real (não-QA)", async () => {
    const realInspectionId = randomUUID();
    seedInspectionWithChildren(realInspectionId, COMPANY_A, ids.realPropA);

    const { status } = await call("adminA", "DELETE", "/clear");

    expect(status).toBe(200);
    expect(state.tables.property.some((row) => row.id === ids.realPropA)).toBe(true);
    expect(state.tables.inspection.some((row) => row.id === realInspectionId)).toBe(true);
  });

  it("exige permissao properties.manage", async () => {
    const { status } = await call("viewerA", "DELETE", "/clear");
    expect(status).toBe(403);
  });
});
