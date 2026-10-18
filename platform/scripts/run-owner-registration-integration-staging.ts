/**
 * C2 — integration test REAL contra o MySQL/TiDB de staging, para o
 * serviço canônico owner-registration.ts (createOrResolveOwner /
 * updateOwnerCanonical).
 *
 * Mesmo padrão de segurança de run-party-identity-integration-staging.ts
 * (C1.2) — não duplicado por acidente, replicado deliberadamente porque
 * cada script precisa ser auditável isoladamente:
 *  - NUNCA roda sem opt-in explícito (ALLOW_OWNER_REGISTRATION_INTEGRATION_TEST).
 *  - NUNCA roda sem confirmar o destino exato do banco via
 *    EXPECTED_STAGING_DB_HOST/PORT/NAME comparado contra DATABASE_URL já
 *    exportado no shell (nunca lido de um .env por conta própria).
 *  - NUNCA toca em empresa real: busca SOMENTE empresas com
 *    isSynthetic = true (coluna real do schema), exige pelo menos 2,
 *    ordenadas de forma estável (createdAt+id), com reconfirmação em
 *    runtime antes de qualquer INSERT de QA.
 *  - Todo PropertyOwner/Party/PartyRole criado é marcado com um runKey
 *    único e removido em bloco finally, mesmo se o teste falhar no meio.
 *    A ordem de remoção respeita as FKs (PropertyOwner -> PartyRole -> Party).
 *
 * Uso (depois de exportar o DATABASE_URL correto de staging no shell):
 *   ALLOW_OWNER_REGISTRATION_INTEGRATION_TEST=true \
 *   EXPECTED_STAGING_DB_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com \
 *   EXPECTED_STAGING_DB_PORT=4000 \
 *   EXPECTED_STAGING_DB_NAME=imobiflow_staging \
 *   npx tsx scripts/run-owner-registration-integration-staging.ts
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

assertSessionGuard("ALLOW_OWNER_REGISTRATION_INTEGRATION_TEST", "true");
assertDatabaseTarget();

// Import dinâmico DEPOIS das guardas acima — mesma razão do script de C1.2:
// módulos do backend leem DATABASE_URL do processo no load.
const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { createOrResolveOwner, updateOwnerCanonical } = await import("../backend/src/services/owner-registration.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-OWNERREG-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const createdOwnerIds = new Set<string>();
const createdPartyIds = new Set<string>();
const createdPartyRoleIds = new Set<string>();

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];
function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

async function preflightSelectTwoSyntheticCompanies() {
  const syntheticCompanies = await prisma.company.findMany({
    where: { isSynthetic: true },
    select: { id: true, name: true, isSynthetic: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (syntheticCompanies.length < 2) {
    throw new Error(
      `Encontradas apenas ${syntheticCompanies.length} empresa(s) com isSynthetic=true; ` +
        "e necessario pelo menos 2 para rodar o teste de isolamento de tenant. Execucao interrompida " +
        "(nunca usa empresa real como fallback).",
    );
  }

  const [companyA, companyB] = syntheticCompanies;
  if (companyA.isSynthetic !== true || companyB.isSynthetic !== true || companyA.id === companyB.id) {
    throw new Error(
      "Reconfirmacao em runtime falhou (isSynthetic ou unicidade de id entre companyA/companyB) — " +
        "abortando antes de qualquer insercao de QA.",
    );
  }
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

function trackOwner(owner: { id: string; party_id: string | null }) {
  createdOwnerIds.add(owner.id);
  if (owner.party_id) createdPartyIds.add(owner.party_id);
}

async function run() {
  const { companyA, companyB } = await preflightSelectTwoSyntheticCompanies();
  const userId = "00000000-0000-4000-8000-0000000000aa";

  // --- [A] criação nova: Party + PartyRole("owner") + PropertyOwner ---
  const cpfA = computeValidCpf(String(Date.now()).slice(-9).padStart(9, "0"));
  const ownerA = await createOrResolveOwner(companyA.id, userId, {
    name: `${runKey} Proprietario A`,
    document: cpfA,
    owner_type: "individual",
  });
  trackOwner(ownerA as { id: string; party_id: string | null });
  record("[A] criação nova gera party_id preenchido", Boolean((ownerA as { party_id: string | null }).party_id));
  if ((ownerA as { party_id: string | null }).party_id) {
    createdPartyRoleIds.add(
      `${companyA.id}:${(ownerA as { party_id: string | null }).party_id}:owner`,
    );
  }

  // --- [B] mesmo CPF, mesma empresa: Party é reaproveitada, mas criação duplicada é rejeitada (409) ---
  let duplicateRejected = false;
  try {
    await createOrResolveOwner(companyA.id, userId, {
      name: `${runKey} Proprietario A Duplicado`,
      document: cpfA,
      owner_type: "individual",
    });
  } catch (error) {
    duplicateRejected = (error as { code?: string }).code === "DUPLICATE_OWNER_DOCUMENT";
  }
  record("[B] mesmo CPF/mesma empresa rejeita criação duplicada (409 DUPLICATE_OWNER_DOCUMENT)", duplicateRejected);

  // --- [D]/[N] mesmo CPF, empresa diferente: Party e Owner totalmente independentes ---
  const ownerB = await createOrResolveOwner(companyB.id, userId, {
    name: `${runKey} Proprietario B`,
    document: cpfA,
    owner_type: "individual",
  });
  trackOwner(ownerB as { id: string; party_id: string | null });
  record(
    "[D]/[N] mesmo CPF em empresa diferente cria Party e Owner independentes (isolamento real de tenant)",
    (ownerB as { party_id: string | null }).party_id !== (ownerA as { party_id: string | null }).party_id,
  );

  // --- [G] concorrência real: duas criações simultâneas do MESMO CPF novo na mesma empresa ---
  const cpfConcurrent = computeValidCpf(String(Date.now()).slice(-8).padStart(9, "1"));
  const [raceA, raceB] = await Promise.allSettled([
    createOrResolveOwner(companyA.id, userId, { name: `${runKey} Corrida A`, document: cpfConcurrent, owner_type: "individual" }),
    createOrResolveOwner(companyA.id, userId, { name: `${runKey} Corrida B`, document: cpfConcurrent, owner_type: "individual" }),
  ]);
  for (const result of [raceA, raceB]) {
    if (result.status === "fulfilled") trackOwner(result.value as { id: string; party_id: string | null });
  }
  const partyRowsForConcurrentCpf = await prisma.party.count({
    where: { companyId: companyA.id, taxIdNormalized: cpfConcurrent },
  });
  const ownerRowsForConcurrentCpf = await prisma.propertyOwner.count({
    where: { companyId: companyA.id, document: cpfConcurrent },
  });
  record(
    "[G] concorrência real na camada Party: nunca duplica (UNIQUE + P2002), mesmo com 2 criações simultâneas de owner",
    partyRowsForConcurrentCpf === 1,
    `partyRowsForConcurrentCpf=${partyRowsForConcurrentCpf}`,
  );
  // Nota: na camada PropertyOwner NÃO existe UNIQUE constraint (dívida
  // documentada — ver owner-registration.ts). Registramos o resultado real
  // observado em staging sem exigir um valor específico, para não travar o
  // teste numa garantia que o código explicitamente não oferece ainda.
  record(
    "[G] (informativo) linhas de PropertyOwner para o CPF concorrente — não há UNIQUE constraint nesta fase",
    true,
    `ownerRowsForConcurrentCpf=${ownerRowsForConcurrentCpf}`,
  );

  // --- [P] legado: PropertyOwner com partyId NULL continua funcionando, e lazy-link funciona sob update real ---
  const legacyCpf = computeValidCpf(String(Date.now()).slice(-7).padStart(9, "2"));
  const legacyOwner = await prisma.propertyOwner.create({
    data: {
      companyId: companyA.id,
      createdBy: userId,
      ownerType: "individual",
      clientType: "proprietario",
      name: `${runKey} Legado`,
      document: legacyCpf,
      addressJson: {},
      status: "active",
      portalToken: randomBytes(16).toString("hex"),
      portalEnabled: true,
      // partyId deliberadamente omitido — simula registro legado pré-C2.
    },
  });
  createdOwnerIds.add(legacyOwner.id);
  const legacyAfterNoopUpdate = await updateOwnerCanonical(companyA.id, legacyOwner.id, { phone: "11999998888" });
  record(
    "[P] update sem tocar em document não aciona lazy-link (partyId continua null)",
    (legacyAfterNoopUpdate as { party_id: string | null }).party_id === null,
  );
  const legacyAfterDocumentUpdate = await updateOwnerCanonical(companyA.id, legacyOwner.id, { document: legacyCpf });
  if ((legacyAfterDocumentUpdate as { party_id: string | null }).party_id) {
    createdPartyIds.add((legacyAfterDocumentUpdate as { party_id: string | null }).party_id as string);
  }
  record(
    "[P] update que inclui document explicitamente aciona lazy-link (partyId passa a existir)",
    Boolean((legacyAfterDocumentUpdate as { party_id: string | null }).party_id),
  );

  // --- [J] troca de documento em owner já vinculado é bloqueada ---
  const cpfToBlock = computeValidCpf(String(Date.now()).slice(-6).padStart(9, "3"));
  let documentChangeBlocked = false;
  try {
    await updateOwnerCanonical(companyA.id, legacyOwner.id, { document: cpfToBlock });
  } catch (error) {
    documentChangeBlocked = (error as { code?: string }).code === "OWNER_DOCUMENT_CHANGE_BLOCKED";
  }
  record("[J] troca de documento em owner já vinculado a uma Party é bloqueada (409)", documentChangeBlocked);

  return { companyA, companyB };
}

async function cleanup() {
  if (createdOwnerIds.size > 0) {
    await prisma.propertyOwner.deleteMany({ where: { id: { in: [...createdOwnerIds] } } });
  }
  if (createdPartyIds.size > 0) {
    await prisma.partyRole.deleteMany({ where: { partyId: { in: [...createdPartyIds] } } });
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
  const remainingOwners = await prisma.propertyOwner.count({ where: { name: { contains: runKey } } });
  const remainingParties = createdPartyIds.size > 0 ? await prisma.party.count({ where: { id: { in: [...createdPartyIds] } } }) : 0;
  const cleanupOk = remainingOwners === 0 && remainingParties === 0;
  if (!cleanupOk) exitCode = 1;
  console.log(JSON.stringify({ cleanup: { remainingOwners, remainingParties, cleanupOk } }, null, 2));
  await prisma.$disconnect();
}

process.exit(exitCode);
