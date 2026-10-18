/**
 * C1.2 — integration test REAL contra o MySQL/TiDB de staging.
 *
 * Mocks não são suficientes para fechar C1.2 (exigência explícita do
 * escopo): este script exercita resolveOrCreateParty/ensurePartyRole
 * diretamente contra o banco de staging de verdade, provando o
 * comportamento real da constraint UNIQUE, da concorrência via P2002 e do
 * isolamento de tenant — nada disso pode ser provado só com um Prisma fake
 * em memória.
 *
 * Segurança (mesmo padrão de scripts/run-import-500-railway-staging.mjs):
 *  - NUNCA roda sem opt-in explícito (ALLOW_PARTY_IDENTITY_INTEGRATION_TEST).
 *  - NUNCA roda sem confirmar o destino exato do banco via
 *    EXPECTED_STAGING_DB_HOST/PORT/NAME comparado contra DATABASE_URL já
 *    exportado no shell (este script não lê nenhum arquivo .env por conta
 *    própria — propositalmente, para nunca correr o risco de importar um
 *    módulo do backend antes do DATABASE_URL correto estar no ambiente).
 *  - NUNCA toca em empresa real: só prossegue se o banco tiver exatamente
 *    as 2 empresas sintéticas já usadas por run-import-500-railway-staging
 *    (nome contendo "staging"), mesma verificação de preflight.companiesAreSynthetic.
 *  - Todo dado criado é sintético, marcado com um runKey único, e é
 *    removido em bloco finally — mesmo se o teste falhar no meio.
 *
 * Uso (depois de exportar o DATABASE_URL correto de staging no shell):
 *   ALLOW_PARTY_IDENTITY_INTEGRATION_TEST=true \
 *   EXPECTED_STAGING_DB_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com \
 *   EXPECTED_STAGING_DB_PORT=4000 \
 *   EXPECTED_STAGING_DB_NAME=imobiflow_staging \
 *   npx tsx scripts/run-party-identity-integration-staging.ts
 */
import { randomBytes } from "node:crypto";

function assertSessionGuard(name: string, expected: string) {
  if (process.env[name] !== expected) {
    throw new Error(`${name}=${expected} e obrigatorio nesta sessao (guarda de seguranca obrigatoria).`);
  }
}

function assertDatabaseTarget() {
  const expectedHost = process.env.EXPECTED_STAGING_DB_HOST;
  const expectedPort = process.env.EXPECTED_STAGING_DB_PORT;
  const expectedDatabase = process.env.EXPECTED_STAGING_DB_NAME;
  if (!expectedHost || !expectedPort || !expectedDatabase) {
    throw new Error("O destino sanitizado de staging precisa ser confirmado por EXPECTED_STAGING_DB_HOST/PORT/NAME.");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error(
      "DATABASE_URL precisa estar exportado no shell ANTES de chamar este script (nunca carregado de dentro dele) — " +
        "ex.: set -a && source platform/.env.c1-staging && set +a.",
    );
  }
  const url = new URL(raw);
  if (url.hostname !== expectedHost || url.port !== expectedPort || url.pathname.replace(/^\//, "") !== expectedDatabase) {
    throw new Error("DATABASE_URL do ambiente nao corresponde ao MySQL de staging confirmado. Execucao interrompida.");
  }
}

assertSessionGuard("ALLOW_PARTY_IDENTITY_INTEGRATION_TEST", "true");
assertDatabaseTarget();

// Import dinâmico DEPOIS das guardas acima terem validado o ambiente — e
// depois de DATABASE_URL já estar confirmado no processo. Os módulos do
// backend (via config/env.ts) leem DATABASE_URL do processo no load; como
// esse script nunca o sobrescreve (apenas valida o que o shell já exportou),
// a ordem de import aqui não corre risco de ler um valor errado.
const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { ensurePartyRole, resolveOrCreateParty } = await import("../backend/src/services/party-identity.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-PARTY-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const createdPartyIds = new Set<string>();
const createdPartyRoleIds = new Set<string>();

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];

function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

async function preflightOnlySyntheticCompanies() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  const synthetic = companies.length === 2 && companies.every((company) => /staging/i.test(company.name));
  if (!synthetic) {
    throw new Error(
      "O banco nao tem exatamente as 2 empresas sinteticas esperadas (mesma verificacao de run-import-500-railway-staging). " +
        "Execucao interrompida para nunca arriscar tocar dado real.",
    );
  }
  return companies;
}

