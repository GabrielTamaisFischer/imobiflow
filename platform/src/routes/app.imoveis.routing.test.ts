import { describe, expect, it } from "vitest";
import { parsePropertiesSearch, resolveSubmitIntent } from "./app.imoveis";

// full-page-imoveis (2026-09-11): este projeto não tem jsdom/React Testing
// Library configurado (vitest.config.ts roda em "environment: node" e só
// inclui src/**/*.test.ts — nem sequer .test.tsx) e nenhuma dependência de
// renderização foi adicionada aqui de propósito: fazer isso exigiria mexer
// em package.json/package-lock.json, e platform/package-lock.json está
// explicitamente fora do escopo desta tarefa (não pode ser tocado). Por
// isso estes testes cobrem a LÓGICA REAL por trás dos dois bugs corrigidos
// (P1: navegação full-page via URL/search params; P2: resolução do intent
// do submit) como funções puras exportadas de app.imoveis.tsx, no mesmo
// estilo já usado em app.imoveis.media.test.ts — não são testes de
// renderização/clique de componente. Ver o relatório final para a lista de
// cenários de UI que ficam como verificação manual pendente por causa
// dessa limitação de infraestrutura de testes do projeto.

describe("parsePropertiesSearch — search params de /app/imoveis", () => {
  it("aceita focusPropertyId e notice quando ambos são strings", () => {
    expect(parsePropertiesSearch({ focusPropertyId: "prop-1", notice: "Imóvel salvo." })).toEqual({
      focusPropertyId: "prop-1",
      notice: "Imóvel salvo.",
    });
  });

  it("omite campos ausentes/inválidos em vez de incluir undefined/null/outros tipos", () => {
    expect(parsePropertiesSearch({})).toEqual({});
    expect(parsePropertiesSearch({ focusPropertyId: 123, notice: null })).toEqual({});
    expect(parsePropertiesSearch({ notice: "" })).toEqual({ notice: "" });
  });

  it("aceita notice sozinho (fluxo de criar/editar sem focusPropertyId)", () => {
    expect(parsePropertiesSearch({ notice: "Imóvel cadastrado com sucesso." })).toEqual({
      notice: "Imóvel cadastrado com sucesso.",
    });
  });

  it("aceita focusPropertyId sozinho (fluxo antigo, vindo da Ficha do proprietário)", () => {
    expect(parsePropertiesSearch({ focusPropertyId: "prop-9" })).toEqual({
      focusPropertyId: "prop-9",
    });
  });
});

describe("resolveSubmitIntent — P2: bug 'Salvar e publicar' não fazia nada", () => {
  it("usa o value do submitter quando ele existe (caminho normal, sem heurística)", () => {
    expect(resolveSubmitIntent("publish", null)).toBe("publish");
    expect(resolveSubmitIntent("draft", "save")).toBe("draft");
    expect(resolveSubmitIntent("save", "publish")).toBe("save");
  });

  it("cai no fallback (pendingIntent) quando submitter é null/undefined", () => {
    expect(resolveSubmitIntent(null, "publish")).toBe("publish");
    expect(resolveSubmitIntent(undefined, "draft")).toBe("draft");
  });

  it("cai em 'save' apenas quando NEM submitter NEM o fallback informam o intent — nunca perde 'publish' silenciosamente", () => {
    expect(resolveSubmitIntent(null, null)).toBe("save");
    expect(resolveSubmitIntent(undefined, null)).toBe("save");
  });

  it("ignora um value de submitter desconhecido e usa o fallback em vez de aceitar lixo", () => {
    expect(resolveSubmitIntent("qualquer-coisa", "publish")).toBe("publish");
    expect(resolveSubmitIntent("", "publish")).toBe("publish");
  });
});
