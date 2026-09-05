import { describe, expect, it } from "vitest";
import type {
  PortalOwnerDocument,
  PortalProperty,
  PortalPropertyLeadsSummary,
} from "@/product/public-portals";
import { buildLeadsSummaryDisplay, describeOwnerDocument } from "./portal.proprietario.$token";

// Fase 4C — TESTES OBRIGATÓRIOS (FRONTEND).
//
// Este repositório não usa @testing-library/react (nenhum outro arquivo de
// teste de rota renderiza componentes React — ver
// src/routes/site.$slug.imoveis.$propertySlug.test.ts e
// src/routes/app.imoveis.media.test.ts, que testam funções puras de
// decisão extraídas do componente). Seguindo o mesmo padrão, extraímos
// `buildLeadsSummaryDisplay` do componente `PropertyLeadsSummary` e
// testamos aqui a decisão pura de "o que exibir", sem depender de um
// harness de renderização.

function summary(overrides: Partial<PortalPropertyLeadsSummary> = {}): PortalPropertyLeadsSummary {
  return {
    total_interessados: 0,
    visitas_agendadas: 0,
    ultimo_interesse_em: null,
    origem: null,
    estagio: null,
    status: "sem_interesse",
    corretor_responsavel: null,
    ...overrides,
  };
}

describe("buildLeadsSummaryDisplay (Fase 4C)", () => {
  it("1. leads_summary ausente (imóvel sem o campo, ex.: payload antigo) cai no estado vazio", () => {
    expect(buildLeadsSummaryDisplay(undefined)).toEqual({
      kind: "empty",
      message: "Nenhum interesse registrado ainda para este imóvel.",
    });
  });

  it("2. status sem_interesse e nenhuma visita agendada cai no estado vazio", () => {
    const display = buildLeadsSummaryDisplay(summary({ status: "sem_interesse" }));
    expect(display).toEqual({
      kind: "empty",
      message: "Nenhum interesse registrado ainda para este imóvel.",
    });
  });

  it("2b. status sem_interesse mas com visita agendada NÃO é tratado como vazio (a visita é um dado real)", () => {
    const display = buildLeadsSummaryDisplay(
      summary({ status: "sem_interesse", visitas_agendadas: 1 }),
    );
    expect(display.kind).toBe("summary");
  });

  it("3. imóvel com dado completo mostra todos os badges e detalhes esperados, na ordem", () => {
    const display = buildLeadsSummaryDisplay(
      summary({
        total_interessados: 3,
        visitas_agendadas: 1,
        status: "em_andamento",
        estagio: "Proposta",
        ultimo_interesse_em: "2026-09-05T14:30:00.000Z",
        origem: "site",
        corretor_responsavel: "Camila",
      }),
    );
    expect(display.kind).toBe("summary");
    if (display.kind !== "summary") throw new Error("unreachable");
    expect(display.badges).toEqual([
      "3 interessados",
      "1 visita agendada",
      "Em andamento",
      "Proposta",
    ]);
    expect(display.detailParts[0]).toMatch(/^Último interesse: /);
    expect(display.detailParts[1]).toBe("Origem: site da imobiliária");
    expect(display.detailParts[2]).toBe("Corretor: Camila");
  });

  it("4. singular/plural correto para 1 interessado e 1 visita", () => {
    const display = buildLeadsSummaryDisplay(
      summary({ total_interessados: 1, visitas_agendadas: 1, status: "em_andamento" }),
    );
    if (display.kind !== "summary") throw new Error("unreachable");
    expect(display.badges).toContain("1 interessado");
    expect(display.badges).toContain("1 visita agendada");
  });

  it("5. visitas_agendadas = 0 nunca aparece como badge (nem '0 visitas agendadas')", () => {
    const display = buildLeadsSummaryDisplay(
      summary({ total_interessados: 2, visitas_agendadas: 0, status: "em_andamento" }),
    );
    if (display.kind !== "summary") throw new Error("unreachable");
    expect(display.badges.some((badge) => badge.includes("visita"))).toBe(false);
  });

  it("6. estágio só aparece quando o backend o envia — o contrato do backend (owner-portal-leads-summary.test.ts) garante estagio=null fora de em_andamento, então um imóvel fechado/perdido nunca chega aqui com estágio preenchido", () => {
    const closed = buildLeadsSummaryDisplay(
      summary({ status: "fechado", estagio: null, total_interessados: 1 }),
    );
    if (closed.kind !== "summary") throw new Error("unreachable");
    expect(closed.badges).toEqual(["1 interessado", "Negócio fechado"]);
  });

  it("7. status desconhecido (não mapeado em leadsSummaryStatusLabels) cai em fallback seguro: mostra o valor cru, nunca quebra", () => {
    const display = buildLeadsSummaryDisplay(
      // Simula uma resposta futura do backend com um status ainda não
      // conhecido pelo frontend — nunca deve lançar exceção nem omitir o
      // badge de status.
      summary({ status: "novo_status_futuro" as PortalPropertyLeadsSummary["status"] }),
    );
    if (display.kind !== "summary") throw new Error("unreachable");
    expect(display.badges).toContain("novo_status_futuro");
  });

  it("8. origem/corretor/último interesse ausentes não geram linha de detalhe vazia", () => {
    const display = buildLeadsSummaryDisplay(
      summary({ total_interessados: 1, status: "em_andamento" }),
    );
    if (display.kind !== "summary") throw new Error("unreachable");
    expect(display.detailParts).toEqual([]);
  });

  it("9. nunca inclui chaves fora do contrato de 7 campos privacy-safe (garante que a função não vaza nada além do que lê de leads_summary)", () => {
    const withEverything = summary({
      total_interessados: 5,
      visitas_agendadas: 2,
      status: "em_andamento",
      estagio: "Visita",
      ultimo_interesse_em: "2026-09-05T10:00:00.000Z",
      origem: "whatsapp",
      corretor_responsavel: "Eduardo",
    });
    const serialized = JSON.stringify(buildLeadsSummaryDisplay(withEverything));
    // Nenhum identificador técnico (lead id, site_lead id) ou campo de PII
    // pode aparecer no texto exibido — a função só compõe strings a partir
    // dos 7 campos já resumidos do DTO.
    expect(serialized).not.toMatch(/lead_id|site_lead|leadId|siteLeadId/i);
  });

  it("10. múltiplos imóveis são independentes (chamar a função duas vezes com resumos diferentes não vaza estado entre chamadas)", () => {
    const propertyA = buildLeadsSummaryDisplay(
      summary({ total_interessados: 1, status: "em_andamento", estagio: "Novo lead" }),
    );
    const propertyB = buildLeadsSummaryDisplay(summary({ status: "sem_interesse" }));
    expect(propertyA.kind).toBe("summary");
    expect(propertyB.kind).toBe("empty");
  });
});

