#!/usr/bin/env node
import { randomBytes, randomUUID } from "node:crypto";

const API_URL = (process.env.C4_RUNTIME_API_URL || "https://imobiflow-staging.vercel.app/api").replace(/\/$/, "");

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

assertGuard("ALLOW_C4_HTTP_RUNTIME_TEST", "true");
assertDatabaseTarget();

const { getWebsiteBuilderPrisma } = await import("../backend/src/lib/website-builder-prisma.js");
const { hashPassword } = await import("../backend/src/services/mysql-auth.js");
const { resolveOrCreateBuyerIdentity } = await import("../backend/src/services/buyer-registration.js");

const prisma = getWebsiteBuilderPrisma();
const runKey = `QA-C4HTTP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
const password = `C4!Runtime-${randomBytes(12).toString("hex")}aA1!`;
const checks = [];
const createdContractIds = new Set();
const createdUserIds = new Set();
const createdLeadIds = new Set();
const createdPartyIds = new Set();

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
  if (!response.ok) throw new Error(`login -> ${response.status}: ${payload?.message || payload?.error || "erro"}`);
  const token = payload?.session?.access_token;
  if (!token) throw new Error("Login nao retornou access_token.");
  return { token, access: payload.access };
}

async function findSyntheticContext() {
  const users = await prisma.appUser.findMany({
    where: {
      status: "active",
      company: { isSynthetic: true, status: "active" },
    },
    include: {
      company: true,
      roleRecord: { include: { permissions: { include: { permission: true } } } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  for (const user of users) {
    const keys = new Set(user.roleRecord.permissions.map((x) => x.permission.key));
    if (!keys.has("contracts.manage") || !keys.has("contracts.view") || !keys.has("properties.view")) continue;
    const property = await prisma.property.findFirst({
      where: { companyId: user.companyId },
      select: { id: true, title: true },
      orderBy: { createdAt: "asc" },
    });
    if (property) return { template: user, property };
  }
  throw new Error("Nao encontrei contexto sintetico com contracts.manage/contracts.view/properties.view e imovel.");
}

async function createQaUser(template) {
  const email = `${runKey.toLowerCase()}@example.test`;
  const passwordHash = await hashPassword(password);
  const user = await prisma.appUser.create({
    data: {
      companyId: template.companyId,
      roleId: template.roleId,
      name: runKey,
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
  return user;
}

async function run() {
  const { template, property } = await findSyntheticContext();
  const qaUser = await createQaUser(template);
  const auth = await login(qaUser.email);

  record("[LOGIN] usuario QA autentica", Boolean(auth.token));
  record("[TENANT] usuario esta na empresa esperada", auth.access?.company?.id === template.companyId);

  const seed = String(Date.now()).slice(-9).padStart(9, "6");
  const cpf = computeValidCpf(seed);
  const cpf2 = computeValidCpf(String(Number(seed) + 17).padStart(9, "7").slice(-9));

  const manualId = randomUUID();
  const manual = await request("/real-estate/contracts", {
    method: "POST",
    token: auth.token,
    body: {
      id: manualId,
      property_id: property.id,
      title: `${runKey} Manual`,
      contract_type: "rental",
      parties: [{
        party_type: "tenant",
        name: `${runKey} Tenant Manual`,
        document: cpf,
        email: `${runKey.toLowerCase()}-tenant@example.test`,
        signature_required: true,
      }],
    },
  });
  if (manual.response.status === 201) createdContractIds.add(manualId);
  record("[A] contrato manual com tenant retorna 201", manual.response.status === 201, `status=${manual.response.status}`);

  const manualParty = manual.payload?.contract?.parties?.find((p) => p.partyType === "tenant" || p.party_type === "tenant");
  const manualSourcePartyId = manualParty?.sourcePartyId ?? manualParty?.source_party_id ?? null;
  if (manualSourcePartyId) createdPartyIds.add(manualSourcePartyId);
  record("[A] ContractParty tenant recebe sourcePartyId", Boolean(manualSourcePartyId));

  const role = manualSourcePartyId ? await prisma.partyRole.findFirst({
    where: { companyId: template.companyId, partyId: manualSourcePartyId, role: "tenant" },
    select: { id: true },
  }) : null;
  const profile = role ? await prisma.tenantProfile.findFirst({
    where: { companyId: template.companyId, partyRoleId: role.id },
    select: { id: true },
  }) : null;
  record("[A] PartyRole tenant existe", Boolean(role));
  record("[A] TenantProfile existe", Boolean(profile));

  const repeatedId = randomUUID();
  const repeated = await request("/real-estate/contracts", {
    method: "POST",
    token: auth.token,
    body: {
      id: repeatedId,
      property_id: property.id,
      title: `${runKey} Repeated`,
      contract_type: "rental",
      parties: [{ party_type: "tenant", name: `${runKey} Tenant Repeated`, document: cpf, signature_required: true }],
    },
  });
  if (repeated.response.status === 201) createdContractIds.add(repeatedId);
  const repeatedParty = repeated.payload?.contract?.parties?.find((p) => p.partyType === "tenant" || p.party_type === "tenant");
  const repeatedSourcePartyId = repeatedParty?.sourcePartyId ?? repeatedParty?.source_party_id ?? null;
  record("[B] segundo contrato mesmo CPF permitido", repeated.response.status === 201);
  record("[B] segundo contrato reutiliza mesma Party", Boolean(manualSourcePartyId) && repeatedSourcePartyId === manualSourcePartyId);

  const noDocId = randomUUID();
  const noDoc = await request("/real-estate/contracts", {
    method: "POST",
    token: auth.token,
    body: {
      id: noDocId,
      property_id: property.id,
      title: `${runKey} NoDoc`,
      contract_type: "rental",
      parties: [{ party_type: "tenant", name: `${runKey} Tenant NoDoc`, signature_required: true }],
    },
  });
  if (noDoc.response.status === 201) createdContractIds.add(noDocId);
  const noDocParty = noDoc.payload?.contract?.parties?.find((p) => p.partyType === "tenant" || p.party_type === "tenant");
  record("[C] contrato tenant sem documento continua permitido", noDoc.response.status === 201);
  record("[C] tenant sem documento nao ganha Party artificial", !(noDocParty?.sourcePartyId ?? noDocParty?.source_party_id));

  const invalidId = randomUUID();
  const invalid = await request("/real-estate/contracts", {
    method: "POST",
    token: auth.token,
    body: {
      id: invalidId,
      property_id: property.id,
      title: `${runKey} Invalid`,
      contract_type: "rental",
      parties: [{ party_type: "tenant", name: `${runKey} Invalid Tenant`, document: "123.456.789-00", signature_required: true }],
    },
  });
  record("[D] CPF invalido de tenant e rejeitado", invalid.response.status === 422, `status=${invalid.response.status}`);
  const invalidPersisted = await prisma.contract.count({ where: { id: invalidId } });
  record("[D] contrato invalido nao foi persistido", invalidPersisted === 0, `count=${invalidPersisted}`);

  // Prepara um Lead C3 diretamente pela camada canônica para provar a
  // conversao C3 -> C4 sem depender de o papel QA possuir crm.manage.
  const buyer = await resolveOrCreateBuyerIdentity(template.companyId, qaUser.id, {
    name: `${runKey} Lead Buyer`,
    document: cpf2,
    partyType: "individual",
    email: `${runKey.toLowerCase()}-lead@example.test`,
  });
  createdPartyIds.add(buyer.party.id);
  const lead = await prisma.lead.create({
    data: {
      companyId: template.companyId,
      createdBy: qaUser.id,
      partyId: buyer.party.id,
      name: `${runKey} Lead Buyer`,
      email: `${runKey.toLowerCase()}-lead@example.test`,
      emailNormalized: `${runKey.toLowerCase()}-lead@example.test`,
      source: "c4-http",
      interestType: "rent",
      status: "open",
    },
  });
  createdLeadIds.add(lead.id);

  const fromLead = await request("/real-estate/contracts/from-lead", {
    method: "POST",
    token: auth.token,
    body: {
      lead_id: lead.id,
      property_id: property.id,
      title: `${runKey} From Lead`,
      contract_type: "rental",
    },
  });
  const fromLeadContractId = fromLead.payload?.contract?.id;
  if (fromLead.response.status === 201 && fromLeadContractId) createdContractIds.add(fromLeadContractId);
  const fromLeadParty = fromLead.payload?.contract?.parties?.find((p) => p.partyType === "tenant" || p.party_type === "tenant");
  const fromLeadSourcePartyId = fromLeadParty?.sourcePartyId ?? fromLeadParty?.source_party_id ?? null;
  record("[E] /from-lead retorna 201", fromLead.response.status === 201, `status=${fromLead.response.status}`);
  record("[E] /from-lead reutiliza exatamente Party da C3", fromLeadSourcePartyId === buyer.party.id);

  const buyerRole = await prisma.partyRole.findFirst({ where: { companyId: template.companyId, partyId: buyer.party.id, role: "buyer" }, select: { id: true } });
  const tenantRole = await prisma.partyRole.findFirst({ where: { companyId: template.companyId, partyId: buyer.party.id, role: "tenant" }, select: { id: true } });
  const tenantProfile = tenantRole ? await prisma.tenantProfile.findFirst({ where: { companyId: template.companyId, partyRoleId: tenantRole.id }, select: { id: true } }) : null;
  record("[E] Party preserva role buyer", Boolean(buyerRole));
  record("[E] mesma Party ganha role tenant", Boolean(tenantRole));
  record("[E] mesma Party ganha TenantProfile", Boolean(tenantProfile));

  const detail = fromLeadContractId ? await request(`/real-estate/contracts/${fromLeadContractId}`, { token: auth.token }) : null;
  record("[F] GET contrato C4 funciona", detail?.response.status === 200);

  const manualPartyCount = manualSourcePartyId ? await prisma.party.count({ where: { companyId: template.companyId, id: manualSourcePartyId, taxIdNormalized: cpf } }) : 0;
  const manualRoleCount = manualSourcePartyId ? await prisma.partyRole.count({ where: { companyId: template.companyId, partyId: manualSourcePartyId, role: "tenant" } }) : 0;
  record("[G] unicidade Party manual=1", manualPartyCount === 1, `count=${manualPartyCount}`);
  record("[G] unicidade tenant role manual=1", manualRoleCount === 1, `count=${manualRoleCount}`);
}

async function cleanup() {
  if (createdContractIds.size) {
    const ids = [...createdContractIds];
    await prisma.financialEntry.deleteMany({ where: { contractId: { in: ids } } });
    await prisma.contractEvent.deleteMany({ where: { contractId: { in: ids } } });
    await prisma.contractClauseInstance.deleteMany({ where: { contractId: { in: ids } } });
    await prisma.contractVersion.deleteMany({ where: { contractId: { in: ids } } });
    await prisma.contractParty.deleteMany({ where: { contractId: { in: ids } } });
    await prisma.contract.deleteMany({ where: { id: { in: ids } } });
  }

  if (createdLeadIds.size) {
    const ids = [...createdLeadIds];
    await prisma.leadEvent.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.leadActivity.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.siteLead.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.leadAccess.deleteMany({ where: { leadId: { in: ids } } });
    await prisma.lead.deleteMany({ where: { id: { in: ids } } });
  }

  if (createdPartyIds.size) {
    const partyIds = [...createdPartyIds];
    const roles = await prisma.partyRole.findMany({ where: { partyId: { in: partyIds } }, select: { id: true } });
    const roleIds = roles.map((r) => r.id);
    if (roleIds.length) {
      await prisma.buyerProfile.deleteMany({ where: { partyRoleId: { in: roleIds } } });
      await prisma.tenantProfile.deleteMany({ where: { partyRoleId: { in: roleIds } } });
    }
    await prisma.partyRole.deleteMany({ where: { partyId: { in: partyIds } } });
    await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
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
    const remainingContracts = await prisma.contract.count({ where: { title: { contains: runKey } } });
    const remainingLeads = await prisma.lead.count({ where: { name: { contains: runKey } } });
    const remainingUsers = await prisma.appUser.count({ where: { name: { contains: runKey } } });
    const remainingParties = createdPartyIds.size ? await prisma.party.count({ where: { id: { in: [...createdPartyIds] } } }) : 0;
    const cleanupOk = remainingContracts === 0 && remainingLeads === 0 && remainingUsers === 0 && remainingParties === 0;
    if (!cleanupOk) exitCode = 1;
    console.log(JSON.stringify({ cleanup: { remainingContracts, remainingLeads, remainingUsers, remainingParties, cleanupOk } }, null, 2));
  } catch (cleanupError) {
    console.error(JSON.stringify({ cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError) }, null, 2));
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

console.log(`C4_RUNTIME_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
