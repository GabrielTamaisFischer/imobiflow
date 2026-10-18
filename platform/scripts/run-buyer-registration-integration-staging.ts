/**
 * C3 — integração REAL contra MySQL/TiDB de staging para identidade de
 * comprador: Party -> PartyRole("buyer") -> BuyerProfile -> Lead.partyId.
 *
 * Guardas:
 * - exige ALLOW_BUYER_REGISTRATION_INTEGRATION_TEST=true;
 * - exige confirmação explícita do host/porta/database de staging;
 * - usa somente empresas isSynthetic=true;
 * - todo dado QA é identificado por runKey e removido no finally;
 * - nunca usa empresa real como fallback.
 */
import { randomBytes } from "node:crypto";

function assertSessionGuard(name: string, expected: string) {
  if (process.env[name] !== expected) {
    throw new Error(`${name}=${expected} e obrigatorio nesta sessao.`);
  }
}

function assertDatabaseTarget() {
  const expectedHost = process.env.EXPECTED_STAGING_DB_HOST;
  const expectedPort = process.env.EXPECTED_STAGING_DB_PORT;
  const expectedDatabase = process.env.EXPECTED_STAGING_DB_NAME;
  const raw = process.env.DATABASE_URL;
  if (!expectedHost || !expectedPort || !expectedDatabase || !raw) {
    throw new Error("Destino de staging e DATABASE_URL precisam estar confirmados no ambiente.");
  }
  const url = new URL(raw);
  if (
    url.hostname !== expectedHost ||
    url.port !== expectedPort ||
    url.pathname.replace(/^\//, "") !== expectedDatabase
  ) {
    throw new Error("DATABASE_URL nao corresponde ao staging confirmado.");
  }
}

assertSessionGuard("ALLOW_BUYER_REGISTRATION_INTEGRATION_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { resolveOrCreateBuyerIdentity } = await import("../backend/src/services/buyer-registration.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-BUYER-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

const createdLeadIds = new Set<string>();
const createdPartyIds = new Set<string>();
const createdPartyRoleIds = new Set<string>();
const createdBuyerProfileIds = new Set<string>();

type Check = { name: string; pass: boolean; detail?: string };
const checks: Check[] = [];
function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, detail });
}

function computeValidCpf(nineDigits: string): string {
  const digits = nineDigits.split("").map(Number);
  const digit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += digits[index] * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  digits.push(digit(9));
  digits.push(digit(10));
  return digits.join("");
}

