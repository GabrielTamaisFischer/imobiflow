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
    expect(list).toContain("listMysqlInspections(page, PAGE_SIZE, status");
    expect(list).not.toContain("listInspections()");
  });

  it("expõe, entre o detalhe e a camada de status (SUB-BLOCO 3), todas as condições canônicas", async () => {
    // Desde o SUB-BLOCO 3 a UI de status do item é uma camada de apresentação
    // (inspection-item-status.ts) sobre o enum real de 7 valores — não mais
    // literais soltos na página de detalhe.
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    const statusDomain = await source("./inspection-item-status.ts");
    for (const condition of ["not_inspected", "excellent", "good", "fair", "poor", "damaged", "not_applicable"]) {
      expect(statusDomain).toContain(condition);
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
    // SUB-BLOCO UX /app/vistorias — "Nova vistoria" agora é a rota dedicada
    // /app/vistorias/nova (link), não mais um formulário inline no dashboard.
    expect(list).toContain('to="/app/vistorias/nova"');
  });

  it("entrega qualquer rota filha (detalhe ou nova vistoria) ao outlet em vez de cobri-la com a listagem", async () => {
    // SUB-BLOCO UX /app/vistorias — além do detalhe (/$inspectionId), a
    // criação dedicada (/nova) também é filha de /app/vistorias; em vez de
    // enumerar cada routeId, o dashboard delega para o Outlet qualquer match
    // que não seja o próprio "/app/vistorias".
    const list = await source("../routes/app.vistorias.tsx");
    expect(list).toContain("Outlet");
    expect(list).toContain('match.routeId !== "/app/vistorias" && match.routeId.startsWith("/app/vistorias/")');
    expect(list).toContain("if (isChildRoute) return <Outlet />");
  });

  it("oferece criação de ambiente (SUB-BLOCO 3: sugestão + manual) somente enquanto a vistoria é mutável", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    const addRoom = await source("../components/app/inspections/InspectionAddRoom.tsx");
    expect(addRoom).toContain("Adicionar ambiente");
    expect(detail).toContain("Nenhum ambiente adicionado ainda.");
    expect(detail).toContain("createMysqlRoom(currentInspection.id");
    expect(detail).toContain("expected_version: currentInspection.version");
    expect(detail).toContain("crypto.randomUUID()");
    expect(detail).toContain("inspection.status !== \"completed\" && inspection.status !== \"archived\"");
    // Ação de criar ambiente (sugestão aceita ou manual) só aparece com
    // permissão operacional (inspections.manage) e vistoria mutável — nunca
    // exige cargo administrativo, ao contrário de editar/arquivar o registro.
    // `contentEditable` encapsula essa condição (canEdit && (lifecycleMutable
    // || (canEditRecord && editMode))); no fluxo operacional normal (não
    // concluída/arquivada) ela se reduz a canEdit, sem exigir cargo alto.
    expect(detail).toContain("contentEditable ? <InspectionAddRoom");
  });

  it("refaz o carregamento após conflito de versão nas mutações do detalhe", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain("INSPECTION_VERSION_CONFLICT");
    expect(detail).toContain("Atualizamos os dados para você.");
    expect(detail).toContain("void reload()");
  });

  it("integra criação, edição e readonly de itens no workspace do ambiente (SUB-BLOCO 3)", async () => {
    // Desde o SUB-BLOCO 3 a árvore ambiente→itens é renderizada pelo
    // InspectionRoomWorkspace (coluna central), não mais na própria página.
    const workspace = await source("../components/app/inspections/InspectionRoomWorkspace.tsx");
    const addItem = await source("../components/app/inspections/InspectionAddItem.tsx");
    expect(workspace).toContain("Nenhum item neste ambiente ainda.");
    expect(addItem).toContain("Adicionar item");
    expect(workspace).toContain("createMysqlItem(current.id, room.id");
    expect(workspace).toContain("expected_version: inspection.version");
    expect(workspace).toContain("patchMysqlItem(inspection.id, room.id, itemId");
    expect(workspace).toContain("deleteMysqlItem(inspection.id, room.id, itemId");
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain("inspection.status !== \"completed\" && inspection.status !== \"archived\"");
  });

  it("oferece arquivamento (\"arquivar vistoria\", nunca \"apagar\") para draft/in_progress/completed, nunca para archived, com modal de confirmacao e locking", async () => {
    // UX /app/vistorias — o botão e o modal nunca usam a palavra "apagar":
    // o comportamento real é arquivar (preserva histórico), e o texto do
    // modal precisa dizer isso explicitamente.
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    const modal = await source("../components/app/inspections/InspectionArchiveConfirmModal.tsx");
    expect(detail).toContain('inspection.status !== "archived"');
    expect(detail).toContain('currentInspection.status === "archived"');
    expect(detail).toContain("Arquivar vistoria");
    expect(detail).not.toContain("Apagar vistoria");
    expect(detail).toContain("InspectionArchiveConfirmModal");
    expect(detail).toContain("setArchiveModalOpen(true)");
    expect(modal).toContain("Arquivar esta vistoria?");
    expect(modal).toContain("Ela continuará disponível no histórico, mas não poderá mais ser editada.");
    expect(modal).not.toContain("Apagar vistoria");
    expect(detail).toContain('status: "archived"');
    expect(detail).toContain("expected_version: currentInspection.version");
    expect(detail).toContain("handleMutationError(e)");
    expect(detail).toContain('inspection.status !== "completed" && inspection.status !== "archived"');
  });

  it("restringe editar/arquivar o registro principal da vistoria a cargo administrativo, sem travar o trabalho operacional", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    const workspace = await source("../components/app/inspections/InspectionRoomWorkspace.tsx");
    const access = await source("./app-access.ts");
    // A UI só mostra Editar/Apagar vistoria e o editor de responsável/observações
    // quando o usuário é administrativo (owner/admin/manager) — não basta ter
    // inspections.manage, que também é concedido a corretor e vistoriador.
    expect(detail).toContain("isAdministrative");
    expect(detail).toContain("canEditRecord = canEdit && isAdministrative(session?.access.appUser)");
    expect(detail).toContain("{canEditRecord ? (");
    expect(detail).toContain("editable={canEditRecord && editMode}");
    // O trabalho operacional (ambientes, itens, evidências, iniciar/concluir)
    // continua liberado apenas com inspections.manage, sem exigir cargo alto —
    // desde o SUB-BLOCO 3 isso é passado para o InspectionRoomWorkspace.
    expect(detail).toContain("canEdit={contentEditable}");
    expect(workspace).toContain("canEdit ?");
    expect(access).toContain('const administrativeRoles = new Set(["owner", "admin", "manager"]);');
  });
});
