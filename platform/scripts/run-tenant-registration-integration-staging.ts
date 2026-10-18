/**
 * C4 — integração REAL de identidade de inquilino contra staging.
 * Valida Party -> PartyRole("tenant") -> TenantProfile.
 */
import { randomBytes } from "node:crypto";

function assertGuard(name: string, expected: string) {
  if (process.env[name] !== expected) throw new Error(`${name}=${expected} e obrigatorio.`);
}

function assertDatabaseTarget() {
  const raw = process.env.DATABASE_URL;
  const expectedHost = process.env.EXPECTED_STAGING_DB_HOST;
  const expectedPort = process.env.EXPECTED_STAGING_DB_PORT;
  const expectedName = process.env.EXPECTED_STAGING_DB_NAME;
  if (!raw || !expectedHost || !expectedPort || !expectedName) {
    throw new Error("DATABASE_URL e EXPECTED_STAGING_DB_HOST/PORT/NAME sao obrigatorios.");
  }
  const url = new URL(raw);
  if (url.hostname !== expectedHost || url.port !== expectedPort || url.pathname.replace(/^\//, "") !== expectedName) {
    throw new Error("DATABASE_URL nao corresponde ao staging confirmado.");
  }
}

assertGuard("ALLOW_TENANT_REGISTRATION_INTEGRATION_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { ensureTenantIdentityForParty, resolveOrCreateTenantIdentity } = await import("../backend/src/services/tenant-registration.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-TENANT-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const createdPartyIds = new Set<string>();
const createdRoleIds = new Set<string>();
const createdProfileIds = new Set<string>();
const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];

function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

function computeValidCpf(nineDigits: string): string {
  const digits = nineDigits.split("").map(Number);
  const digit = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  digits.push(digit(9));
  digits.push(digit(10));
  return digits.join("");
}

function track(result: any) {
  if (result.party?.id) createdPartyIds.add(result.party.id);
  if (result.partyRole?.id) createdRoleIds.add(result.partyRole.id);
  if (result.tenantProfile?.id) createdProfileIds.add(result.tenantProfile.id);
}

async function selectCompanies() {
  const rows = await prisma.company.findMany({
    where: { isSynthetic: true },
    select: { id: true, isSynthetic: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  if (rows.length < 2) throw new Error("Sao necessarias pelo menos duas empresas sinteticas.");
  return { companyA: rows[0], companyB: rows[1] };
}

async function run() {
  const { companyA, companyB } = await selectCompanies();
  const userId = "00000000-0000-4000-8000-0000000000aa";
  const cpf = computeValidCpf(String(Date.now()).slice(-9).padStart(9, "6"));

  const first = await resolveOrCreateTenantIdentity(companyA.id, userId, {
    name: `${runKey} Tenant A`,
    document: cpf,
    partyType: "individual",
  });
  track(first);
  record("[A] Party criada com CPF normalizado", first.party.taxIdNormalized === cpf);
  record("[A] tenant role criada", first.partyRole.role === "tenant");
  record("[A] TenantProfile criado", first.tenantProfile.partyRoleId === first.partyRole.id);

  const second = await resolveOrCreateTenantIdentity(companyA.id, userId, {
    name: `${runKey} Tenant A novamente`,
    document: cpf,
    partyType: "individual",
  });
  track(second);
  record("[B] mesmo CPF reutiliza Party", second.party.id === first.party.id);
  record("[B] mesmo CPF reutiliza tenant role", second.partyRole.id === first.partyRole.id);
  record("[B] mesmo CPF reutiliza TenantProfile", second.tenantProfile.id === first.tenantProfile.id);

  const otherTenant = await resolveOrCreateTenantIdentity(companyB.id, userId, {
    name: `${runKey} Tenant B`,
    document: cpf,
    partyType: "individual",
  });
  track(otherTenant);
  record("[C] mesmo CPF em outro tenant cria Party diferente", otherTenant.party.id !== first.party.id);

  const existingBuyerParty = await prisma.party.create({
    data: {
      companyId: companyA.id,
      partyType: "individual",
      name: `${runKey} Existing Party`,
      taxId: null,
      taxIdNormalized: null,
      status: "active",
    },
  });
  createdPartyIds.add(existingBuyerParty.id);
  const promoted = await ensureTenantIdentityForParty(companyA.id, existingBuyerParty.id);
  createdRoleIds.add(promoted.partyRole.id);
  createdProfileIds.add(promoted.tenantProfile.id);
  record("[D] Party existente ganha tenant role sem duplicar Party", promoted.partyRole.partyId === existingBuyerParty.id);

  const concurrentCpf = computeValidCpf(String(Date.now()).slice(-8).padStart(9, "7"));
  const [raceA, raceB] = await Promise.all([
    resolveOrCreateTenantIdentity(companyA.id, userId, { name: `${runKey} Race A`, document: concurrentCpf }),
    resolveOrCreateTenantIdentity(companyA.id, userId, { name: `${runKey} Race B`, document: concurrentCpf }),
  ]);
  track(raceA);
  track(raceB);
  record("[E] concorrencia converge para mesma Party", raceA.party.id === raceB.party.id);
  record("[E] concorrencia converge para mesma tenant role", raceA.partyRole.id === raceB.partyRole.id);
  record("[E] concorrencia converge para mesmo TenantProfile", raceA.tenantProfile.id === raceB.tenantProfile.id);

  const countParty = await prisma.party.count({ where: { companyId: companyA.id, taxIdNormalized: cpf } });
  const countRole = await prisma.partyRole.count({ where: { companyId: companyA.id, partyId: first.party.id, role: "tenant" } });
  const countProfile = await prisma.tenantProfile.count({ where: { companyId: companyA.id, partyRoleId: first.partyRole.id } });
  record("[F] unicidade Party=1", countParty === 1, `count=${countParty}`);
  record("[F] unicidade tenant role=1", countRole === 1, `count=${countRole}`);
  record("[F] unicidade TenantProfile=1", countProfile === 1, `count=${countProfile}`);

  return { companyA, companyB };
}

async function cleanup() {
  if (createdProfileIds.size) await prisma.tenantProfile.deleteMany({ where: { id: { in: [...createdProfileIds] } } });
  if (createdRoleIds.size) await prisma.partyRole.deleteMany({ where: { id: { in: [...createdRoleIds] } } });
  if (createdPartyIds.size) await prisma.party.deleteMany({ where: { id: { in: [...createdPartyIds] } } });
}

let exitCode = 0;
try {
  const { companyA, companyB } = await run();
  const allPassed = checks.every((c) => c.pass);
  console.log(JSON.stringify({ runKey, companyA: companyA.id, companyB: companyB.id, checks, allPassed }, null, 2));
  exitCode = allPassed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ runKey, fatalError: error instanceof Error ? error.message : String(error) }, null, 2));
  exitCode = 1;
} finally {
  try {
    await cleanup();
    const remainingParties = createdPartyIds.size ? await prisma.party.count({ where: { id: { in: [...createdPartyIds] } } }) : 0;
    const cleanupOk = remainingParties === 0;
    if (!cleanupOk) exitCode = 1;
    console.log(JSON.stringify({ cleanup: { remainingParties, cleanupOk } }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`C4_INTEGRATION_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
