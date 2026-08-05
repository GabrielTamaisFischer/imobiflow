import { createHmac, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(scriptDir, "..");
const repositoryDir = resolve(platformDir, "..");
const resultDir = resolve(platformDir, ".tmp", "import-staging", "500");
const config = dotenv.parse(await readFile(resolve(platformDir, ".env")));

assertSessionGuard("NODE_ENV", "staging");
assertSessionGuard("ALLOW_IMPORT_STAGING_TEST", "true");
assertSessionGuard("CONFIRM_IMPORT_500_STAGING", "true");
if (config.NODE_ENV !== "staging") throw new Error("platform/.env precisa declarar NODE_ENV=staging.");

const apiUrl = process.env.RAILWAY_STAGING_API_URL?.replace(/\/$/, "");
if (!apiUrl || !apiUrl.startsWith("https://imobiflow-api-staging-") || !apiUrl.endsWith(".up.railway.app")) {
  throw new Error("RAILWAY_STAGING_API_URL precisa apontar para o dominio temporario do servico imobiflow-api-staging.");
}

const databaseUrl = new URL(config.DATABASE_URL);
assertDatabaseTarget(databaseUrl);
process.env.DATABASE_URL = config.DATABASE_URL;
const prisma = new PrismaClient();
const railwayEnvironment = process.env.RAILWAY_STAGING_ENVIRONMENT || "production";
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(railwayEnvironment)) throw new Error("Rotulo de ambiente Railway invalido.");
const preflightOnly = process.argv.includes("--preflight-only");
let httpCalls = 0;
let healthCalls = 0;

function assertSessionGuard(name, expected) {
  if (process.env[name] !== expected) throw new Error(`${name}=${expected} e obrigatorio nesta sessao.`);
}

function assertDatabaseTarget(value) {
  const expectedHost = process.env.EXPECTED_STAGING_DB_HOST;
  const expectedPort = process.env.EXPECTED_STAGING_DB_PORT;
  const expectedDatabase = process.env.EXPECTED_STAGING_DB_NAME;
  if (!expectedHost || !expectedPort || !expectedDatabase) {
    throw new Error("O destino sanitizado de staging precisa ser confirmado por EXPECTED_STAGING_DB_HOST/PORT/NAME.");
  }
  if (value.hostname !== expectedHost || value.port !== expectedPort || value.pathname.replace(/^\//, "") !== expectedDatabase) {
    throw new Error("DATABASE_URL local nao corresponde ao MySQL de staging confirmado. Execucao interrompida.");
  }
}

async function api(path, { token, method = "GET", body, expected = [200] } = {}) {
  httpCalls += 1;
  const startedAt = performance.now();
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseText = await response.text();
  const payload = responseText ? JSON.parse(responseText) : {};
  const result = {
    status: response.status,
    payload,
    payloadBytes: Buffer.byteLength(responseText, "utf8"),
    elapsedMs: round(performance.now() - startedAt),
  };
  if (!expected.includes(response.status)) {
    const code = typeof payload?.error === "string" ? payload.error : "UNEXPECTED_RESPONSE";
    throw new Error(`${method} ${path} retornou HTTP ${response.status} (${code}).`);
  }
  return result;
}

async function waitForApi() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    healthCalls += 1;
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.status === 200) return;
    } catch {}
    await delay(1_000);
  }
  throw new Error("A API Railway nao voltou ao estado saudavel dentro do limite.");
}