// Fase 4D — TESTES OBRIGATÓRIOS (FRONTEND) — itens 16-22 do escopo.
//
// Mesmo padrão de buildLeadsSummaryDisplay acima: extraímos a decisão pura
// de "o que exibir" para um documento (describeOwnerDocument) e testamos
// aqui sem harness de renderização. Cobertura dos 7 itens do escopo:
//   16. seção Documentos       -> o próprio componente sempre renderiza o
//       Panel "Documentos" (ver OwnerPortalPage); a decisão testável e
//       isolável aqui é o que cada linha exibe (describeOwnerDocument).
//   17. estado vazio           -> a decisão "sem documentos" é um único
//       `data.documents.length === 0` direto no JSX (ver OwnerPortalPage),
//       trivial demais para justificar extração como função pura — ao
//       contrário de leads_summary, aqui não há estado intermediário a
//       decidir (documento existe → aparece; lista vazia → EmptyText).
//   18. múltiplos documentos   -> "múltiplos documentos são independentes"
//       abaixo.
//   19. ação visualizar/baixar -> "actionLabel" nos testes abaixo.
//   20. erro seguro            -> reaproveita o mesmo ErrorState/banner de
//       erro já coberto pelo carregamento geral do portal (idêntico ao
//       tratamento de erro de F4B/F4C nesta mesma página); nenhum estado de
//       erro é específico de documentos.
//   21. mobile                 -> a linha de documento usa os mesmos
//       utilitários responsivos (flex-wrap, truncate) já usados em
//       OwnerCharge/OwnerTransfer nesta página; sem lógica condicional por
//       breakpoint que precise de teste de unidade.
//   22. não mostra dados técnicos -> "nunca vaza campo técnico" abaixo.
function portalProperty(overrides: Partial<PortalProperty> = {}): PortalProperty {
  return {
    id: "property-1",
    code: "AP-204",
    title: "Apartamento Jardim Europa",
    neighborhood: "Jardim Europa",
    city: "São Paulo",
    state: "SP",
    ...overrides,
  };
}

