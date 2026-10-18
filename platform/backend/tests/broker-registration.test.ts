import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state, makeP2002Error } = vi.hoisted(() => {
  const state = {
    parties: [] as Array<Record<string, any>>,
    partyRoles: [] as Array<Record<string, any>>,
    brokerProfiles: [] as Array<Record<string, any>>,
    users: [] as Array<Record<string, any>>,
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
  function matches(row: Record<string, any>, where: Record<string, any>) {
    return Object.entries(where).every(([key, value]) => row[key] === value);
  }
  const db: any = {
    party: {
      async findFirst({ where }: any) {
        return state.parties.find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: any) {
        await Promise.resolve();
        if (data.taxIdNormalized && state.parties.some((row) => row.companyId === data.companyId && row.taxIdNormalized === data.taxIdNormalized)) throw makeP2002Error();
        const row = { ...data };
        state.parties.push(row);
        return row;
      },
    },
    partyRole: {
      async findFirst({ where }: any) {
        return state.partyRoles.find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: any) {
        await Promise.resolve();
        if (state.partyRoles.some((row) => row.companyId === data.companyId && row.partyId === data.partyId && row.role === data.role)) throw makeP2002Error();
        const row = { ...data };
        state.partyRoles.push(row);
        return row;
      },
    },
    brokerProfile: {
      async findFirst({ where }: any) {
        return state.brokerProfiles.find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: any) {
        await Promise.resolve();
        if (state.brokerProfiles.some((row) => row.companyId === data.companyId && row.partyRoleId === data.partyRoleId)) throw makeP2002Error();
        const row = { id: randomUUID(), ...data };
        state.brokerProfiles.push(row);
        return row;
      },
      async update({ where, data }: any) {
        const row = state.brokerProfiles.find((item) => item.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    appUser: {
      async findFirst({ where, include }: any) {
        const row = state.users.find((item) => matches(item, where));
        if (!row) return null;
        if (include?.party) return { ...row, party: state.parties.find((p) => p.id === row.partyId) ?? null };
        return row;
      },
      async findFirstOrThrow(args: any) {
        const row = await db.appUser.findFirst(args);
        if (!row) throw new Error("not found");
        return row;
      },
      async updateMany({ where, data }: any) {
        const row = state.users.find((item) => matches(item, where));
        if (!row) return { count: 0 };
        if (data.partyId && state.users.some((item) => item !== row && item.companyId === row.companyId && item.partyId === data.partyId)) throw makeP2002Error();
        Object.assign(row, data);
        return { count: 1 };
      },
    },
  };
  return { getPrisma: () => db, getWebsiteBuilderPrisma: () => db };
});

import { linkAppUserToBrokerIdentity, resolveOrCreateBrokerIdentity } from "../src/services/broker-registration.js";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const CPF = "52998224725";

beforeEach(() => {
  state.parties.length = 0;
  state.partyRoles.length = 0;
  state.brokerProfiles.length = 0;
  state.users.length = 0;
});

describe("broker-registration", () => {
  it("[A] cria Party + broker role + BrokerProfile", async () => {
    const result = await resolveOrCreateBrokerIdentity(COMPANY_A, "user-a", {
      name: "Corretor A",
      document: CPF,
      creciNumber: "123456-F",
    });
    expect(result.party.taxIdNormalized).toBe(CPF);
    expect(result.partyRole.role).toBe("broker");
    expect(result.brokerProfile.creciNumber).toBe("123456-F");
  });

  it("[B] mesmo CPF reutiliza identidade profissional", async () => {
    const first = await resolveOrCreateBrokerIdentity(COMPANY_A, "user-a", { name: "A", document: CPF });
    const second = await resolveOrCreateBrokerIdentity(COMPANY_A, "user-b", { name: "B", document: CPF });
    expect(second.party.id).toBe(first.party.id);
    expect(second.partyRole.id).toBe(first.partyRole.id);
    expect(second.brokerProfile.id).toBe(first.brokerProfile.id);
  });

  it("[C] mesmo CPF em empresas diferentes fica isolado", async () => {
    const first = await resolveOrCreateBrokerIdentity(COMPANY_A, "user-a", { name: "A", document: CPF });
    const second = await resolveOrCreateBrokerIdentity(COMPANY_B, "user-b", { name: "B", document: CPF });
    expect(second.party.id).not.toBe(first.party.id);
  });

  it("[D] vincula AppUser a Party e e idempotente", async () => {
    const user = { id: "user-a", companyId: COMPANY_A, partyId: null, name: "Broker", email: "broker@test" };
    state.users.push(user);
    const first = await linkAppUserToBrokerIdentity(COMPANY_A, user.id, { name: "Broker", document: CPF });
    const second = await linkAppUserToBrokerIdentity(COMPANY_A, user.id, { name: "Broker", document: CPF });
    expect(first.appUser.partyId).toBe(first.party.id);
    expect(second.party.id).toBe(first.party.id);
    expect(state.parties).toHaveLength(1);
    expect(state.partyRoles).toHaveLength(1);
    expect(state.brokerProfiles).toHaveLength(1);
  });

  it("[E] bloqueia troca de CPF em AppUser ja vinculado", async () => {
    const party = { id: randomUUID(), companyId: COMPANY_A, name: "Broker", taxId: CPF, taxIdNormalized: CPF };
    state.parties.push(party);
    state.users.push({ id: "user-a", companyId: COMPANY_A, partyId: party.id, name: "Broker", email: "broker@test" });
    await expect(
      linkAppUserToBrokerIdentity(COMPANY_A, "user-a", { name: "Broker", document: "11144477735" }),
    ).rejects.toMatchObject({ code: "BROKER_DOCUMENT_CHANGE_BLOCKED", statusCode: 409 });
  });

  it("[F] atualiza CRECI/bio sem duplicar BrokerProfile", async () => {
    const user = { id: "user-a", companyId: COMPANY_A, partyId: null, name: "Broker", email: "broker@test" };
    state.users.push(user);
    const first = await linkAppUserToBrokerIdentity(COMPANY_A, user.id, { name: "Broker", document: CPF, creciNumber: "100-F" });
    const second = await linkAppUserToBrokerIdentity(COMPANY_A, user.id, { name: "Broker", document: CPF, creciNumber: "200-F", bioText: "Nova bio" });
    expect(second.brokerProfile.id).toBe(first.brokerProfile.id);
    expect(second.brokerProfile.creciNumber).toBe("200-F");
    expect(second.brokerProfile.bioText).toBe("Nova bio");
  });
});
