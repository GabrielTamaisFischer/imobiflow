import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("F5C — UI de vistoria ligada ao backend canônico", () => {
  it("usa apenas as rotas MySQL e pagina a listagem", async () => {
    const client = await source("./inspections.ts");
    const list = await source("../routes/app.vistorias.tsx");
    expect(client).toContain("/real-estate/inspections");
    expect(client).toContain("Idempotency-Key");
    expect(list).toContain("listMysqlInspections(page, 25, status)");
    expect(list).not.toContain("listInspections()");
  });

  it("expõe detalhes de ambientes, itens e todas as condições canônicas", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    for (const condition of ["not_inspected", "excellent", "good", "fair", "poor", "damaged", "not_applicable"]) {
      expect(detail).toContain(condition);
    }
    expect(detail).toContain("expected_version");
    expect(detail).toContain("INSPECTION_VERSION_CONFLICT");
    expect(detail).toContain("INSPECTION_NOT_MUTABLE");
  });

  it("mantém ações de mutação condicionadas à permissão real", async () => {
    const list = await source("../routes/app.vistorias.tsx");
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(list).toContain('canManage(session?.access.appUser, "inspections.manage")');
    expect(detail).toContain('canManage(session?.access.appUser, "inspections.manage")');
    expect(list).toContain('actionLabel={canCreate ? "Criar vistoria" : undefined}');
  });

  it("entrega a rota filha ao outlet em vez de cobri-la com a listagem", async () => {
    const list = await source("../routes/app.vistorias.tsx");
    expect(list).toContain("Outlet");
    expect(list).toContain('match.routeId === "/app/vistorias/$inspectionId"');
    expect(list).toContain("if (isDetailRoute) return <Outlet />");
  });
});
