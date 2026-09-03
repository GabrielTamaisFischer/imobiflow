import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fase 2.2B — Compartilhamento explícito de Property (PropertyAccess).
//
// Este arquivo cobre dois níveis, seguindo os padrões já existentes no
// backend:
//  - Nível de serviço (estilo property-central-search-multitenant.test.ts):
//    um fake de banco em memória exercita as cláusulas WHERE reais de
//    grant/replace/revoke/list e de resolvePropertyShareTarget.
//  - Nível HTTP (estilo mysql-auth-http-isolation.test.ts): sobe o
//    realEstateRouter de verdade num servidor efêmero e faz requisições
//    reais com tokens de diferentes usuários/empresas, provando 401/403/404
//    ponta a ponta (adversarial IDOR/multi-tenant, decisão C1, regressão).

// Todos os ids usados dentro do factory de vi.mock (hoisted) precisam ser
// declarados dentro de vi.hoisted() também — um vi.mock de topo é elevado
// acima de qualquer `const` normal do módulo, então uma referência a uma
// constante "solta" causaria ReferenceError (temporal dead zone) no import.
const {
  COMPANY_A,
  COMPANY_B,
  PROPERTY_A1,
  PROPERTY_B1,
  OWNER_A,
  BROKER_A1,
  BROKER_A2,
  BROKER_A3,
  OWNER_B,
} = vi.hoisted(() => ({
  // user_id no payload de grant/replace é validado como z.string().uuid()
  // (mesma convenção do resto da API), por isso os ids de usuário de teste
  // precisam ter formato UUID — property/company ids não passam por essa
  // validação (vêm de req.params/token), então continuam legíveis.
  COMPANY_A: "company-a",
  COMPANY_B: "company-b",
  PROPERTY_A1: "property-a1",
  PROPERTY_B1: "property-b1",
  OWNER_A: "00000000-0000-4000-8000-00000000000a",
  BROKER_A1: "00000000-0000-4000-8000-0000000000a1", // responsável pelo property-a1
  BROKER_A2: "00000000-0000-4000-8000-0000000000a2", // sem grant algum (recebe grants nos testes)
  BROKER_A3: "00000000-0000-4000-8000-0000000000a3", // sem nenhum acesso ao property-a1
  OWNER_B: "00000000-0000-4000-8000-00000000000b", // dono da empresa B (cross-tenant)
}));

type FakeUser = {
  id: string;
  companyId: string;
  name: string;
  status: string;
  role: string;
  permissionKeys: string[];
};

function fakeUser(id: string, companyId: string, role: string, permissionKeys: string[], status = "active"): FakeUser {
  return { id, companyId, name: id, status, role, permissionKeys };
}

const state = vi.hoisted(() => ({
  users: [] as FakeUser[],
  properties: [] as Array<{ id: string; companyId: string; responsibleUserId: string | null }>,
  access: [] as Array<{
    id: string;
    companyId: string;
    propertyId: string;
    userId: string;
    permission: string;
    grantedBy: string;
    createdAt: Date;
  }>,
  auditLog: [] as Array<Record<string, unknown>>,
  seq: 0,
}));