async function run() {
  const companies = await preflightOnlySyntheticCompanies();
  const [companyA, companyB] = companies;

  // Gera um CPF matematicamente valido e sintetico, derivado do runKey, para
  // nao colidir com nenhum outro teste/execucao.
  const cpfBase = String(Date.now()).slice(-9).padStart(9, "0");
  const cpf = computeValidCpf(cpfBase);

  // --- [D]/[E] reaproveitamento na mesma empresa / independencia entre empresas ---
  const firstA = await resolveOrCreateParty({ companyId: companyA.id, name: `${runKey} Pessoa A1`, taxId: cpf, partyType: "individual" });
  createdPartyIds.add(firstA.party.id);
  const secondA = await resolveOrCreateParty({ companyId: companyA.id, name: `${runKey} Pessoa A2`, taxId: cpf, partyType: "individual" });
  createdPartyIds.add(secondA.party.id);
  record("[D] mesmo CPF, mesma empresa, reutiliza a mesma Party (banco real)", secondA.party.id === firstA.party.id && secondA.created === false);

  const firstB = await resolveOrCreateParty({ companyId: companyB.id, name: `${runKey} Pessoa B1`, taxId: cpf, partyType: "individual" });
  createdPartyIds.add(firstB.party.id);
  record(
    "[E] mesmo CPF em empresas diferentes cria Parties independentes (banco real)",
    firstB.party.id !== firstA.party.id && firstB.party.companyId === companyB.id,
  );

  // --- [I] concorrência real: duas tentativas simultâneas do MESMO documento novo ---
  const cpfConcurrent = computeValidCpf(String(Date.now()).slice(-8).padStart(9, "1"));
  const [raceA, raceB] = await Promise.all([
    resolveOrCreateParty({ companyId: companyA.id, name: `${runKey} Corrida A`, taxId: cpfConcurrent, partyType: "individual" }),
    resolveOrCreateParty({ companyId: companyA.id, name: `${runKey} Corrida B`, taxId: cpfConcurrent, partyType: "individual" }),
  ]);
  createdPartyIds.add(raceA.party.id);
  createdPartyIds.add(raceB.party.id);
  const rowsForRaceCpf = await prisma.party.count({ where: { companyId: companyA.id, taxIdNormalized: cpfConcurrent } });
  record(
    "[I] concorrencia real (UNIQUE constraint + P2002): duas chamadas simultaneas resultam numa unica linha",
    raceA.party.id === raceB.party.id && rowsForRaceCpf === 1,
    `rowsForRaceCpf=${rowsForRaceCpf}`,
  );

  // --- [M] isolamento de tenant real ---
  let tenantIsolationHeld = false;
  try {
    await ensurePartyRole(companyB.id, firstA.party.id, "owner");
  } catch (error) {
    tenantIsolationHeld = (error as { code?: string }).code === "PARTY_NOT_FOUND";
  }
  record("[M] isolamento de tenant real: partyId de outra empresa e rejeitado", tenantIsolationHeld);

  // --- [L] concorrência real em PartyRole ---
  const [roleA, roleB] = await Promise.all([
    ensurePartyRole(companyA.id, firstA.party.id, "buyer"),
    ensurePartyRole(companyA.id, firstA.party.id, "buyer"),
  ]);
  createdPartyRoleIds.add(roleA.partyRole.id);
  createdPartyRoleIds.add(roleB.partyRole.id);
  const rolesForParty = await prisma.partyRole.count({ where: { companyId: companyA.id, partyId: firstA.party.id, role: "buyer" } });
  record(
    "[L] concorrencia real em PartyRole (UNIQUE constraint + P2002): idempotente",
    roleA.partyRole.id === roleB.partyRole.id && rolesForParty === 1,
    `rolesForParty=${rolesForParty}`,
  );

  return { companyA, companyB };
}

function computeValidCpf(nineDigits: string): string {
  const digits = nineDigits.split("").map(Number);
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += digits[index] * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  const d1 = digit(9);
  digits.push(d1);
  const d2 = digit(10);
  digits.push(d2);
  return digits.join("");
}

async function cleanup() {
  if (createdPartyRoleIds.size > 0) {
    await prisma.partyRole.deleteMany({ where: { id: { in: [...createdPartyRoleIds] } } });
  }
  if (createdPartyIds.size > 0) {
    await prisma.party.deleteMany({ where: { id: { in: [...createdPartyIds] } } });
  }
}

let exitCode = 0;
try {
  const { companyA, companyB } = await run();
  const allPassed = checks.every((check) => check.pass);
  console.log(JSON.stringify({ runKey, companyA: companyA.id, companyB: companyB.id, checks, allPassed }, null, 2));
  exitCode = allPassed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ runKey, fatalError: (error as Error).message }, null, 2));
  exitCode = 1;
} finally {
  await cleanup();
  const remainingParties = await prisma.party.count({ where: { name: { contains: runKey } } });
  const remainingRoles = createdPartyRoleIds.size > 0 ? await prisma.partyRole.count({ where: { id: { in: [...createdPartyRoleIds] } } }) : 0;
  console.log(JSON.stringify({ cleanup: { remainingParties, remainingRoles } }, null, 2));
  await prisma.$disconnect();
}

process.exit(exitCode);
