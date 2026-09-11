import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("AJUSTE-MANUAL-01B — wizard compartilhado de imóveis", () => {
  it("usa literalmente o mesmo PropertyWizard para criar e editar", async () => {
    // full-page-imoveis (2026-09-11): o PropertyWizard continua sendo o
    // único componente de wizard (definido em app.imoveis.tsx, exportado),
    // mas quem o MONTA em cada modo agora são as rotas full-page dedicadas
    // (/app/imoveis/novo e /app/imoveis/:id/editar) em vez de blocos
    // inline dentro de app.imoveis.tsx — ver AGENT HANDOFF, tarefa
    // "full-page create/edit de Imóveis". As asserções abaixo foram
    // atualizadas para apontar para onde cada coisa realmente está agora,
    // preservando a mesma garantia original: mode="create" e mode="edit"
    // literalmente montam o MESMO PropertyWizard exportado, não uma cópia.
    const route = await source("../routes/app.imoveis.tsx");
    const novo = await source("../routes/app.imoveis_.novo.tsx");
    const editar = await source("../routes/app.imoveis_.$propertyId.editar.tsx");
    expect(route).toContain("export function PropertyWizard({");
    expect(route).toContain('mode: "create" | "edit"');
    expect(route).not.toContain("function EditPropertyDialog");
    expect(route).toContain("populatePropertyWizardForm(formRef.current, property)");
    expect(route).toContain("Mídias não alteradas são preservadas");
    expect(novo).toContain('import { PropertyWizard } from "./app.imoveis"');
    expect(novo).toContain('mode="create"');
    expect(editar).toContain('import { PropertyWizard } from "./app.imoveis"');
    expect(editar).toContain('mode="edit"');
    for (const step of [
      "Proprietário",
      "Localização",
      "Captação",
      "Dados primários",
      "Metragens",
      "Valores",
      "Detalhes adicionais",
      "Vídeo",
      "Descrição",
      "Imagens",
      "Liberações",
      "Revisão final",
    ]) {
      expect(route).toContain(`"${step}"`);
    }
  });

  it("preserva campos existentes e integra a etapa única de mídia em create/edit", async () => {
    const route = await source("../routes/app.imoveis.tsx");
    const novo = await source("../routes/app.imoveis_.novo.tsx");
    const editar = await source("../routes/app.imoveis_.$propertyId.editar.tsx");
    expect(route).toContain("10. Imagens");
    expect(route).toContain("<PropertyMediaManager");
    expect(route).toContain("<PropertyMediaUpload");
    expect(route).toContain("onMediaChanged={setEditableMedia}");
    expect(route).toContain("property.features_json");
    expect(route).toContain("features_json:");
    expect(route).toContain("initialItems={isEdit && property");
    expect(route).toContain("const [customItems, setCustomItems] = useState<string[]>(() => initialItems.filter");
    expect(route).toContain('property?.description ?? ""');
    // currentUserId e canCreateOwner são resolvidos pelas próprias rotas
    // full-page (cada uma carrega sua sessão/permissões) e passados ao
    // PropertyWizard compartilhado — não mais montados inline dentro de
    // app.imoveis.tsx.
    expect(novo).toContain("currentUserId={session?.access.appUser?.id}");
    expect(novo).toContain("canCreateOwner={canCreateOwner}");
    expect(editar).toContain("currentUserId={session?.access.appUser?.id}");
    expect(editar).toContain("canCreateOwner={canCreateOwner}");
    expect(route).toContain('status: !isEdit && intent === "draft"');
    expect(route).toContain('name={!isEdit ? "intent" : undefined}');
  });

  it("mantém a ficha visual somente leitura e não expõe chaves internas de storage", async () => {
    const route = await source("../routes/app.imoveis.tsx");
    const reportStart = route.indexOf("function PropertyReportModal");
    const reportEnd = route.indexOf("function populatePropertyWizardForm");
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