function resetState() {
  state.users = [
    fakeUser(OWNER_A, COMPANY_A, "owner", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(BROKER_A1, COMPANY_A, "broker", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(BROKER_A2, COMPANY_A, "broker", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(BROKER_A3, COMPANY_A, "broker", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(OWNER_B, COMPANY_B, "owner", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
  ];
  state.properties = [
    { id: PROPERTY_A1, companyId: COMPANY_A, responsibleUserId: BROKER_A1 },
    { id: PROPERTY_B1, companyId: COMPANY_B, responsibleUserId: OWNER_B },
  ];
  state.access = [];
  state.auditLog = [];
  state.seq = 0;
}

// ---------------------------------------------------------------------------
// Fake Prisma — reimplementa só o suficiente das cláusulas WHERE realmente
// usadas por authorization.ts / mysql-real-estate.ts / crm.ts-style /users,
// para que os testes exercitem o código de produção real (não apenas
// verifiquem que ele "chamou a função certa").
// ---------------------------------------------------------------------------

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === "object" && !Array.isArray(condition)) {
    const cond = condition as Record<string, unknown>;
    if ("in" in cond) return (cond.in as unknown[]).includes(value);
    if ("notIn" in cond) return !(cond.notIn as unknown[]).includes(value);
    if ("not" in cond) return value !== cond.not;
  }
  return value === condition;
}

function matchesPropertyWhere(row: (typeof state.properties)[number], where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as Record<string, unknown>[]).every((clause) => matchesPropertyWhere(row, clause));
    if (key === "OR") return (condition as Record<string, unknown>[]).some((clause) => matchesPropertyWhere(row, clause));
    if (key === "accessGrants") {
      const some = (condition as { some: Record<string, unknown> }).some;
      return state.access.some((grant) => grant.propertyId === row.id && matchesAccessWhere(grant, some));
    }
    return matchesCondition((row as Record<string, unknown>)[key], condition);
  });
}

function matchesAccessWhere(row: (typeof state.access)[number], where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => matchesCondition((row as Record<string, unknown>)[key], condition));
}

function serializedUserRef(userId: string) {
  const user = state.users.find((candidate) => candidate.id === userId);
  return user ? { id: user.id, name: user.name } : null;
}

function attachAccessRelations(row: (typeof state.access)[number]) {
  return { ...row, user: serializedUserRef(row.userId), grantedByUser: serializedUserRef(row.grantedBy) };
}

function buildFakeDatabase() {
  const propertyModel = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = state.properties.find((property) => matchesPropertyWhere(property, where));
      return row ? { ...row, media: [], owner: null, responsibleUser: null } : null;
    }),
  };

  const propertyAccessModel = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = state.access.find((candidate) => matchesAccessWhere(candidate, where));
      return row ? attachAccessRelations(row) : null;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return state.access
        .filter((candidate) => matchesAccessWhere(candidate, where))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map(attachAccessRelations);
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: { propertyId_userId_permission: { propertyId: string; userId: string; permission: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const key = where.propertyId_userId_permission;
      const existing = state.access.find(
        (candidate) => candidate.propertyId === key.propertyId && candidate.userId === key.userId && candidate.permission === key.permission,
      );
      if (existing) {
        Object.assign(existing, update);
        return attachAccessRelations(existing);
      }
      const row = { id: `access-${++state.seq}`, createdAt: new Date(), ...(create as typeof state.access[number]) };
      state.access.push(row);
      return attachAccessRelations(row);
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const before = state.access.length;
      state.access = state.access.filter((candidate) => !matchesAccessWhere(candidate, where));
      return { count: before - state.access.length };
    }),
  };

  const appUserModel = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const user = state.users.find((candidate) => matchesAppUserWhere(candidate, where));
      return user ? { id: user.id, name: user.name, status: user.status } : null;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return state.users
        .filter((candidate) => matchesAppUserWhere(candidate, where))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((user) => ({ id: user.id, name: user.name, role: user.role, status: user.status }));
    }),
  };

  const authAuditLogModel = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      state.auditLog.push(data);
      return data;
    }),
  };

  const database = {
    property: propertyModel,
    propertyAccess: propertyAccessModel,
    appUser: appUserModel,
    authAuditLog: authAuditLogModel,
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") return (arg as (tx: typeof database) => unknown)(database);
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };

  return database;
}

function matchesAppUserWhere(user: FakeUser, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "roleRecord") {
      const some = (condition as { permissions: { some: { permission: { key: { in: string[] } } } } }).permissions.some;
      return some.permission.key.in.some((permissionKey) => user.permissionKeys.includes(permissionKey));
    }
    return matchesCondition((user as unknown as Record<string, unknown>)[key], condition);
  });
}

