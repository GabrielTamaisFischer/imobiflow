import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  users: [companyUser("user-a", "company-a", "owner"), companyUser("user-b", "company-b", "owner")],
  companies: [companyRow("company-a", "Empresa A"), companyRow("company-b", "Empresa B")],
  roles: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      companyId: "company-a",
      name: "Custom A",
      systemKey: null,
      isSystem: false,
      _count: { users: 0, invitations: 0 },
    },
  ],
  resetTokens: [] as Array<Record<string, unknown>>,
  invitations: [] as Array<Record<string, unknown>>,
  updatedPasswordHash: null as string | null,
  revokedSessions: 0,
}));

vi.mock("../src/services/mysql-auth.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/services/mysql-auth.js")>();
  return {
    ...original,
    buildMysqlAccessContextFromToken: vi.fn(async (token: string) => {
      const companyId =
        token === "token-a" || token === "token-manager"
          ? "company-a"
          : token === "token-b"
            ? "company-b"
            : null;
      if (!companyId) return null;
      const user = state.users.find((candidate) => candidate.companyId === companyId)!;
      const role = token === "token-manager" ? "manager" : "owner";
      return {
        sessionId: `session-${companyId}`,
        authUser: { id: user.id, email: user.email, name: user.name },
        appUser: {
          id: user.id,
          company_id: companyId,
          name: user.name,
          email: user.email,
          status: "active",
          role,
          permissions: ["users.manage", "settings.manage"],
        },
        company: { id: companyId, name: companyId, status: "active" },
        subscription: null,
      };
    }),
  };
});

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => fakePrisma() }));

import { authRouter } from "../src/routes/auth.js";
import { errorHandler } from "../src/middleware/error-handler.js";
import { env } from "../src/config/env.js";
import { hashPassword, verifyPassword } from "../src/services/mysql-auth.js";

const servers: Server[] = [];
const originalNodeEnv = env.NODE_ENV;
const originalExposeTokens = env.AUTH_EXPOSE_TEST_TOKENS;

beforeEach(async () => {
  state.resetTokens = [];
  state.invitations = [];
  state.updatedPasswordHash = null;
  state.revokedSessions = 0;
  state.companies[0].name = "Empresa A";
  state.users[0].passwordHash = await hashPassword("Senha-Atual@123");
});

