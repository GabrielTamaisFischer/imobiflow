import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fase 2.2C — Compartilhamento explícito de Lead (LeadAccess).
//
// Mesma estrutura de dois níveis já homologada em property-access.test.ts
// (Fase 2.2B), adaptada para Lead/assignedTo:
//  - Nível de serviço: um fake de banco em memória exercita as cláusulas
//    WHERE reais de grant/replace/revoke/list e de resolveLeadShareTarget.
//  - Nível HTTP: sobe o crmRouter de verdade num servidor efêmero e faz
//    requisições reais com tokens de diferentes usuários/empresas, provando
//    401/403/404 ponta a ponta (adversarial IDOR/multi-tenant, decisão C1,
//    idempotência, regressão).

// Ids de usuário em formato UUID (mesma convenção de property-access.test.ts
// — user_id no payload de grant/replace é validado como z.string().uuid()).
const {
  COMPANY_A,
  COMPANY_B,
  LEAD_A1,
  LEAD_B1,
  OWNER_A,
  ADMIN_A,
  MANAGER_A,
  BROKER_A1,
  BROKER_A2,
  BROKER_A3,
  OWNER_B,
} = vi.hoisted(() => ({
  COMPANY_A: "company-a",
  COMPANY_B: "company-b",
  LEAD_A1: "lead-a1",
  LEAD_B1: "lead-b1",
  OWNER_A: "00000000-0000-4000-9000-00000000000a",
  ADMIN_A: "00000000-0000-4000-9000-0000000000ad",
  MANAGER_A: "00000000-0000-4000-9000-0000000000ma",
  BROKER_A1: "00000000-0000-4000-9000-0000000000a1", // assignedTo do lead-a1
  BROKER_A2: "00000000-0000-4000-9000-0000000000a2", // sem grant algum (recebe grants nos testes)
  BROKER_A3: "00000000-0000-4000-9000-0000000000a3", // sem nenhum acesso ao lead-a1
  OWNER_B: "00000000-0000-4000-9000-00000000000b", // dono da empresa B (cross-tenant)
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
  leads: [] as Array<{ id: string; companyId: string; assignedTo: string | null }>,
  access: [] as Array<{
    id: string;
    companyId: string;
    leadId: string;
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
    fakeUser(ADMIN_A, COMPANY_A, "admin", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(MANAGER_A, COMPANY_A, "manager", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(BROKER_A1, COMPANY_A, "broker", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(BROKER_A2, COMPANY_A, "broker", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(BROKER_A3, COMPANY_A, "broker", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
    fakeUser(OWNER_B, COMPANY_B, "owner", ["properties.view", "properties.manage", "crm.view", "crm.manage"]),
  ];
  state.leads = [
    { id: LEAD_A1, companyId: COMPANY_A, assignedTo: BROKER_A1 },
    { id: LEAD_B1, companyId: COMPANY_B, assignedTo: OWNER_B },
  ];
  state.access = [];
  state.auditLog = [];
  state.seq = 0;
}

// ---------------------------------------------------------------------------
// Fake Prisma — reimplementa só o suficiente das cláusulas WHERE realmente
// usadas por authorization.ts / routes/crm.ts, para exercitar o código de
// produção real (não apenas verificar que ele "chamou a função certa").
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

function matchesLeadWhere(row: (typeof state.leads)[number], where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as Record<string, unknown>[]).every((clause) => matchesLeadWhere(row, clause));
    if (key === "OR") return (condition as Record<string, unknown>[]).some((clause) => matchesLeadWhere(row, clause));
    if (key === "accessGrants") {
      const some = (condition as { some: Record<string, unknown> }).some;
      return state.access.some((grant) => grant.leadId === row.id && matchesAccessWhere(grant, some));
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
  const leadModel = {
    // NB: o `select` do Prisma real é um mapa de booleans dizendo QUAIS
    // campos retornar, nunca dados — nunca fazer spread dele sobre a linha
    // (isso sobrescreveria id/assignedTo com `true`). Este fake ignora
    // `select` e sempre devolve a linha "rica o bastante" (id/assignedTo
    // reais + stubs para os demais campos que leadSelect também pede).
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = state.leads.find((lead) => matchesLeadWhere(lead, where));
      if (!row) return null;
      return {
        id: row.id,
        companyId: row.companyId,
        assignedTo: row.assignedTo,
        stageId: null,
        name: "Lead QA",
        email: null,
        phone: null,
        source: "manual",
        interestType: "not_defined",
        status: "open",
        lostReason: null,
        budgetCents: null,
        propertyReference: null,
        notes: null,
        firstContactAt: null,
        lastContactAt: null,
        nextFollowUpAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }),
  };

  const leadAccessModel = {
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
    upsert: vi.fn(async ({ where, create, update }: { where: { leadId_userId_permission: { leadId: string; userId: string; permission: string } }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
      const key = where.leadId_userId_permission;
      const existing = state.access.find(
        (candidate) => candidate.leadId === key.leadId && candidate.userId === key.userId && candidate.permission === key.permission,
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
    lead: leadModel,
    leadAccess: leadAccessModel,
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
    "token-admin-a": { userId: ADMIN_A, role: "admin", scope: "company" },
    "token-manager-a": { userId: MANAGER_A, role: "manager", scope: "company" },
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
  grantLeadAccess,
  listLeadAccess,
  replaceLeadAccess,
  resolveLeadShareTarget,
  revokeLeadAccess,
} from "../src/routes/crm.js";
import { canAccessLead, canManageLeadSharing } from "../src/services/authorization.js";
import { crmRouter } from "../src/routes/crm.js";
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
        "crm.view": scope,
        "crm.manage": scope,
      },
    },
    company: { id: companyId, name: companyId, status: "active" },
    subscription: { id: "sub", status: "ACTIVE", plan_slug: "qa", expires_at: null, grace_ends_at: null },
  };
}

describe("Fase 2.2C — serviço de LeadAccess (grant/replace/revoke/list)", () => {
  beforeEach(() => resetState());

  it("resolveLeadShareTarget aceita um AppUser ativo da mesma empresa com crm.view/manage", async () => {
    const target = await resolveLeadShareTarget(COMPANY_A, BROKER_A2, BROKER_A1);
    expect(target.id).toBe(BROKER_A2);
  });

  it("resolveLeadShareTarget bloqueia auto-compartilhamento (#22)", async () => {
    await expect(resolveLeadShareTarget(COMPANY_A, BROKER_A1, BROKER_A1)).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_SHARE_TARGET",
    });
  });

  it("resolveLeadShareTarget bloqueia usuário de outra empresa — cross-tenant (#20)", async () => {
    await expect(resolveLeadShareTarget(COMPANY_A, OWNER_B, BROKER_A1)).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_SHARE_TARGET",
    });
  });

  it("resolveLeadShareTarget bloqueia usuário inativo (#21)", async () => {
    state.users.find((user) => user.id === BROKER_A2)!.status = "inactive";
    await expect(resolveLeadShareTarget(COMPANY_A, BROKER_A2, BROKER_A1)).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_SHARE_TARGET",
    });
  });

  it("resolveLeadShareTarget bloqueia alvo inelegível (sem crm.view/crm.manage) (#23)", async () => {
    state.users.push(fakeUser("00000000-0000-4000-9000-0000000000f1", COMPANY_A, "financial", ["finance.view"]));
    await expect(resolveLeadShareTarget(COMPANY_A, "00000000-0000-4000-9000-0000000000f1", BROKER_A1)).rejects.toMatchObject({
      statusCode: 422,
      code: "INVALID_SHARE_TARGET",
    });
  });

  it("grantLeadAccess é aditivo: conceder EDIT não remove um VIEW já concedido", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["EDIT"], BROKER_A1);
    const rows = await listLeadAccess(COMPANY_A, LEAD_A1);
    expect(rows.map((row) => row.permission).sort()).toEqual(["EDIT", "VIEW"]);
  });

  it("grantLeadAccess é idempotente: POST repetido não duplica (#16)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    const rows = await listLeadAccess(COMPANY_A, LEAD_A1);
    expect(rows.filter((row) => row.permission === "VIEW")).toHaveLength(1);
  });

  it("replaceLeadAccess deixa o resultado final EXATAMENTE igual ao conjunto pedido (#17)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW", "EDIT", "VISIT"], BROKER_A1);
    await replaceLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["EDIT", "NEGOTIATE"], BROKER_A1);
    const rows = await listLeadAccess(COMPANY_A, LEAD_A1);
    expect(rows.map((row) => row.permission).sort()).toEqual(["EDIT", "NEGOTIATE"]);
  });

  it("replaceLeadAccess com lista vazia revoga todas as permissões daquele usuário (#18)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW", "EDIT"], BROKER_A1);
    await replaceLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, [], BROKER_A1);
    const rows = await listLeadAccess(COMPANY_A, LEAD_A1);
    expect(rows).toEqual([]);
  });

  it("revokeLeadAccess remove exatamente uma linha e retorna null em id inexistente/cross-tenant (#15/#27)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    const [row] = await listLeadAccess(COMPANY_A, LEAD_A1);
    await expect(revokeLeadAccess(COMPANY_B, LEAD_A1, row!.id)).resolves.toBeNull();
    await expect(revokeLeadAccess(COMPANY_A, LEAD_B1, row!.id)).resolves.toBeNull();
    await expect(revokeLeadAccess(COMPANY_A, LEAD_A1, "does-not-exist")).resolves.toBeNull();
    const revoked = await revokeLeadAccess(COMPANY_A, LEAD_A1, row!.id);
    expect(revoked?.userId).toBe(BROKER_A2);
    expect(await listLeadAccess(COMPANY_A, LEAD_A1)).toEqual([]);
  });

  it("revogar um VIEW explícito não derruba o VIEW implícito por EDIT (implicação de permissões) (#12)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW", "EDIT"], BROKER_A1);
    const viewRow = (await listLeadAccess(COMPANY_A, LEAD_A1)).find((row) => row.permission === "VIEW")!;
    await revokeLeadAccess(COMPANY_A, LEAD_A1, viewRow.id);
    await expect(canAccessLead(accessOf(BROKER_A2, "broker", COMPANY_A), LEAD_A1)).resolves.toBe(true);
  });

  it("listLeadAccess nunca retorna dados de outra empresa/lead — nenhuma linha fantasma (#19)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await grantLeadAccess(COMPANY_B, LEAD_B1, OWNER_B, ["VIEW"], OWNER_B);
    const rows = await listLeadAccess(COMPANY_A, LEAD_A1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: BROKER_A2, lead_id: LEAD_A1 });
    expect(JSON.stringify(rows)).not.toContain(COMPANY_B);
  });
});