vi.mock("../src/services/mysql-auth.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/services/mysql-auth.js")>();
  const tokenMap: Record<string, { userId: string; role: string; scope: "own" | "shared" | "company" }> = {
    "token-owner-a": { userId: OWNER_A, role: "owner", scope: "company" },
    "token-broker-a1": { userId: BROKER_A1, role: "broker", scope: "shared" },
    "token-broker-a2": { userId: BROKER_A2, role: "broker", scope: "shared" },
    "token-broker-a3": { userId: BROKER_A3, role: "broker", scope: "shared" },
    "token-owner-b": { userId: OWNER_B, role: "owner", scope: "company" },
  };
  return {
    ...original,
    buildMysqlAccessContextFromToken: vi.fn(async (token: string) => {
      const entry = tokenMap[token];
      if (!entry) return null;
      const user = state.users.find((candidate) => candidate.id === entry.userId)!;
      return {
        sessionId: `session-${user.id}`,
        authUser: { id: user.id, email: `${user.id}@example.test`, name: user.name },
        appUser: {
          id: user.id,
          company_id: user.companyId,
          name: user.name,
          email: `${user.id}@example.test`,
          status: user.status,
          role: entry.role,
          permissions: user.permissionKeys,
          permissionScopes: {
            "properties.view": entry.scope,
            "properties.manage": entry.scope,
            "crm.view": entry.scope,
            "crm.manage": entry.scope,
          },
        },
        company: { id: user.companyId, name: user.companyId, status: "active" },
        subscription: { id: "sub", status: "ACTIVE", plan_slug: "qa", expires_at: null, grace_ends_at: null },
      };
    }),
  };
});

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => buildFakeDatabase() }));

// A mesma instância fake precisa ser compartilhada entre o middleware de auth
// (que não usa getPrisma) e as rotas (que usam getPrisma() a cada chamada) —
// como buildFakeDatabase() só encapsula funções que leem/escrevem o `state`
// hoisted compartilhado, múltiplas instâncias continuam consistentes entre
// si (todas operam sobre o mesmo `state`).

import {
  grantMysqlPropertyAccess,
  listMysqlPropertyAccess,
  replaceMysqlPropertyAccess,
  resolvePropertyShareTarget,
  revokeMysqlPropertyAccess,
} from "../src/services/mysql-real-estate.js";
import { canAccessProperty } from "../src/services/authorization.js";
import { realEstateRouter } from "../src/routes/real-estate.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import type { AccessContext } from "../src/types/access.js";

function accessOf(userId: string, role: string, companyId: string, scope: "own" | "shared" | "company" = "shared"): AccessContext {
  const user = state.users.find((candidate) => candidate.id === userId)!;
  return {
    authUser: { id: user.id, email: `${user.id}@example.test`, name: user.name },
    appUser: {
      id: user.id,
      company_id: companyId,
      name: user.name,
      email: `${user.id}@example.test`,
      status: "active",
      role,
      permissions: user.permissionKeys,
      permissionScopes: {
        "properties.view": scope,
        "properties.manage": scope,
      },
    },
    company: { id: companyId, name: companyId, status: "active" },
    subscription: { id: "sub", status: "ACTIVE", plan_slug: "qa", expires_at: null, grace_ends_at: null },
  };
}

