#!/usr/bin/env node
import { randomBytes } from "node:crypto";

const API_URL = (process.env.C5_RUNTIME_API_URL || "https://imobiflow-staging.vercel.app/api").replace(/\/$/, "");

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

assertGuard("ALLOW_C5_HTTP_RUNTIME_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { hashPassword } = await import("../backend/src/services/mysql-auth.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-C5HTTP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const adminPassword = `C5!Admin-${randomBytes(12).toString("hex")}aA1!`;
const brokerPassword = `C5!Broker-${randomBytes(12).toString("hex")}aA1!`;
const checks = [];
const createdUserIds = new Set();
const createdPartyIds = new Set();
const createdInvitationIds = new Set();

function record(name, pass, detail) {
  checks.push({ name, pass, ...(detail ? { detail } : {}) });
}

function computeValidCpf(nineDigits) {
  const digits = nineDigits.split("").map(Number);
  const digit = (length) => {
    let sum = 0;
    for (let i = 0; i < length; i += 1) sum += digits[i] * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  digits.push(digit(9));
  digits.push(digit(10));
  return digits.join("");
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

async function login(email, password) {
  const result = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!result.response.ok) {
    throw new Error(`login ${email} -> ${result.response.status}: ${result.payload?.message || result.payload?.error || "erro"}`);
  }
  const token = result.payload?.session?.access_token;
  if (!token) throw new Error("Login nao retornou access_token.");
  return { token, access: result.payload.access };
}

async function findSyntheticOwnerContext() {
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

  for (const user of users) {
    const permissions = new Set(user.roleRecord.permissions.map((row) => row.permission.key));
    if (!permissions.has("users.manage")) continue;
    const brokerRole = await prisma.role.findFirst({
      where: { companyId: user.companyId, systemKey: "broker" },
      select: { id: true },
    });
    if (brokerRole) return { template: user, brokerRole };
  }
  throw new Error("Nao encontrei empresa sintetica com owner users.manage e role broker.");
}

async function createAdmin(template) {
  const email = `${runKey.toLowerCase()}-admin@example.test`;
  const passwordHash = await hashPassword(adminPassword);
  const user = await prisma.appUser.create({
    data: {
      companyId: template.companyId,
      roleId: template.roleId,
      name: `${runKey} Admin`,
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

function tokenFromInviteUrl(inviteUrl) {
  const url = new URL(inviteUrl);
  return url.searchParams.get("token");
}

async function run() {
  const { template } = await findSyntheticOwnerContext();
  const admin = await createAdmin(template);
  const adminAuth = await login(admin.email, adminPassword);
  record("[LOGIN] owner QA autentica", Boolean(adminAuth.token));

  const brokerEmail = `${runKey.toLowerCase()}-broker@example.test`;
  const invite = await request("/auth/invite", {
    method: "POST",
    token: adminAuth.token,
    body: {
      email: brokerEmail,
      name: `${runKey} Broker`,
      roleSystemKey: "broker",
      expiresInDays: 7,
    },
  });
  record("[A] convite broker retorna 201", invite.response.status === 201, `status=${invite.response.status}`);
  const invitationId = invite.payload?.invitation?.id;
  if (invitationId) createdInvitationIds.add(invitationId);
  const inviteToken = invite.payload?.invite_url ? tokenFromInviteUrl(invite.payload.invite_url) : null;
  record("[A] convite retorna token utilizavel", Boolean(inviteToken));

  const cpf = computeValidCpf(String(Date.now()).slice(-9).padStart(9, "6"));
  const accept = await request("/auth/accept-invite", {
    method: "POST",
    body: {
      token: inviteToken,
      name: `${runKey} Broker`,
      password: brokerPassword,
      phone: "11988887777",
      document: cpf,
      creci_number: "123456-F",
      bio_text: "Perfil profissional C5 QA",
    },
  });
  record("[B] aceite de convite broker retorna 201", accept.response.status === 201, `status=${accept.response.status}`);
  const brokerUserId = accept.payload?.user_id;
  if (brokerUserId) createdUserIds.add(brokerUserId);

  const brokerUser = brokerUserId ? await prisma.appUser.findFirst({
    where: { id: brokerUserId, companyId: template.companyId },
    include: {
      party: {
        include: {
          roles: {
            where: { role: "broker" },
            include: { brokerProfile: true },
          },
        },
      },
    },
  }) : null;

  if (brokerUser?.partyId) createdPartyIds.add(brokerUser.partyId);
  const brokerRole = brokerUser?.party?.roles?.[0];
  const brokerProfile = brokerRole?.brokerProfile;
  record("[B] AppUser.partyId criado no aceite", Boolean(brokerUser?.partyId));
  record("[B] Party usa CPF informado", brokerUser?.party?.taxIdNormalized === cpf);
  record("[B] PartyRole broker criado", brokerRole?.role === "broker");
  record("[B] BrokerProfile criado", Boolean(brokerProfile));
  record("[B] CRECI persistido", brokerProfile?.creciNumber === "123456-F");
  record("[B] bio persistida", brokerProfile?.bioText === "Perfil profissional C5 QA");

  const brokerAuth = await login(brokerEmail, brokerPassword);
  record("[C] corretor criado consegue fazer login", Boolean(brokerAuth.token));
  record("[C] login retorna role broker", brokerAuth.access?.appUser?.role === "broker");

  const update = await request(`/auth/users/${brokerUserId}`, {
    method: "PATCH",
    token: adminAuth.token,
    body: {
      document: cpf,
      creci_number: "654321-F",
      bio_text: "Bio profissional atualizada C5",
    },
  });
  record("[D] PATCH de broker retorna 200", update.response.status === 200, `status=${update.response.status}`);

  const updatedProfile = brokerRole ? await prisma.brokerProfile.findFirst({
    where: { companyId: template.companyId, partyRoleId: brokerRole.id },
  }) : null;
  record("[D] PATCH atualiza CRECI", updatedProfile?.creciNumber === "654321-F");
  record("[D] PATCH atualiza bio", updatedProfile?.bioText === "Bio profissional atualizada C5");

  const sameParty = await prisma.appUser.findFirst({
    where: { id: brokerUserId, companyId: template.companyId },
    select: { partyId: true },
  });
  record("[D] PATCH preserva AppUser.partyId", sameParty?.partyId === brokerUser?.partyId);

  const otherCpf = computeValidCpf("123456789");
  const blocked = await request(`/auth/users/${brokerUserId}`, {
    method: "PATCH",
    token: adminAuth.token,
    body: { document: otherCpf },
  });
  record(
    "[E] troca material de CPF e bloqueada",
    blocked.response.status === 409 && (blocked.payload?.error === "BROKER_DOCUMENT_CHANGE_BLOCKED" || blocked.payload?.code === "BROKER_DOCUMENT_CHANGE_BLOCKED"),
    `status=${blocked.response.status} code=${blocked.payload?.error ?? blocked.payload?.code ?? "?"}`,
  );

  const invalid = await request(`/auth/users/${brokerUserId}`, {
    method: "PATCH",
    token: adminAuth.token,
    body: { document: "123.456.789-00" },
  });
  record(
    "[F] CPF invalido e rejeitado",
    invalid.response.status === 422 && (invalid.payload?.error === "INVALID_BROKER_DOCUMENT" || invalid.payload?.code === "INVALID_BROKER_DOCUMENT"),
    `status=${invalid.response.status} code=${invalid.payload?.error ?? invalid.payload?.code ?? "?"}`,
  );

  const partyCount = await prisma.party.count({ where: { companyId: template.companyId, taxIdNormalized: cpf } });
  const roleCount = brokerUser?.partyId ? await prisma.partyRole.count({ where: { companyId: template.companyId, partyId: brokerUser.partyId, role: "broker" } }) : 0;
  const profileCount = brokerRole ? await prisma.brokerProfile.count({ where: { companyId: template.companyId, partyRoleId: brokerRole.id } }) : 0;
  record("[G] unicidade Party=1", partyCount === 1, `count=${partyCount}`);
  record("[G] unicidade broker role=1", roleCount === 1, `count=${roleCount}`);
  record("[G] unicidade BrokerProfile=1", profileCount === 1, `count=${profileCount}`);

  const usersList = await request("/auth/users", { token: adminAuth.token });
  record("[H] listagem de usuarios continua funcionando", usersList.response.status === 200 && Array.isArray(usersList.payload?.users));
}

async function cleanup() {
  if (createdUserIds.size) {
    const ids = [...createdUserIds];
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authAuditLog.deleteMany({ where: { actorUserId: { in: ids } } });
  }

  if (createdInvitationIds.size) {
    await prisma.userInvitation.deleteMany({ where: { id: { in: [...createdInvitationIds] } } });
  }

  if (createdUserIds.size) {
    await prisma.appUser.deleteMany({ where: { id: { in: [...createdUserIds] } } });
  }

  if (createdPartyIds.size) {
    const partyIds = [...createdPartyIds];
    const roles = await prisma.partyRole.findMany({ where: { partyId: { in: partyIds } }, select: { id: true } });
    if (roles.length) await prisma.brokerProfile.deleteMany({ where: { partyRoleId: { in: roles.map((row) => row.id) } } });
    await prisma.partyRole.deleteMany({ where: { partyId: { in: partyIds } } });
    await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
  }
}

let exitCode = 0;
try {
  await run();
  const allPassed = checks.every((check) => check.pass);
  console.log(JSON.stringify({ runKey, apiUrl: API_URL, checks, allPassed }, null, 2));
  exitCode = allPassed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ runKey, fatalError: error instanceof Error ? error.message : String(error) }, null, 2));
  exitCode = 1;
} finally {
  try {
    await cleanup();
    const remainingUsers = await prisma.appUser.count({ where: { name: { contains: runKey } } });
    const remainingInvitations = await prisma.userInvitation.count({ where: { name: { contains: runKey } } });
    const remainingParties = createdPartyIds.size ? await prisma.party.count({ where: { id: { in: [...createdPartyIds] } } }) : 0;
    const cleanupOk = remainingUsers === 0 && remainingInvitations === 0 && remainingParties === 0;
    if (!cleanupOk) exitCode = 1;
    console.log(JSON.stringify({ cleanup: { remainingUsers, remainingInvitations, remainingParties, cleanupOk } }, null, 2));
  } catch (cleanupError) {
    console.error(JSON.stringify({ cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }, null, 2));
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`C5_RUNTIME_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