async function preflight() {
  await waitForApi();
  const [companies, users, properties, counts, migrations, runningJobs, databaseBytes] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.appUser.findMany({ select: { companyId: true, email: true, status: true } }),
    prisma.property.findMany({ select: { code: true, title: true, importJobId: true } }),
    readCounts(),
    prisma.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`,
    prisma.importJob.count({ where: { status: "PROCESSING" } }),
    readDatabaseBytes(),
  ]);
  const companyIds = new Set(companies.map((company) => company.id));
  const companiesAreSynthetic = companies.length === 2 && companies.every((company) => /staging/i.test(company.name));
  const usersBelongToSyntheticCompanies = users.length === 2 && users.every((user) => companyIds.has(user.companyId) && user.status === "active");
  const propertiesAreSynthetic = properties.every((property) =>
    Boolean(property.importJobId) || /(?:sintet|simulad|staging|qa|teste)/i.test(`${property.code ?? ""} ${property.title}`),
  );
  const migrationRows = Array.isArray(migrations) ? migrations : [];
  const requiredMigrations = [
    "202605220001_website_builder_foundation",
    "202605230002_website_builder_audit_logs",
    "202606010001_website_builder_code_files",
    "202607130001_mysql_saas_core",
    "202607130002_site_audit_actions",
    "202607140001_storage_provider_metadata",
    "202608040001_resumable_imports",
    "202608050001_property_query_indexes",
  ];
  const appliedMigrations = new Set(migrationRows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name));
  const migrationsHealthy = requiredMigrations.every((migration) => appliedMigrations.has(migration));
  if (!companiesAreSynthetic || !usersBelongToSyntheticCompanies || !propertiesAreSynthetic) {
    throw new Error("O banco nao passou na verificacao de dados exclusivamente sinteticos.");
  }
  if (!migrationsHealthy) throw new Error("A cadeia esperada de sete migrations nao esta integra e aplicada.");
  if (runningJobs !== 0) throw new Error("Existe ImportJob em PROCESSING; o teste nao pode iniciar.");
  return {
    companies,
    counts,
    databaseBytes,
    safe: {
      nodeEnv: process.env.NODE_ENV,
      stagingGuards: true,
      companies: companies.length,
      users: users.length,
      properties: properties.length,
      importJobs: counts.importJobs,
      importRows: counts.importRows,
      runningJobs,
      migrationsApplied: appliedMigrations.size,
      migrationsHealthy,
      exclusivelySynthetic: true,
      apiHealthy: true,
    },
  };
}

async function readCounts() {
  const [companies, users, properties, importJobs, importRows, storedFiles, propertyMedia] = await Promise.all([
    prisma.company.count(), prisma.appUser.count(), prisma.property.count(), prisma.importJob.count(),
    prisma.importRow.count(), prisma.storedFile.count(), prisma.propertyMedia.count(),
  ]);
  return { companies, users, properties, importJobs, importRows, storedFiles, propertyMedia };
}

async function readDatabaseBytes() {
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  const rows = await prisma.$queryRaw`SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.tables WHERE table_schema = ${databaseName}`;
  return Number(rows?.[0]?.bytes ?? 0);
}

async function loginCompanyA() {
  const email = config.IMOBIFLOW_BOOTSTRAP_EMAIL;
  const password = config.IMOBIFLOW_BOOTSTRAP_PASSWORD;
  if (!email || !password) throw new Error("Credenciais bootstrap de staging ausentes no arquivo local ignorado.");
  const response = await api("/auth/login", { method: "POST", body: { email, password } });
  const token = response.payload?.session?.access_token;
  const companyId = response.payload?.access?.company?.id;
  if (!token || !companyId) throw new Error("Login da Empresa A nao retornou sessao e empresa.");
  return { token, companyId, elapsedMs: response.elapsedMs };
}

async function tokenForCompanyB(companyAId) {
  const user = await prisma.appUser.findFirst({
    where: { companyId: { not: companyAId }, status: "active", company: { name: { contains: "Staging" } } },
    select: { id: true, companyId: true, email: true },
  });
  if (!user) throw new Error("Usuario sintetico da Empresa B nao encontrado.");
  const secret = config.JWT_SECRET || config.IMOBIFLOW_BOOTSTRAP_PASSWORD;
  if (!secret) throw new Error("JWT_SECRET de staging ausente.");
  const body = Buffer.from(JSON.stringify({ userId: user.id, companyId: user.companyId, email: user.email, iat: Date.now() }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return { token: `imobiflow.mysql.${body}.${signature}`, companyId: user.companyId };
}

function buildFixture() {
  const runKey = `QA500-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const rows = ["Codigo;Titulo;Cidade;Status;Valor Venda;Tipo;Finalidade"];
  const types = ["apartamento", "casa", "comercial"];
  const operations = ["venda", "locacao", "ambos"];
  const codes = [];
  for (let index = 1; index <= 500; index += 1) {
    const code = `${runKey}-${String(index).padStart(3, "0")}`;
    codes.push(code);
    rows.push(`${code};Imovel sintetico QA 500 ${index};Curitiba;disponivel;${250000 + index};${types[(index - 1) % types.length]};${operations[(index - 1) % operations.length]}`);
  }
  if (new Set(codes).size !== 500) throw new Error("A fixture nao produziu 500 codigos unicos.");
  return { runKey, codes, buffer: Buffer.from(rows.join("\n"), "utf8") };
}