describe("Fase 2.2B — serviço de PropertyAccess (grant/replace/revoke/list)", () => {
  beforeEach(() => resetState());

  it("resolvePropertyShareTarget aceita um AppUser ativo da mesma empresa com properties.view/manage", async () => {
    const target = await resolvePropertyShareTarget(COMPANY_A, BROKER_A2, BROKER_A1);
    expect(target.id).toBe(BROKER_A2);
  });

  it("resolvePropertyShareTarget bloqueia auto-compartilhamento", async () => {
    await expect(resolvePropertyShareTarget(COMPANY_A, BROKER_A1, BROKER_A1)).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_SHARE_TARGET",
    });
  });

  it("resolvePropertyShareTarget bloqueia usuário de outra empresa (cross-tenant)", async () => {
    await expect(resolvePropertyShareTarget(COMPANY_A, OWNER_B, BROKER_A1)).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_SHARE_TARGET",
    });
  });

  it("resolvePropertyShareTarget bloqueia usuário inativo", async () => {
    state.users.find((user) => user.id === BROKER_A2)!.status = "inactive";
    await expect(resolvePropertyShareTarget(COMPANY_A, BROKER_A2, BROKER_A1)).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_SHARE_TARGET",
    });
  });

  it("grantMysqlPropertyAccess é aditivo: conceder EDIT não remove um VIEW já concedido", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["EDIT"], BROKER_A1);
    const rows = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    expect(rows.map((row) => row.permission).sort()).toEqual(["EDIT", "VIEW"]);
  });

  it("grantMysqlPropertyAccess é idempotente: reconceder a mesma permissão não duplica nem falha", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    const rows = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    expect(rows.filter((row) => row.permission === "VIEW")).toHaveLength(1);
  });

  it("replaceMysqlPropertyAccess deixa o resultado final EXATAMENTE igual ao conjunto pedido", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW", "EDIT", "VISIT"], BROKER_A1);
    await replaceMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["EDIT", "NEGOTIATE"], BROKER_A1);
    const rows = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    expect(rows.map((row) => row.permission).sort()).toEqual(["EDIT", "NEGOTIATE"]);
  });

  it("replaceMysqlPropertyAccess com lista vazia revoga todas as permissões daquele usuário", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW", "EDIT"], BROKER_A1);
    await replaceMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, [], BROKER_A1);
    const rows = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    expect(rows).toEqual([]);
  });

  it("revokeMysqlPropertyAccess remove exatamente uma linha e retorna null em id inexistente/cross-tenant", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    const [row] = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    await expect(revokeMysqlPropertyAccess(COMPANY_B, PROPERTY_A1, row!.id)).resolves.toBeNull();
    await expect(revokeMysqlPropertyAccess(COMPANY_A, PROPERTY_B1, row!.id)).resolves.toBeNull();
    await expect(revokeMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, "does-not-exist")).resolves.toBeNull();
    const revoked = await revokeMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, row!.id);
    expect(revoked?.userId).toBe(BROKER_A2);
    expect(await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1)).toEqual([]);
  });

  it("revogar um VIEW explícito não derruba o VIEW implícito por EDIT (implicação de permissões)", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW", "EDIT"], BROKER_A1);
    const viewRow = (await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1)).find((row) => row.permission === "VIEW")!;
    await revokeMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, viewRow.id);
    // grantPermissions("VIEW") em buildPropertyScopeFilter aceita QUALQUER
    // permissão remanescente (inclusive EDIT) como prova de visibilidade.
    await expect(canAccessProperty(accessOf(BROKER_A2, "broker", COMPANY_A), PROPERTY_A1)).resolves.toBe(true);
  });

  it("listMysqlPropertyAccess nunca retorna dados de outra empresa/imóvel", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await grantMysqlPropertyAccess(COMPANY_B, PROPERTY_B1, OWNER_B, ["VIEW"], OWNER_B);
    const rows = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: BROKER_A2, property_id: PROPERTY_A1 });
    expect(JSON.stringify(rows)).not.toContain(COMPANY_B);
  });
});

