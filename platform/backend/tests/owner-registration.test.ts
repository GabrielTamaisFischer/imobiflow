import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// C2 — testes do serviço canônico owner-registration.ts.
//
// Padrão já usado em party-identity.test.ts / property-access.test.ts /
// owner-document-isolation.test.ts: mocka-se APENAS o acesso ao banco
// (../src/lib/website-builder-prisma.js) com um fake em memória, e deixa-se
// o código real de serviço (party-identity.ts, mysql-real-estate.ts,
// owner-registration.ts) rodar por cima sem mocks adicionais — isso exercita
// o fluxo real resolveOrCreateParty → ensurePartyRole → PropertyOwner
// exatamente como em produção, inclusive a semântica de concorrência P2002
// de party-identity.ts.
const { state, makeP2002Error } = vi.hoisted(() => {
  const state = {
    parties: [] as Array<Record<string, unknown>>,
    partyRoles: [] as Array<Record<string, unknown>>,
    owners: [] as Array<Record<string, unknown>>,
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
  function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && "not" in (value as Record<string, unknown>)) {
        return row[key] !== (value as Record<string, unknown>).not;
      }
      return row[key] === value;
    });
  }

  const db = {
    party: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return state.parties.find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        await Promise.resolve();
        if (
          data.taxIdNormalized !== null &&
          data.taxIdNormalized !== undefined &&
          state.parties.some((row) => matchesPartyUnique(row, data.companyId as string, data.taxIdNormalized as string))
        ) {
          throw makeP2002Error();
        }
        const row = { id: randomUUID(), ...data };
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
        if (state.partyRoles.some((row) => matchesRoleUnique(row, data.companyId as string, data.partyId as string, data.role as string))) {
          throw makeP2002Error();
        }
        const row = { id: randomUUID(), ...data };
        state.partyRoles.push(row);
        return row;
      },
    },
    propertyOwner: {
      async findFirst({ where }: { where: Record<string, unknown> }) {
        return state.owners.find((row) => matches(row, where)) ?? null;
      },
      async findFirstOrThrow({ where }: { where: Record<string, unknown> }) {
        const row = state.owners.find((r) => matches(r, where));
        if (!row) throw new Error("not found");
        return row;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), ...data };
        state.owners.push(row);
        return row;
      },
      async update({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const row = state.owners.find((r) => r.id === where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        const matched = state.owners.filter((row) => matches(row, where));
        for (const row of matched) Object.assign(row, data, { updatedAt: new Date() });
        return { count: matched.length };
      },
    },
  };

  return { getPrisma: () => db, getWebsiteBuilderPrisma: () => db };
});

import { createOrResolveOwner, updateOwnerCanonical } from "../src/services/owner-registration.js";

const COMPANY_A = "company-a";
const COMPANY_B = "company-b";
const VALID_CPF = "52998224725"; // 529.982.247-25 — CPF de teste válido matematicamente
const VALID_CPF_2 = "11144477735"; // outro CPF válido matematicamente, distinto do acima
const INVALID_CPF = "11111111111"; // dígitos repetidos — reprovado por hasRepeatedDigits
const INVALID_CPF_2 = "22222222222"; // outro CPF inválido, string crua distinta do anterior
const USER_ID = "user-1";

