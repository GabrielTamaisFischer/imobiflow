#!/usr/bin/env node
import { randomBytes } from "node:crypto";

const API_URL = (process.env.C3_RUNTIME_API_URL || "https://imobiflow-staging.vercel.app/api").replace(/\/$/, "");

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

assertGuard("ALLOW_C3_HTTP_RUNTIME_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { hashPassword } = await import("../backend/src/services/mysql-auth.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-C3HTTP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const password = `C3!Runtime-${randomBytes(12).toString("hex")}aA1!`;

const createdUserIds = new Set();
const createdLeadIds = new Set();
const createdPartyIds = new Set();
const checks = [];

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

async function login(email) {
  const { response, payload } = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!response.ok) throw new Error(`login ${email} -> ${response.status}: ${payload?.message || payload?.error || "erro"}`);
  const token = payload?.session?.access_token;
  if (!token) throw new Error("Login nao retornou access_token.");
  return { token, access: payload.access };
}

async function findTwoSyntheticCrmUsers() {
  const users = await prisma.appUser.findMany({
    where: {
      status: "active",
      company: { isSynthetic: true, status: "active" },
      roleRecord: {
        permissions: {
          some: { permission: { key: "crm.manage" } },
        },
      },
    },
    include: {
      company: true,
      roleRecord: true,
    },
    orderBy: [{ companyId: "asc" }, { createdAt: "asc" }],
  });
  const byCompany = new Map();
  for (const user of users) if (!byCompany.has(user.companyId)) byCompany.set(user.companyId, user);
  const selected = [...byCompany.values()].slice(0, 2);
  if (selected.length < 2) throw new Error("Sao necessarios usuarios crm.manage em pelo menos 2 empresas sinteticas.");
  return selected;
}

async function createQaUser(template, suffix) {
  const email = `${runKey.toLowerCase()}-${suffix}@example.test`;
  const passwordHash = await hashPassword(password);
  const user = await prisma.appUser.create({
    data: {
      companyId: template.companyId,
      roleId: template.roleId,
      name: `${runKey} ${suffix}`,
      email,
      phone: null,
      passwordHash,
      status: "active",
      isSynthetic: true,
      role: template.role,
      permissionsJson: template.permissionsJson,
      failedLoginAttempts: 0,
      lockedUntil: null,
      passwordChangedAt: new Date(),
    },
  });
  createdUserIds.add(user.id);
  return { ...user, email };
}

async function deleteIdentityForLead(leadId) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { partyId: true } });
  if (lead?.partyId) createdPartyIds.add(lead.partyId);
}