describe("Fase 2.2C — canManageLeadSharing (C1)", () => {
  beforeEach(() => resetState());

  it("Owner/Admin/Manager em company scope podem gerenciar (#1/#2/#3)", () => {
    for (const [id, role] of [[OWNER_A, "owner"], [ADMIN_A, "admin"], [MANAGER_A, "manager"]] as const) {
      const access = accessOf(id, role, COMPANY_A, "company");
      expect(canManageLeadSharing(access)).toBe(true);
      expect(canManageLeadSharing(access, { assignedTo: BROKER_A1 })).toBe(true);
      expect(canManageLeadSharing(access, null)).toBe(true);
    }
  });

  it("Broker responsável (assignedTo === si mesmo) pode gerenciar (#4)", () => {
    const brokerA1 = accessOf(BROKER_A1, "broker", COMPANY_A);
    expect(canManageLeadSharing(brokerA1, { assignedTo: BROKER_A1 })).toBe(true);
  });

  it("Broker apenas compartilhado (não responsável) NÃO pode gerenciar (#5)", () => {
    const brokerA2 = accessOf(BROKER_A2, "broker", COMPANY_A);
    expect(canManageLeadSharing(brokerA2, { assignedTo: BROKER_A1 })).toBe(false);
    expect(canManageLeadSharing(brokerA2, null)).toBe(false);
    expect(canManageLeadSharing(brokerA2)).toBe(false);
  });

  it("Broker sem nenhum acesso/responsabilidade NÃO pode gerenciar (#6)", () => {
    const brokerA3 = accessOf(BROKER_A3, "broker", COMPANY_A);
    expect(canManageLeadSharing(brokerA3, { assignedTo: BROKER_A1 })).toBe(false);
  });
});