afterEach(async () => {
  env.NODE_ENV = originalNodeEnv;
  env.AUTH_EXPOSE_TEST_TOKENS = originalExposeTokens;
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("HTTP company isolation for identity", () => {
  it("lists only users from the authenticated company and ignores a malicious company_id", async () => {
    const response = await request("GET", "/users?company_id=company-b", "token-a");
    expect(response.status).toBe(200);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0]).toMatchObject({ id: "user-a", company_id: "company-a" });
  });

  it("returns 404 when company B attempts to alter a user from company A", async () => {
    const response = await request("PATCH", "/users/user-a", "token-b", {
      status: "blocked",
      company_id: "company-a",
    });
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("USER_NOT_FOUND");
    expect(state.users.find((user) => user.id === "user-a")?.status).toBe("active");
  });

  it("does not accept legacy, preview or Supabase bearer tokens", async () => {
    for (const token of [
      "still-valid-supabase-token",
      "imobiflow.preview_access",
      "imobiflow.local_dev_access",
    ]) {
      const response = await request("GET", "/session", token);
      expect(response.status).toBe(401);
      expect(response.body.error).toBe("INVALID_TOKEN");
    }
  });

  it("does not let company B delete a custom role from company A", async () => {
    const response = await request("DELETE", "/roles/role-custom-a", "token-b");
    expect(response.status).toBe(404);
    expect(state.roles).toHaveLength(1);
  });

  it("requires an owner or admin role for identity mutations even with users.manage", async () => {
    const response = await request("PATCH", "/users/user-a", "token-manager", {
      status: "blocked",
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("ROLE_REQUIRED");
  });

  it("completes password recovery with a hashed single-use token", async () => {
    env.NODE_ENV = "test";
    env.AUTH_EXPOSE_TEST_TOKENS = "true";
    const requested = await request("POST", "/forgot-password", "", {
      email: "user-a@example.test",
    });
    expect(requested.status).toBe(200);
    expect(requested.body.test_token).toEqual(expect.any(String));
    expect(state.resetTokens[0]?.tokenHash).not.toBe(requested.body.test_token);

    const reset = await request("POST", "/reset-password", "", {
      token: requested.body.test_token,
      new_password: "Nova-Senha@123",
    });
    expect(reset.status).toBe(200);
    expect(state.updatedPasswordHash).toMatch(/^scrypt\$v1\$/);

    const replay = await request("POST", "/reset-password", "", {
      token: requested.body.test_token,
      new_password: "Outra-Senha@123",
    });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("RESET_TOKEN_INVALID");
  });

  it("creates and accepts a company-scoped invitation without storing its raw token", async () => {
    const created = await request("POST", "/invite", "token-a", {
      email: "invited@example.test",
      roleId: "11111111-1111-4111-8111-111111111111",
      company_id: "company-b",
    });
    expect(created.status).toBe(201);
    expect(created.body.invitation).toMatchObject({ company_id: "company-a" });
    const rawToken = new URL(created.body.invite_url).searchParams.get("token")!;
    expect(state.invitations[0]?.tokenHash).not.toBe(rawToken);

    const accepted = await request("POST", "/accept-invite", "", {
      token: rawToken,
      name: "Pessoa Convidada",
      password: "Convite-Seguro@123",
    });
    expect(accepted.status).toBe(201);
    expect(state.users.find((user) => user.email === "invited@example.test")).toMatchObject({
      companyId: "company-a",
      roleId: "11111111-1111-4111-8111-111111111111",
    });

    const replay = await request("POST", "/accept-invite", "", {
      token: rawToken,
      name: "Pessoa Convidada",
      password: "Convite-Seguro@123",
    });
    expect(replay.status).toBe(404);
  });

  it("updates only the authenticated company when another company_id is submitted", async () => {
    const response = await request("PATCH", "/company", "token-a", {
      name: "Empresa A Atualizada",
      company_id: "company-b",
    });
    expect(response.status).toBe(200);
    expect(response.body.company).toMatchObject({
      id: "company-a",
      name: "Empresa A Atualizada",
    });
    expect(state.companies[1].name).toBe("Empresa B");
  });

  it("changes the current password and revokes every existing session", async () => {
    const response = await request("POST", "/change-password", "token-a", {
      current_password: "Senha-Atual@123",
      new_password: "Senha-Nova@1234",
    });
    expect(response.status).toBe(200);
    await expect(verifyPassword("Senha-Nova@1234", state.users[0].passwordHash)).resolves.toBe(
      true,
    );
    expect(state.revokedSessions).toBeGreaterThan(0);
  });
});

function fakePrisma() {
  const transaction = {
    appUser: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        state.users.find((user) => user.email === where.email) ?? null,
      findFirst: async ({ where }: { where: { id: string; companyId: string; status?: string } }) =>
        state.users.find(
          (user) =>
            user.id === where.id &&
            user.companyId === where.companyId &&
            (!where.status || user.status === where.status),
        ) ?? null,
      findFirstOrThrow: async ({ where }: { where: { id: string; companyId: string } }) =>
        state.users.find((user) => user.id === where.id && user.companyId === where.companyId)!,
      count: async () => 1,
      updateMany: async () => ({ count: 0 }),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { passwordHash?: string };
      }) => {
        state.updatedPasswordHash = data.passwordHash ?? null;
        const user = state.users.find((candidate) => candidate.id === where.id)!;
        if (data.passwordHash) user.passwordHash = data.passwordHash;
        return user;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const role = state.roles.find((candidate) => candidate.id === data.roleId)!;
        const now = new Date();
        const created = {
          id: `user-${state.users.length + 1}`,
          companyId: String(data.companyId),
          roleId: String(data.roleId),
          name: String(data.name),
          email: String(data.email),
          phone: data.phone ?? null,
          status: String(data.status),
          createdAt: now,
          updatedAt: now,
          roleRecord: {
            id: role.id,
            companyId: role.companyId,
            name: role.name,
            systemKey: role.systemKey,
          },
        };
        state.users.push(created);
        return created;
      },
    },
    role: {
      findFirst: async ({ where }: { where: { id?: string; companyId: string } }) =>
        state.roles.find((role) => role.id === where.id && role.companyId === where.companyId) ??
        null,
      deleteMany: async ({ where }: { where: { id: string; companyId: string } }) => {
        const index = state.roles.findIndex(
          (role) => role.id === where.id && role.companyId === where.companyId,
        );
        if (index < 0) return { count: 0 };
        state.roles.splice(index, 1);
        return { count: 1 };
      },
    },
    authSession: {
      updateMany: async () => {
        state.revokedSessions += 1;
        return { count: 1 };
      },
    },
    authAuditLog: { create: async () => ({}) },
    passwordResetToken: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const record = state.resetTokens.find((token) => token.tokenHash === where.tokenHash);
        if (!record) return null;
        const user = state.users.find((candidate) => candidate.id === record.userId)!;
        return {
          ...record,
          user: {
            ...user,
            company: { id: user.companyId, name: user.companyId, status: "active" },
          },
        };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id?: string; userId?: string; usedAt: null };
        data: { usedAt: Date };
      }) => {
        let count = 0;
        for (const token of state.resetTokens) {
          const matchesIdentity = where.id ? token.id === where.id : token.userId === where.userId;
          if (matchesIdentity && token.usedAt === where.usedAt) {
            token.usedAt = data.usedAt;
            count += 1;
          }
        }
        return { count };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const record = { id: `reset-${state.resetTokens.length + 1}`, usedAt: null, ...data };
        state.resetTokens.push(record);
        return record;
      },
    },
    userInvitation: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const invitation = state.invitations.find(
          (candidate) => candidate.tokenHash === where.tokenHash,
        );
        if (!invitation) return null;
        const role = state.roles.find((candidate) => candidate.id === invitation.roleId)!;
        return {
          ...invitation,
          role,
          company: { id: invitation.companyId, name: invitation.companyId, status: "active" },
        };
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; status: string };
        data: Record<string, unknown>;
      }) => {
        const invitation = state.invitations.find(
          (candidate) => candidate.id === where.id && candidate.status === where.status,
        );
        if (!invitation) return { count: 0 };
        Object.assign(invitation, data, { updatedAt: new Date() });
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const invitation = state.invitations.find((candidate) => candidate.id === where.id)!;
        Object.assign(invitation, data, { updatedAt: new Date() });
        return invitation;
      },
    },
  };
  return {
    appUser: {
      findMany: async ({ where }: { where: { companyId: string } }) =>
        state.users.filter((user) => user.companyId === where.companyId),
      findUnique: async ({ where }: { where: { email: string } }) => {
        const user = state.users.find((candidate) => candidate.email === where.email);
        return user
          ? { ...user, company: { id: user.companyId, name: user.companyId, status: "active" } }
          : null;
      },
      findFirst: async ({ where }: { where: { id: string; companyId: string; status?: string } }) =>
        state.users.find(
          (user) =>
            user.id === where.id &&
            user.companyId === where.companyId &&
            (!where.status || user.status === where.status),
        ) ?? null,
    },
    company: {
      updateMany: async ({ where, data }: { where: { id: string }; data: { name?: string } }) => {
        const company = state.companies.find((candidate) => candidate.id === where.id);
        if (!company) return { count: 0 };
        Object.assign(company, data);
        return { count: 1 };
      },
      findFirstOrThrow: async ({ where }: { where: { id: string } }) =>
        state.companies.find((company) => company.id === where.id)!,
    },
    role: {
      findFirst: async ({ where }: { where: { id: string; companyId: string } }) =>
        state.roles.find((role) => role.id === where.id && role.companyId === where.companyId) ??
        null,
    },
    userInvitation: {
      findFirst: async ({ where }: { where: { email: string; status: string } }) =>
        state.invitations.find(
          (invitation) => invitation.email === where.email && invitation.status === where.status,
        ) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const role = state.roles.find((candidate) => candidate.id === data.roleId)!;
        const now = new Date();
        const invitation = {
          id: `invitation-${state.invitations.length + 1}`,
          acceptedAt: null,
          createdAt: now,
          updatedAt: now,
          status: "pending",
          ...data,
          role,
        };
        state.invitations.push(invitation);
        return invitation;
      },
    },
    authAuditLog: { create: async () => ({}) },
    $transaction: async (callback: (database: typeof transaction) => unknown) =>
      callback(transaction),
  };
}

function companyUser(id: string, companyId: string, systemKey: string) {
  const now = new Date();
  return {
    id,
    companyId,
    roleId: `role-${companyId}`,
    name: id,
    email: `${id}@example.test`,
    phone: null,
    passwordHash: null as string | null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    roleRecord: { id: `role-${companyId}`, companyId, name: "Dono", systemKey },
  };
}

function companyRow(id: string, name: string) {
  const now = new Date();
  return {
    id,
    name,
    document: null,
    phone: null,
    email: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
}

async function request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  token: string,
  body?: Record<string, unknown>,
) {
  const app = express();
  app.use(express.json());
  app.use(authRouter);
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
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      users: Array<{ id: string; company_id: string }>;
      error: string;
      message: string;
      test_token: string;
      invite_url: string;
      invitation: { company_id: string };
      company: { id: string; name: string };
    },
  };
}