describe("Fase 2.2B — fluxo semântico completo grant → uso → revoke", () => {
  beforeEach(() => resetState());

  it("VIEW/EDIT concedidos passam a valer e, ao revogar tudo, o acesso desaparece de novo", async () => {
    const brokerA2Access = accessOf(BROKER_A2, "broker", COMPANY_A);
    await expect(canAccessProperty(brokerA2Access, PROPERTY_A1, "properties.view", "VIEW")).resolves.toBe(false);

    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await expect(canAccessProperty(brokerA2Access, PROPERTY_A1, "properties.view", "VIEW")).resolves.toBe(true);
    await expect(canAccessProperty(brokerA2Access, PROPERTY_A1, "properties.manage", "EDIT")).resolves.toBe(false);

    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["EDIT"], BROKER_A1);
    await expect(canAccessProperty(brokerA2Access, PROPERTY_A1, "properties.manage", "EDIT")).resolves.toBe(true);

    await replaceMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, [], BROKER_A1);
    await expect(canAccessProperty(brokerA2Access, PROPERTY_A1, "properties.view", "VIEW")).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nível HTTP — sobe o realEstateRouter real, com auth/permission/subscription
// middlewares reais, e faz requisições reais via fetch (mesmo padrão de
// mysql-auth-http-isolation.test.ts). Cobre os cenários adversariais A-M do
// escopo, a regra C1 ponta a ponta, e uma checagem de regressão.
// ---------------------------------------------------------------------------

const servers: Server[] = [];

async function request(method: "GET" | "POST" | "PUT" | "DELETE", path: string, token: string | null, body?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use(realEstateRouter);
  app.use(errorHandler);
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind.");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

describe("Fase 2.2B — HTTP adversarial (IDOR / multi-tenant / C1)", () => {
  beforeEach(() => resetState());

  it("[M] 401 sem token", async () => {
    const res = await request("GET", `/properties/${PROPERTY_A1}/access`, null);
    expect(res.status).toBe(401);
  });

  it("[A] GET do property de OUTRA empresa devolve 404 tenant-safe (nunca 403, nunca vaza existência)", async () => {
    const res = await request("GET", `/properties/${PROPERTY_B1}/access`, "token-owner-a");
    expect(res.status).toBe(404);
  });

  it("[B] POST grant em property de outra empresa devolve 404", async () => {
    const res = await request("POST", `/properties/${PROPERTY_B1}/access`, "token-owner-a", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(404);
  });

  it("[C] POST grant com target de outra empresa devolve 422 sem vazar detalhes", async () => {
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a1", { user_id: OWNER_B, permissions: ["VIEW"] });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INVALID_SHARE_TARGET");
  });

  it("[D] (C1) Broker com acesso apenas 'shared' NÃO pode compartilhar (mesmo tendo EDIT concedido)", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW", "EDIT"], BROKER_A1);
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a2", { user_id: BROKER_A3, permissions: ["VIEW"] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("PROPERTY_SHARING_DENIED");
  });

  it("[E] (C1) Broker sem NENHUM acesso ao imóvel: 404 tenant-safe, não 403 (não revela se o imóvel existe)", async () => {
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a3", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(404);
  });

  it("[F] PUT replace por Broker compartilhado (não responsável) é bloqueado", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["EDIT"], BROKER_A1);
    const res = await request("PUT", `/properties/${PROPERTY_A1}/access`, "token-broker-a2", { user_id: BROKER_A3, permissions: ["VIEW"] });
    expect(res.status).toBe(403);
  });

  it("[G] DELETE de um access id usando o propertyId de OUTRO imóvel devolve 404", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    const [row] = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    const res = await request("DELETE", `/properties/${PROPERTY_B1}/access/${row!.id}`, "token-owner-b");
    expect(res.status).toBe(404);
  });

  it("[H] DELETE de um access id de OUTRA empresa (mesmo propertyId manipulado) devolve 404", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    const [row] = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    // owner-b não enxerga sequer o property-a1 (empresa errada) — 404 antes
    // de chegar a avaliar o accessId.
    const res = await request("DELETE", `/properties/${PROPERTY_A1}/access/${row!.id}`, "token-owner-b");
    expect(res.status).toBe(404);
  });

  it("[I] POST grant para si mesmo (auto-compartilhamento) devolve 422", async () => {
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a1", { user_id: BROKER_A1, permissions: ["VIEW"] });
    expect(res.status).toBe(422);
  });

  it("[J] POST grant com permissões duplicadas no array devolve 400", async () => {
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW", "VIEW"] });
    expect(res.status).toBe(400);
  });

  it("[K] POST grant com permissão fora do enum aceito devolve 400", async () => {
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["DELETE_EVERYTHING"] });
    expect(res.status).toBe(400);
  });

  it("[L] company_id/role injetados no corpo da requisição são ignorados (nunca confiar no cliente)", async () => {
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a1", {
      user_id: BROKER_A2,
      permissions: ["VIEW"],
      company_id: COMPANY_B,
      role: "owner",
    } as never);
    expect(res.status).toBe(201);
    const rows = await listMysqlPropertyAccess(COMPANY_A, PROPERTY_A1);
    expect(rows).toHaveLength(1);
    expect(await listMysqlPropertyAccess(COMPANY_B, PROPERTY_A1)).toEqual([]);
  });

  it("[M] 403 quando falta a permissão properties.view (sem token válido de acesso ao módulo)", async () => {
    state.users.find((user) => user.id === BROKER_A3)!.permissionKeys = [];
    const res = await request("GET", `/properties/${PROPERTY_A1}/access`, "token-broker-a3");
    expect(res.status).toBe(403);
  });
});