describe("Fase 2.2C — fluxo semântico completo grant → uso → revoke", () => {
  beforeEach(() => resetState());

  it("Broker sem grant não vê o Lead; VIEW concede leitura; VIEW não concede edição; EDIT concede edição (#7/#8/#9/#10)", async () => {
    const brokerA2Access = accessOf(BROKER_A2, "broker", COMPANY_A);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.view", "VIEW")).resolves.toBe(false);

    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.view", "VIEW")).resolves.toBe(true);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.manage", "EDIT")).resolves.toBe(false);

    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["EDIT"], BROKER_A1);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.manage", "EDIT")).resolves.toBe(true);
  });

  it("remover EDIT retira edição mas VIEW continua após a remoção (#11)", async () => {
    const brokerA2Access = accessOf(BROKER_A2, "broker", COMPANY_A);
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW", "EDIT"], BROKER_A1);
    await replaceLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.manage", "EDIT")).resolves.toBe(false);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.view", "VIEW")).resolves.toBe(true);
  });

  it("revogação total remove o acesso por completo (#13)", async () => {
    const brokerA2Access = accessOf(BROKER_A2, "broker", COMPANY_A);
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await replaceLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, [], BROKER_A1);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.view", "VIEW")).resolves.toBe(false);
  });

  it("assignedTo não muda com o compartilhamento (#33)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW", "EDIT", "NEGOTIATE"], BROKER_A1);
    await replaceLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    await revokeLeadAccess(COMPANY_A, LEAD_A1, (await listLeadAccess(COMPANY_A, LEAD_A1))[0]!.id);
    expect(state.leads.find((lead) => lead.id === LEAD_A1)!.assignedTo).toBe(BROKER_A1);
  });

  it("permissões granulares (VISIT/INSPECT/NEGOTIATE) persistem e implicam VIEW, sem inventar endpoint funcional novo", async () => {
    const brokerA2Access = accessOf(BROKER_A2, "broker", COMPANY_A);
    await replaceLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["INSPECT"], BROKER_A1);
    expect((await listLeadAccess(COMPANY_A, LEAD_A1)).map((row) => row.permission)).toEqual(["INSPECT"]);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.view", "VIEW")).resolves.toBe(true);
    await expect(canAccessLead(brokerA2Access, LEAD_A1, "crm.manage", "EDIT")).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nível HTTP — sobe o crmRouter real, com auth/permission/subscription
// middlewares reais, e faz requisições reais via fetch (mesmo padrão de
// property-access.test.ts). Cobre os cenários adversariais, a regra C1
// ponta a ponta, IDOR/spoof, idempotência via HTTP e regressão.
// ---------------------------------------------------------------------------

const servers: Server[] = [];

async function request(method: "GET" | "POST" | "PUT" | "DELETE", path: string, token: string | null, body?: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use(crmRouter);
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

describe("Fase 2.2C — HTTP adversarial (IDOR / multi-tenant / C1)", () => {
  beforeEach(() => resetState());

  it("[M] 401 sem token", async () => {
    const res = await request("GET", `/leads/${LEAD_A1}/access`, null);
    expect(res.status).toBe(401);
  });

  it("[A] GET do lead de OUTRA empresa devolve 404 tenant-safe (#26)", async () => {
    const res = await request("GET", `/leads/${LEAD_B1}/access`, "token-owner-a");
    expect(res.status).toBe(404);
  });

  it("[B] POST grant em lead de outra empresa devolve 404 (#26)", async () => {
    const res = await request("POST", `/leads/${LEAD_B1}/access`, "token-owner-a", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(404);
  });

  it("[C] POST grant com target de outra empresa devolve 422 sem vazar detalhes (#20)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: OWNER_B, permissions: ["VIEW"] });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe("INVALID_SHARE_TARGET");
  });

  it("[D] (C1/C3) Broker com acesso apenas 'shared' NÃO pode re-compartilhar (mesmo tendo EDIT/NEGOTIATE concedidos)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW", "EDIT", "NEGOTIATE"], BROKER_A1);
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a2", { user_id: BROKER_A3, permissions: ["VIEW"] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("LEAD_SHARING_DENIED");
  });

  it("[E] (C1) Broker sem NENHUM acesso ao lead: 404 tenant-safe, não 403 (não revela se o lead existe)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a3", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(404);
  });

  it("[F] PUT replace por Broker compartilhado (não responsável) é bloqueado", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["EDIT"], BROKER_A1);
    const res = await request("PUT", `/leads/${LEAD_A1}/access`, "token-broker-a2", { user_id: BROKER_A3, permissions: ["VIEW"] });
    expect(res.status).toBe(403);
  });

  it("[G] DELETE de um access id usando o leadId de OUTRO lead devolve 404 (#26)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    const [row] = await listLeadAccess(COMPANY_A, LEAD_A1);
    const res = await request("DELETE", `/leads/${LEAD_B1}/access/${row!.id}`, "token-owner-b");
    expect(res.status).toBe(404);
  });

  it("[H] DELETE de um access id de OUTRA empresa (mesmo leadId manipulado) devolve 404 (#27)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW"], BROKER_A1);
    const [row] = await listLeadAccess(COMPANY_A, LEAD_A1);
    const res = await request("DELETE", `/leads/${LEAD_A1}/access/${row!.id}`, "token-owner-b");
    expect(res.status).toBe(404);
  });

  it("[I] POST grant para si mesmo (auto-compartilhamento) devolve 422 (#22)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A1, permissions: ["VIEW"] });
    expect(res.status).toBe(422);
  });

  it("[J] POST grant com permissões duplicadas no array devolve 400 (#31)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW", "VIEW"] });
    expect(res.status).toBe(400);
  });

  it("[K] POST grant com permissão fora do enum aceito devolve 400 (#30)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["DELETE_EVERYTHING"] });
    expect(res.status).toBe(400);
  });

  it("[L] company_id/role injetados no corpo da requisição são ignorados (#24/#25)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", {
      user_id: BROKER_A2,
      permissions: ["VIEW"],
      company_id: COMPANY_B,
      companyId: COMPANY_B,
      role: "owner",
    } as never);
    expect(res.status).toBe(201);
    const rows = await listLeadAccess(COMPANY_A, LEAD_A1);
    expect(rows).toHaveLength(1);
    expect(await listLeadAccess(COMPANY_B, LEAD_A1)).toEqual([]);
  });

  it("[M] 403 quando falta a permissão crm.view (sem token válido de acesso ao módulo)", async () => {
    state.users.find((user) => user.id === BROKER_A3)!.permissionKeys = [];
    const res = await request("GET", `/leads/${LEAD_A1}/access`, "token-broker-a3");
    expect(res.status).toBe(403);
  });

  it("[N] payload malformado (sem user_id) devolve 400 (#29)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { permissions: ["VIEW"] } as never);
    expect(res.status).toBe(400);
  });

  it("[O] userId cross-tenant como alvo do grant devolve 422, não vaza empresa (#28)", async () => {
    const res = await request("PUT", `/leads/${LEAD_A1}/access`, "token-owner-a", { user_id: OWNER_B, permissions: ["VIEW"] });
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body)).not.toContain(COMPANY_B);
  });
});