async function getSyntheticCompanies() {
  const companies = await prisma.company.findMany({
    where: { isSynthetic: true },
    select: { id: true, name: true, isSynthetic: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (companies.length < 2) throw new Error("Sao necessarias pelo menos 2 empresas sinteticas.");
  const [companyA, companyB] = companies;
  if (!companyA.isSynthetic || !companyB.isSynthetic || companyA.id === companyB.id) {
    throw new Error("Guarda de empresas sinteticas falhou.");
  }
  return { companyA, companyB };
}

function trackIdentity(result: {
  party: { id: string };
  partyRole: { id: string };
  buyerProfile: { id: string };
}) {
  createdPartyIds.add(result.party.id);
  createdPartyRoleIds.add(result.partyRole.id);
  createdBuyerProfileIds.add(result.buyerProfile.id);
}

async function createLead(companyId: string, partyId: string | null, name: string) {
  const lead = await prisma.lead.create({
    data: {
      companyId,
      partyId,
      name,
      source: "c3-integration",
      interestType: "sale",
      status: "open",
    },
    select: { id: true, companyId: true, partyId: true, name: true },
  });
  createdLeadIds.add(lead.id);
  return lead;
}

async function run() {
  const { companyA, companyB } = await getSyntheticCompanies();
  const userId = "00000000-0000-4000-8000-0000000000aa";
  const cpf = computeValidCpf(String(Date.now()).slice(-9).padStart(9, "4"));

  const first = await resolveOrCreateBuyerIdentity(companyA.id, userId, {
    name: `${runKey} Comprador A`,
    document: cpf,
    partyType: "individual",
    email: `${runKey.toLowerCase()}@example.com`,
  });
  trackIdentity(first);

  record("[A] Party criada com CPF normalizado", first.party.taxIdNormalized === cpf);
  record("[A] PartyRole buyer criada", first.partyRole.role === "buyer");
  record("[A] BuyerProfile criado", first.buyerProfile.partyRoleId === first.partyRole.id);

  const second = await resolveOrCreateBuyerIdentity(companyA.id, userId, {
    name: `${runKey} Comprador A novamente`,
    document: cpf,
    partyType: "individual",
  });
  trackIdentity(second);

  record("[B] mesmo CPF/empresa reutiliza Party", second.party.id === first.party.id);
  record("[B] mesmo CPF/empresa reutiliza PartyRole", second.partyRole.id === first.partyRole.id);
  record("[B] mesmo CPF/empresa reutiliza BuyerProfile", second.buyerProfile.id === first.buyerProfile.id);

  const lead1 = await createLead(companyA.id, first.party.id, `${runKey} Lead 1`);
  const lead2 = await createLead(companyA.id, first.party.id, `${runKey} Lead 2`);
  record(
    "[C] mesma Party pode ter multiplos Leads",
    lead1.partyId === first.party.id && lead2.partyId === first.party.id && lead1.id !== lead2.id,
  );

  const tenantB = await resolveOrCreateBuyerIdentity(companyB.id, userId, {
    name: `${runKey} Comprador B`,
    document: cpf,
    partyType: "individual",
  });
  trackIdentity(tenantB);
  record("[D] mesmo CPF em tenant diferente gera Party diferente", tenantB.party.id !== first.party.id);

  const partyCountA = await prisma.party.count({ where: { companyId: companyA.id, taxIdNormalized: cpf } });
  const roleCountA = await prisma.partyRole.count({ where: { companyId: companyA.id, partyId: first.party.id, role: "buyer" } });
  const profileCountA = await prisma.buyerProfile.count({ where: { companyId: companyA.id, partyRoleId: first.partyRole.id } });
  record("[E] unicidade persistida Party=1", partyCountA === 1, `count=${partyCountA}`);
  record("[E] unicidade persistida PartyRole=1", roleCountA === 1, `count=${roleCountA}`);
  record("[E] unicidade persistida BuyerProfile=1", profileCountA === 1, `count=${profileCountA}`);

  const concurrentCpf = computeValidCpf(String(Date.now()).slice(-8).padStart(9, "5"));
  const [raceA, raceB] = await Promise.all([
    resolveOrCreateBuyerIdentity(companyA.id, userId, {
      name: `${runKey} Race A`,
      document: concurrentCpf,
      partyType: "individual",
    }),
    resolveOrCreateBuyerIdentity(companyA.id, userId, {
      name: `${runKey} Race B`,
      document: concurrentCpf,
      partyType: "individual",
    }),
  ]);
  trackIdentity(raceA);
  trackIdentity(raceB);
  record("[F] concorrencia converge para mesma Party", raceA.party.id === raceB.party.id);
  record("[F] concorrencia converge para mesma PartyRole", raceA.partyRole.id === raceB.partyRole.id);
  record("[F] concorrencia converge para mesmo BuyerProfile", raceA.buyerProfile.id === raceB.buyerProfile.id);

  return { companyA, companyB };
}

async function cleanup() {
  if (createdLeadIds.size) {
    await prisma.lead.deleteMany({ where: { id: { in: [...createdLeadIds] } } });
  }
  if (createdBuyerProfileIds.size) {
    await prisma.buyerProfile.deleteMany({ where: { id: { in: [...createdBuyerProfileIds] } } });
  }
  if (createdPartyRoleIds.size) {
    await prisma.partyRole.deleteMany({ where: { id: { in: [...createdPartyRoleIds] } } });
  }
  if (createdPartyIds.size) {
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
  const remainingLeads = await prisma.lead.count({ where: { name: { contains: runKey } } });
  const remainingParties = createdPartyIds.size
    ? await prisma.party.count({ where: { id: { in: [...createdPartyIds] } } })
    : 0;
  const cleanupOk = remainingLeads === 0 && remainingParties === 0;
  if (!cleanupOk) exitCode = 1;
  console.log(JSON.stringify({ cleanup: { remainingLeads, remainingParties, cleanupOk } }, null, 2));
  await prisma.$disconnect();
}

console.log(`C3_INTEGRATION_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
