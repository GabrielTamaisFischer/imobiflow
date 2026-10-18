/**
 * Cleanup manual e guardado de uma execução C7 interrompida.
 * Uso:
 *   $env:ALLOW_C7_CLEANUP="true"
 *   $env:C7_CLEANUP_RUN_KEY="QA-C7-..."
 *   npx tsx scripts/cleanup-c7-run-staging.ts
 */
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

if (process.env.ALLOW_C7_CLEANUP !== "true") throw new Error("ALLOW_C7_CLEANUP=true e obrigatorio.");
assertDatabaseTarget();

const runKey = process.env.C7_CLEANUP_RUN_KEY?.trim();
if (!runKey || !/^QA-C7-[A-Z0-9-]+$/.test(runKey)) {
  throw new Error("C7_CLEANUP_RUN_KEY deve ser um runKey C7 valido (QA-C7-...).");
}

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const prisma = getWebsiteBuilderPrisma();

const properties = await prisma.property.findMany({
  where: { title: { contains: runKey } },
  select: { id: true },
});
const owners = await prisma.propertyOwner.findMany({
  where: { name: { contains: runKey } },
  select: { id: true },
});
const users = await prisma.appUser.findMany({
  where: { name: { contains: runKey }, isSynthetic: true },
  select: { id: true },
});
const parties = await prisma.party.findMany({
  where: { name: { contains: runKey } },
  select: { id: true },
});

const propertyIds = properties.map((x) => x.id);
const ownerIds = owners.map((x) => x.id);
const userIds = users.map((x) => x.id);
const partyIds = parties.map((x) => x.id);

if (propertyIds.length) {
  await prisma.propertyOwnerLink.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await prisma.propertyAccess.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await prisma.propertyMedia.deleteMany({ where: { propertyId: { in: propertyIds } } });
  await prisma.property.deleteMany({ where: { id: { in: propertyIds } } });
}
if (ownerIds.length) {
  await prisma.propertyOwner.deleteMany({ where: { id: { in: ownerIds } } });
}
if (userIds.length) {
  await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.authAuditLog.deleteMany({ where: { actorUserId: { in: userIds } } });
  await prisma.appUser.deleteMany({ where: { id: { in: userIds } } });
}
if (partyIds.length) {
  const roles = await prisma.partyRole.findMany({ where: { partyId: { in: partyIds } }, select: { id: true } });
  const roleIds = roles.map((x) => x.id);
  if (roleIds.length) {
    await prisma.buyerProfile.deleteMany({ where: { partyRoleId: { in: roleIds } } });
    await prisma.tenantProfile.deleteMany({ where: { partyRoleId: { in: roleIds } } });
    await prisma.brokerProfile.deleteMany({ where: { partyRoleId: { in: roleIds } } });
  }
  await prisma.partyRole.deleteMany({ where: { partyId: { in: partyIds } } });
  await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
}

const remaining = {
  properties: await prisma.property.count({ where: { title: { contains: runKey } } }),
  owners: await prisma.propertyOwner.count({ where: { name: { contains: runKey } } }),
  users: await prisma.appUser.count({ where: { name: { contains: runKey }, isSynthetic: true } }),
  parties: await prisma.party.count({ where: { name: { contains: runKey } } }),
};
console.log(JSON.stringify({ runKey, deleted: { properties: propertyIds.length, owners: ownerIds.length, users: userIds.length, parties: partyIds.length }, remaining, cleanupOk: Object.values(remaining).every((n) => n === 0) }, null, 2));
await prisma.$disconnect();
