import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Padrão já usado em property-access.test.ts: vi.mock de topo é elevado
// acima de qualquer `const` normal do módulo, então todo estado referenciado
// dentro do factory precisa nascer dentro de vi.hoisted().
//
// Importante: o erro simulado precisa ser uma instância REAL de
// Prisma.PrismaClientKnownRequestError (não um Error genérico com .code
// forjado) — o serviço real (party-identity.ts) usa
// `error instanceof Prisma.PrismaClientKnownRequestError` para decidir se é
// uma violação de unique constraint. Um Error genérico, mesmo com
// error.code = "P2002", não passaria esse `instanceof` e quebraria o
// tratamento de concorrência — foi exatamente o que a primeira versão deste
// teste pegou (os cenários [I] e [L] falhavam até essa correção).
const { state, makeP2002Error } = vi.hoisted(() => {
  const state = {
    parties: [] as Array<Record<string, unknown>>,
    partyRoles: [] as Array<Record<string, unknown>>,
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
  function matchesPartyUnique(row: Record<string, unknown>, companyId: string, taxIdNormalized: string) {
    return row.companyId === companyId && row.taxIdNormalized === taxIdNormalized;
  }

  function matchesRoleUnique(row: Record<string, unknown>, companyId: string, partyId: string, role: string) {
    return row.companyId === companyId && row.partyId === partyId && row.role === role;
  }

  const prisma = {
    party: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return (
          state.parties.find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) ?? null
        );
      },
      async create({ data }: { data: Record<string, unknown> }) {
        // Yield uma vez antes de checar+gravar: isso permite que duas
        // chamadas "simultâneas" (Promise.all) tenham suas continuações
        // ordenadas pela fila de microtasks, exatamente como um UNIQUE
        // constraint real deixaria só a primeira gravação passar.
        await Promise.resolve();
        if (
          data.taxIdNormalized !== null &&
          data.taxIdNormalized !== undefined &&
          state.parties.some((row) => matchesPartyUnique(row, data.companyId as string, data.taxIdNormalized as string))
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
        return (
          state.partyRoles.find((row) =>
            Object.entries(where).every(([key, value]) => row[key] === value),
          ) ?? null
        );
      },
      async create({ data }: { data: Record<string, unknown> }) {
        await Promise.resolve();
        if (
          state.partyRoles.some((row) =>
            matchesRoleUnique(row, data.companyId as string, data.partyId as string, data.role as string),
          )
        ) {
          throw makeP2002Error();
        }
        const row = { ...data };
        state.partyRoles.push(row);
        return row;
      },
    },
  };

  return { getPrisma: () => prisma, getWebsiteBuilderPrisma: () => prisma };
});

import { ensurePartyRole, resolveOrCreateParty, resolvePartyTaxIdNormalized } from "../src/services/party-identity.js";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const VALID_CPF = "52998224725"; // 529.982.247-25 — CPF de teste publicamente conhecido como válido matematicamente
const VALID_CPF_FORMATTED = "529.982.247-25";
const INVALID_CPF = "11111111111"; // dígitos repetidos — reprovado por hasRepeatedDigits
const VALID_CNPJ = "11222333000181"; // 11.222.333/0001-81

