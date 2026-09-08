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

  it("oferece criação de ambiente somente enquanto a vistoria é mutável", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain("Adicionar ambiente");
    expect(detail).toContain("Nenhum ambiente adicionado ainda.");
    expect(detail).toContain("createMysqlRoom(inspection.id");
    expect(detail).toContain("expected_version: inspection.version");
    expect(detail).toContain("crypto.randomUUID()");
    expect(detail).toContain("inspection.status !== \"completed\" && inspection.status !== \"archived\"");
  });

  it("refaz o carregamento após conflito de versão nas mutações do detalhe", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain("INSPECTION_VERSION_CONFLICT");
    expect(detail).toContain("Atualizamos os dados para você.");
    expect(detail).toContain("void reload()");
  });

  it("integra criacao, edicao e readonly de itens no Room", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain("Nenhum item adicionado ainda.");
    expect(detail).toContain("Adicionar item");
    expect(detail).toContain("createMysqlItem(inspection.id, room.id");
    expect(detail).toContain("expected_version: inspection.version");
    expect(detail).toContain("condition: itemCondition");
    expect(detail).toContain("notes: itemNotes.trim() || null");
    expect(detail).toContain("patchMysqlItem(inspection.id, room.id, itemId");
    expect(detail).toContain("deleteMysqlItem(inspection.id, room.id, itemId");
    expect(detail).toContain("inspection.status !== \"completed\" && inspection.status !== \"archived\"");
  });
});
