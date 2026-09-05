import { type Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Fase 4C — Leads e negociações no Portal do Proprietário. Cobertura da
// função de resumo (loadMysqlOwnerPortalLeadsSummary) e do payload HTTP
// (GET /public/portals/owners/:token, campo leads_summary por imóvel).
// Prisma/MySQL sempre mockado, nunca banco real.

const { database } = vi.hoisted(() => ({
  database: {
    propertyOwner: { findFirst: vi.fn(), update: vi.fn() },
    company: { findFirst: vi.fn() },
    property: { findMany: vi.fn() },
    siteLead: { findMany: vi.fn() },
    lead: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
  },
}));

vi.mock("../src/lib/website-builder-prisma.js", () => ({ getPrisma: () => database }));

vi.mock("../src/lib/supabase.js", () => ({
  supabaseAdmin: {
    from(table: string) {
      if (table === "owner_transfers" || table === "financial_charges") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({ limit: async () => ({ data: [], error: null }) }),
              }),
            }),
          }),
        };
      }
      if (table === "portal_access_logs") {
        return { insert: async () => ({ error: null }) };
      }
      throw new Error(`Unexpected supabase table in test: ${table}`);
    },
  },
}));

import { loadMysqlOwnerPortalLeadsSummary } from "../src/services/mysql-real-estate.js";
import { publicPortalsRouter } from "../src/routes/public-portals.js";

const OWNER_TOKEN = "33333333-3333-4333-8333-333333333333";

function ownerFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "owner-a",
    companyId: "company-a",
    ownerType: "individual",
    name: "Maria Proprietária",
    document: "52998224725",
    email: "maria@example.test",
    phone: "+55 41 90000-0000",
    whatsapp: "+55 41 90000-0000",
    status: "active",
    ...overrides,
  };
}

function propertyFixture(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    code: `COD-${id}`,
    title: `Imóvel ${id}`,
    operation: "sale",
    status: "available",
    neighborhood: "Centro",
    city: "Curitiba",
    state: "PR",
    rentPriceCents: null,
    salePriceCents: 400_000_00,
    ...overrides,
  };
}