async function processBatch(token, jobId, batchNumber) {
  const response = await api(`/imports/${jobId}/process-next-batch`, { token, method: "POST" });
  const current = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  return snapshotBatch(batchNumber, response.elapsedMs, current);
}

function snapshotBatch(number, elapsedMs, job) {
  return {
    number,
    elapsedMs,
    cursor: job.nextCursor,
    processedRows: job.processedRows,
    importedRows: job.importedRows,
    duplicateRows: job.duplicateRows,
    failedRows: job.failedRows,
    status: job.status,
  };
}

function restartRailwayService() {
  const command = `npx.cmd -y @railway/cli@latest service restart --service imobiflow-api-staging --environment ${railwayEnvironment} --yes --json`;
  execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    cwd: repositoryDir,
    stdio: "ignore",
    windowsHide: true,
  });
}

async function measureReads(companyA, companyB, jobId, fixture) {
  const paths = {
    first_page: "/real-estate/properties?page=1&page_size=50&status=all",
    middle_page: "/real-estate/properties?page=6&page_size=50&status=all",
    last_page: "/real-estate/properties?page=11&page_size=50&status=all",
    code_search: `/real-estate/properties/by-code/${encodeURIComponent(fixture.codes[124])}`,
    external_id_search: `/real-estate/properties/by-external-id/${encodeURIComponent(fixture.codes[249])}?import_source=csv`,
    purpose_sale: "/real-estate/properties?page=1&page_size=50&status=all&operation=sale",
    type_house: "/real-estate/properties?page=1&page_size=50&status=all&property_type=house",
    status_available: "/real-estate/properties?page=1&page_size=50&status=available",
  };
  const apiMetrics = {};
  for (const [name, path] of Object.entries(paths)) apiMetrics[name] = await measureApi(path, companyA.token, 5);

  const first = await api(paths.first_page, { token: companyA.token });
  const middle = await api(paths.middle_page, { token: companyA.token });
  const last = await api(paths.last_page, { token: companyA.token });
  const code = await api(paths.code_search, { token: companyA.token });
  const detailId = code.payload?.property?.id;
  if (!detailId) throw new Error("Busca por codigo nao retornou imovel para medir detalhe.");
  apiMetrics.detail = await measureApi(`/real-estate/properties/${encodeURIComponent(detailId)}`, companyA.token, 5);
  const pageItems = [first, middle, last].map((response) => response.payload?.items ?? []);
  const ids = pageItems.flatMap((items) => items.map((row) => row.id));
  const expectedTotal = 501;
  const pagesCorrect = pageItems[0].length === 50
    && pageItems[1].length === 50
    && pageItems[2].length === 1
    && new Set(ids).size === ids.length
    && first.payload?.pagination?.total === expectedTotal
    && last.payload?.pagination?.total_pages === 11;

  const companyBList = await api("/real-estate/properties?page=1&page_size=100&status=all", { token: companyB.token });
  const companyBProperties = Array.isArray(companyBList.payload?.items) ? companyBList.payload.items : [];
  const companyBJobLeak = companyBProperties.some((property) => String(property.code || "").startsWith(fixture.runKey));
  const companyBDetail = await api(`/real-estate/properties/${encodeURIComponent(detailId)}`, {
    token: companyB.token,
    expected: [404],
  });

  const explains = {
    pagination: sanitizeExplain(await prisma.$queryRaw`EXPLAIN SELECT id, created_at FROM properties WHERE company_id = ${companyA.companyId} ORDER BY created_at DESC, id DESC LIMIT 50`),
    code: sanitizeExplain(await prisma.$queryRaw`EXPLAIN SELECT id FROM properties WHERE company_id = ${companyA.companyId} AND code = ${fixture.codes[124]} LIMIT 1`),
    externalId: sanitizeExplain(await prisma.$queryRaw`EXPLAIN SELECT id FROM properties WHERE company_id = ${companyA.companyId} AND import_source = 'csv' AND import_external_id = ${fixture.codes[249]} LIMIT 1`),
    operation: sanitizeExplain(await prisma.$queryRaw`EXPLAIN SELECT id FROM properties WHERE company_id = ${companyA.companyId} AND operation = 'sale' LIMIT 50`),
    propertyType: sanitizeExplain(await prisma.$queryRaw`EXPLAIN SELECT id FROM properties WHERE company_id = ${companyA.companyId} AND property_type = 'house' LIMIT 50`),
    importJob: sanitizeExplain(await prisma.$queryRaw`EXPLAIN SELECT id FROM properties WHERE company_id = ${companyA.companyId} AND import_job_id = ${jobId} LIMIT 50`),
  };
  const apiSamples = Object.values(apiMetrics).flatMap((metric) => metric.samplesMs);
  return {
    api: apiMetrics,
    apiOverall: summarize(apiSamples),
    pagesCorrect,
    expectedTotal,
    companyB: {
      listStatus: companyBList.status,
      detailStatus: companyBDetail.status,
      returned: companyBProperties.length,
      leakedJobProperties: companyBJobLeak,
    },
    explains,
  };
}

