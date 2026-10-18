import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, makeP2002Error } = vi.hoisted(() => {
  const state = {
    parties: [] as Array<Record<string, unknown>>,
    partyRoles: [] as Array<Record<string, unknown>>,
    tenantProfiles: [] as Array<Record<string, unknown>>,
  };
  function makeP2002Error() {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
  }
  return { state, makeP2002Error };
});

vi.mock("../src/lib/website-builder-prisma.js", () => {
  function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, value]) => row[key] === value);
  }
  const db = {
    party: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return state.parties.find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        await Promise.resolve();
        if (data.taxIdNormalized && state.parties.some((row) => row.companyId === data.companyId && row.taxIdNormalized === data.taxIdNormalized)) throw makeP2002Error();
        const row = { ...data };
        state.parties.push(row);
        return row;
      },
    },
    partyRole: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return state.partyRoles.find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        await Promise.resolve();
        if (state.partyRoles.some((row) => row.companyId === data.companyId && row.partyId === data.partyId && row.role === data.role)) throw makeP2002Error();
        const row = { ...data };
        state.partyRoles.push(row);
        return row;
      },
    },
    tenantProfile: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return state.tenantProfiles.find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        await Promise.resolve();
        if (state.tenantProfiles.some((row) => row.companyId === data.companyId && row.partyRoleId === data.partyRoleId)) throw makeP2002Error();
        const row = { id: randomUUID(), ...data };
        state.tenantProfiles.push(row);
        return row;
      },
    },
  };
  return { getPrisma: () => db, getWebsiteBuilderPrisma: () => db };
});

import { ensureTenantIdentityForParty, resolveOrCreateTenantIdentity } from "../src/services/tenant-registration.js";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const USER_ID = "user-1";
const VALID_CPF = "52998224725";

beforeEach(() => {
  state.parties.length = 0;
  state.partyRoles.length = 0;
  state.tenantProfiles.length = 0;
});

describe("tenant-registration", () => {
  it("[A] cria Party + tenant role + TenantProfile", async () => {
    const result = await resolveOrCreateTenantIdentity(COMPANY_A, USER_ID, {
      name: "Ana Locataria",
      document: VALID_CPF,
      partyType: "individual",
    });
    expect(result.party.taxIdNormalized).toBe(VALID_CPF);
    expect(result.partyRole.role).toBe("tenant");
    expect(result.tenantProfile.partyRoleId).toBe(result.partyRole.id);
    expect(state.parties).toHaveLength(1);
    expect(state.partyRoles).toHaveLength(1);
    expect(state.tenantProfiles).toHaveLength(1);
  });

  it("[B] mesmo CPF/tenant reutiliza Party, role e profile", async () => {
    const a = await resolveOrCreateTenantIdentity(COMPANY_A, USER_ID, { name: "Ana", document: VALID_CPF });
    const b = await resolveOrCreateTenantIdentity(COMPANY_A, USER_ID, { name: "Ana 2", document: VALID_CPF });
    expect(b.party.id).toBe(a.party.id);
    expect(b.partyRole.id).toBe(a.partyRole.id);
    expect(b.tenantProfile.id).toBe(a.tenantProfile.id);
  });

  it("[C] mesmo CPF em tenant diferente fica isolado", async () => {
    const a = await resolveOrCreateTenantIdentity(COMPANY_A, USER_ID, { name: "Ana", document: VALID_CPF });
    const b = await resolveOrCreateTenantIdentity(COMPANY_B, USER_ID, { name: "Ana", document: VALID_CPF });
    expect(b.party.id).not.toBe(a.party.id);
  });

  it("[D] Party existente de outro papel ganha tenant role sem duplicar Party", async () => {
    const party = { id: randomUUID(), companyId: COMPANY_A, partyType: "individual", name: "Ana", taxId: VALID_CPF, taxIdNormalized: VALID_CPF };
    state.parties.push(party);
    const result = await ensureTenantIdentityForParty(COMPANY_A, String(party.id));
    expect(result.partyRole.partyId).toBe(party.id);
    expect(result.partyRole.role).toBe("tenant");
    expect(state.parties).toHaveLength(1);
    expect(state.tenantProfiles).toHaveLength(1);
  });

  it("[E] concorrencia converge para uma identidade tenant", async () => {
    const [a, b] = await Promise.all([
      resolveOrCreateTenantIdentity(COMPANY_A, USER_ID, { name: "Race A", document: VALID_CPF }),
      resolveOrCreateTenantIdentity(COMPANY_A, USER_ID, { name: "Race B", document: VALID_CPF }),
    ]);
    expect(a.party.id).toBe(b.party.id);
    expect(a.partyRole.id).toBe(b.partyRole.id);
    expect(a.tenantProfile.id).toBe(b.tenantProfile.id);
    expect(state.parties).toHaveLength(1);
    expect(state.partyRoles).toHaveLength(1);
    expect(state.tenantProfiles).toHaveLength(1);
  });
});