beforeEach(() => {
  state.parties.length = 0;
  state.partyRoles.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("party-identity — normalização/validação de documento", () => {
  it("documento ausente -> null", () => {
    expect(resolvePartyTaxIdNormalized(null)).toBeNull();
    expect(resolvePartyTaxIdNormalized(undefined)).toBeNull();
    expect(resolvePartyTaxIdNormalized("")).toBeNull();
  });

  it("CPF inválido -> null (nunca dedupa)", () => {
    expect(resolvePartyTaxIdNormalized(INVALID_CPF)).toBeNull();
  });

  it("CPF válido -> normalizado", () => {
    expect(resolvePartyTaxIdNormalized(VALID_CPF)).toBe(VALID_CPF);
  });

  it("CNPJ válido -> normalizado", () => {
    expect(resolvePartyTaxIdNormalized(VALID_CNPJ)).toBe(VALID_CNPJ);
  });

  it("entrada formatada é normalizada corretamente (cenário H)", () => {
    expect(resolvePartyTaxIdNormalized(VALID_CPF_FORMATTED)).toBe(VALID_CPF);
  });
});

describe("party-identity — resolveOrCreateParty", () => {
  it("[A] Party sem documento cria nova com taxIdNormalized = null", async () => {
    const { party, created } = await resolveOrCreateParty({ companyId: COMPANY_A, name: "Fulano" });
    expect(created).toBe(true);
    expect(party.taxIdNormalized).toBeNull();
  });

  it("[B] duas chamadas sem documento criam Parties distintas (nunca dedupa)", async () => {
    const first = await resolveOrCreateParty({ companyId: COMPANY_A, name: "Fulano" });
    const second = await resolveOrCreateParty({ companyId: COMPANY_A, name: "Fulano" });
    expect(first.party.id).not.toBe(second.party.id);
    expect(state.parties).toHaveLength(2);
  });

  it("[C] CPF válido cria Party com taxIdNormalized correto", async () => {
    const { party, created } = await resolveOrCreateParty({
      companyId: COMPANY_A,
      name: "Maria",
      taxId: VALID_CPF,
      partyType: "individual",
    });
    expect(created).toBe(true);
    expect(party.taxIdNormalized).toBe(VALID_CPF);
  });

  it("[D] mesmo CPF válido na mesma empresa reutiliza a mesma Party", async () => {
    const first = await resolveOrCreateParty({ companyId: COMPANY_A, name: "Maria", taxId: VALID_CPF, partyType: "individual" });
    const second = await resolveOrCreateParty({ companyId: COMPANY_A, name: "Maria da Silva", taxId: VALID_CPF_FORMATTED, partyType: "individual" });
    expect(second.created).toBe(false);
    expect(second.party.id).toBe(first.party.id);
    expect(state.parties).toHaveLength(1);
  });

  it("[E] mesmo CPF válido em empresas diferentes cria/reutiliza Parties independentes", async () => {
    const companyA = await resolveOrCreateParty({ companyId: COMPANY_A, name: "Maria", taxId: VALID_CPF, partyType: "individual" });
    const companyB = await resolveOrCreateParty({ companyId: COMPANY_B, name: "Maria", taxId: VALID_CPF, partyType: "individual" });
    expect(companyA.party.id).not.toBe(companyB.party.id);
    expect(companyA.party.companyId).toBe(COMPANY_A);
    expect(companyB.party.companyId).toBe(COMPANY_B);
    expect(state.parties).toHaveLength(2);
  });

  it("[F] CPF inválido -> taxIdNormalized null, nunca dedupa", async () => {
    const first = await resolveOrCreateParty({ companyId: COMPANY_A, name: "X", taxId: INVALID_CPF, partyType: "individual" });
    const second = await resolveOrCreateParty({ companyId: COMPANY_A, name: "X", taxId: INVALID_CPF, partyType: "individual" });
    expect(first.party.taxIdNormalized).toBeNull();
    expect(second.party.taxIdNormalized).toBeNull();
    expect(first.party.id).not.toBe(second.party.id);
    expect(state.parties).toHaveLength(2);
  });

  it("[G] CNPJ válido normaliza e reutiliza corretamente", async () => {
    const first = await resolveOrCreateParty({ companyId: COMPANY_A, name: "Imobi LTDA", taxId: VALID_CNPJ, partyType: "company" });
    const second = await resolveOrCreateParty({ companyId: COMPANY_A, name: "Imobi LTDA", taxId: VALID_CNPJ, partyType: "company" });
    expect(first.party.taxIdNormalized).toBe(VALID_CNPJ);
    expect(second.created).toBe(false);
    expect(second.party.id).toBe(first.party.id);
  });

  it("[I] concorrência: duas tentativas simultâneas com o mesmo CPF/empresa devolvem a mesma Party, só uma linha é criada", async () => {
    const [resultA, resultB] = await Promise.all([
      resolveOrCreateParty({ companyId: COMPANY_A, name: "Concorrente A", taxId: VALID_CPF, partyType: "individual" }),
      resolveOrCreateParty({ companyId: COMPANY_A, name: "Concorrente B", taxId: VALID_CPF, partyType: "individual" }),
    ]);
    expect(resultA.party.id).toBe(resultB.party.id);
    expect(state.parties).toHaveLength(1);
    // Exatamente uma das duas chamadas deve ter efetivamente criado a linha.
    expect([resultA.created, resultB.created].filter(Boolean)).toHaveLength(1);
  });

  it("[O] reaproveitar uma Party existente nunca sobrescreve campos já preenchidos", async () => {
    const first = await resolveOrCreateParty({
      companyId: COMPANY_A,
      name: "Maria Original",
      taxId: VALID_CPF,
      partyType: "individual",
      email: "maria@original.com",
    });
    const second = await resolveOrCreateParty({
      companyId: COMPANY_A,
      name: "Nome Diferente",
      taxId: VALID_CPF,
      partyType: "individual",
      email: "outro@email.com",
    });
    expect(second.party.id).toBe(first.party.id);
    expect(second.party.name).toBe("Maria Original");
    expect(second.party.email).toBe("maria@original.com");
  });

  it("[N] companyId ausente/vazio é rejeitado — nenhum fallback implícito existe", async () => {
    await expect(
      resolveOrCreateParty({ companyId: "", name: "X" }),
    ).rejects.toMatchObject({ code: "COMPANY_REQUIRED", statusCode: 403 });
  });
});

describe("party-identity — ensurePartyRole", () => {
  async function seedParty(companyId: string) {
    const { party } = await resolveOrCreateParty({ companyId, name: "Corretor Teste" });
    return party;
  }

  it("[J] cria nova PartyRole", async () => {
    const party = await seedParty(COMPANY_A);
    const { partyRole, created } = await ensurePartyRole(COMPANY_A, party.id as string, "broker");
    expect(created).toBe(true);
    expect(partyRole.role).toBe("broker");
    expect(partyRole.partyId).toBe(party.id);
  });

  it("[K] chamada repetida não duplica a PartyRole", async () => {
    const party = await seedParty(COMPANY_A);
    const first = await ensurePartyRole(COMPANY_A, party.id as string, "owner");
    const second = await ensurePartyRole(COMPANY_A, party.id as string, "owner");
    expect(second.created).toBe(false);
    expect(second.partyRole.id).toBe(first.partyRole.id);
    expect(state.partyRoles).toHaveLength(1);
  });

  it("[L] concorrência: duas chamadas simultâneas para a mesma (company, party, role) ficam idempotentes", async () => {
    const party = await seedParty(COMPANY_A);
    const [roleA, roleB] = await Promise.all([
      ensurePartyRole(COMPANY_A, party.id as string, "buyer"),
      ensurePartyRole(COMPANY_A, party.id as string, "buyer"),
    ]);
    expect(roleA.partyRole.id).toBe(roleB.partyRole.id);
    expect(state.partyRoles).toHaveLength(1);
    expect([roleA.created, roleB.created].filter(Boolean)).toHaveLength(1);
  });

  it("[M] isolamento de tenant: partyId de outra empresa nunca ganha papel nesta empresa", async () => {
    const partyInA = await seedParty(COMPANY_A);
    await expect(
      ensurePartyRole(COMPANY_B, partyInA.id as string, "owner"),
    ).rejects.toMatchObject({ code: "PARTY_NOT_FOUND", statusCode: 404 });
    expect(state.partyRoles).toHaveLength(0);
  });

  it("[N] companyId ausente/vazio é rejeitado em ensurePartyRole também", async () => {
    const party = await seedParty(COMPANY_A);
    await expect(
      ensurePartyRole("", party.id as string, "owner"),
    ).rejects.toMatchObject({ code: "COMPANY_REQUIRED", statusCode: 403 });
  });

  it("rejeita role fora da lista permitida nesta fase", async () => {
    const party = await seedParty(COMPANY_A);
    await expect(
      ensurePartyRole(COMPANY_A, party.id as string, "guarantor" as never),
    ).rejects.toMatchObject({ code: "PARTY_ROLE_INVALID", statusCode: 400 });
  });
});
