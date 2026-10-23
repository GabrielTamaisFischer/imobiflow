import { describe, expect, it } from "vitest";
import type { MysqlInspection } from "@/product/inspections";
import { buildStructureCopyPlan, mergeCandidateEntries, pickDefaultReferenceEntryId } from "./app.vistorias.nova";

// Bloco 5 — "Criar vistoria de saída a partir da Entrada".
//
// Este repositório não usa @testing-library/react (ver
// src/routes/portal.proprietario.$token.test.ts); seguimos o mesmo padrão
// testando as funções puras extraídas do componente em vez de renderizar.

function inspection(overrides: Partial<MysqlInspection> = {}): MysqlInspection {
  return {
    id: "insp-1",
    property_id: "prop-1",
    assigned_user_id: null,
    created_by: "user-1",
    type: "entry",
    status: "completed",
    notes: null,
    version: 1,
    completed_at: "2026-01-01T00:00:00.000Z",
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    rooms: [],
    ...overrides,
  };
}

describe("mergeCandidateEntries", () => {
  it("concatena concluídas e arquivadas preservando a ordem (concluídas primeiro)", () => {
    const completed = [inspection({ id: "c1" }), inspection({ id: "c2" })];
    const archived = [inspection({ id: "a1", status: "archived" })];
    expect(mergeCandidateEntries(completed, archived).map((e) => e.id)).toEqual(["c1", "c2", "a1"]);
  });

  it("devolve lista vazia quando não há nenhuma entrada compatível", () => {
    expect(mergeCandidateEntries([], [])).toEqual([]);
  });
});

describe("pickDefaultReferenceEntryId", () => {
  it("pré-seleciona automaticamente quando há exatamente uma entrada compatível", () => {
    expect(pickDefaultReferenceEntryId([inspection({ id: "only-one" })])).toBe("only-one");
  });

  it("não pré-seleciona quando não há nenhuma entrada compatível", () => {
    expect(pickDefaultReferenceEntryId([])).toBe("");
  });

  it("não pré-seleciona quando há mais de uma entrada compatível — exige escolha manual", () => {
    expect(pickDefaultReferenceEntryId([inspection({ id: "e1" }), inspection({ id: "e2" })])).toBe("");
  });
});

describe("buildStructureCopyPlan", () => {
  it("copia apenas nome e posição de ambientes/itens, na ordem correta, nunca condition/notes/evidência", () => {
    const reference = {
      rooms: [
        {
          id: "room-2", name: "Cozinha", position: 1, notes: "observação da entrada — NUNCA deve aparecer no plano",
          items: [
            { id: "item-2a", name: "Piso", condition: "damaged" as const, position: 0, notes: "arranhado — NUNCA deve aparecer no plano" },
          ],
        },
        {
          id: "room-1", name: "Sala", position: 0,
          notes: null,
          items: [
            { id: "item-1b", name: "Parede", condition: "good" as const, position: 1, notes: null },
            { id: "item-1a", name: "Janela", condition: "excellent" as const, position: 0, notes: null },
          ],
        },
      ],
    };

    const plan = buildStructureCopyPlan(reference, 5);

    // Ordem: ambientes por position (Sala antes de Cozinha), e dentro de
    // cada ambiente os itens por position (Janela antes de Parede).
    expect(plan.map((step) => (step.kind === "room" ? `room:${step.name}` : `item:${step.name}`))).toEqual([
      "room:Sala", "item:Janela", "item:Parede", "room:Cozinha", "item:Piso",
    ]);

    // expected_version é sequencial a partir do version atual da vistoria
    // recém-criada — nunca reaproveita a versão da Entrada de referência.
    expect(plan.map((step) => step.expectedVersion)).toEqual([5, 6, 7, 8, 9]);

    // Nenhum passo do plano carrega condition/notes/evidência da Entrada —
    // todo item nasce "not_inspected", sem observação, sem foto.
    for (const step of plan) {
      if (step.kind === "item") {
        expect(step.condition).toBe("not_inspected");
        expect(step).not.toHaveProperty("notes");
        expect(step).not.toHaveProperty("evidence");
      }
      expect(step).not.toHaveProperty("notes");
    }

    // position local reinicia em 0 por ambiente/por lista de itens — não
    // herda a position bruta da Entrada quando ela não começa em 0.
    const salaStep = plan.find((step) => step.kind === "room" && step.name === "Sala");
    expect(salaStep).toMatchObject({ position: 0 });
    const cozinhaStep = plan.find((step) => step.kind === "room" && step.name === "Cozinha");
    expect(cozinhaStep).toMatchObject({ position: 1 });
  });

  it("devolve plano vazio quando a Entrada de referência não tem ambientes", () => {
    expect(buildStructureCopyPlan({ rooms: [] }, 3)).toEqual([]);
  });

  it("mantém o sourceRoomId em cada passo de item, para o submit() remapear ao id real criado no backend", () => {
    const reference = {
      rooms: [
        { id: "room-x", name: "Quarto", position: 0, notes: null, items: [{ id: "item-x", name: "Cama", condition: "good" as const, position: 0, notes: null }] },
      ],
    };
    const plan = buildStructureCopyPlan(reference, 10);
    const itemStep = plan.find((step) => step.kind === "item");
    expect(itemStep).toMatchObject({ sourceRoomId: "room-x", sourceItemId: "item-x" });
  });
});