describe("Fase 2.2C — decisão C1 ponta a ponta (responsável pode; compartilhado e estranho não podem)", () => {
  beforeEach(() => resetState());

  it("responsável (Broker A1) concede e revoga com sucesso", async () => {
    const grant = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(grant.status).toBe(201);
    const accessId = grant.body.access[0].id as string;
    const revoke = await request("DELETE", `/leads/${LEAD_A1}/access/${accessId}`, "token-broker-a1");
    expect(revoke.status).toBe(200);
    expect(revoke.body).toMatchObject({ ok: true, access_id: accessId });
  });

  it("Broker apenas com acesso compartilhado tentando re-compartilhar: BLOCKED (403) (#5)", async () => {
    await grantLeadAccess(COMPANY_A, LEAD_A1, BROKER_A2, ["VIEW", "EDIT"], BROKER_A1);
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a2", { user_id: BROKER_A3, permissions: ["VIEW"] });
    expect(res.status).toBe(403);
  });

  it("Broker sem nenhum acesso tentando compartilhar: BLOCKED (404, tenant-safe) (#6)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a3", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(404);
  });

  it("Admin (company scope) pode gerenciar sem ser o responsável (#2)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-admin-a", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(201);
  });

  it("Manager (company scope) pode gerenciar sem ser o responsável (#3)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-manager-a", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(201);
  });

  it("registra auditoria em grant, updated (PUT) e revoke — sem secrets (#37/#38/#39)", async () => {
    const grant = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW"] });
    const accessId = grant.body.access[0].id as string;
    await request("PUT", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW", "EDIT"] });
    await request("DELETE", `/leads/${LEAD_A1}/access/${accessId}`, "token-broker-a1");
    const actions = state.auditLog.map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(["lead.access_granted", "lead.access_updated", "lead.access_revoked"]));
    expect(JSON.stringify(state.auditLog)).not.toMatch(/password|token|secret/i);
  });

  it("idempotência via HTTP: POST repetido do mesmo grant não duplica linha (#16)", async () => {
    await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW"] });
    const res2 = await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res2.status).toBe(201);
    const rows = await listLeadAccess(COMPANY_A, LEAD_A1);
    expect(rows.filter((row) => row.user_id === BROKER_A2 && row.permission === "VIEW")).toHaveLength(1);
  });

  it("PUT vazio via HTTP remove tudo (#18)", async () => {
    await request("POST", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: ["VIEW", "EDIT"] });
    const res = await request("PUT", `/leads/${LEAD_A1}/access`, "token-broker-a1", { user_id: BROKER_A2, permissions: [] });
    expect(res.status).toBe(200);
    expect(res.body.access).toEqual([]);
    expect(await listLeadAccess(COMPANY_A, LEAD_A1)).toEqual([]);
  });
});