async function measureApi(path, token, repetitions) {
  const samples = [];
  const payloadSizes = [];
  let quantity = 0;
  let total = null;
  for (let index = 0; index < repetitions; index += 1) {
    const response = await api(path, { token });
    samples.push(response.elapsedMs);
    payloadSizes.push(response.payloadBytes);
    quantity = Array.isArray(response.payload?.items) ? response.payload.items.length : response.payload?.property ? 1 : 0;
    total = response.payload?.pagination?.total ?? total;
  }
  return {
    ...summarize(samples),
    quantity,
    total,
    averagePayloadBytes: round(payloadSizes.reduce((sum, value) => sum + value, 0) / payloadSizes.length),
    maxPayloadBytes: Math.max(...payloadSizes),
    samplesMs: samples,
  };
}

function sanitizeExplain(rows) {
  return rows.map((row) => {
    const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]));
    return {
      key: normalized.key ?? normalized.f6 ?? null,
      accessType: normalized.type ?? normalized.f4 ?? null,
      estimatedRows: Number(normalized.rows ?? normalized.f9 ?? 0),
      extra: normalized.extra ?? normalized.f11 ?? null,
    };
  });
}

function readRailwayMetrics(since) {
  const command = `npx.cmd -y @railway/cli@latest metrics --service imobiflow-api-staging --environment ${railwayEnvironment} --since ${since} --json --cpu --memory`;
  const output = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    cwd: repositoryDir,
    encoding: "utf8",
    windowsHide: true,
  });
  const start = output.indexOf("{");
  return JSON.parse(output.slice(start));
}

function metricPayload(metadata) {
  return metadata && typeof metadata === "object" && metadata.import_metrics && typeof metadata.import_metrics === "object"
    ? metadata.import_metrics
    : {};
}

function sameRollback(left, right) {
  const keys = ["deleted_properties", "deleted_owners", "deleted_media", "deleted_file_records", "deleted_provider_files"];
  return keys.every((key) => Number(left?.[key] ?? -1) === Number(right?.[key] ?? -2));
}

function summarize(samples) {
  return {
    averageMs: round(samples.reduce((sum, value) => sum + value, 0) / Math.max(samples.length, 1)),
    p50Ms: percentile(samples, 50),
    p95Ms: percentile(samples, 95),
    maxMs: samples.length ? Math.max(...samples) : 0,
  };
}

