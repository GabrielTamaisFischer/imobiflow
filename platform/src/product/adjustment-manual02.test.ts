import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("AJUSTE-MANUAL-02 — painel do proprietário", () => {
  it("liga a listagem a uma ficha dedicada e cobre os blocos operacionais", async () => {
    const list = await source("../routes/app.proprietarios.tsx");
    const dashboard = await source("../routes/app.proprietarios.$ownerId.tsx");
    expect(list).toContain('to: "/app/proprietarios/$ownerId"');
    for (const section of ["Imóveis vinculados", "Financeiro", "Documentos", "Agenda", "Atividades", "Responsável operacional"]) {
      expect(dashboard).toContain(section);
    }
    expect(dashboard).toContain("getOwnerDashboard");
    expect(dashboard).toContain("setOwnerPortalEnabled");
    expect(dashboard).toContain("regenerateOwnerPortalToken");
  });

  it("mantém solicitação de situação do portal auditável e sem mutação implícita", async () => {
    const portal = await source("../routes/portal.proprietario.$token.tsx");
    const client = await source("./public-portals.ts");
    const backend = await source("../../backend/src/services/mysql-real-estate.ts");
    expect(portal).toContain("submitOwnerPropertyUpdate");
    expect(client).toContain("/property-updates");
    expect(backend).toContain('owner.property_update.requested');
    expect(backend).toContain("requires_internal_confirmation");
    expect(backend).toContain("ownerPropertyUpdateRequestDelegate(tx).create");
    expect(backend).toContain("recordOwnerPropertyUpdateNotification");
    expect(backend).toContain("publishedAt: null");
  });

  it("expõe resolução interna tenant-scoped e mantém a trilha em AuthAuditLog", async () => {
    const routes = await source("../../backend/src/routes/real-estate.ts");
    const schema = await source("../../prisma/schema.prisma");
    const migration = await source("../../prisma/migrations/202609150001_adjustment_manual_02b_owner_property_update_requests/migration.sql");
    const dashboard = await source("../routes/app.proprietarios.$ownerId.tsx");
    expect(routes).toContain("/owners/:id/property-update-requests");
    expect(routes).toContain("/owner-property-update-requests/:id");
    expect(routes).toContain('requirePermission("owners.manage")');
    expect(schema).toContain("model OwnerPropertyUpdateRequest");
    expect(schema).toContain("owner_property_update_requests");
    expect(migration).toContain("CREATE TABLE `owner_property_update_requests`");
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(migration).toContain("ON DELETE SET NULL");
    expect(migration).not.toMatch(/DROP TABLE|TRUNCATE|ON DELETE CASCADE/i);
    expect(dashboard).toContain("Solicitações do proprietário");
    expect(dashboard).toContain("resolveOwnerPropertyUpdateRequest");
  });
});
