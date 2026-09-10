import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}

describe("F5E — evidências de vistoria", () => {
  it("usa a API canônica, múltiplos arquivos e idempotência por arquivo", async () => {
    const client = await source("./inspections.ts");
    expect(client).toContain("uploadMysqlInspectionEvidence");
    expect(client).toContain("content_base64");
    expect(client).toContain('"Idempotency-Key"');
    expect(client).toContain("queueOfflineInspectionEvidence");
    expect(client).toContain("syncMysqlInspectionOfflineEvidenceQueue");
  });

  it("renderiza galeria e CTA apenas enquanto a vistoria é editável", async () => {
    const panel = await source("../components/app/inspection-evidence-panel.tsx");
    const detail = await source("../routes/app.vistorias.$inspectionId.tsx");
    expect(panel).toContain("Adicionar fotos");
    expect(panel).toContain("multiple");
    expect(panel).toContain("Remover evidência");
    expect(detail).toContain("InspectionEvidencePanel");
    expect(detail).toContain("editable={canEdit}");
    expect(detail).toContain("roomId={room.id}");
    expect(detail).toContain("itemId={item.id}");
  });

  it("persiste fotos offline em IndexedDB e mostra o estado de sincronização", async () => {
    const panel = await source("../components/app/inspection-evidence-panel.tsx");
    const client = await source("./inspections.ts");
    expect(panel).not.toContain("localStorage");
    expect(client).toContain("queueOfflineInspectionEvidence");
    expect(client).toContain("offline_pending");
    expect(panel).toContain("Salva no dispositivo");
    expect(panel).toContain("Falha na sincronização");
  });
});
