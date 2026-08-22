import { describe, expect, it, vi } from "vitest";
import { updateCompanyUser } from "../src/services/user-management.js";

describe("company-scoped user management", () => {
  it("returns not found instead of mutating a user from another company", async () => {
    const fixture = databaseFixture({ target: null });
    await expect(
      updateCompanyUser({
        prisma: fixture.prisma,
        companyId: "company-a",
        actorUserId: "owner-a",
        actorRole: "owner",
        targetUserId: "user-b",
        update: { status: "blocked" },
      }),
    ).rejects.toMatchObject({ code: "USER_NOT_FOUND", statusCode: 404 });
    expect(fixture.updateMany).not.toHaveBeenCalled();
  });

  it("protects the last active owner from demotion or deactivation", async () => {
    const fixture = databaseFixture({ activeOwners: 1 });
    await expect(
      updateCompanyUser({
        prisma: fixture.prisma,
        companyId: "company-a",
        actorUserId: "owner-a",
        actorRole: "owner",
        targetUserId: "owner-a",
        update: { status: "inactive" },
      }),
    ).rejects.toMatchObject({ code: "LAST_OWNER_PROTECTED", statusCode: 409 });
    expect(fixture.updateMany).not.toHaveBeenCalled();
  });

  it("allows an owner transition when another active owner remains", async () => {
    const fixture = databaseFixture({ activeOwners: 2 });
    await expect(
      updateCompanyUser({
        prisma: fixture.prisma,
        companyId: "company-a",
        actorUserId: "owner-a",
        actorRole: "owner",
        targetUserId: "owner-a",
        update: { roleSystemKey: "admin" },
      }),
    ).resolves.toMatchObject({ id: "owner-a", companyId: "company-a" });
    expect(fixture.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "owner-a", companyId: "company-a" },
      }),
    );
  });

  it("does not allow a non-owner to grant or alter the owner role", async () => {
    const fixture = databaseFixture({ target: ownerUser() });
    await expect(
      updateCompanyUser({
        prisma: fixture.prisma,
        companyId: "company-a",
        actorUserId: "admin-a",
        actorRole: "admin",
        targetUserId: "owner-a",
        update: { status: "blocked" },
      }),
    ).rejects.toMatchObject({ code: "OWNER_ROLE_REQUIRED", statusCode: 403 });
  });
});

function databaseFixture(
  options: { target?: ReturnType<typeof ownerUser> | null; activeOwners?: number } = {},
) {
  const target = options.target === undefined ? ownerUser() : options.target;
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const transaction = {
    appUser: {
      findFirst: vi.fn(async () => target),
      findFirstOrThrow: vi.fn(async () => target),
      count: vi.fn(async () => options.activeOwners ?? 1),
      updateMany,
    },
    role: {
      findFirst: vi.fn(async ({ where }: { where: { systemKey: string } }) => ({
        id: `role-${where.systemKey}`,
        companyId: "company-a",
        name: where.systemKey,
        systemKey: where.systemKey,
      })),
    },
    authSession: { updateMany: vi.fn(async () => ({ count: 1 })) },
    authAuditLog: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (database: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  } as never;
  return { prisma, updateMany };
}

function ownerUser() {
  return {
    id: "owner-a",
    companyId: "company-a",
    roleId: "role-owner",
    name: "Owner A",
    email: "owner-a@example.test",
    phone: null,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    roleRecord: { id: "role-owner", companyId: "company-a", name: "Dono", systemKey: "owner" },
  };
}
