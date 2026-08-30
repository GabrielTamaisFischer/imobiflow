import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  findPropertyForCompany,
  searchPropertiesForCompany,
  type PropertyListInput,
} from "../src/services/mysql-real-estate.js";

// Item 1/17 do escopo: serviço central de busca multi-tenant de Property.
// Este teste é o "teste cross-tenant explícito" pedido — empresa A precisa
// encontrar seu próprio imóvel (por id E por código), e empresa B, mesmo
// tentando o MESMO código, nunca pode encontrá-lo. Um fake de banco em
// memória simula a tabela `properties` de verdade e aplica o filtro
// companyId como o MySQL aplicaria, para provar que a cláusula WHERE
// realmente chega até a query — não só que a função foi chamada com os
// parâmetros certos.

const COMPANY_A = "company-a-906164";
const COMPANY_B = "company-b-outsider";

const propertyRow = {
  id: "property-906164",
  companyId: COMPANY_A,
  code: "906164",
  title: "Imovel Taboao",
  street: "Rua Taboao",
  neighborhood: "Taboao",
  city: "Sao Bernardo do Campo",
  ownerId: null,
  owner: null,
  media: [],
};

function buildFakeDatabase() {
  const rows = [propertyRow];

  const property = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return rows.find((row) => matchesWhere(row, where)) ?? null;
    }),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return rows.filter((row) => matchesWhere(row, where));
    }),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return rows.filter((row) => matchesWhere(row, where)).length;
    }),
  };

  return {
    property,
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
  } as unknown as PrismaClient & { property: typeof property };
}

function matchesWhere(row: typeof propertyRow, where: Record<string, unknown>): boolean {
  if (where.companyId !== undefined && row.companyId !== where.companyId) return false;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.code !== undefined && row.code !== where.code) return false;
  if (where.OR) {
    const clauses = where.OR as Array<Record<string, { contains: string }>>;
    return clauses.some((clause) => {
      const [field, condition] = Object.entries(clause)[0] as [string, { contains: string }];
      const value = (row as Record<string, unknown>)[field];
      return typeof value === "string" && value.toLowerCase().includes(condition.contains.toLowerCase());
    });
  }
  return true;
}

describe("serviço central de busca multi-tenant de Property (cross-tenant)", () => {
  it("a empresa dona do imóvel encontra por id", async () => {
    const database = buildFakeDatabase();
    const result = await findPropertyForCompany(COMPANY_A, { id: "property-906164" }, database);
    expect(result.id).toBe("property-906164");
  });

  it("a empresa dona do imóvel encontra por código (906164)", async () => {
    const database = buildFakeDatabase();
    const result = await findPropertyForCompany(COMPANY_A, { code: "906164" }, database);
    expect(result.code).toBe("906164");
  });

  it("OUTRA empresa NUNCA encontra o mesmo imóvel pelo mesmo código", async () => {
    const database = buildFakeDatabase();
    await expect(findPropertyForCompany(COMPANY_B, { code: "906164" }, database)).rejects.toThrow(/não encontrado/i);
  });

  it("OUTRA empresa NUNCA encontra o mesmo imóvel pelo mesmo id", async () => {
    const database = buildFakeDatabase();
    await expect(findPropertyForCompany(COMPANY_B, { id: "property-906164" }, database)).rejects.toThrow(/não encontrado/i);
  });

  it("busca central: a empresa dona encontra por bairro (taboao)", async () => {
    const database = buildFakeDatabase();
    const input: PropertyListInput = { page: 1, pageSize: 25, search: "taboao" };
    const result = await searchPropertiesForCompany(COMPANY_A, input, database);
    expect(result.pagination.total).toBe(1);
    expect(result.items[0]?.id).toBe("property-906164");
  });

  it("busca central: OUTRA empresa buscando o mesmo termo (taboao) não vê nada", async () => {
    const database = buildFakeDatabase();
    const input: PropertyListInput = { page: 1, pageSize: 25, search: "taboao" };
    const result = await searchPropertiesForCompany(COMPANY_B, input, database);
    expect(result.pagination.total).toBe(0);
    expect(result.items).toEqual([]);
  });
});
