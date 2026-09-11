import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("AJUSTE-MANUAL-01 — fluxo canônico de imóveis", () => {
  it("mantém a edição no wizard completo e oferece as operações canônicas de mídia", async () => {
    const route = await source("../routes/app.imoveis.tsx");
    expect(route).toContain("function EditPropertyDialog");
    expect(route).toContain("10. Imagens e mídia do imóvel");
    expect(route).toContain("<PropertyMediaManager");
    expect(route).toContain("<PropertyMediaUpload");
    expect(route).toContain("onMediaChanged={setEditableMedia}");
    expect(route).toContain("Mídias não alteradas são preservadas");
  });

  it("mantém a ficha visual somente leitura e não expõe chaves internas de storage", async () => {
    const route = await source("../routes/app.imoveis.tsx");
    const reportStart = route.indexOf("function PropertyReportModal");
    const reportEnd = route.indexOf("function EditPropertyDialog");
    const report = route.slice(reportStart, reportEnd);
    expect(report).not.toContain("<PropertyMediaManager");
    expect(report).not.toContain("<PropertyMediaUpload");
    expect(route).toContain("media.caption ?");
    expect(route).not.toContain("media.caption || media.storage_path || media.url");
  });

  it("prepara comunicação do proprietário somente após publicação, sem afirmar SENT", async () => {
    const events = await source("../../backend/src/services/property-events.ts");
    const sites = await source("../../backend/src/routes/sites.ts");
    expect(sites).toContain("emitPropertyPublishedEvent(companyId, property.id, userId)");
    expect(events).toContain('status: "prepared"');
    expect(events).toContain('provider: "simulated"');
    expect(events).toContain('delivery_status: "SIMULATED"');
    expect(events).toContain('.contains("metadata", { event: metadata.event })');
    expect(events).not.toContain('status: "sent"');
  });
});
