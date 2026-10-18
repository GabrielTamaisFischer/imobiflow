#!/usr/bin/env node
import { randomBytes } from "node:crypto";

const API_URL = (process.env.C6_RUNTIME_API_URL || "https://imobiflow-staging.vercel.app/api").replace(/\/$/, "");

function assertGuard(name, expected) {
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

assertGuard("ALLOW_C6_HTTP_RUNTIME_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { hashPassword } = await import("../backend/src/services/mysql-auth.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-C6HTTP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const password = `C6!Runtime-${randomBytes(12).toString("hex")}aA1!`;
const checks = [];
const createdUserIds = new Set();
const createdOwnerIds = new Set();
const createdPropertyIds = new Set();

function record(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

async function request(path, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
  return { response, payload };
}

async function login(email) {
  const result = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!result.response.ok) {
    throw new Error(`login -> ${result.response.status}: ${result.payload?.message || result.payload?.error || "erro"}`);
  }
  const token = result.payload?.session?.access_token;
  if (!token) throw new Error("Login nao retornou access_token.");
  return { token, access: result.payload.access };
}

async function findContexts() {
  const users = await prisma.appUser.findMany({
    where: {
      status: "active",
      company: { isSynthetic: true, status: "active" },
      roleRecord: { systemKey: "owner" },
    },
    include: {
      company: true,
      roleRecord: {
        include: { permissions: { include: { permission: true } } },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const eligible = [];
  for (const user of users) {
    const perms = new Set(user.roleRecord.permissions.map((row) => row.permission.key));
    if (perms.has("properties.manage") && perms.has("properties.view")) eligible.push(user);
  }
  const byCompany = new Map();
  for (const user of eligible) if (!byCompany.has(user.companyId)) byCompany.set(user.companyId, user);
  const selected = [...byCompany.values()].slice(0, 2);
  if (selected.length < 2) throw new Error("Sao necessarias duas empresas sinteticas com owner properties.manage/view.");
  return { templateA: selected[0], templateB: selected[1] };
}

async function createQaUser(template, suffix) {
  const email = `${runKey.toLowerCase()}-${suffix.toLowerCase()}@example.test`;
  const passwordHash = await hashPassword(password);
  const user = await prisma.appUser.create({
    data: {
      companyId: template.companyId,
      roleId: template.roleId,
      name: `${runKey} ${suffix}`,
      email,
      passwordHash,
      passwordChangedAt: new Date(),
      status: "active",
      isSynthetic: true,
      role: "owner",
      permissionsJson: [],
    },
  });
  createdUserIds.add(user.id);
  return user;
}

async function createOwner(companyId, createdBy, suffix) {
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
  const { templateA, templateB } = await findContexts();
  const userA = await createQaUser(templateA, "A");
  const userB = await createQaUser(templateB, "B");
  const authA = await login(userA.email);
  const authB = await login(userB.email);

  record("[LOGIN] empresa A autentica", Boolean(authA.token));
  record("[LOGIN] empresa B autentica", Boolean(authB.token));

  const ownerA1 = await createOwner(templateA.companyId, userA.id, "A1");
  const ownerA2 = await createOwner(templateA.companyId, userA.id, "A2");
  const ownerB = await createOwner(templateB.companyId, userB.id, "B");

  const code = `C6H-${runKey.slice(-8)}`;
  const create = await request("/real-estate/properties", {
    method: "POST",
    token: authA.token,
    body: {
      code,
      title: `${runKey} Property`,
      property_type: "apartment",
      operation: "sale",
      status: "draft",
      owner_id: ownerA1.id,
      responsible_user_id: userA.id,
    },
  });
  record("[A] POST property retorna 201", create.response.status === 201, `status=${create.response.status}`);
  const propertyId = create.payload?.property?.id;
  if (propertyId) createdPropertyIds.add(propertyId);

  const persisted = propertyId ? await prisma.property.findFirst({
    where: { id: propertyId, companyId: templateA.companyId },
    select: { ownerId: true, responsibleUserId: true },
  }) : null;
  const mainLinks = propertyId ? await prisma.propertyOwnerLink.findMany({
    where: { companyId: templateA.companyId, propertyId, isMainOwner: true },
  }) : [];
  record("[A] ownerId principal persiste", persisted?.ownerId === ownerA1.id);
  record("[A] responsibleUser persiste", persisted?.responsibleUserId === userA.id);
  record("[A] existe exatamente um main owner link", mainLinks.length === 1 && mainLinks[0].ownerId === ownerA1.id, `count=${mainLinks.length}`);

  const detail = propertyId ? await request(`/real-estate/properties/${propertyId}`, { token: authA.token }) : null;
  record("[B] GET detalhe retorna 200", detail?.response.status === 200);
  record("[B] GET detalhe expoe owner correto", detail?.payload?.property?.owner_id === ownerA1.id);

  if (propertyId) {
    await prisma.propertyOwnerLink.upsert({
      where: { companyId_propertyId_ownerId: { companyId: templateA.companyId, propertyId, ownerId: ownerA2.id } },
      create: { companyId: templateA.companyId, propertyId, ownerId: ownerA2.id, isMainOwner: false },
      update: { isMainOwner: false },
    });
  }

  const swap = propertyId ? await request(`/real-estate/properties/${propertyId}`, {
    method: "PATCH",
    token: authA.token,
    body: { owner_id: ownerA2.id },
  }) : null;
  record("[C] PATCH troca principal retorna 200", swap?.response.status === 200, `status=${swap?.response.status}`);

  const swapLinks = propertyId ? await prisma.propertyOwnerLink.findMany({
    where: { companyId: templateA.companyId, propertyId },
  }) : [];
  const mainAfterSwap = swapLinks.filter((row) => row.isMainOwner);
  record("[C] PATCH deixa ownerA2 como unico principal", mainAfterSwap.length === 1 && mainAfterSwap[0].ownerId === ownerA2.id);
  record("[C] ownerA1 permanece como secundario", swapLinks.find((row) => row.ownerId === ownerA1.id)?.isMainOwner === false);

  const remove = propertyId ? await request(`/real-estate/properties/${propertyId}`, {
    method: "PATCH",
    token: authA.token,
    body: { owner_id: "" },
  }) : null;
  record("[D] PATCH remove principal retorna 200", remove?.response.status === 200, `status=${remove?.response.status}`);
  const afterRemove = propertyId ? await prisma.property.findFirst({ where: { id: propertyId }, select: { ownerId: true } }) : null;
  const linksAfterRemove = propertyId ? await prisma.propertyOwnerLink.findMany({ where: { propertyId } }) : [];
  record("[D] Property.ownerId fica null", afterRemove?.ownerId === null);
  record("[D] coproprietarios permanecem", linksAfterRemove.length === 2, `count=${linksAfterRemove.length}`);
  record("[D] nenhum link permanece principal", linksAfterRemove.every((row) => !row.isMainOwner));

  const crossOwner = propertyId ? await request(`/real-estate/properties/${propertyId}`, {
    method: "PATCH",
    token: authA.token,
    body: { owner_id: ownerB.id },
  }) : null;
  record(
    "[E] owner cross-tenant retorna 422",
    crossOwner?.response.status === 422 && (crossOwner?.payload?.error === "INVALID_OWNER" || crossOwner?.payload?.code === "INVALID_OWNER"),
    `status=${crossOwner?.response.status} code=${crossOwner?.payload?.error ?? crossOwner?.payload?.code ?? "?"}`,
  );

  const crossResponsible = propertyId ? await request(`/real-estate/properties/${propertyId}`, {
    method: "PATCH",
    token: authA.token,
    body: { responsible_user_id: userB.id },
  }) : null;
  record(
    "[F] responsible cross-tenant retorna 422",
    crossResponsible?.response.status === 422 && (crossResponsible?.payload?.error === "INVALID_RESPONSIBLE_USER" || crossResponsible?.payload?.code === "INVALID_RESPONSIBLE_USER"),
    `status=${crossResponsible?.response.status} code=${crossResponsible?.payload?.error ?? crossResponsible?.payload?.code ?? "?"}`,
  );

  const crossGet = propertyId ? await request(`/real-estate/properties/${propertyId}`, { token: authB.token }) : null;
  record("[G] outra empresa nao acessa property", crossGet?.response.status === 404, `status=${crossGet?.response.status}`);

  const duplicate = await request("/real-estate/properties", {
    method: "POST",
    token: authA.token,
    body: {
      code,
      title: `${runKey} Duplicate`,
      property_type: "house",
      operation: "sale",
      status: "draft",
    },
  });
  if (duplicate.response.status === 201 && duplicate.payload?.property?.id) createdPropertyIds.add(duplicate.payload.property.id);
  record(
    "[H] codigo duplicado retorna 409",
    duplicate.response.status === 409 && (duplicate.payload?.error === "DUPLICATE_PROPERTY_CODE" || duplicate.payload?.code === "DUPLICATE_PROPERTY_CODE"),
    `status=${duplicate.response.status} code=${duplicate.payload?.error ?? duplicate.payload?.code ?? "?"}`,
  );

  const list = await request(`/real-estate/properties?code=${encodeURIComponent(code)}`, { token: authA.token });
  record("[I] listagem filtrada continua funcionando", list.response.status === 200);

  const archive = propertyId ? await request(`/real-estate/properties/${propertyId}`, {
    method: "DELETE",
    token: authA.token,
  }) : null;
  record("[J] DELETE logico retorna 200", archive?.response.status === 200, `status=${archive?.response.status}`);
  record("[J] DELETE logico seta archived", archive?.payload?.property?.status === "archived");

  return { companyA: templateA.companyId, companyB: templateB.companyId };
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
}

let exitCode = 0;
try {
  const companies = await run();
  const allPassed = checks.every((check) => check.pass);
  console.log(JSON.stringify({ runKey, apiUrl: API_URL, ...companies, checks, allPassed }, null, 2));
  exitCode = allPassed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ runKey, fatalError: error instanceof Error ? error.message : String(error) }, null, 2));
  exitCode = 1;
} finally {
  try {
    await cleanup();
    const remainingProperties = createdPropertyIds.size ? await prisma.property.count({ where: { id: { in: [...createdPropertyIds] } } }) : 0;
    const remainingOwners = createdOwnerIds.size ? await prisma.propertyOwner.count({ where: { id: { in: [...createdOwnerIds] } } }) : 0;
    const remainingUsers = createdUserIds.size ? await prisma.appUser.count({ where: { id: { in: [...createdUserIds] } } }) : 0;
    const cleanupOk = remainingProperties === 0 && remainingOwners === 0 && remainingUsers === 0;
    if (!cleanupOk) exitCode = 1;
    console.log(JSON.stringify({ cleanup: { remainingProperties, remainingOwners, remainingUsers, cleanupOk } }, null, 2));
  } catch (cleanupError) {
    console.error(JSON.stringify({ cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }, null, 2));
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`C6_RUNTIME_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
