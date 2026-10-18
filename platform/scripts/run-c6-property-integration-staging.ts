/**
 * C6 — integração REAL do cadastro canônico de imóveis contra staging.
 * Valida ownerId <-> PropertyOwnerLink.isMainOwner e responsibleUser tenant-safe.
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

assertGuard("ALLOW_C6_PROPERTY_INTEGRATION_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { createMysqlProperty, updateMysqlProperty } = await import("../backend/src/services/mysql-real-estate.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-C6-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
const createdPropertyIds = new Set<string>();
const createdOwnerIds = new Set<string>();

function record(name: string, pass: boolean, detail?: string) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

async function contexts() {
  const users = await prisma.appUser.findMany({
    where: { status: "active", company: { isSynthetic: true, status: "active" } },
    include: { company: true },
    orderBy: [{ createdAt: "asc" }],
  });

  const perCompany = new Map<string, typeof users>();
  for (const user of users) {
    const list = perCompany.get(user.companyId) ?? [];
    list.push(user);
    perCompany.set(user.companyId, list);
  }
  const companies = [...perCompany.entries()].filter(([, list]) => list.length >= 1).slice(0, 2);
  if (companies.length < 2) throw new Error("Sao necessarias duas empresas sinteticas com usuarios ativos.");
  return {
    companyA: companies[0][0],
    usersA: companies[0][1],
    companyB: companies[1][0],
    usersB: companies[1][1],
  };
}

async function createOwner(companyId: string, createdBy: string, suffix: string) {
  const owner = await prisma.propertyOwner.create({
    data: {
      companyId,
      createdBy,
      ownerType: "individual",
      clientType: "proprietario",
      name: `${runKey} Owner ${suffix}`,
      addressJson: {},
      status: "active",
    },
  });
  createdOwnerIds.add(owner.id);
  return owner;
}

async function run() {
  const { companyA, usersA, companyB, usersB } = await contexts();
  const userA = usersA[0];
  const userB = usersB[0];
  const ownerA1 = await createOwner(companyA, userA.id, "A1");
  const ownerA2 = await createOwner(companyA, userA.id, "A2");
  const ownerB = await createOwner(companyB, userB.id, "B");

  const code = `C6-${runKey.slice(-8)}`;
  const created = await createMysqlProperty(companyA, userA.id, {
    code,
    title: `${runKey} Property`,
    property_type: "apartment",
    operation: "sale",
    status: "draft",
    owner_id: ownerA1.id,
    responsible_user_id: userA.id,
  });
  createdPropertyIds.add(created.id);

  const persisted = await prisma.property.findFirst({
    where: { id: created.id, companyId: companyA },
    select: { ownerId: true, responsibleUserId: true },
  });
  const mainLinksA = await prisma.propertyOwnerLink.findMany({
    where: { companyId: companyA, propertyId: created.id, isMainOwner: true },
  });
  record("[A] create persiste ownerId principal", persisted?.ownerId === ownerA1.id);
  record("[A] create persiste responsibleUser same-tenant", persisted?.responsibleUserId === userA.id);
  record("[A] create gera exatamente um main owner link", mainLinksA.length === 1 && mainLinksA[0].ownerId === ownerA1.id, `count=${mainLinksA.length}`);

  // Simula coproprietario já existente antes da troca do principal.
  await prisma.propertyOwnerLink.upsert({
    where: { companyId_propertyId_ownerId: { companyId: companyA, propertyId: created.id, ownerId: ownerA2.id } },
    create: { companyId: companyA, propertyId: created.id, ownerId: ownerA2.id, isMainOwner: false },
    update: { isMainOwner: false },
  });

  await updateMysqlProperty(companyA, created.id, { owner_id: ownerA2.id });
  const afterSwap = await prisma.property.findFirst({
    where: { id: created.id, companyId: companyA },
    select: { ownerId: true },
  });
  const swapLinks = await prisma.propertyOwnerLink.findMany({
    where: { companyId: companyA, propertyId: created.id },
    orderBy: { createdAt: "asc" },
  });
  const mainAfterSwap = swapLinks.filter((row) => row.isMainOwner);
  const oldOwnerLink = swapLinks.find((row) => row.ownerId === ownerA1.id);
  const newOwnerLink = swapLinks.find((row) => row.ownerId === ownerA2.id);
  record("[B] troca atualiza Property.ownerId", afterSwap?.ownerId === ownerA2.id);
  record("[B] troca deixa exatamente um main owner", mainAfterSwap.length === 1 && mainAfterSwap[0].ownerId === ownerA2.id, `main=${mainAfterSwap.length}`);
  record("[B] antigo principal e preservado como secundario", oldOwnerLink?.isMainOwner === false);
  record("[B] coproprietario promovido vira principal", newOwnerLink?.isMainOwner === true);

  await updateMysqlProperty(companyA, created.id, { owner_id: "" });
  const afterRemove = await prisma.property.findFirst({
    where: { id: created.id, companyId: companyA },
    select: { ownerId: true },
  });
  const linksAfterRemove = await prisma.propertyOwnerLink.findMany({
    where: { companyId: companyA, propertyId: created.id },
  });
  record("[C] remover principal zera Property.ownerId", afterRemove?.ownerId === null);
  record("[C] remover principal nao apaga coproprietarios", linksAfterRemove.length === 2, `count=${linksAfterRemove.length}`);
  record("[C] remover principal deixa zero links main", linksAfterRemove.every((row) => !row.isMainOwner));

  let crossOwnerBlocked = false;
  try {
    await updateMysqlProperty(companyA, created.id, { owner_id: ownerB.id });
  } catch (error: any) {
    crossOwnerBlocked = error?.code === "INVALID_OWNER" && error?.statusCode === 422;
  }
  record("[D] owner de outra empresa e rejeitado", crossOwnerBlocked);

  let crossResponsibleBlocked = false;
  try {
    await updateMysqlProperty(companyA, created.id, { responsible_user_id: userB.id });
  } catch (error: any) {
    crossResponsibleBlocked = error?.code === "INVALID_RESPONSIBLE_USER" && error?.statusCode === 422;
  }
  record("[E] responsavel de outra empresa e rejeitado", crossResponsibleBlocked);

  await updateMysqlProperty(companyA, created.id, { responsible_user_id: userA.id });
  const validResponsible = await prisma.property.findFirst({
    where: { id: created.id, companyId: companyA },
    select: { responsibleUserId: true },
  });
  record("[F] responsavel valido da mesma empresa e aceito", validResponsible?.responsibleUserId === userA.id);

  let duplicateCodeBlocked = false;
  try {
    const duplicate = await createMysqlProperty(companyA, userA.id, {
      code,
      title: `${runKey} Duplicate`,
      property_type: "house",
      operation: "sale",
      status: "draft",
    });
    createdPropertyIds.add(duplicate.id);
  } catch (error: any) {
    duplicateCodeBlocked = error?.code === "DUPLICATE_PROPERTY_CODE" && error?.statusCode === 409;
  }
  record("[G] codigo duplicado continua bloqueado", duplicateCodeBlocked);

  const mainMismatchCount = await prisma.$queryRawUnsafe<Array<{ total: bigint }>>(
    `SELECT COUNT(*) AS total
       FROM property_owner_links pol
       JOIN properties p ON p.id = pol.property_id AND p.company_id = pol.company_id
      WHERE pol.company_id = ?
        AND pol.property_id = ?
        AND pol.is_main_owner = 1
        AND (p.owner_id IS NULL OR p.owner_id <> pol.owner_id)`,
    companyA,
    created.id,
  );
  record("[H] nenhum main link diverge de Property.ownerId", Number(mainMismatchCount[0]?.total ?? 0) === 0);

  return { companyA, companyB };
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
}

let exitCode = 0;
try {
  const companies = await run();
  const allPassed = checks.every((check) => check.pass);
  console.log(JSON.stringify({ runKey, ...companies, checks, allPassed }, null, 2));
  exitCode = allPassed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ runKey, fatalError: error instanceof Error ? error.message : String(error) }, null, 2));
  exitCode = 1;
} finally {
  try {
    await cleanup();
    const remainingProperties = createdPropertyIds.size
      ? await prisma.property.count({ where: { id: { in: [...createdPropertyIds] } } })
      : 0;
    const remainingOwners = createdOwnerIds.size
      ? await prisma.propertyOwner.count({ where: { id: { in: [...createdOwnerIds] } } })
      : 0;
    const cleanupOk = remainingProperties === 0 && remainingOwners === 0;
    if (!cleanupOk) exitCode = 1;
    console.log(JSON.stringify({ cleanup: { remainingProperties, remainingOwners, cleanupOk } }, null, 2));
  } catch (cleanupError) {
    console.error(JSON.stringify({ cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }, null, 2));
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`C6_INTEGRATION_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