beforeEach(() => {
  state.parties.length = 0;
  state.partyRoles.length = 0;
  state.owners.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("owner-registration — createOrResolveOwner", () => {
  it("[A] novo proprietário com CPF válido: cria Party, garante PartyRole owner e cria PropertyOwner com partyId", async () => {
    const owner = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    expect(owner.party_id).toBeTruthy();
    expect(state.parties).toHaveLength(1);
    expect(state.parties[0].taxIdNormalized).toBe(VALID_CPF);
    expect(state.partyRoles).toHaveLength(1);
    expect(state.partyRoles[0]).toMatchObject({ partyId: owner.party_id, role: "owner", companyId: COMPANY_A });
    expect(state.owners).toHaveLength(1);
    expect(owner.document).toBe(VALID_CPF);
  });

  it("[B] mesmo CPF na mesma empresa reutiliza a Party mas rejeita criação duplicada de proprietário (409)", async () => {
    await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    await expect(
      createOrResolveOwner(COMPANY_A, USER_ID, { name: "Maria da Silva", document: VALID_CPF, owner_type: "individual" }),
    ).rejects.toMatchObject({ statusCode: 409, code: "DUPLICATE_OWNER_DOCUMENT" });
    // Nenhum novo PropertyOwner nem nova Party foi criada pela tentativa rejeitada.
    expect(state.parties).toHaveLength(1);
    expect(state.owners).toHaveLength(1);
  });

  it("[C] Party já existente com outro papel (ex.: buyer) ganha o papel owner sem duplicar a Party", async () => {
    const { party } = await (await import("../src/services/party-identity.js")).resolveOrCreateParty({
      companyId: COMPANY_A,
      name: "Carlos",
      taxId: VALID_CPF,
      partyType: "individual",
    });
    await (await import("../src/services/party-identity.js")).ensurePartyRole(COMPANY_A, party.id as string, "buyer");
    expect(state.partyRoles).toHaveLength(1);

    const owner = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Carlos", document: VALID_CPF, owner_type: "individual" });
    expect(owner.party_id).toBe(party.id);
    expect(state.parties).toHaveLength(1); // nenhuma Party nova
    expect(state.partyRoles).toHaveLength(2); // buyer preservado + owner adicionado
    expect(state.partyRoles.map((r) => r.role).sort()).toEqual(["buyer", "owner"]);
  });

  it("[D] mesmo CPF em empresas diferentes: isolamento total (Party e Owner independentes)", async () => {
    const ownerA = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    const ownerB = await createOrResolveOwner(COMPANY_B, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    expect(ownerA.party_id).not.toBe(ownerB.party_id);
    expect(state.parties).toHaveLength(2);
    expect(state.owners).toHaveLength(2);
  });

  it("[E] CPF inválido: sempre cria nova Party (nunca dedupa) — usando dois valores crus distintos para isolar do guard pré-existente de documento duplicado em PropertyOwner (ensureOwnerDocumentAvailable, que compara string crua, não checksum)", async () => {
    const first = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "X", document: INVALID_CPF, owner_type: "individual" });
    const second = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Y", document: INVALID_CPF_2, owner_type: "individual" });
    expect(first.party_id).not.toBe(second.party_id);
    expect(state.parties).toHaveLength(2);
    expect(state.parties.every((p) => p.taxIdNormalized === null)).toBe(true);
    expect(state.owners).toHaveLength(2);
  });

  it("[F] sem documento: sempre cria nova Party (nunca dedupa)", async () => {
    const first = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Y", owner_type: "individual" });
    const second = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Y", owner_type: "individual" });
    expect(first.party_id).not.toBe(second.party_id);
    expect(state.parties).toHaveLength(2);
  });

  it("[G] concorrência na Party é segura (dedupe real via P2002); dedupe de PropertyOwner é best-effort nesta fase — dívida documentada", async () => {
    // Duas chamadas verdadeiramente simultâneas com o MESMO CPF/empresa:
    // a camada Party nunca duplica (protegida por unique constraint real +
    // P2002, idêntico a party-identity.test.ts [I]). A camada PropertyOwner
    // NÃO possui constraint de banco (@@index, não @@unique — ver seção 5 da
    // C2), então, sob concorrência real, as duas chamadas podem passar pela
    // checagem findExistingOwnerForParty antes de qualquer criação, e ambas
    // criar um PropertyOwner apontando para a MESMA Party. Este teste
    // documenta esse comportamento conhecido/aceito como dívida — e não
        // deve ser lido como uma garantia de unicidade neste nível.
    const [resultA, resultB] = await Promise.allSettled([
      createOrResolveOwner(COMPANY_A, USER_ID, { name: "Concorrente A", document: VALID_CPF, owner_type: "individual" }),
      createOrResolveOwner(COMPANY_A, USER_ID, { name: "Concorrente B", document: VALID_CPF, owner_type: "individual" }),
    ]);
    // A Party nunca duplica, independentemente do resultado dos dois lados.
    expect(state.parties).toHaveLength(1);
    // Pelo menos uma das duas chamadas sempre é bem-sucedida.
    const fulfilled = [resultA, resultB].filter((r) => r.status === "fulfilled");
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
  });

  it("[N] isolamento de tenant: resolução de Party existente nunca atravessa empresa", async () => {
    await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    const ownerB = await createOrResolveOwner(COMPANY_B, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    const partyB = state.parties.find((p) => p.id === ownerB.party_id);
    expect(partyB?.companyId).toBe(COMPANY_B);
  });
});

describe("owner-registration — updateOwnerCanonical", () => {
  it("[H] update sem alterar documento mantém a mesma Party (nenhuma nova resolução é feita)", async () => {
    const created = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    const partiesBefore = state.parties.length;
    const updated = await updateOwnerCanonical(COMPANY_A, created.id as string, { phone: "11999990000" });
    expect(updated.party_id).toBe(created.party_id);
    expect(state.parties).toHaveLength(partiesBefore);
  });

  it("[J] troca de documento em proprietário já vinculado a uma Party é bloqueada (decisão confirmada com o usuário)", async () => {
    const created = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    await expect(
      updateOwnerCanonical(COMPANY_A, created.id as string, { document: VALID_CPF_2 }),
    ).rejects.toMatchObject({ statusCode: 409, code: "OWNER_DOCUMENT_CHANGE_BLOCKED" });
  });

  it("[K] troca de documento para um CPF já vinculado a outra Party também é bloqueada (nunca faz merge silencioso)", async () => {
    const ownerA = await createOrResolveOwner(COMPANY_A, USER_ID, { name: "Maria", document: VALID_CPF, owner_type: "individual" });
    await createOrResolveOwner(COMPANY_A, USER_ID, { name: "João", document: VALID_CPF_2, owner_type: "individual" });
    await expect(
      updateOwnerCanonical(COMPANY_A, ownerA.id as string, { document: VALID_CPF_2 }),
    ).rejects.toMatchObject({ statusCode: 409, code: "OWNER_DOCUMENT_CHANGE_BLOCKED" });
  });

  it("[P] proprietário legado (partyId null) sem documento no update continua funcionando sem lazy-link", async () => {
    state.owners.push({
      id: randomUUID(),
      companyId: COMPANY_A,
      createdBy: USER_ID,
      ownerType: "individual",
      clientType: "proprietario",
      name: "Legado",
      document: VALID_CPF,
      email: null,
      phone: null,
      whatsapp: null,
      residentialPhone: null,
      commercialPhone: null,
      addressJson: {},
      notes: null,
      status: "active",
      portalToken: randomUUID(),
      portalEnabled: true,
      partyId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const legacyOwnerId = state.owners[state.owners.length - 1].id as string;
    const updated = await updateOwnerCanonical(COMPANY_A, legacyOwnerId, { phone: "11988887777" });
    expect(updated.party_id).toBeNull();
    expect(state.parties).toHaveLength(0);
  });

  it("[P] proprietário legado (partyId null) que recebe um document explícito no update dispara lazy-link", async () => {
    state.owners.push({
      id: randomUUID(),
      companyId: COMPANY_A,
      createdBy: USER_ID,
      ownerType: "individual",
      clientType: "proprietario",
      name: "Legado Doc",
      document: VALID_CPF,
      email: null,
      phone: null,
      whatsapp: null,
      residentialPhone: null,
      commercialPhone: null,
      addressJson: {},
      notes: null,
      status: "active",
      portalToken: randomUUID(),
      portalEnabled: true,
      partyId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const legacyOwnerId = state.owners[state.owners.length - 1].id as string;
    const updated = await updateOwnerCanonical(COMPANY_A, legacyOwnerId, { document: VALID_CPF });
    expect(updated.party_id).toBeTruthy();
    expect(state.parties).toHaveLength(1);
    expect(state.parties[0].taxIdNormalized).toBe(VALID_CPF);
    expect(state.partyRoles).toHaveLength(1);
    expect(state.partyRoles[0]).toMatchObject({ role: "owner", partyId: updated.party_id });
  });
});
