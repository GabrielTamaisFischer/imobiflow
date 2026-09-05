/**
 * Fase 4B.1 — pré-check de dados reais para a futura migration
 * UNIQUE(portal_token) em PropertyOwner.
 *
 * Consulta somente leitura (não altera nenhum dado). Nunca imprime um token
 * completo — apenas contagens e, quando necessário mostrar evidência de
 * duplicidade, o id do proprietário e um trecho mascarado do token
 * (primeiros 8 caracteres + "…").
 *
 * Uso: npx tsx scripts/fase-4b1-portal-token-precheck.ts
 */
import "../src/config/env.js";
import { getPrisma } from "../src/lib/website-builder-prisma.js";

function mask(token: string) {
  return `${token.slice(0, 8)}…(${token.length} chars)`;
}

async function main() {
  const prisma = getPrisma();

  const total = await prisma.propertyOwner.count();
  const nullTokens = await prisma.propertyOwner.count({ where: { portalToken: null } });
  const filledTokens = total - nullTokens;

  const owners = await prisma.propertyOwner.findMany({
    where: { portalToken: { not: null } },
    select: { id: true, portalToken: true },
  });

  const byToken = new Map<string, string[]>();
  const invalidFormat: string[] = [];
  const emptyOrWhitespace: string[] = [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  for (const owner of owners) {
    const token = owner.portalToken as string;
    if (!token || token.trim().length === 0) {
      emptyOrWhitespace.push(owner.id);
      continue;
    }
    if (!uuidRe.test(token)) invalidFormat.push(owner.id);
    const list = byToken.get(token) ?? [];
    list.push(owner.id);
    byToken.set(token, list);
  }

  const duplicates = [...byToken.entries()].filter(([, ids]) => ids.length > 1);

  console.log("=== Fase 4B.1 — Pré-check PropertyOwner.portalToken ===");
  console.log(`Total de PropertyOwner: ${total}`);
  console.log(`portalToken NULL: ${nullTokens}`);
  console.log(`portalToken preenchido: ${filledTokens}`);
  console.log(`Tokens vazios/whitespace (entre os preenchidos): ${emptyOrWhitespace.length}`);
  console.log(`Tokens com formato fora do padrão UUID: ${invalidFormat.length}`);
  console.log(`Grupos de token duplicado (não-nulo): ${duplicates.length}`);

  if (duplicates.length > 0) {
    console.log("Evidência (mascarada) de duplicidade:");
    for (const [token, ids] of duplicates) {
      console.log(`  token ${mask(token)} -> owners: ${ids.join(", ")}`);
    }
  }

  const maxLength = owners.reduce(
    (max, owner) => Math.max(max, (owner.portalToken as string)?.length ?? 0),
    0,
  );
  console.log(`Maior tamanho de token encontrado: ${maxLength} (coluna suporta até 120)`);

  console.log("=== Conclusão ===");
  console.log(
    `UNIQUE(portal_token) pode ser aplicada com segurança hoje: ${duplicates.length === 0 ? "SIM" : "NÃO — resolver duplicados antes"}`,
  );
  console.log(
    "Observação: MySQL/TiDB (padrão InnoDB) trata múltiplos NULL como valores distintos em índice UNIQUE — não colide com portalToken=NULL.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Falha no pré-check:", error);
    process.exit(1);
  });
