import { describe, expect, it } from "vitest";
import type { MysqlInspectionComparisonItem } from "@/product/inspections";
import {
  COMPARISON_CONDITION_LABELS,
  COMPARISON_FILTERS,
  itemMatchesComparisonFilter,
  resolveComparisonButtonMode,
} from "./app.vistorias.$inspectionId";

// Bloco 5 — painel de comparacao Entrada x Saida.
//
// Este repositorio nao usa @testing-library/react (ver
// src/routes/portal.proprietario.$token.test.ts); seguimos o mesmo padrao
// testando as funcoes puras extraidas do componente — decisao do botao
// contextual e filtragem de itens — em vez de renderizar o painel. Fotos
// lado a lado, lightbox e o disparo do download de PDF dependem de DOM
// real (URL.createObjectURL, cliques, <img>) e, sem harness de
// renderizacao disponivel neste projeto, ficam cobertos indiretamente: o
// download reusa o mesmo padrao ja testado em downloadMysqlInspectionReport
// (inspections.ts), e a obtencao de entry_evidence/exit_evidence por
// ambiente/item com associacao deterministica por id ja tem teste de ponta
// a ponta na camada HTTP (backend/tests/inspections-mysql-http.test.ts —
// "Bloco 5 — anexa fotos de entrada/saida por ambiente e por item").

function item(overrides: Partial<MysqlInspectionComparisonItem> = {}): MysqlInspectionComparisonItem {
  return {
    name: "Piso",
    entry: "good",
    exit: "damaged",
    outcome: "worse",
    changed: true,
    entry_notes: null,
    exit_notes: null,
    entry_item_id: "item-entry-1",
    exit_item_id: "item-exit-1",
    entry_evidence: [],
    exit_evidence: [],
    ...overrides,
  };
}

describe("COMPARISON_CONDITION_LABELS — rotulos PT-BR", () => {
  it("cobre todos os 7 valores do dominio MysqlInspectionCondition, sem nenhum rotulo vazio", () => {
    const domain = ["not_inspected", "excellent", "good", "fair", "poor", "damaged", "not_applicable"] as const;
    for (const condition of domain) {
      expect(COMPARISON_CONDITION_LABELS[condition]).toBeTruthy();
    }
    expect(Object.keys(COMPARISON_CONDITION_LABELS)).toHaveLength(domain.length);
  });

  it("nenhum rotulo atribui culpa/responsabilidade — vocabulario estritamente descritivo", () => {
    const blamePattern = /locat[aá]rio|propriet[aá]rio|causad[oa]|respons[aá]vel|culpa/i;
    for (const label of Object.values(COMPARISON_CONDITION_LABELS)) {
      expect(label).not.toMatch(blamePattern);
    }
  });
});

describe("COMPARISON_FILTERS — filtros disponiveis no painel", () => {
  it("expoe exatamente os 7 filtros esperados, cada um com rotulo PT-BR", () => {
    expect(COMPARISON_FILTERS.map((f) => f.key)).toEqual(["all", "changed", "same", "worse", "better", "new", "with_photos"]);
    for (const filter of COMPARISON_FILTERS) {
      expect(filter.label).toBeTruthy();
    }
  });
});

