import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, makeP2002Error } = vi.hoisted(() => {
  const state = {
    parties: [] as Array<Record<string, unknown>>,
    partyRoles: [] as Array<Record<string, unknown>>,
    buyerProfiles: [] as Array<Record<string, unknown>>,
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
        if (
          data.taxIdNormalized &&
          state.parties.some(
            (row) =>
              row.companyId === data.companyId &&
              row.taxIdNormalized === data.taxIdNormalized,
          )
        ) {
          throw makeP2002Error();
        }
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
        if (
          state.partyRoles.some(
            (row) =>
              row.companyId === data.companyId &&
              row.partyId === data.partyId &&
              row.role === data.role,
          )
        ) {
          throw makeP2002Error();
        }
        const row = { ...data };
        state.partyRoles.push(row);
        return row;
      },
    },
    buyerProfile: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return state.buyerProfiles.find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        await Promise.resolve();
        if (
          state.buyerProfiles.some(
            (row) =>
              row.companyId === data.companyId &&
              row.partyRoleId === data.partyRoleId,
          )
        ) {
          throw makeP2002Error();
        }
        const row = { id: randomUUID(), ...data };
        state.buyerProfiles.push(row);
        return row;
      },
    },
  };

  return { getPrisma: () => db, getWebsiteBuilderPrisma: () => db };
});

import { resolveOrCreateBuyerIdentity } from "../src/services/buyer-registration.js";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const USER_ID = "user-1";
const VALID_CPF = "52998224725";

beforeEach(() => {
  state.parties.length = 0;
  state.partyRoles.length = 0;
  state.buyerProfiles.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("buyer-registration — resolveOrCreateBuyerIdentity", () => {
  it("[A] cria Party + PartyRole buyer + BuyerProfile para CPF novo", async () => {
    const result = await resolveOrCreateBuyerIdentity(COMPANY_A, USER_ID, {
      name: "Maria",
      document: VALID_CPF,
      partyType: "individual",
      email: "maria@example.com",
    });

    expect(result.created).toEqual({
      party: true,
      partyRole: true,
      buyerProfile: true,
    });
    expect(result.party.taxIdNormalized).toBe(VALID_CPF);
    expect(result.partyRole.role).toBe("buyer");
    expect(result.buyerProfile.partyRoleId).toBe(result.partyRole.id);
    expect(state.parties).toHaveLength(1);
    expect(state.partyRoles).toHaveLength(1);
    expect(state.buyerProfiles).toHaveLength(1);
  });

  it("[B] mesmo CPF na mesma empresa reutiliza Party, role e profile", async () => {
    const first = await resolveOrCreateBuyerIdentity(COMPANY_A, USER_ID, {
      name: "Maria",
      document: VALID_CPF,
      partyType: "individual",
    });
    const second = await resolveOrCreateBuyerIdentity(COMPANY_A, USER_ID, {
      name: "Maria novamente",
      document: VALID_CPF,
      partyType: "individual",
    });

    expect(second.party.id).toBe(first.party.id);
    expect(second.partyRole.id).toBe(first.partyRole.id);
    expect(second.buyerProfile.id).toBe(first.buyerProfile.id);
    expect(second.created).toEqual({
      party: false,
      partyRole: false,
      buyerProfile: false,
    });
    expect(state.parties).toHaveLength(1);
    expect(state.partyRoles).toHaveLength(1);
    expect(state.buyerProfiles).toHaveLength(1);
  });

  it("[C] mesmo CPF em empresas diferentes mantém isolamento total", async () => {
    const a = await resolveOrCreateBuyerIdentity(COMPANY_A, USER_ID, {
      name: "Maria",
      document: VALID_CPF,
      partyType: "individual",
    });
    const b = await resolveOrCreateBuyerIdentity(COMPANY_B, USER_ID, {
      name: "Maria",
      document: VALID_CPF,
      partyType: "individual",
    });

    expect(a.party.id).not.toBe(b.party.id);
    expect(a.partyRole.id).not.toBe(b.partyRole.id);
    expect(a.buyerProfile.id).not.toBe(b.buyerProfile.id);
    expect(state.parties).toHaveLength(2);
    expect(state.partyRoles).toHaveLength(2);
    expect(state.buyerProfiles).toHaveLength(2);
  });

  it("[D] concorrência do mesmo CPF converge para uma Party/role/profile", async () => {
    const [a, b] = await Promise.all([
      resolveOrCreateBuyerIdentity(COMPANY_A, USER_ID, {
        name: "Concorrente A",
        document: VALID_CPF,
        partyType: "individual",
      }),
      resolveOrCreateBuyerIdentity(COMPANY_A, USER_ID, {
        name: "Concorrente B",
        document: VALID_CPF,
        partyType: "individual",
      }),
    ]);

    expect(a.party.id).toBe(b.party.id);
    expect(a.partyRole.id).toBe(b.partyRole.id);
    expect(a.buyerProfile.id).toBe(b.buyerProfile.id);
    expect(state.parties).toHaveLength(1);
    expect(state.partyRoles).toHaveLength(1);
    expect(state.buyerProfiles).toHaveLength(1);
  });
});
