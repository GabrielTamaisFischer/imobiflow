import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { inspectionStatusLabels } from "./inspection-dashboard";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("SUB-BLOCO 4 — status, conclusão, autosave e contexto das fotos", () => {
  it("rótulos de status amigáveis existem para os 4 status reais", () => {
    expect(inspectionStatusLabels.draft).toBe("Rascunho");
    expect(inspectionStatusLabels.in_progress).toBe("Em andamento");
    expect(inspectionStatusLabels.completed).toBe("Concluída");
    expect(inspectionStatusLabels.archived).toBe("Arquivada");
  });

  it("InspectionStatusBanner deixa claro quando a vistoria está concluída ou arquivada, e não cria botão de desarquivar", () => {
    const banner = source("../components/app/inspections/InspectionStatusBanner.tsx");
    return banner.then((text) => {
      expect(text).toContain("Vistoria concluída");
      expect(text).toContain("Vistoria arquivada");
      // Nenhum botão "Desarquivar" é renderizado (a doc do próprio arquivo
      // explica, em prosa, por que essa ação não existe ainda).
      expect(text).not.toContain("<button");
    });
  });

  it("a página mostra o banner de status logo após o cabeçalho, para toda vistoria", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain("InspectionStatusBanner");
    expect(detail).toContain("<InspectionStatusBanner status={currentInspection.status} />");
  });

  it("concluir com pendências abre um modal nomeado (não window.confirm), e concluir exige conexão antes de tentar", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain("InspectionCompletionModal");
    expect(detail).toContain("if (offline) { setError(");
    expect(detail).toContain("if (pendingItems > 0) { setCompletionModalOpen(true); return; }");
    expect(detail).not.toContain("window.confirm(`Ainda há");
    const modal = await source("../components/app/inspections/InspectionCompletionModal.tsx");
    expect(modal).toContain("Voltar para revisar");
    expect(modal).toContain("Concluir mesmo assim");
  });

  it("concluir sem pendências não exibe o modal (segue direto para patchMysqlInspection)", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain('if (pendingItems > 0) { setCompletionModalOpen(true); return; }\n    void move("completed");');
  });

  it("upload/remoção/reordenação/legenda de evidência participam do indicador de salvamento (onSavingChange)", async () => {
    const panel = await source("../components/app/inspection-evidence-panel.tsx");
    for (const fn of ["upload", "remove", "move", "retry", "saveCaption"]) {
      const start = panel.indexOf(`async function ${fn}(`);
      expect(start, `${fn} não encontrado`).toBeGreaterThan(-1);
      const body = panel.slice(start, panel.indexOf("\n  }\n", start));
      expect(body).toContain("notifySaving(true)");
      expect(body).toContain("notifySaving(false)");
    }
  });

  it("o workspace encaminha onSavingChange para a evidência geral do ambiente e para cada item", async () => {
    const workspace = await source("../components/app/inspections/InspectionRoomWorkspace.tsx");
    const itemCard = await source("../components/app/inspections/InspectionItemCard.tsx");
    expect(workspace).toContain("onSavingChange={onSavingChange}");
    expect(itemCard).toContain("onSavingChange={onSavingChange}");
  });

  it("legenda de foto síncrona exige conexão (não finge que funciona offline) — exclusão e reordenação idem no domínio", async () => {
    const panel = await source("../components/app/inspection-evidence-panel.tsx");
    expect(panel).toContain("function isCaptionEditable(entry: InspectionEvidenceRow)");
    expect(panel).toContain("return !isOfflineRuntime();");
    const client = await source("./inspections.ts");
    expect(client).toContain("OFFLINE_EVIDENCE_UNSUPPORTED");
    expect(client).toContain("Remoção de evidência exige conexão.");
    expect(client).toContain("Ordenação de evidência exige conexão.");
  });

  it("lightbox recebe um rótulo de contexto real: nome do ambiente (fotos gerais) ou ambiente · item (fotos do item)", async () => {
    const workspace = await source("../components/app/inspections/InspectionRoomWorkspace.tsx");
    const itemCard = await source("../components/app/inspections/InspectionItemCard.tsx");
    expect(workspace).toContain("contextLabel={room.name}");
    expect(itemCard).toContain("contextLabel={`${roomName} · ${item.name}`}");
  });

  it("o resumo conta fotos (evidence.length, sem filtrar) e observações via countInspectionNotes (geral + ambiente + item)", async () => {
    const panel = await source("../components/app/inspections/InspectionSummaryPanel.tsx");
    expect(panel).toContain("const totalPhotos = evidence.length;");
    expect(panel).toContain("const notesCount = countInspectionNotes(inspection);");
  });

  it("ordem das fotos usa a posição persistida do backend (position asc, created_at asc) — nenhum schema novo", async () => {
    const backendRoute = await source("../../backend/src/routes/inspections-mysql.ts");
    expect(backendRoute).toContain('orderBy: [{ position: "asc" }, { createdAt: "asc" }]');
  });
});
