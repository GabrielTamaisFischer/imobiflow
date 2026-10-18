/**
 * C7 — integração final dos cadastros canônicos C2–C6 contra staging.
 *
 * Prova central:
 * uma única identidade civil (Party) pode acumular owner/buyer/tenant/broker,
 * mantendo PropertyOwner e AppUser como agregados operacionais distintos,
 * e Property vinculado ao owner/responsible corretos, sem cruzar tenants.
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

assertGuard("ALLOW_C7_CANONICAL_INTEGRATION_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { createOrResolveOwner } = await import("../backend/src/services/owner-registration.js");
const { resolveOrCreateBuyerIdentity } = await import("../backend/src/services/buyer-registration.js");
const { resolveOrCreateTenantIdentity } = await import("../backend/src/services/tenant-registration.js");
const { linkAppUserToBrokerIdentity } = await import("../backend/src/services/broker-registration.js");
const { createMysqlProperty } = await import("../backend/src/services/mysql-real-estate.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-C7-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
const createdPartyIds = new Set<string>();
const createdOwnerIds = new Set<string>();
const createdUserIds = new Set<string>();
const createdPropertyIds = new Set<string>();

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

async function contexts() {
  const brokerRoles = await prisma.role.findMany({
    where: { company: { isSynthetic: true, status: "active" }, systemKey: "broker" },
    include: { company: true },
    orderBy: [{ createdAt: "asc" }],
  });
  const unique = new Map<string, (typeof brokerRoles)[number]>();
  for (const role of brokerRoles) if (!unique.has(role.companyId)) unique.set(role.companyId, role);
  const selected = [...unique.values()].slice(0, 2);
  if (selected.length < 2) throw new Error("Sao necessarias duas empresas sinteticas com role broker.");

  const creatorA = await prisma.appUser.findFirst({
    where: { companyId: selected[0].companyId, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  const creatorB = await prisma.appUser.findFirst({
    where: { companyId: selected[1].companyId, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!creatorA || !creatorB) throw new Error("Empresas sinteticas precisam de usuarios ativos.");

  return { roleA: selected[0], roleB: selected[1], creatorA, creatorB };
}

async function createBrokerUser(role: any, suffix: string) {
  const user = await prisma.appUser.create({
    data: {
      companyId: role.companyId,
      roleId: role.id,
      name: `${runKey} Broker ${suffix}`,
      email: `${runKey.toLowerCase()}-${suffix.toLowerCase()}@example.test`,
      phone: "11999998888",
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
  const { roleA, roleB, creatorA, creatorB } = await contexts();
  const cpf = computeValidCpf(String(Date.now()).slice(-9).padStart(9, "6"));
  const name = `${runKey} Pessoa Canonica`;

  // C2 — Owner cria/resolva a Party principal.
  const owner = await createOrResolveOwner(roleA.companyId, creatorA.id, {
    name,
    owner_type: "individual",
    client_type: "proprietario",
    document: cpf,
    email: `${runKey.toLowerCase()}@example.test`,
    phone: "11911112222",
    address_json: {},
  });
  createdOwnerIds.add(owner.id);
  if (owner.party_id) createdPartyIds.add(owner.party_id);
  record("[A] owner possui partyId", Boolean(owner.party_id));

  // C3 — mesma identidade ganha papel buyer.
  const buyer = await resolveOrCreateBuyerIdentity(roleA.companyId, creatorA.id, {
    name,
    document: cpf,
    email: `${runKey.toLowerCase()}@example.test`,
    interestJson: { source: "C7" },
  });
  createdPartyIds.add(buyer.party.id);
  record("[B] buyer reutiliza mesma Party do owner", buyer.party.id === owner.party_id);
  record("[B] BuyerProfile existe", buyer.buyerProfile.partyRoleId === buyer.partyRole.id);

  // C4 — mesma identidade ganha papel tenant.
  const tenant = await resolveOrCreateTenantIdentity(roleA.companyId, creatorA.id, {
    name,
    document: cpf,
    rentalJson: { source: "C7" },
  });
  createdPartyIds.add(tenant.party.id);
  record("[C] tenant reutiliza mesma Party", tenant.party.id === owner.party_id);
  record("[C] TenantProfile existe", tenant.tenantProfile.partyRoleId === tenant.partyRole.id);

  // C5 — AppUser operacional aponta para a mesma Party e ganha broker profile.
  const brokerUser = await createBrokerUser(roleA, "A");
  const broker = await linkAppUserToBrokerIdentity(roleA.companyId, brokerUser.id, {
    name,
    document: cpf,
    email: brokerUser.email,
    phone: brokerUser.phone,
    creciNumber: "C7-123456-F",
    bioText: "C7 cadastro integrado",
  });
  createdPartyIds.add(broker.party.id);
  record("[D] broker reutiliza mesma Party", broker.party.id === owner.party_id);
  record("[D] AppUser.partyId aponta para Party canonica", broker.appUser.partyId === owner.party_id);
  record("[D] BrokerProfile existe", broker.brokerProfile.partyRoleId === broker.partyRole.id);

  // C6 — imóvel aponta para o PropertyOwner operacional e para AppUser responsável.
  const property = await createMysqlProperty(roleA.companyId, creatorA.id, {
    code: `C7-${runKey.slice(-8)}`,
    title: `${runKey} Imovel`,
    property_type: "apartment",
    operation: "sale",
    status: "draft",
    owner_id: owner.id,
    responsible_user_id: brokerUser.id,
  });
  createdPropertyIds.add(property.id);
  record("[E] Property ownerId aponta para PropertyOwner", property.owner_id === owner.id);
  record("[E] Property responsibleUser aponta para broker AppUser", property.responsible_user_id === brokerUser.id);

  const party = await prisma.party.findFirst({
    where: { id: owner.party_id!, companyId: roleA.companyId },
    include: {
      roles: {
        include: {
          buyerProfile: true,
          tenantProfile: true,
          brokerProfile: true,
        },
      },
      appUsers: true,
      ownersLinked: true,
    },
  });

  const roles = new Map((party?.roles ?? []).map((row) => [row.role, row]));
  record("[F] existe apenas uma Party para o CPF no tenant A",
    (await prisma.party.count({ where: { companyId: roleA.companyId, taxIdNormalized: cpf } })) === 1);
  record("[F] Party possui role owner", roles.has("owner"));
  record("[F] Party possui role buyer", roles.has("buyer"));
  record("[F] Party possui role tenant", roles.has("tenant"));
  record("[F] Party possui role broker", roles.has("broker"));
  record("[F] exatamente quatro roles canônicas", roles.size === 4, `count=${roles.size}`);
  record("[F] um PropertyOwner operacional ligado", party?.ownersLinked.length === 1, `count=${party?.ownersLinked.length ?? 0}`);
  record("[F] um AppUser operacional ligado", party?.appUsers.length === 1, `count=${party?.appUsers.length ?? 0}`);

  const roleRows = await prisma.partyRole.findMany({
    where: { companyId: roleA.companyId, partyId: owner.party_id! },
    select: { role: true },
  });
  const roleNames = roleRows.map((row) => row.role);
  record("[G] nenhuma role duplicada", new Set(roleNames).size === roleNames.length);

  const buyerCount = await prisma.buyerProfile.count({ where: { companyId: roleA.companyId, partyRoleId: buyer.partyRole.id } });
  const tenantCount = await prisma.tenantProfile.count({ where: { companyId: roleA.companyId, partyRoleId: tenant.partyRole.id } });
  const brokerCount = await prisma.brokerProfile.count({ where: { companyId: roleA.companyId, partyRoleId: broker.partyRole.id } });
  record("[G] BuyerProfile unico", buyerCount === 1, `count=${buyerCount}`);
  record("[G] TenantProfile unico", tenantCount === 1, `count=${tenantCount}`);
  record("[G] BrokerProfile unico", brokerCount === 1, `count=${brokerCount}`);

  const propertyRow = await prisma.property.findFirst({
    where: { id: property.id, companyId: roleA.companyId },
    select: { ownerId: true, responsibleUserId: true },
  });
  const mainLinks = await prisma.propertyOwnerLink.findMany({
    where: { companyId: roleA.companyId, propertyId: property.id, isMainOwner: true },
  });
  record("[H] Property.ownerId permanece consistente", propertyRow?.ownerId === owner.id);
  record("[H] Property.responsibleUserId permanece consistente", propertyRow?.responsibleUserId === brokerUser.id);
  record("[H] main owner link coincide com Property.ownerId", mainLinks.length === 1 && mainLinks[0].ownerId === owner.id);

  // Mesmo CPF em outro tenant DEVE gerar identidade diferente.
  const buyerB = await resolveOrCreateBuyerIdentity(roleB.companyId, creatorB.id, {
    name: `${name} B`,
    document: cpf,
  });
  createdPartyIds.add(buyerB.party.id);
  record("[I] mesmo CPF em tenant B cria Party diferente", buyerB.party.id !== owner.party_id);
  record("[I] tenant B tem exatamente uma Party para o CPF",
    (await prisma.party.count({ where: { companyId: roleB.companyId, taxIdNormalized: cpf } })) === 1);

  // Auditoria estrutural somente dos registros QA criados.
  const crossTenantOwner = await prisma.propertyOwner.count({
    where: {
      id: owner.id,
      companyId: { not: roleA.companyId },
    },
  });
  const crossTenantUser = await prisma.appUser.count({
    where: {
      id: brokerUser.id,
      companyId: { not: roleA.companyId },
    },
  });
  record("[J] owner nao vaza para outro tenant", crossTenantOwner === 0);
  record("[J] AppUser nao vaza para outro tenant", crossTenantUser === 0);

  return { companyA: roleA.companyId, companyB: roleB.companyId, canonicalPartyId: owner.party_id };
}

async function cleanup() {
  if (createdPropertyIds.size) {
    const ids = [...createdPropertyIds];
    await prisma.propertyOwnerLink.deleteMany({ where: { propertyId: { in: ids } } });
    await prisma.propertyAccess.deleteMany({ where: { propertyId: { in: ids } } });
    await prisma.propertyMedia.deleteMany({ where: { propertyId: { in: ids } } });
    await prisma.property.deleteMany({ where: { id: { in: ids } } });
  }

  if (createdOwnerIds.size) {
    await prisma.propertyOwner.deleteMany({ where: { id: { in: [...createdOwnerIds] } } });
  }

  if (createdUserIds.size) {
    const ids = [...createdUserIds];
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authAuditLog.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.appUser.deleteMany({ where: { id: { in: ids } } });
  }

  if (createdPartyIds.size) {
    const partyIds = [...createdPartyIds];
    const roles = await prisma.partyRole.findMany({
      where: { partyId: { in: partyIds } },
      select: { id: true },
    });
    const roleIds = roles.map((row) => row.id);
    if (roleIds.length) {
      await prisma.buyerProfile.deleteMany({ where: { partyRoleId: { in: roleIds } } });
      await prisma.tenantProfile.deleteMany({ where: { partyRoleId: { in: roleIds } } });
      await prisma.brokerProfile.deleteMany({ where: { partyRoleId: { in: roleIds } } });
    }
    await prisma.partyRole.deleteMany({ where: { partyId: { in: partyIds } } });
    await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
  }
}

let exitCode = 0;
try {
  const context = await run();
  const allPassed = checks.every((check) => check.pass);
  console.log(JSON.stringify({ runKey, ...context, checks, allPassed }, null, 2));
  exitCode = allPassed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({
    runKey,
    fatalError: error instanceof Error ? error.message : String(error),
  }, null, 2));
  exitCode = 1;
} finally {
  let cleanupSucceeded = false;
  let lastCleanupError: unknown = null;

  for (let attempt = 1; attempt <= 3 && !cleanupSucceeded; attempt += 1) {
    try {
      await cleanup();
      const remainingProperties = createdPropertyIds.size
        ? await prisma.property.count({ where: { id: { in: [...createdPropertyIds] } } })
        : 0;
      const remainingOwners = createdOwnerIds.size
        ? await prisma.propertyOwner.count({ where: { id: { in: [...createdOwnerIds] } } })
        : 0;
      const remainingUsers = createdUserIds.size
        ? await prisma.appUser.count({ where: { id: { in: [...createdUserIds] } } })
        : 0;
      const remainingParties = createdPartyIds.size
        ? await prisma.party.count({ where: { id: { in: [...createdPartyIds] } } })
        : 0;
      const cleanupOk = remainingProperties === 0 && remainingOwners === 0 && remainingUsers === 0 && remainingParties === 0;
      cleanupSucceeded = cleanupOk;
      if (!cleanupOk) exitCode = 1;
      console.log(JSON.stringify({
        cleanup: { attempt, remainingProperties, remainingOwners, remainingUsers, remainingParties, cleanupOk },
      }, null, 2));
    } catch (cleanupError) {
      lastCleanupError = cleanupError;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
      }
    }
  }

  if (!cleanupSucceeded) {
    console.error(JSON.stringify({
      cleanupError: lastCleanupError instanceof Error ? lastCleanupError.message : String(lastCleanupError ?? "cleanup incompleto"),
    }, null, 2));
    exitCode = 1;
  }

  await prisma.$disconnect();
}

console.log(`C7_INTEGRATION_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
