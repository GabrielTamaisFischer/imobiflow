import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("SUB-BLOCO 3 (ajuste) — evidência geral do ambiente e indicador de salvamento", () => {
  it("InspectionRoomWorkspace expõe fotos gerais do ambiente reaproveitando InspectionEvidencePanel (sem itemId)", async () => {
    const workspace = await source("../components/app/inspections/InspectionRoomWorkspace.tsx");
    expect(workspace).toContain("Fotos gerais do ambiente");
    expect(workspace).toContain("InspectionEvidencePanel");
    expect(workspace).toContain("roomId={room.id}");
    // A seção de fotos gerais não passa itemId — é o que faz
    // filterEvidenceFor(evidence, room.id, null) trazer só as fotos do
    // ambiente como um todo (ver inspection-evidence-room-general.test.ts).
    const generalEvidenceBlock = workspace.slice(workspace.indexOf("Fotos gerais do ambiente"), workspace.indexOf("Fotos gerais do ambiente") + 700);
    expect(generalEvidenceBlock).not.toContain("itemId=");
    // Reaproveita a MESMA infraestrutura da evidência por item: compressão,
    // offline queue e expected_version já existentes no inspection-evidence-panel.tsx
    // (upload único, nenhum domínio novo).
    const panel = await source("../components/app/inspection-evidence-panel.tsx");
    expect(panel).toContain("uploadMysqlInspectionEvidence");
  });

  it("o indicador de salvamento do cabeçalho usa só sinais reais rastreados pela página, nunca um estado fixo", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(detail).toContain("InspectionSaveStatus");
    expect(detail).toContain("saveStatusInput: InspectionSaveStatusInput = { saving, justSaved, offline, pending, conflicts, syncing }");
    expect(detail).toContain("<InspectionSaveStatus {...saveStatusInput} />");
    // saving/justSaved são derivados de mutações reais (registro E
    // ambientes/itens via onSavingChange), não um valor fixo nem um
    // "Salvo" fabricado sem uma gravação ter ocorrido.
    expect(detail).toContain("beginSaving();");
    expect(detail).toContain("endSavingWithFlash();");
    expect(detail).toContain('onSavingChange={(savingNow) => (savingNow ? beginSaving() : endSaving())}');
  });

  it("resolveInspectionSaveStatus é a única fonte do texto exibido — sem string de status duplicada na página", async () => {
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    // O antigo texto inline de status (Online — sincronizado, etc.) foi
    // substituído pelo componente; não deve mais existir como string solta
    // na página, para não haver duas fontes de verdade sobre o mesmo rótulo.
    expect(detail).not.toContain("Online — sincronizado");
    expect(detail).not.toContain("alteração(ões) pendente(s)");
  });
});
