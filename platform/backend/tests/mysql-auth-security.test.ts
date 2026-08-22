import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import {
  assertPasswordPolicy,
  buildMysqlAccessContextForUser,
  buildMysqlAccessContextFromToken,
  createSession,
  hashPassword,
  hashOpaqueToken,
  loginWithMysql,
  refreshMysqlSession,
  verifyAccessToken,
  verifyPassword,
} from "../src/services/mysql-auth.js";

const originalSecret = env.JWT_SECRET;

beforeEach(() => {
  env.JWT_SECRET = "test-only-jwt-secret-with-at-least-32-characters";
});

afterEach(() => {
  env.JWT_SECRET = originalSecret;
});

describe("MySQL password and JWT boundary", () => {
  it("hashes passwords with a random scrypt salt and verifies only the correct password", async () => {
    const first = await hashPassword("Senha-Forte@123");
    const second = await hashPassword("Senha-Forte@123");

    expect(first).toMatch(/^scrypt\$v1\$/);
    expect(first).not.toBe(second);
    await expect(verifyPassword("Senha-Forte@123", first)).resolves.toBe(true);
    await expect(verifyPassword("senha-incorreta", first)).resolves.toBe(false);
  });

  it.each([
    "curta",
    "apenasminusculas123!",
    "APENASMAIUSCULAS123!",
    "SemNumero!abc",
    "SemSimbolo123Abc",
  ])("rejects a weak password: %s", (password) =>
    expect(() => assertPasswordPolicy(password)).toThrowError(),
  );

  it("issues a standard expiring HS256 JWT and rejects tampering", async () => {
    let storedSession: Record<string, unknown> | null = null;
    const database = {
      authSession: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          storedSession = data;
          return data;
        },
      },
    } as never;
    const created = await createSession("user-a", "company-a", {}, database);
    const token = created.publicSession.access_token;

    expect(token.split(".")).toHaveLength(3);
    expect(verifyAccessToken(token)).toMatchObject({
      sub: "user-a",
      company_id: "company-a",
      type: "access",
    });
    expect(verifyAccessToken(`${token.slice(0, -1)}x`)).toBeNull();
    expect(storedSession).toMatchObject({ userId: "user-a", companyId: "company-a" });
  });

  it("rotates the refresh credential atomically so a replay cannot win twice", async () => {
    const session = {
      id: "11111111-1111-4111-8111-111111111111",
      companyId: "company-a",
      userId: "user-a",
      accessTokenJti: "22222222-2222-4222-8222-222222222222",
      refreshTokenHash: "",
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      ipAddress: null,
      userAgent: null,
      user: { ...userRow(), roleRecord: roleRow("company-a") },
    };
    const refreshToken = `${session.id}.refresh-secret-with-more-than-thirty-two-characters`;
    session.refreshTokenHash = hashOpaqueToken(refreshToken);
    let rotationAvailable = true;
    const database = {
      authSession: {
        findFirst: async () => session,
        updateMany: async () => ({
          count: rotationAvailable ? ((rotationAvailable = false), 1) : 0,
        }),
      },
      appUser: { findFirst: async () => userRow() },
      subscription: { findFirst: async () => null },
    } as never;

    await expect(refreshMysqlSession(refreshToken, {}, database)).resolves.toHaveProperty(
      "session.access_token",
    );
    await expect(refreshMysqlSession(refreshToken, {}, database)).rejects.toMatchObject({
      code: "INVALID_SESSION",
    });
  });

  it("completes a MySQL login with persisted session and role permissions", async () => {
    const passwordHash = await hashPassword("Senha-Forte@123");
    const user = userRow({ passwordHash });
    const sessionCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
    const permissionCreateMany = vi.fn(async () => ({ count: 1 }));
    const roleCreateMany = vi.fn(async () => ({ count: 1 }));
    const rolePermissionCreateMany = vi.fn(async () => ({ count: 1 }));
    const database = {
      appUser: {
        findUnique: async () => user,
        update: vi.fn(async () => user),
        findFirst: async () => user,
      },
      permission: {
        createMany: permissionCreateMany,
        findMany: async () => [{ id: "permission-users.manage", key: "users.manage" }],
      },
      role: {
        createMany: roleCreateMany,
        findMany: async () => [{ id: "role-owner", systemKey: "owner" }],
      },
      rolePermission: { createMany: rolePermissionCreateMany },
      authSession: { create: sessionCreate },
      authAuditLog: { create: async () => ({}) },
      subscription: { findFirst: async () => null },
    } as never;

    const response = await loginWithMysql("A@Example.Test", "Senha-Forte@123", {}, database);
    expect(response.session.access_token.split(".")).toHaveLength(3);
    expect(response.access).toMatchObject({
      appUser: { id: "user-a", company_id: "company-a", permissions: ["users.manage"] },
    });
    expect(sessionCreate).toHaveBeenCalledOnce();
    expect(permissionCreateMany).not.toHaveBeenCalled();
    expect(roleCreateMany).not.toHaveBeenCalled();
    expect(rolePermissionCreateMany).not.toHaveBeenCalled();
  });
});

describe("canonical MySQL access context", () => {
  it("derives company, role and permissions only from MySQL records", async () => {
    const context = await buildMysqlAccessContextForUser("user-a", "company-a", accessDatabase());
    expect(context).toMatchObject({
      authUser: { id: "user-a", email: "a@example.test" },
      appUser: { company_id: "company-a", role: "owner", permissions: ["users.manage"] },
      company: { id: "company-a", status: "active" },
    });
  });

  it.each([
    { user: null, label: "missing internal user" },
    { user: userRow({ status: "inactive" }), label: "inactive internal user" },
    {
      user: userRow({ company: { id: "company-a", name: "A", status: "inactive" } }),
      label: "inactive company",
    },
    { user: userRow({ roleRecord: roleRow("company-b") }), label: "role from another company" },
  ])("rejects $label", async ({ user }) => {
    await expect(
      buildMysqlAccessContextForUser("user-a", "company-a", accessDatabase(user)),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it("rejects an otherwise valid JWT after the persisted session is revoked", async () => {
    let storedSession: Record<string, unknown> | null = null;
    const database = accessDatabase();
    database.authSession = {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        storedSession = data;
        return data;
      },
      findFirst: async () => null,
    };
    const created = await createSession("user-a", "company-a", {}, database as never);

    await expect(
      buildMysqlAccessContextFromToken(created.publicSession.access_token, database as never),
    ).resolves.toBeNull();
    expect(storedSession).not.toBeNull();
  });
});

function accessDatabase(user: ReturnType<typeof userRow> | null = userRow()) {
  return {
    appUser: { findFirst: async () => user },
    subscription: {
      findFirst: async () => ({ id: "sub-a", status: "active", planSlug: "test", expiresAt: null }),
    },
    authSession: {} as Record<string, unknown>,
  };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-a",
    companyId: "company-a",
    roleId: "role-a",
    name: "Usuario A",
    email: "a@example.test",
    phone: null,
    passwordHash: null,
    status: "active",
    role: "owner",
    permissionsJson: [],
    passwordChangedAt: null,
    lastLoginAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    company: { id: "company-a", name: "A", status: "active" },
    roleRecord: roleRow("company-a"),
    ...overrides,
  };
}

function roleRow(companyId: string) {
  return {
    id: "role-a",
    companyId,
    name: "Dono",
    systemKey: "owner",
    isSystem: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissions: [
      { permission: { id: "permission-a", key: "users.manage", description: "Gerenciar" } },
    ],
  };
}