const servers: Server[] = [];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("loadMysqlOwnerPortalLeadsSummary (service layer)", () => {
  it("returns an empty map without querying the DB when there are no properties", async () => {
    const result = await loadMysqlOwnerPortalLeadsSummary("company-a", []);
    expect(result.size).toBe(0);
    expect(database.siteLead.findMany).not.toHaveBeenCalled();
  });

  it("an owner/property with zero leads gets a deterministic sem_interesse summary", async () => {
    database.siteLead.findMany.mockResolvedValue([]);
    database.appointment.findMany.mockResolvedValue([]);

    const result = await loadMysqlOwnerPortalLeadsSummary("company-a", ["p1"]);
    expect(result.get("p1")).toEqual({
      total_interessados: 0,
      visitas_agendadas: 0,
      ultimo_interesse_em: null,
      origem: null,
      estagio: null,
      status: "sem_interesse",
      corretor_responsavel: null,
    });
  });

  it("counts leads correctly for a single property and reports the most advanced open stage", async () => {
    const now = new Date("2026-09-06T14:30:00.000Z");
    database.siteLead.findMany.mockResolvedValue([
      { propertyId: "p1", leadId: "lead-1", createdAt: now },
      { propertyId: "p1", leadId: "lead-2", createdAt: new Date("2026-09-05T10:00:00.000Z") },
    ]);
    database.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        status: "open",
        source: "site",
        updatedAt: now,
        stage: { name: "Visita", position: 3 },
        assignee: { name: "Marina Souza" },
      },
      {
        id: "lead-2",
        status: "open",
        source: "whatsapp",
        updatedAt: new Date("2026-09-04T10:00:00.000Z"),
        stage: { name: "Atendimento", position: 2 },
        assignee: null,
      },
    ]);
    database.appointment.findMany.mockResolvedValue([{ propertyId: "p1" }]);

    const result = await loadMysqlOwnerPortalLeadsSummary("company-a", ["p1"]);
    const summary = result.get("p1")!;
    expect(summary.total_interessados).toBe(2);
    expect(summary.visitas_agendadas).toBe(1);
    expect(summary.status).toBe("em_andamento");
    // lead-1 tem o estágio mais avançado (position 3 > 2) — deve vencer, mesmo
    // não sendo o SiteLead mais recente por leadId (é, aqui, mas o critério é
    // position desc, não recência do SiteLead).
    expect(summary.estagio).toBe("Visita");
    expect(summary.corretor_responsavel).toBe("Marina Souza");
    expect(summary.ultimo_interesse_em).toBe(now.toISOString());
    expect(summary.origem).toBe("site");
  });

  it("does not mix leads/counts across properties (isolamento por imóvel)", async () => {
    database.siteLead.findMany.mockResolvedValue([
      { propertyId: "p1", leadId: "lead-1", createdAt: new Date("2026-09-05T10:00:00.000Z") },
      { propertyId: "p2", leadId: "lead-2", createdAt: new Date("2026-09-05T11:00:00.000Z") },
      { propertyId: "p2", leadId: "lead-3", createdAt: new Date("2026-09-05T12:00:00.000Z") },
    ]);
    database.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        status: "open",
        source: "site",
        updatedAt: new Date(),
        stage: { name: "Novo lead", position: 1 },
        assignee: null,
      },
      {
        id: "lead-2",
        status: "won",
        source: "site",
        updatedAt: new Date(),
        stage: null,
        assignee: { name: "Eduardo" },
      },
      {
        id: "lead-3",
        status: "lost",
        source: "site",
        updatedAt: new Date(),
        stage: null,
        assignee: null,
      },
    ]);
    database.appointment.findMany.mockResolvedValue([]);

    const result = await loadMysqlOwnerPortalLeadsSummary("company-a", ["p1", "p2"]);
    expect(result.get("p1")).toMatchObject({ total_interessados: 1, status: "em_andamento" });
    // p2 tem um lead won e um lost: won vence na prioridade (em_andamento > fechado > perdido).
    expect(result.get("p2")).toMatchObject({
      total_interessados: 2,
      status: "fechado",
      corretor_responsavel: "Eduardo",
    });
  });

  it("scopes leads by companyId — a leadId that does not belong to the given company is ignored", async () => {
    database.siteLead.findMany.mockResolvedValue([
      { propertyId: "p1", leadId: "lead-of-other-company", createdAt: new Date() },
    ]);
    // O mock de lead.findMany já simula a cláusula where.companyId da query real
    // (a implementação sempre passa companyId no where) — aqui simulamos o
    // resultado real: nenhum lead retorna porque não pertence à empresa.
    database.lead.findMany.mockResolvedValue([]);
    database.appointment.findMany.mockResolvedValue([]);

    const result = await loadMysqlOwnerPortalLeadsSummary("company-a", ["p1"]);
    // total_interessados conta o leadId do SiteLead (join-key), mas o
    // estágio/status ficam "sem_interesse" pois o lead não foi encontrado
    // dentro do escopo da empresa — nenhum dado de outra empresa vaza.
    expect(result.get("p1")).toMatchObject({
      status: "sem_interesse",
      estagio: null,
      corretor_responsavel: null,
    });
  });

  it("ignores SiteLead rows without a linked property (propertyId null)", async () => {
    database.siteLead.findMany.mockResolvedValue([
      { propertyId: null, leadId: "lead-x", createdAt: new Date() },
    ]);
    database.lead.findMany.mockResolvedValue([]);
    database.appointment.findMany.mockResolvedValue([]);

    const result = await loadMysqlOwnerPortalLeadsSummary("company-a", ["p1"]);
    expect(result.get("p1")?.total_interessados).toBe(0);
  });
});