async function run() {
  const [templateA, templateB] = await findTwoSyntheticCrmUsers();
  const qaA = await createQaUser(templateA, "A");
  const qaB = await createQaUser(templateB, "B");

  const a = await login(qaA.email);
  const b = await login(qaB.email);
  record("[LOGIN] tenant A autentica via HTTP", Boolean(a.token));
  record("[LOGIN] tenant B autentica via HTTP", Boolean(b.token));
  record("[TENANT] logins pertencem a companies distintas", a.access?.company?.id !== b.access?.company?.id);

  const seed = String(Date.now()).slice(-9).padStart(9, "6");
  const cpf = computeValidCpf(seed);
  const cpf2 = computeValidCpf(String(Number(seed) + 7).padStart(9, "7").slice(-9));

  const create1 = await request("/crm/leads", {
    method: "POST",
    token: a.token,
    body: { name: `${runKey} Lead 1`, document: cpf, source: "c3-http", interest_type: "sale" },
  });
  record("[A] POST buyer Lead retorna 201", create1.response.status === 201, `status=${create1.response.status}`);
  const lead1 = create1.payload?.lead;
  if (lead1?.id) createdLeadIds.add(lead1.id);
  if (lead1?.party_id) createdPartyIds.add(lead1.party_id);
  record("[A] POST buyer Lead retorna party_id", Boolean(lead1?.party_id));

  const create2 = await request("/crm/leads", {
    method: "POST",
    token: a.token,
    body: { name: `${runKey} Lead 2`, document: cpf, source: "c3-http", interest_type: "sale" },
  });
  const lead2 = create2.payload?.lead;
  if (lead2?.id) createdLeadIds.add(lead2.id);
  if (lead2?.party_id) createdPartyIds.add(lead2.party_id);
  record("[B] segundo Lead mesmo CPF permitido", create2.response.status === 201 && lead2?.id !== lead1?.id);
  record("[B] segundo Lead reutiliza mesma Party", Boolean(lead1?.party_id) && lead2?.party_id === lead1.party_id);

  const detail = await request(`/crm/leads/${lead1.id}`, { token: a.token });
  record("[C] GET detalhe funciona", detail.response.status === 200);
  record("[C] detalhe expõe CPF e party_id", detail.payload?.lead?.document === cpf && detail.payload?.lead?.party_id === lead1.party_id);

  const normalPatch = await request(`/crm/leads/${lead1.id}`, {
    method: "PATCH",
    token: a.token,
    body: { phone: "11999990000" },
  });
  record("[D] PATCH normal retorna 200", normalPatch.response.status === 200);
  record("[D] PATCH normal preserva party_id", normalPatch.payload?.lead?.party_id === lead1.party_id);

  const blocked = await request(`/crm/leads/${lead1.id}`, {
    method: "PATCH",
    token: a.token,
    body: { document: cpf2 },
  });
  record(
    "[E] troca material de CPF bloqueada",
    blocked.response.status === 409 && blocked.payload?.error === "BUYER_DOCUMENT_CHANGE_BLOCKED",
    `status=${blocked.response.status} code=${blocked.payload?.error ?? blocked.payload?.code ?? "?"}`,
  );

  const legacyCreate = await request("/crm/leads", {
    method: "POST",
    token: a.token,
    body: { name: `${runKey} Legacy`, source: "c3-http", interest_type: "sale" },
  });
  const legacy = legacyCreate.payload?.lead;
  if (legacy?.id) createdLeadIds.add(legacy.id);
  record("[F] Lead sem documento continua sem Party", legacyCreate.response.status === 201 && legacy?.party_id === null);

  const legacyNoDocPatch = await request(`/crm/leads/${legacy.id}`, {
    method: "PATCH",
    token: a.token,
    body: { phone: "11888887777" },
  });
  record("[G] PATCH legado sem documento permanece sem Party", legacyNoDocPatch.response.status === 200 && legacyNoDocPatch.payload?.lead?.party_id === null);

  const legacyLink = await request(`/crm/leads/${legacy.id}`, {
    method: "PATCH",
    token: a.token,
    body: { document: cpf2 },
  });
  if (legacyLink.payload?.lead?.party_id) createdPartyIds.add(legacyLink.payload.lead.party_id);
  record("[H] lazy-link de Lead legado funciona", legacyLink.response.status === 200 && Boolean(legacyLink.payload?.lead?.party_id));

  const otherTenant = await request("/crm/leads", {
    method: "POST",
    token: b.token,
    body: { name: `${runKey} Tenant B`, document: cpf, source: "c3-http", interest_type: "sale" },
  });
  const leadB = otherTenant.payload?.lead;
  if (leadB?.id) createdLeadIds.add(leadB.id);
  if (leadB?.party_id) createdPartyIds.add(leadB.party_id);
  record("[I] mesmo CPF em outro tenant cria Lead", otherTenant.response.status === 201);
  record("[I] mesmo CPF em outro tenant usa Party diferente", Boolean(leadB?.party_id) && leadB.party_id !== lead1.party_id);

  const crossTenant = await request(`/crm/leads/${lead1.id}`, { token: b.token });
  record("[I] tenant B nao enxerga Lead do tenant A", crossTenant.response.status === 404, `status=${crossTenant.response.status}`);

  const invalid = await request("/crm/leads", {
    method: "POST",
    token: a.token,
    body: { name: `${runKey} Invalid`, document: "123.456.789-00", source: "c3-http", interest_type: "sale" },
  });
  record("[J] CPF invalido e rejeitado", invalid.response.status === 422, `status=${invalid.response.status}`);

  const list = await request(`/crm/leads?status=open&search=${encodeURIComponent(runKey)}`, { token: a.token });
  record("[K] CRM list funciona com leads C3", list.response.status === 200 && Array.isArray(list.payload?.leads));

  const dbPartyCountA = await prisma.party.count({ where: { companyId: qaA.companyId, taxIdNormalized: cpf } });
  const dbRoleCountA = await prisma.partyRole.count({ where: { companyId: qaA.companyId, partyId: lead1.party_id, role: "buyer" } });
  const role = await prisma.partyRole.findFirst({ where: { companyId: qaA.companyId, partyId: lead1.party_id, role: "buyer" }, select: { id: true } });
  const dbProfileCountA = role ? await prisma.buyerProfile.count({ where: { companyId: qaA.companyId, partyRoleId: role.id } }) : 0;
  record("[L] DB Party unica no tenant A", dbPartyCountA === 1, `count=${dbPartyCountA}`);
  record("[L] DB buyer role unica no tenant A", dbRoleCountA === 1, `count=${dbRoleCountA}`);
  record("[L] DB BuyerProfile unico no tenant A", dbProfileCountA === 1, `count=${dbProfileCountA}`);
}

