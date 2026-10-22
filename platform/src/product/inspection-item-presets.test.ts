import { describe, expect, it } from "vitest";
import { buildSuggestedInspectionItems, selectNewPresetItems } from "./inspection-item-presets";

describe("buildSuggestedInspectionItems", () => {
  it.each([
    ["Sala", ["Paredes", "Piso", "Teto", "Pintura", "Portas", "Janelas", "Tomadas", "Iluminação"]],
    ["Cozinha", ["Paredes", "Piso", "Teto", "Pintura", "Portas", "Janelas", "Tomadas", "Iluminação", "Pia", "Torneira", "Bancada", "Armários", "Revestimento"]],
    ["Quarto 1", ["Paredes", "Piso", "Teto", "Pintura", "Portas", "Janelas", "Tomadas", "Iluminação", "Armários"]],
    ["Suíte", ["Paredes", "Piso", "Teto", "Pintura", "Portas", "Janelas", "Tomadas", "Iluminação", "Armários"]],
    ["Banheiro 1", ["Piso", "Paredes", "Revestimento", "Teto", "Pintura", "Porta", "Janela", "Pia", "Torneira", "Vaso sanitário", "Box", "Chuveiro", "Ralo", "Iluminação"]],
    ["Área de serviço", ["Piso", "Paredes", "Teto", "Pintura", "Tanque", "Torneira", "Ralo", "Tomadas", "Iluminação"]],
    ["Garagem", ["Piso", "Paredes", "Teto/cobertura", "Portão", "Iluminação", "Tomadas"]],
    ["Quintal", ["Piso", "Paredes/muros", "Portões", "Ralos", "Iluminação", "Cobertura"]],
  ] as const)("preset de %s", (roomName, expected) => {
    expect(buildSuggestedInspectionItems(roomName)).toEqual(expected);
  });

  it("ambiente customizado (sem categoria reconhecida) recebe o preset genérico/base", () => {
    expect(buildSuggestedInspectionItems("Sala de jogos")).toEqual(
      ["Paredes", "Piso", "Teto", "Pintura", "Portas", "Janelas", "Tomadas", "Iluminação"],
    );
  });
});

describe("selectNewPresetItems — idempotência", () => {
  it("não sugere de novo um item que o ambiente já tem (nem com variação de caixa/acento)", () => {
    const preset = buildSuggestedInspectionItems("Sala");
    const afterFirstRun = selectNewPresetItems([], preset);
    expect(afterFirstRun).toEqual(preset);

    const afterSecondRun = selectNewPresetItems(afterFirstRun, preset);
    expect(afterSecondRun).toEqual([]);
  });

  it("ignora diferenças de acento/caixa ao comparar com os itens já existentes", () => {
    const result = selectNewPresetItems(["paredes", "PISO"], ["Paredes", "Piso", "Teto"]);
    expect(result).toEqual(["Teto"]);
  });

  it("nunca duplica dentro do próprio preset sugerido", () => {
    const result = selectNewPresetItems([], ["Paredes", "paredes", "Piso"]);
    expect(result).toEqual(["Paredes", "Piso"]);
  });
});