async function requestPublicPortal(path: string) {
  const app = express();
  app.use(publicPortalsRouter);
  app.use(
    (
      error: { statusCode?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(error.statusCode ?? 500)
        .json({ message: error.message, code: (error as { code?: string }).code });
    },
  );
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not bind to a TCP port.");
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("GET /public/portals/owners/:token — leads_summary (Fase 4C)", () => {
  it("keeps full backward compatibility: existing fields stay intact and leads_summary is additive", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([propertyFixture("p1")]);
    database.siteLead.findMany.mockResolvedValue([]);
    database.appointment.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});

    const response = await requestPublicPortal(`/owners/${OWNER_TOKEN}`);
    expect(response.status).toBe(200);
    const properties = response.body.properties as Array<Record<string, unknown>>;
    expect(properties).toHaveLength(1);
    // campos antigos continuam presentes e sem alteração de forma.
    expect(properties[0]).toMatchObject({
      id: "p1",
      code: "COD-p1",
      title: "Imóvel p1",
      operation: "sale",
      status: "available",
      neighborhood: "Centro",
      city: "Curitiba",
      state: "PR",
      sale_price_cents: 400_000_00,
    });
    expect(properties[0]).toHaveProperty("leads_summary");
    expect(properties[0].leads_summary).toEqual({
      total_interessados: 0,
      visitas_agendadas: 0,
      ultimo_interesse_em: null,
      origem: null,
      estagio: null,
      status: "sem_interesse",
      corretor_responsavel: null,
    });
  });

  it("an owner with leads spread across multiple properties gets independent, correct counts for each", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([propertyFixture("p1"), propertyFixture("p2")]);
    database.siteLead.findMany.mockResolvedValue([
      { propertyId: "p1", leadId: "lead-1", createdAt: new Date("2026-09-05T10:00:00.000Z") },
      { propertyId: "p2", leadId: "lead-2", createdAt: new Date("2026-09-05T11:00:00.000Z") },
    ]);
    database.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        status: "open",
        source: "site",
        updatedAt: new Date(),
        stage: { name: "Novo lead", position: 1 },
        assignee: null,
      },
      {
        id: "lead-2",
        status: "open",
        source: "site",
        updatedAt: new Date(),
        stage: { name: "Proposta", position: 4 },
        assignee: { name: "Camila" },
      },
    ]);
    database.appointment.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});

    const response = await requestPublicPortal(`/owners/${OWNER_TOKEN}`);
    const properties = response.body.properties as Array<{
      id: string;
      leads_summary: Record<string, unknown>;
    }>;
    const p1 = properties.find((p) => p.id === "p1")!;
    const p2 = properties.find((p) => p.id === "p2")!;
    expect(p1.leads_summary).toMatchObject({ total_interessados: 1, estagio: "Novo lead" });
    expect(p2.leads_summary).toMatchObject({
      total_interessados: 1,
      estagio: "Proposta",
      corretor_responsavel: "Camila",
    });
  });

  it("never leaks lead PII (name/email/phone/document) or internal IDs (lead_id/site_lead_id) in the payload", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([propertyFixture("p1")]);
    database.siteLead.findMany.mockResolvedValue([
      { propertyId: "p1", leadId: "lead-1", createdAt: new Date() },
    ]);
    database.lead.findMany.mockResolvedValue([
      {
        id: "lead-1",
        status: "open",
        source: "site",
        updatedAt: new Date(),
        stage: { name: "Novo lead", position: 1 },
        assignee: { name: "Marina Souza" },
      },
    ]);
    database.appointment.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});

    const response = await requestPublicPortal(`/owners/${OWNER_TOKEN}`);
    const raw = JSON.stringify(response.body);
    // Nenhum identificador técnico de lead/site_lead deve vazar.
    expect(raw).not.toContain("lead-1");
    expect(raw).not.toContain("lead_id");
    expect(raw).not.toContain("site_lead");
    // Nenhum dado privado do lead (nome/e-mail/telefone) deve aparecer — só o
    // nome do corretor responsável (dado interno da empresa, não do lead) é
    // permitido.
    const summary = (
      response.body.properties as Array<{ leads_summary: Record<string, unknown> }>
    )[0].leads_summary;
    expect(Object.keys(summary).sort()).toEqual(
      [
        "corretor_responsavel",
        "estagio",
        "origem",
        "status",
        "total_interessados",
        "ultimo_interesse_em",
        "visitas_agendadas",
      ].sort(),
    );
  });

  it("a lead not linked to any property of this owner (propertyId null) never counts toward any property", async () => {
    database.propertyOwner.findFirst.mockResolvedValue(ownerFixture());
    database.company.findFirst.mockResolvedValue({
      id: "company-a",
      name: "Imobiliária A",
      status: "active",
    });
    database.property.findMany.mockResolvedValue([propertyFixture("p1")]);
    // A query real já filtra propertyId: { in: propertyIds } — simulamos o
    // resultado (nenhum SiteLead retorna, pois nenhum pertence a p1).
    database.siteLead.findMany.mockResolvedValue([]);
    database.appointment.findMany.mockResolvedValue([]);
    database.propertyOwner.update.mockResolvedValue({});

    const response = await requestPublicPortal(`/owners/${OWNER_TOKEN}`);
    const summary = (
      response.body.properties as Array<{ leads_summary: Record<string, unknown> }>
    )[0].leads_summary;
    expect(summary).toMatchObject({ total_interessados: 0, status: "sem_interesse" });
  });
});