async function cleanup() {
  for (const leadId of createdLeadIds) await deleteIdentityForLead(leadId);
  if (createdLeadIds.size) {
    await prisma.leadActivity.deleteMany({ where: { leadId: { in: [...createdLeadIds] } } });
    await prisma.leadEvent.deleteMany({ where: { leadId: { in: [...createdLeadIds] } } });
    await prisma.siteLead.deleteMany({ where: { leadId: { in: [...createdLeadIds] } } });
    await prisma.leadAccess.deleteMany({ where: { leadId: { in: [...createdLeadIds] } } });
    await prisma.lead.deleteMany({ where: { id: { in: [...createdLeadIds] } } });
  }
  if (createdPartyIds.size) {
    const roles = await prisma.partyRole.findMany({ where: { partyId: { in: [...createdPartyIds] } }, select: { id: true } });
    if (roles.length) await prisma.buyerProfile.deleteMany({ where: { partyRoleId: { in: roles.map((r) => r.id) } } });
    await prisma.partyRole.deleteMany({ where: { partyId: { in: [...createdPartyIds] } } });
    await prisma.party.deleteMany({ where: { id: { in: [...createdPartyIds] } } });
  }
  if (createdUserIds.size) {
    await prisma.authSession.deleteMany({ where: { userId: { in: [...createdUserIds] } } });
    await prisma.authAuditLog.deleteMany({ where: { actorUserId: { in: [...createdUserIds] } } });
    await prisma.appUser.deleteMany({ where: { id: { in: [...createdUserIds] } } });
  }
}

let exitCode = 0;
try {
  await run();
  const allPassed = checks.every((c) => c.pass);
  console.log(JSON.stringify({ runKey, apiUrl: API_URL, checks, allPassed }, null, 2));
  exitCode = allPassed ? 0 : 1;
} catch (error) {
  console.error(JSON.stringify({ runKey, fatalError: error instanceof Error ? error.message : String(error) }, null, 2));
  exitCode = 1;
} finally {
  try {
    await cleanup();
    const remainingLeads = await prisma.lead.count({ where: { name: { contains: runKey } } });
    const remainingUsers = await prisma.appUser.count({ where: { name: { contains: runKey } } });
    const remainingParties = createdPartyIds.size
      ? await prisma.party.count({ where: { id: { in: [...createdPartyIds] } } })
      : 0;
    const cleanupOk = remainingLeads === 0 && remainingUsers === 0 && remainingParties === 0;
    if (!cleanupOk) exitCode = 1;
    console.log(JSON.stringify({ cleanup: { remainingLeads, remainingUsers, remainingParties, cleanupOk } }, null, 2));
  } catch (cleanupError) {
    console.error(JSON.stringify({ cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }, null, 2));
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`C3_RUNTIME_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