describe("itemMatchesComparisonFilter", () => {
  it('"all" sempre inclui, independente do outcome', () => {
    expect(itemMatchesComparisonFilter(item({ outcome: "same" }), "all")).toBe(true);
    expect(itemMatchesComparisonFilter(item({ outcome: "absent" }), "all")).toBe(true);
  });

  it('"changed" usa o campo changed, nao o outcome diretamente', () => {
    expect(itemMatchesComparisonFilter(item({ changed: true, outcome: "worse" }), "changed")).toBe(true);
    expect(itemMatchesComparisonFilter(item({ changed: false, outcome: "same" }), "changed")).toBe(false);
  });

  it('"same"/"better"/"worse"/"not_comparable" casam exatamente o outcome correspondente', () => {
    expect(itemMatchesComparisonFilter(item({ outcome: "same" }), "same")).toBe(true);
    expect(itemMatchesComparisonFilter(item({ outcome: "better" }), "same")).toBe(false);
    expect(itemMatchesComparisonFilter(item({ outcome: "better" }), "better")).toBe(true);
    expect(itemMatchesComparisonFilter(item({ outcome: "worse" }), "worse")).toBe(true);
    // "not_comparable" nao e um dos filtros exibidos na UI (COMPARISON_FILTERS),
    // mas a funcao ainda casa esse outcome corretamente se for passado — ela
    // nao da throw nem silenciosamente devolve tudo para uma chave fora da
    // lista exibida.
    expect(itemMatchesComparisonFilter(item({ outcome: "not_comparable" }), "not_comparable" as never)).toBe(true);
  });

  it('"new" agrupa tanto item novo quanto item ausente na saida', () => {
    expect(itemMatchesComparisonFilter(item({ outcome: "new" }), "new")).toBe(true);
    expect(itemMatchesComparisonFilter(item({ outcome: "absent" }), "new")).toBe(true);
    expect(itemMatchesComparisonFilter(item({ outcome: "same" }), "new")).toBe(false);
  });

  it('"with_photos" inclui quando ha foto de entrada OU de saida, exclui quando nao ha nenhuma', () => {
    expect(itemMatchesComparisonFilter(item({ entry_evidence: [{ id: "e1" }] as never }), "with_photos")).toBe(true);
    expect(itemMatchesComparisonFilter(item({ exit_evidence: [{ id: "e2" }] as never }), "with_photos")).toBe(true);
    expect(itemMatchesComparisonFilter(item({ entry_evidence: [], exit_evidence: [] }), "with_photos")).toBe(false);
  });
});

describe("resolveComparisonButtonMode — botao contextual, nunca generico na dashboard", () => {
  it("Saida com comparacao ja existente -> alternar exibicao, sem exigir selecao", () => {
    const mode = resolveComparisonButtonMode({ inspectionType: "exit", hasActiveComparison: true, canCompare: true, candidateEntryCount: 3 });
    expect(mode).toEqual({ kind: "toggle_view", viewingAs: "exit" });
  });

  it("Saida elegivel sem comparacao e com exatamente 1 Entrada candidata -> comparar sem exigir selecao manual", () => {
    const mode = resolveComparisonButtonMode({ inspectionType: "exit", hasActiveComparison: false, canCompare: true, candidateEntryCount: 1 });
    expect(mode).toEqual({ kind: "select_and_compare", candidateCount: 1, requiresSelection: false });
  });

  it("Saida elegivel sem comparacao e com mais de 1 Entrada candidata -> exige selecao manual", () => {
    const mode = resolveComparisonButtonMode({ inspectionType: "exit", hasActiveComparison: false, canCompare: true, candidateEntryCount: 2 });
    expect(mode).toEqual({ kind: "select_and_compare", candidateCount: 2, requiresSelection: true });
  });

  it("Saida sem nenhuma Entrada candidata -> nenhum botao (nao ocupa espaco sem utilidade)", () => {
    const mode = resolveComparisonButtonMode({ inspectionType: "exit", hasActiveComparison: false, canCompare: true, candidateEntryCount: 0 });
    expect(mode).toEqual({ kind: "none" });
  });

  it("Saida nao elegivel (ainda em andamento) mesmo com candidatas -> nenhum botao", () => {
    const mode = resolveComparisonButtonMode({ inspectionType: "exit", hasActiveComparison: false, canCompare: false, candidateEntryCount: 2 });
    expect(mode).toEqual({ kind: "none" });
  });

  it("Entrada com comparacao ja feita contra alguma Saida -> ver, nao comparar/selecionar", () => {
    const mode = resolveComparisonButtonMode({ inspectionType: "entry", hasActiveComparison: true, canCompare: false, candidateEntryCount: 0 });
    expect(mode).toEqual({ kind: "toggle_view", viewingAs: "entry" });
  });

  it("Entrada sem nenhuma comparacao feita -> nenhum botao (nunca oferece comparar a partir da Entrada)", () => {
    const mode = resolveComparisonButtonMode({ inspectionType: "entry", hasActiveComparison: false, canCompare: false, candidateEntryCount: 5 });
    expect(mode).toEqual({ kind: "none" });
  });
});