function percentile(samples, value) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil((value / 100) * sorted.length) - 1)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function run() {
  const measuredAt = new Date();
  const initial = await preflight();
  if (preflightOnly) {
    console.log(JSON.stringify({ measuredAt: measuredAt.toISOString(), preflight: initial.safe, databaseBytes: initial.databaseBytes }, null, 2));
    return;
  }

  const fixture = buildFixture();
  const companyA = await loginCompanyA();
  const companyB = await tokenForCompanyB(companyA.companyId);
  if (!initial.companies.some((company) => company.id === companyA.companyId)) throw new Error("Empresa A nao pertence ao conjunto sintetico validado.");
  const baselineCompanyProperties = await prisma.property.count({ where: { companyId: companyA.companyId } });
  let jobId;
  let rollbackCompleted = false;
  try {
    const start = await api("/imports/start", {
      token: companyA.token,
      method: "POST",
      expected: [201],
      body: {
        file_name: `${fixture.runKey}.csv`,
        content_base64: fixture.buffer.toString("base64"),
        import_type: "properties",
        source_type: "csv",
        mode: "full",
        confirm_full_import: true,
        allow_partial: false,
        batch_size: 50,
      },
    });
    jobId = start.payload?.import?.id;
    if (!jobId) throw new Error("O start nao retornou ImportJob.");
    const firstJob = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const batches = [snapshotBatch(1, start.elapsedMs, firstJob)];
    const concurrent = await Promise.all([
      api(`/imports/${jobId}/process-next-batch`, { token: companyA.token, method: "POST", expected: [200, 409] }),
      api(`/imports/${jobId}/process-next-batch`, { token: companyA.token, method: "POST", expected: [200, 409] }),
    ]);
    const statuses = concurrent.map((response) => response.status).sort((left, right) => left - right);
    if (statuses.join(",") !== "200,409") throw new Error(`Lock concorrente inesperado: ${statuses.join("/")}.`);
    const successfulConcurrent = concurrent.find((response) => response.status === 200);
    const secondJob = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    batches.push(snapshotBatch(2, successfulConcurrent.elapsedMs, secondJob));
    for (let batchNumber = 3; batchNumber <= 5; batchNumber += 1) batches.push(await processBatch(companyA.token, jobId, batchNumber));

    const beforeRestart = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const propertiesBeforeRestart = await prisma.property.count({ where: { companyId: companyA.companyId, importJobId: jobId } });
    if (beforeRestart.importedRows !== 250 || propertiesBeforeRestart !== 250) throw new Error("O quinto lote nao terminou com 250 imoveis persistidos.");
    restartRailwayService();
    await delay(5_000);
    await waitForApi();
    const afterRestartReport = await api(`/imports/${jobId}/report`, { token: companyA.token });
    const afterRestart = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const propertiesAfterRestart = await prisma.property.count({ where: { companyId: companyA.companyId, importJobId: jobId } });
    const restartPersisted = beforeRestart.nextCursor === afterRestart.nextCursor
      && afterRestart.importedRows === 250 && propertiesAfterRestart === 250 && afterRestartReport.status === 200;
    if (!restartPersisted) throw new Error("Cursor ou contadores nao persistiram apos o restart Railway.");

    for (let batchNumber = 6; batchNumber <= 10; batchNumber += 1) batches.push(await processBatch(companyA.token, jobId, batchNumber));
    const finalReport = await api(`/imports/${jobId}/report`, { token: companyA.token });
    const finalJob = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    if (finalJob.status !== "COMPLETED" || finalJob.processedRows !== 500 || finalJob.importedRows !== 500 || finalJob.duplicateRows !== 0 || finalJob.failedRows !== 0) {
      throw new Error("O job nao concluiu com 500 importacoes sem duplicatas ou falhas.");
    }
    const propertiesBeforeIdempotency = await prisma.property.count({ where: { companyId: companyA.companyId, importJobId: jobId } });
    const repeated = await api(`/imports/${jobId}/process-next-batch`, { token: companyA.token, method: "POST" });
    const propertiesAfterIdempotency = await prisma.property.count({ where: { companyId: companyA.companyId, importJobId: jobId } });
    const idempotent = repeated.status === 200 && propertiesBeforeIdempotency === 500 && propertiesAfterIdempotency === 500;
    if (!idempotent) throw new Error("A chamada repetida alterou a quantidade de imoveis.");

    const crossCompanyReport = await api(`/imports/${jobId}/report`, { token: companyB.token, expected: [404] });
    const reads = await measureReads(companyA, companyB, jobId, fixture);
    if (!reads.pagesCorrect || reads.companyB.leakedJobProperties) throw new Error("Paginacao Prisma ou isolamento de listagem falhou.");
    const databaseBytesAfterImport = await readDatabaseBytes();
    const importRowsCreated = await prisma.importRow.count({ where: { companyId: companyA.companyId, importJobId: jobId } });
    const mediaCreated = await prisma.propertyMedia.count({ where: { companyId: companyA.companyId, property: { importJobId: jobId } } });
    const storedFilesCreated = await prisma.storedFile.count({ where: { companyId: companyA.companyId, importJobId: jobId } });
    if (importRowsCreated !== 500 || mediaCreated !== 0 || storedFilesCreated !== 0) throw new Error("A auditoria de ImportRows ou ausencia de midia nao corresponde ao cenario.");

    const rollbackFirst = await api(`/imports/${jobId}/rollback`, { token: companyA.token, method: "POST", body: { confirm_rollback: true } });
    const databaseBytesAfterRollback = await readDatabaseBytes();
    const afterRollback = await readCounts();
    const jobPropertiesAfterRollback = await prisma.property.count({ where: { companyId: companyA.companyId, importJobId: jobId } });
    const auditRowsAfterRollback = await prisma.importRow.count({ where: { companyId: companyA.companyId, importJobId: jobId } });
    const previousSyntheticPreserved = await prisma.property.count({ where: { companyId: companyA.companyId } }) === baselineCompanyProperties;
    const rollbackSecond = await api(`/imports/${jobId}/rollback`, { token: companyA.token, method: "POST", body: { confirm_rollback: true } });
    const rollbackIdempotent = sameRollback(rollbackFirst.payload?.rollback, rollbackSecond.payload?.rollback);
    rollbackCompleted = true;
    if (jobPropertiesAfterRollback !== 0 || auditRowsAfterRollback !== 500 || !previousSyntheticPreserved || !rollbackIdempotent) {
      throw new Error("Rollback nao preservou exatamente a auditoria e os dados sinteticos anteriores.");
    }

    await delay(5_000);
    const railwayMetrics = readRailwayMetrics(measuredAt.toISOString());
    const batchTimes = batches.map((batch) => batch.elapsedMs);
    const result = {
      measuredAt: measuredAt.toISOString(),
      synthetic: true,
      target: "railway-api-private-mysql",
      companiesTested: 2,
      importingCompanies: 1,
      propertiesRequested: 500,
      fileBytes: fixture.buffer.byteLength,
      batchSize: 50,
      batchCount: batches.length,
      startMs: batches[0].elapsedMs,
      batches,
      batchSummary: summarize(batchTimes),
      totalBatchMs: round(batchTimes.reduce((sum, value) => sum + value, 0)),
      averagePerPropertyMs: round(batchTimes.reduce((sum, value) => sum + value, 0) / 500),
      final: {
        status: finalJob.status,
        cursor: finalJob.nextCursor,
        processedRows: finalJob.processedRows,
        importedRows: finalJob.importedRows,
        duplicateRows: finalJob.duplicateRows,
        failedRows: finalJob.failedRows,
        importRowsCreated,
        mediaCreated,
        storedFilesCreated,
        hasPendingBatches: finalReport.payload?.has_pending_batches,
        importMetrics: metricPayload(finalJob.metadataJson),
      },
      restart: {
        afterBatch: 5,
        cursorBefore: beforeRestart.nextCursor,
        cursorAfter: afterRestart.nextCursor,
        importedBefore: beforeRestart.importedRows,
        importedAfter: afterRestart.importedRows,
        propertiesBefore: propertiesBeforeRestart,
        propertiesAfter: propertiesAfterRestart,
        persisted: restartPersisted,
      },
      concurrency: { statuses, protected: statuses.join(",") === "200,409" },
      idempotency: { approved: idempotent, before: propertiesBeforeIdempotency, after: propertiesAfterIdempotency },
      isolation: { crossCompanyReportStatus: crossCompanyReport.status, companyBListLeak: reads.companyB.leakedJobProperties },
      reads,
      database: {
        beforeBytes: initial.databaseBytes,
        afterImportBytes: databaseBytesAfterImport,
        afterRollbackBytes: databaseBytesAfterRollback,
      },
      rollback: {
        first: rollbackFirst.payload?.rollback,
        second: rollbackSecond.payload?.rollback,
        idempotent: rollbackIdempotent,
        jobPropertiesRemaining: jobPropertiesAfterRollback,
        auditRowsPreserved: auditRowsAfterRollback,
        previousSyntheticPreserved,
        finalCounts: afterRollback,
      },
      railwayMetrics,
      requests: { httpCalls, healthCalls },
      preflight: initial.safe,
    };
    await mkdir(resultDir, { recursive: true });
    await writeFile(resolve(resultDir, "railway-result.json"), JSON.stringify(result, null, 2), "utf8");
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (jobId && !rollbackCompleted) {
      try {
        await api(`/imports/${jobId}/rollback`, { token: companyA.token, method: "POST", body: { confirm_rollback: true } });
      } catch {}
    }
  }
}

try {
  await run();
} finally {
  await prisma.$disconnect();
}
