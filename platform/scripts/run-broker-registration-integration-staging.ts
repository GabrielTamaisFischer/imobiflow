/**
 * C5 — integração REAL de identidade de corretor contra staging.
 * Valida AppUser -> Party -> PartyRole("broker") -> BrokerProfile.
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

assertGuard("ALLOW_BROKER_REGISTRATION_INTEGRATION_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { linkAppUserToBrokerIdentity, resolveOrCreateBrokerIdentity } = await import("../backend/src/services/broker-registration.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-BROKER-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
const createdUserIds = new Set<string>();
const createdPartyIds = new Set<string>();

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

async function syntheticContexts() {
  const roles = await prisma.role.findMany({
    where: { company: { isSynthetic: true }, systemKey: "broker" },
    include: { company: true },
    orderBy: [{ createdAt: "asc" }],
  });
  const unique = new Map<string, (typeof roles)[number]>();
  for (const role of roles) if (!unique.has(role.companyId)) unique.set(role.companyId, role);
  const selected = [...unique.values()].slice(0, 2);
  if (selected.length < 2) throw new Error("Sao necessarias duas empresas sinteticas com role broker.");
  return selected;
}

async function createUser(role: any, suffix: string) {
  const user = await prisma.appUser.create({
    data: {
      companyId: role.companyId,
      roleId: role.id,
      name: `${runKey} ${suffix}`,
      email: `${runKey.toLowerCase()}-${suffix.toLowerCase()}@example.test`,
      phone: "11999990000",
      status: "active",
      isSynthetic: true,
      role: "broker",
      permissionsJson: [],
    },
  });
  createdUserIds.add(user.id);
  return user;
}

async function run() {
  const [roleA, roleB] = await syntheticContexts();
  const userA = await createUser(roleA, "A");
  const userB = await createUser(roleB, "B");
  const cpf = computeValidCpf(String(Date.now()).slice(-9).padStart(9, "6"));

  const linkedA = await linkAppUserToBrokerIdentity(roleA.companyId, userA.id, {
    name: userA.name,
    document: cpf,
    email: userA.email,
    phone: userA.phone,
    creciNumber: "123456-F",
    bioText: "Corretor QA C5",
  });
  createdPartyIds.add(linkedA.party.id);
  record("[A] AppUser recebe partyId", linkedA.appUser.partyId === linkedA.party.id);
  record("[A] Party usa CPF normalizado", linkedA.party.taxIdNormalized === cpf);
  record("[A] broker role criada", linkedA.partyRole.role === "broker");
  record("[A] BrokerProfile criado", linkedA.brokerProfile.partyRoleId === linkedA.partyRole.id);
  record("[A] CRECI persistido", linkedA.brokerProfile.creciNumber === "123456-F");

  const again = await linkAppUserToBrokerIdentity(roleA.companyId, userA.id, {
    name: userA.name,
    document: cpf,
    creciNumber: "654321-F",
    bioText: "Bio atualizada",
  });
  record("[B] reexecucao reutiliza Party", again.party.id === linkedA.party.id);
  record("[B] reexecucao reutiliza broker role", again.partyRole.id === linkedA.partyRole.id);
  record("[B] reexecucao reutiliza BrokerProfile", again.brokerProfile.id === linkedA.brokerProfile.id);
  record("[B] CRECI pode ser atualizado", again.brokerProfile.creciNumber === "654321-F");
  record("[B] bio pode ser atualizada", again.brokerProfile.bioText === "Bio atualizada");

  const otherCompany = await linkAppUserToBrokerIdentity(roleB.companyId, userB.id, {
    name: userB.name,
    document: cpf,
    email: userB.email,
    phone: userB.phone,
    creciNumber: "111111-F",
  });
  createdPartyIds.add(otherCompany.party.id);
  record("[C] mesmo CPF em outra empresa cria Party diferente", otherCompany.party.id !== linkedA.party.id);

  const persistedUser = await prisma.appUser.findFirst({
    where: { id: userA.id, companyId: roleA.companyId },
    select: { partyId: true },
  });
  record("[D] link AppUser.partyId persistiu", persistedUser?.partyId === linkedA.party.id);

  const partyCount = await prisma.party.count({ where: { companyId: roleA.companyId, taxIdNormalized: cpf } });
  const roleCount = await prisma.partyRole.count({ where: { companyId: roleA.companyId, partyId: linkedA.party.id, role: "broker" } });
  const profileCount = await prisma.brokerProfile.count({ where: { companyId: roleA.companyId, partyRoleId: linkedA.partyRole.id } });
  record("[E] unicidade Party=1", partyCount === 1, `count=${partyCount}`);
  record("[E] unicidade broker role=1", roleCount === 1, `count=${roleCount}`);
  record("[E] unicidade BrokerProfile=1", profileCount === 1, `count=${profileCount}`);

  const raceUser = await createUser(roleA, "RACE");
  const raceCpf = computeValidCpf(String(Date.now()).slice(-8).padStart(9, "7"));
  const [raceA, raceB] = await Promise.all([
    linkAppUserToBrokerIdentity(roleA.companyId, raceUser.id, { name: raceUser.name, document: raceCpf, creciNumber: "900-F" }),
    linkAppUserToBrokerIdentity(roleA.companyId, raceUser.id, { name: raceUser.name, document: raceCpf, creciNumber: "900-F" }),
  ]);
  createdPartyIds.add(raceA.party.id);
  createdPartyIds.add(raceB.party.id);
  record("[F] concorrencia converge para mesma Party", raceA.party.id === raceB.party.id);
  record("[F] concorrencia converge para mesma broker role", raceA.partyRole.id === raceB.partyRole.id);
  record("[F] concorrencia converge para mesmo BrokerProfile", raceA.brokerProfile.id === raceB.brokerProfile.id);

  let blocked = false;
  try {
    await linkAppUserToBrokerIdentity(roleA.companyId, userA.id, {
      name: userA.name,
      document: computeValidCpf("123456789"),
    });
  } catch (error: any) {
    blocked = error?.code === "BROKER_DOCUMENT_CHANGE_BLOCKED" && error?.statusCode === 409;
  }
  record("[G] troca material de CPF e bloqueada", blocked);

  let invalid = false;
  try {
    await resolveOrCreateBrokerIdentity(roleA.companyId, userA.id, {
      name: `${runKey} Invalid`,
      document: "123.456.789-00",
    });
  } catch (error: any) {
    invalid = error?.code === "INVALID_BROKER_DOCUMENT" && error?.statusCode === 422;
  }
  record("[H] CPF invalido e rejeitado", invalid);

  return { companyA: roleA.companyId, companyB: roleB.companyId };
}

async function cleanup() {
  if (createdUserIds.size) {
    await prisma.authSession.deleteMany({ where: { userId: { in: [...createdUserIds] } } });
    await prisma.authAuditLog.deleteMany({ where: { actorUserId: { in: [...createdUserIds] } } });
    await prisma.appUser.deleteMany({ where: { id: { in: [...createdUserIds] } } });
  }
  if (createdPartyIds.size) {
    const roles = await prisma.partyRole.findMany({ where: { partyId: { in: [...createdPartyIds] } }, select: { id: true } });
    if (roles.length) await prisma.brokerProfile.deleteMany({ where: { partyRoleId: { in: roles.map((r) => r.id) } } });
    await prisma.partyRole.deleteMany({ where: { partyId: { in: [...createdPartyIds] } } });
    await prisma.party.deleteMany({ where: { id: { in: [...createdPartyIds] } } });
  }
}

let exitCode = 0;
try {
  const companies = await run();
  const allPassed = checks.every((c) => c.pass);
  console.log(JSON.stringify({ runKey, ...companies, checks, allPassed }, null, 2));
  exitCode = allPassed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ runKey, fatalError: error instanceof Error ? error.message : String(error) }, null, 2));
  exitCode = 1;
} finally {
  try {
    await cleanup();
    const remainingUsers = await prisma.appUser.count({ where: { name: { contains: runKey } } });
    const remainingParties = createdPartyIds.size ? await prisma.party.count({ where: { id: { in: [...createdPartyIds] } } }) : 0;
    const cleanupOk = remainingUsers === 0 && remainingParties === 0;
    if (!cleanupOk) exitCode = 1;
    console.log(JSON.stringify({ cleanup: { remainingUsers, remainingParties, cleanupOk } }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`C5_INTEGRATION_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
