import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// full-page-imoveis (2026-09-11) — CORREÇÃO URGENTE: o usuário testou o
// deploy anterior (commit 6079dd2) em staging e "Novo imóvel"/"Editar" não
// mostravam NADA — a URL mudava, mas a tela continuava a listagem. Causa
// raiz real, confirmada lendo o routeTree.gen.ts gerado: as rotas
// app.imoveis.novo.tsx e app.imoveis.$propertyId.editar.tsx eram, pela
// convenção de nomes com ponto do TanStack Router, filhas de
// AppImoveisRoute (app.imoveis.tsx) — e app.imoveis.tsx renderiza
// PropertiesPage diretamente, SEM <Outlet/>. Sem Outlet no pai, a rota
// filha nunca é montada, mesmo com a URL/roteador corretos — exatamente o
// "clico e não acontece nada visível" relatado.
//
// Corrigido com a convenção OFICIAL do TanStack Router para rotas
// "non-nested" (arquivo com "_" no segmento do pai): renomeando os dois
// arquivos para app.imoveis_.novo.tsx e
// app.imoveis_.$propertyId.editar.tsx. Isso muda o pai gerado de
// AppImoveisRoute para AppRoute (o layout de /app, que TEM <Outlet/> —
// confirmado em src/routes/app.tsx) mantendo a mesma URL final
// (/app/imoveis/novo, /app/imoveis/:propertyId/editar). Nenhum wizard novo
// foi criado, nenhum conteúdo de app.imoveis.tsx mudou por causa disso.
//
// Este teste lê o routeTree.gen.ts REAL e gerado pelo build (não um mock)
// e trava a árvore de rotas: se alguém reverter o rename ou o plugin
// regenerar a árvore errada de novo, este teste falha imediatamente — é o
// guarda de regressão direto para o bug relatado pelo usuário.

const routeTreePath = fileURLToPath(new URL("../routeTree.gen.ts", import.meta.url));
const routeTreeSource = readFileSync(routeTreePath, "utf8");

function parentOf(routeConstName: string): string {
  const declRe = new RegExp(
    `const ${routeConstName}\\s*=[\\s\\S]*?getParentRoute:\\s*\\(\\)\\s*=>\\s*(\\w+)`,
  );
  const match = routeTreeSource.match(declRe);
  if (!match) throw new Error(`Route ${routeConstName} não encontrada em routeTree.gen.ts`);
  return match[1];
}

describe("routeTree.gen.ts — /app/imoveis/novo e /app/imoveis/:propertyId/editar", () => {
  it("NÃO ficam aninhadas sob AppImoveisRoute (a causa raiz do bug relatado)", () => {
    expect(parentOf("AppImoveisNovoRoute")).not.toBe("AppImoveisRoute");
    expect(parentOf("AppImoveisPropertyIdEditarRoute")).not.toBe("AppImoveisRoute");
  });

  it("ficam aninhadas diretamente sob AppRoute, que renderiza <Outlet/>", () => {
    expect(parentOf("AppImoveisNovoRoute")).toBe("AppRoute");
    expect(parentOf("AppImoveisPropertyIdEditarRoute")).toBe("AppRoute");
  });

  it("mantêm a URL final esperada apesar do rename do arquivo (path, não id)", () => {
    const novoPathMatch = routeTreeSource.match(
      /const AppImoveisNovoRoute = AppImoveisNovoRouteImport\.update\(\{[\s\S]*?path:\s*'([^']+)'/,
    );
    const editarPathMatch = routeTreeSource.match(
      /const AppImoveisPropertyIdEditarRoute =\s*AppImoveisPropertyIdEditarRouteImport\.update\(\{[\s\S]*?path:\s*'([^']+)'/,
    );
    expect(novoPathMatch?.[1]).toBe("/imoveis/novo");
    expect(editarPathMatch?.[1]).toBe("/imoveis/$propertyId/editar");
  });
});

describe("app.tsx — pré-condição do fix (o pai precisa ter Outlet)", () => {
  it("AppRoute (app.tsx) renderiza <Outlet/>, diferente de app.imoveis.tsx", () => {
    const appTsxPath = fileURLToPath(new URL("./app.tsx", import.meta.url));
    const appImoveisTsxPath = fileURLToPath(new URL("./app.imoveis.tsx", import.meta.url));
    const appTsxSource = readFileSync(appTsxPath, "utf8");
    const appImoveisTsxSource = readFileSync(appImoveisTsxPath, "utf8");
    expect(appTsxSource).toContain("<Outlet");
    // Documenta a causa raiz: app.imoveis.tsx (PropertiesPage) continua sem
    // Outlet de propósito — é por isso que as rotas filhas tiveram que
    // deixar de ser filhas dele, em vez de exigir um Outlet ali (o que
    // reintroduziria o risco de a listagem aparecer atrás do wizard).
    expect(appImoveisTsxSource).not.toContain("<Outlet");
  });
});
