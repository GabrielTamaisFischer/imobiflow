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

// AJUSTE-FUNCIONAL-03 (2026-09-11) — a auditoria pós-teste manual do usuário
// encontrou a Ficha (app.proprietarios.$ownerId.tsx) montada, mas com 5
// gaps funcionais confirmados por leitura direta do código (não presentes
// nos commits do Codex): sem WhatsApp, "Abrir" genérico para /app/imoveis
// sem apontar pro imóvel exato, sem "Visitar no site", Financeiro não
// separado em repasses pendentes/pagos/cobranças abertas, Documentos e
// Agenda somente leitura sem ação de enviar/agendar. Os 5 estão corrigidos
// abaixo, reaproveitando sempre mecanismos já existentes (StoredFile,
// getPropertyDetailUrl, Appointment) — nenhum um novo é criado.
describe("AJUSTE-FUNCIONAL-03 — gaps funcionais da Ficha do proprietário corrigidos", () => {
  it("adiciona contato por WhatsApp (wa.me) ao lado de Ligar/E-mail", async () => {
    const dashboard = await source("../routes/app.proprietarios.$ownerId.tsx");
    expect(dashboard).toContain("https://wa.me/${dashboard.owner.whatsapp");
  });

  it("aponta 'Abrir imóvel' para o imóvel exato e adiciona 'Visitar no site', reaproveitando getPropertyDetailUrl", async () => {
    const dashboard = await source("../routes/app.proprietarios.$ownerId.tsx");
    const properties = await source("../routes/app.imoveis.tsx");
    expect(dashboard).toContain('import { getPropertyDetailUrl } from "@/product/public-site-helpers"');
    expect(dashboard).toContain("search={{ focusPropertyId: property.id }}");
    expect(dashboard).toContain("getPropertyDetailUrl(siteSlug, property)");
    // /app/imoveis precisa saber ler focusPropertyId (validateSearch) e abrir
    // o mesmo dossiê somente leitura (PropertyReportModal) que o botão
    // "Visualizar" de cada card já abre — nenhum diálogo novo é criado.
    expect(properties).toContain("focusPropertyId");
    expect(properties).toContain("validateSearch");
    expect(properties).toContain("<PropertyReportModal property={focusedProperty}");
  });

  it("separa Financeiro em repasses pendentes / repasses pagos / cobranças abertas usando a mesma semântica payable/receivable do backend", async () => {
    const dashboard = await source("../routes/app.proprietarios.$ownerId.tsx");
    const backend = await source("../../backend/src/services/mysql-real-estate.ts");
    expect(dashboard).toContain("function FinancialBreakdown(");
    expect(dashboard).toContain('entry.type === "payable" && entry.status !== "paid"');
    expect(dashboard).toContain('entry.type === "payable" && entry.status === "paid"');
    expect(dashboard).toContain('entry.type === "receivable" && entry.status !== "paid"');
    // mesma semântica já usada pelo backend para calcular os counts do topo
    // do dashboard — não é um cálculo novo, só reorganização visual.
    expect(backend).toContain('pending_payouts: financialEntries.filter((entry) => entry.type === "payable"');
  });

  it("permite enviar documento direto na Ficha reaproveitando o mesmo uploader/StoredFile (sem voltar para a listagem antiga)", async () => {
    const dashboard = await source("../routes/app.proprietarios.$ownerId.tsx");
    const modal = await source("../components/real-estate/owner-documents-modal.tsx");
    expect(dashboard).toContain('import { OwnerDocumentsModal } from "@/components/real-estate/owner-documents-modal"');
    expect(dashboard).toContain("setIsDocumentsOpen(true)");
    expect(dashboard).toContain("<OwnerDocumentsModal");
    expect(modal).toContain("uploadOwnerDocument(owner.id");
  });

  it("adiciona 'Novo agendamento' usando a entidade canônica Appointment (sem duplicar Agenda)", async () => {
    const dashboard = await source("../routes/app.proprietarios.$ownerId.tsx");
    expect(dashboard).toContain('Novo agendamento');
    expect(dashboard).toContain('to="/app/agenda"');
  });

  // AJUSTE-FUNCIONAL-03 (2026-09-11, continuação): a Visualização Completa
  // (dossiê) renderizava um <pre>{report}</pre> — um único bloco de texto
  // plano — exatamente o "parece que colei num bloco de notas" reportado
  // pelo usuário. Reescrito como 13 seções organizadas, campo a campo,
  // somente leitura (sem input/select/upload/delete/reorder), com mídias
  // sempre por último e nunca expondo storage_path/publicId/provider.
  it("substitui o dossiê em texto único por 13 seções organizadas, somente leitura", async () => {
    const properties = await source("../routes/app.imoveis.tsx");
    expect(properties).not.toContain('<pre className="whitespace-pre-wrap rounded-md bg-muted p-4 text-sm leading-relaxed text-foreground">{report}</pre>');
    for (const section of [
      "1. Identificação",
      "2. Situação e publicação",
      "3. Dados comerciais",
      "4. Endereço completo",
      "5. Valores",
      "6. Características",
      "7. Amenidades",
      "8. Descrição",
      "9. Proprietário",
      "10. Corretor/responsável",
      "11. Informações complementares",
      "12. Liberações",
      "13. Mídias",
    ]) {
      expect(properties).toContain(section);
    }
    // read-only real: nenhum controle de mutação de mídia dentro do
    // DossierSection/PropertyReportModal — PropertyMediaManager/Upload só
    // aparecem no PropertyWizard (mode edit), nunca aqui.
    const dossierStart = properties.indexOf("function PropertyReportModal(");
    const dossierEnd = properties.indexOf("function DossierField(");
    const dossierBody = properties.slice(dossierStart, dossierEnd);
    expect(dossierBody).not.toContain("PropertyMediaManager");
    expect(dossierBody).not.toContain("PropertyMediaUpload");
    expect(dossierBody).not.toContain("<input");
    expect(dossierBody).not.toContain("<select");
  });

  it("mídias do dossiê nunca expõem storage_path/publicId/UUID técnico — só galeria real, com mídia sempre por último", async () => {
    const properties = await source("../routes/app.imoveis.tsx");
    const dossierStart = properties.indexOf("function PropertyReportModal(");
    const dossierEnd = properties.indexOf("function DossierField(");
    const dossierBody = properties.slice(dossierStart, dossierEnd);
    // Regex específica em cima de acesso a propriedade (media.storage_path,
    // media.publicId, media.public_id) — não uma busca genérica de string,
    // que também bateria no próprio comentário explicando esta regra.
    expect(dossierBody).not.toMatch(/media\.(storage_path|publicId|public_id)/i);
    expect(dossierBody).toContain("13. Mídias");
    // mídias precisa ser a última seção renderizada
    const lastSectionIndex = dossierBody.lastIndexOf("<DossierSection");
    const mediaSectionIndex = dossierBody.indexOf("13. Mídias");
    expect(mediaSectionIndex).toBeGreaterThan(lastSectionIndex);
  });
});