describe("Fase 2.2B — decisão C1 ponta a ponta (responsável pode; compartilhado e estranho não podem)", () => {
  beforeEach(() => resetState());

  it("responsável (Broker A1) concede e revoga com sucesso", async () => {
    const grant = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(grant.status).toBe(201);
    const accessId = grant.body.access[0].id as string;
    const revoke = await request("DELETE", `/properties/${PROPERTY_A1}/access/${accessId}`, "token-broker-a1");
    expect(revoke.status).toBe(200);
    expect(revoke.body).toMatchObject({ ok: true, access_id: accessId });
  });

  it("Broker apenas com acesso compartilhado tentando re-compartilhar: BLOCKED (403)", async () => {
    await grantMysqlPropertyAccess(COMPANY_A, PROPERTY_A1, BROKER_A2, ["VIEW", "EDIT"], BROKER_A1);
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a2", { user_id: BROKER_A3, permissions: ["VIEW"] });
    expect(res.status).toBe(403);
  });

  it("Broker sem nenhum acesso tentando compartilhar: BLOCKED (404, tenant-safe)", async () => {
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a3", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(404);
  });

  it("registra auditoria em grant e revoke (sem secrets, com metadados mínimos)", async () => {
    const grant = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW"] });
    const accessId = grant.body.access[0].id as string;
    await request("DELETE", `/properties/${PROPERTY_A1}/access/${accessId}`, "token-broker-a1");
    const actions = state.auditLog.map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["property.access_granted", "property.access_revoked"]));
    expect(JSON.stringify(state.auditLog)).not.toMatch(/password|token|secret/i);
  });
});

describe("Fase 2.2B — regressão", () => {
  beforeEach(() => resetState());

  it("Owner (escopo company) continua conseguindo gerenciar compartilhamento sem ser o responsável", async () => {
    const res = await request("POST", `/properties/${PROPERTY_A1}/access`, "token-owner-a", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(201);
  });

  it("GET /properties/:id/access de um imóvel visível funciona normalmente para qualquer viewer com escopo", async () => {
    const res = await request("GET", `/properties/${PROPERTY_A1}/access`, "token-broker-a1");
    expect(res.status).toBe(200);
    expect(res.body.access).toEqual([]);
  });

  it("GET /users lista apenas usuários ativos da mesma empresa com properties.view/manage", async () => {
    const res = await request("GET", "/users", "token-owner-a");
    expect(res.status).toBe(200);
    const ids = (res.body.users as Array<{ id: string }>).map((user) => user.id);
    expect(ids).toEqual(expect.arrayContaining([OWNER_A, BROKER_A1, BROKER_A2, BROKER_A3]));
    expect(ids).not.toContain(OWNER_B);
  });
});