describe("Fase 2.2C — regressão (assignedTo, Owner/Admin/Manager, Broker, 2.2B intacto)", () => {
  beforeEach(() => resetState());

  it("Owner (escopo company) continua conseguindo gerenciar compartilhamento sem ser o responsável (#34)", async () => {
    const res = await request("POST", `/leads/${LEAD_A1}/access`, "token-owner-a", { user_id: BROKER_A2, permissions: ["VIEW"] });
    expect(res.status).toBe(201);
  });

  it("compartilhamento não altera assignedTo do Lead (#32/#33)", async () => {
    const before = state.leads.find((lead) => lead.id === LEAD_A1)!.assignedTo;
    await request("POST", `/leads/${LEAD_A1}/access`, "token-owner-a", { user_id: BROKER_A2, permissions: ["VIEW", "EDIT"] });
    expect(state.leads.find((lead) => lead.id === LEAD_A1)!.assignedTo).toBe(before);
    expect(before).toBe(BROKER_A1);
  });

  it("GET /leads/:id/access de um lead visível funciona normalmente para qualquer viewer com escopo (#35)", async () => {
    const res = await request("GET", `/leads/${LEAD_A1}/access`, "token-broker-a1");
    expect(res.status).toBe(200);
    expect(res.body.access).toEqual([]);
  });

  it("GET /crm/users (reaproveitado, sem endpoint duplicado) lista apenas usuários ativos da mesma empresa com crm.view/manage", async () => {
    const res = await request("GET", "/users", "token-owner-a");
    expect(res.status).toBe(200);
    const ids = (res.body.users as Array<{ id: string }>).map((user) => user.id);
    expect(ids).toEqual(expect.arrayContaining([OWNER_A, ADMIN_A, MANAGER_A, BROKER_A1, BROKER_A2, BROKER_A3]));
    expect(ids).not.toContain(OWNER_B);
  });

  it("Broker continua restrito a own/shared para leitura de Lead (Fase 2.1, sem regressão) (#34)", async () => {
    const brokerA3Access = accessOf(BROKER_A3, "broker", COMPANY_A);
    await expect(canAccessLead(brokerA3Access, LEAD_A1, "crm.view", "VIEW")).resolves.toBe(false);
  });
});
