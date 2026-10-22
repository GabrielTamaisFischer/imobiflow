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
    // Desde o SUB-BLOCO 4 o card de item (dentro do workspace do ambiente),
    // não mais a página de detalhe, é quem renderiza o InspectionEvidencePanel
    // por item — a vistoria segue reaproveitando a infraestrutura de
    // evidência existente, só a integração visual mudou de lugar.
    const gallery = await source("../components/app/inspections/InspectionEvidenceGallery.tsx");
    const itemCard = await source("../components/app/inspections/InspectionItemCard.tsx");
    expect(gallery).toContain("Adicionar fotos");
    expect(gallery).toContain("multiple");
    const thumbnail = await source("../components/app/inspections/InspectionEvidenceThumbnail.tsx");
    expect(thumbnail).toContain("Remover evidência");
    expect(itemCard).toContain("InspectionEvidencePanel");
    expect(itemCard).toContain("editable={canEdit}");
    expect(itemCard).toContain("roomId={roomId}");
    expect(itemCard).toContain("itemId={item.id}");
  });

  it("persiste fotos offline em IndexedDB e mostra o estado de sincronização", async () => {
    // Desde o SUB-BLOCO 4 o rótulo de sincronização por foto fica na
    // miniatura (InspectionEvidenceThumbnail), não mais no painel.
    const thumbnail = await source("../components/app/inspections/InspectionEvidenceThumbnail.tsx");
    const client = await source("./inspections.ts");
    expect(thumbnail).not.toContain("localStorage");
    expect(client).toContain("queueOfflineInspectionEvidence");
    expect(client).toContain("offline_pending");
    expect(thumbnail).toContain("Salva no dispositivo");
    expect(thumbnail).toContain("Falha na sincronização");
  });
});
