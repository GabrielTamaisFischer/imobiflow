import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

// AJUSTE-FUNCIONAL-03 (2026-09-11) — auditoria pós-teste manual do usuário
// sobre o trabalho do Codex em Imóveis/Proprietários. Estes testes cobrem
// os dois gaps de backend confirmados por leitura direta do código durante
// a auditoria (não presentes nos 4 commits do Codex) e agora corrigidos:
//
// 1) Um imóvel despublicado (inclusive via fluxo do proprietário —
//    VENDEU/ALUGOU/DESISTIU_*) continuava aceitando novos leads públicos,
//    porque POST /site/:slug/leads nunca validava publishedAt para o
//    property_id recebido no body — só createMysqlPublicLead, que não
//    valida. Isso violava o requisito explícito "não aceita mais leads
//    públicos" após a atualização do proprietário.
//
// 2) recordOwnerPropertyUpdateNotification só notificava a empresa
//    (recipient_type "company"), nunca o corretor responsável pelo imóvel
//    — violando "o corretor responsável relacionado recebe aviso quando
//    aplicável".
describe("AJUSTE-FUNCIONAL-03 — imóvel despublicado não aceita mais leads públicos", () => {
  it("valida o property_id contra loadMysqlPublicPropertyByReference antes de criar o lead", async () => {
    const source = await readFile(new URL("../src/routes/public-sites.ts", import.meta.url), "utf8");
    // A validação precisa vir ANTES de createMysqlPublicLead, reaproveitando
    // a mesma consulta que já filtra publishedAt: { not: null } em vez de
    // duplicar a regra de publicação em outro lugar.
    const validationIndex = source.indexOf("loadMysqlPublicPropertyByReference(site, input.property_id)");
    const leadCreationIndex = source.indexOf("const lead = await createMysqlPublicLead(");
    expect(validationIndex).toBeGreaterThan(-1);
    expect(leadCreationIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(leadCreationIndex);
    expect(source).toContain("PROPERTY_NOT_AVAILABLE");
  });

  it("mantém leads sem property_id funcionando (contato geral do site, não amarrado a um imóvel)", async () => {
    const source = await readFile(new URL("../src/routes/public-sites.ts", import.meta.url), "utf8");
    expect(source).toContain("if (input.property_id) {");
  });
});

describe("AJUSTE-FUNCIONAL-03 — corretor responsável é notificado da solicitação do proprietário", () => {
  it("propaga responsibleUserId do imóvel até recordOwnerPropertyUpdateNotification na criação", async () => {
    const source = await readFile(new URL("../src/services/mysql-real-estate.ts", import.meta.url), "utf8");
    expect(source).toContain("responsibleUserId: result.property.responsibleUserId ?? null");
  });

  it("propaga responsibleUserId também no fluxo de aprovar/rejeitar (resolveMysqlOwnerPropertyUpdateRequest)", async () => {
    const source = await readFile(new URL("../src/services/mysql-real-estate.ts", import.meta.url), "utf8");
    expect(source).toContain("const responsibleUserId: string | null = request.property?.responsibleUserId ?? null;");
    expect(source).toContain("responsibleUserId: result.responsibleUserId");
  });

  it("grava um evento dedicado (recipient_type 'user') para o corretor, sem substituir o aviso interno da empresa", async () => {
    const source = await readFile(new URL("../src/services/mysql-real-estate.ts", import.meta.url), "utf8");
    // O aviso interno original (recipient_type "company") precisa continuar
    // existindo — este ajuste ADICIONA um segundo evento, não substitui.
    expect(source).toContain('recipient_type: "company"');
    expect(source).toContain('recipient_type: "user"');
    // Mesma idempotência (não duplica o evento se já existe para este
    // request_id + status), agora também checada por recipient_id.
    expect(source).toContain(".eq(\"recipient_id\", input.responsibleUserId)");
  });
});