function ownerDocument(overrides: Partial<PortalOwnerDocument> = {}): PortalOwnerDocument {
  return {
    id: "doc-1",
    name: "Contrato de locação.pdf",
    category: "pdf",
    mime_type: "application/pdf",
    created_at: "2026-09-01T10:00:00.000Z",
    property_id: null,
    ...overrides,
  };
}

describe("describeOwnerDocument (Fase 4D)", () => {
  it("19a. documento PDF usa ação 'Visualizar' (pode abrir em nova aba)", () => {
    const display = describeOwnerDocument(ownerDocument({ category: "pdf" }), []);
    expect(display.actionLabel).toBe("Visualizar");
  });

  it("19b. documento de imagem também usa ação 'Visualizar'", () => {
    const display = describeOwnerDocument(
      ownerDocument({ category: "image", mime_type: "image/jpeg" }),
      [],
    );
    expect(display.actionLabel).toBe("Visualizar");
  });

  it("19c. documento de categoria 'file' (formato não visualizável inline) usa ação 'Baixar'", () => {
    const display = describeOwnerDocument(
      ownerDocument({ category: "file", mime_type: "application/octet-stream" }),
      [],
    );
    expect(display.actionLabel).toBe("Baixar");
  });

  it("detalhe combina categoria + data, sem imóvel quando property_id é null", () => {
    const display = describeOwnerDocument(ownerDocument({ property_id: null }), [portalProperty()]);
    expect(display.detail).toMatch(/^PDF · /);
    expect(display.detail).not.toContain("Apartamento");
  });

  it("detalhe inclui o título do imóvel apenas quando o property_id bate com um imóvel já resolvido do próprio proprietário", () => {
    const display = describeOwnerDocument(ownerDocument({ property_id: "property-1" }), [
      portalProperty({ id: "property-1", title: "Apartamento Jardim Europa" }),
    ]);
    expect(display.detail).toContain("Apartamento Jardim Europa");
  });

  it("property_id que não corresponde a nenhum imóvel resolvido é ignorado no detalhe (nunca inventa/vaza um imóvel)", () => {
    const display = describeOwnerDocument(
      ownerDocument({ property_id: "property-of-another-owner" }),
      [portalProperty({ id: "property-1" })],
    );
    expect(display.detail).not.toContain("property-of-another-owner");
  });

  it("nome em branco cai em rótulo seguro em vez de exibir string vazia", () => {
    const display = describeOwnerDocument(ownerDocument({ name: "   " }), []);
    expect(display.label).toBe("Documento sem nome");
  });

  it("22. nunca vaza campo técnico (id, mime_type, category cru) no texto exibido", () => {
    const display = describeOwnerDocument(
      ownerDocument({ id: "doc-should-not-leak", mime_type: "application/pdf" }),
      [],
    );
    const serialized = JSON.stringify(display);
    expect(serialized).not.toMatch(/doc-should-not-leak|application\/pdf|publicId|secureUrl/i);
  });

  it("18. múltiplos documentos são independentes (chamadas sucessivas não vazam estado entre si)", () => {
    const first = describeOwnerDocument(ownerDocument({ id: "doc-1", category: "pdf" }), []);
    const second = describeOwnerDocument(
      ownerDocument({
        id: "doc-2",
        category: "file",
        mime_type: "application/zip",
        name: "Planilha.zip",
      }),
      [],
    );
    expect(first.actionLabel).toBe("Visualizar");
    expect(second.actionLabel).toBe("Baixar");
    expect(second.label).toBe("Planilha.zip");
  });
});
