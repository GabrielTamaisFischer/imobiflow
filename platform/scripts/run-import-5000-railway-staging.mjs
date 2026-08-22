import { createHash, createHmac, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const PROPERTY_COUNT = 5_000;
const BATCH_SIZE = 100;
const EXPECTED_BATCHES = 50;
const RESTART_AFTER_BATCH = 25;
const IMPORT_MARKER = "synthetic_5000_staging";
const REQUIRED_MIGRATIONS = [
  "202605220001_website_builder_foundation",
  "202605230002_website_builder_audit_logs",
  "202606010001_website_builder_code_files",
  "202607130001_mysql_saas_core",
  "202607130002_site_audit_actions",
  "202607140001_storage_provider_metadata",
  "202608040001_resumable_imports",
  "202608050001_property_query_indexes",
];

const scriptDir = dirname(fileURLToPath(import.meta.url));
const platformDir = resolve(scriptDir, "..");
const repositoryDir = resolve(platformDir, "..");
const resultDir = resolve(platformDir, ".tmp", "import-staging", "5000");
const config = dotenv.parse(await readFile(resolve(platformDir, ".env")));

assertSessionGuard("NODE_ENV", "staging");
assertSessionGuard("ALLOW_IMPORT_STAGING_TEST", "true");
assertSessionGuard("CONFIRM_IMPORT_5000_STAGING", "true");
if (config.NODE_ENV !== "staging")
  throw new Error("platform/.env precisa declarar NODE_ENV=staging.");

const apiUrl = process.env.RAILWAY_STAGING_API_URL?.replace(/\/$/, "");
const apiHost = apiUrl ? new URL(apiUrl).hostname : "";
if (!apiUrl || !/^imobiflow-api-staging-[a-z0-9-]+\.up\.railway\.app$/.test(apiHost)) {
  throw new Error("RAILWAY_STAGING_API_URL precisa apontar para o servico imobiflow-api-staging.");
}

const databaseUrl = new URL(config.DATABASE_URL);
assertDatabaseTarget(databaseUrl);
process.env.DATABASE_URL = config.DATABASE_URL;
const prisma = new PrismaClient();
const railwayEnvironment = process.env.RAILWAY_STAGING_ENVIRONMENT || "production";
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(railwayEnvironment))
  throw new Error("Rotulo de ambiente Railway invalido.");
const preflightOnly = process.argv.includes("--preflight-only");
const httpTimeoutMs = readBoundedInteger(
  process.env.IMPORT_5000_HTTP_TIMEOUT_MS,
  180_000,
  15_000,
  300_000,
);
let httpCalls = 0;
let healthCalls = 0;

function assertSessionGuard(name, expected) {
  if (process.env[name] !== expected)
    throw new Error(`${name}=${expected} e obrigatorio nesta sessao.`);
}

function assertDatabaseTarget(value) {
  const expectedHost = process.env.EXPECTED_STAGING_DB_HOST;
  const expectedPort = process.env.EXPECTED_STAGING_DB_PORT;
  const expectedDatabase = process.env.EXPECTED_STAGING_DB_NAME;
  if (!expectedHost || !expectedPort || !expectedDatabase) {
    throw new Error(
      "O destino sanitizado de staging precisa ser confirmado por EXPECTED_STAGING_DB_HOST/PORT/NAME.",
    );
  }
  if (
    value.hostname !== expectedHost ||
    value.port !== expectedPort ||
    value.pathname.replace(/^\//, "") !== expectedDatabase
  ) {
    throw new Error(
      "DATABASE_URL local nao corresponde ao MySQL de staging confirmado. Execucao interrompida.",
    );
  }
}

function readBoundedInteger(raw, fallback, minimum, maximum) {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Timeout precisa ser inteiro entre ${minimum} e ${maximum} ms.`);
  }
  return parsed;
}

async function api(
  path,
  { token, method = "GET", body, expected = [200], timeoutMs = httpTimeoutMs } = {},
) {
  httpCalls += 1;
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "FETCH_ERROR";
    throw new Error(`${method} ${path} falhou antes da resposta (${name}).`);
  }
  const responseText = await response.text();
  let payload = {};
  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new Error(`${method} ${path} retornou resposta nao JSON.`);
    }
  }
  const result = {
    status: response.status,
    payload,
    payloadBytes: Buffer.byteLength(responseText, "utf8"),
    elapsedMs: round(performance.now() - startedAt),
  };
  if (!expected.includes(response.status)) {
    const code = typeof payload?.error === "string" ? payload.error : "UNEXPECTED_RESPONSE";
    throw new Error(`${method} ${path} retornou HTTP ${response.status} (${sanitizeText(code)}).`);
  }
  return result;
}

async function waitForApi() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    healthCalls += 1;
    try {
      const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(10_000) });
      if (response.status === 200) return;
    } catch {}
    await delay(1_000);
  }
  throw new Error("A API Railway nao voltou ao estado saudavel dentro do limite.");
}

async function preflight() {
  await waitForApi();
  const [
    companies,
    users,
    properties,
    importJobs,
    storedFiles,
    counts,
    migrations,
    database,
    connections,
  ] = await Promise.all([
    prisma.company.findMany({ select: { id: true, name: true } }),
    prisma.appUser.findMany({ select: { id: true, companyId: true, status: true } }),
    prisma.property.findMany({ select: { code: true, title: true, importJobId: true } }),
    prisma.importJob.findMany({ select: { companyId: true, createdBy: true } }),
    prisma.storedFile.findMany({
      select: {
        companyId: true,
        isTestData: true,
        testBatchId: true,
        importJobId: true,
        importSource: true,
        originalFilename: true,
      },
    }),
    readCounts(),
    prisma.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`,
    readDatabaseSnapshot(),
    readConnections(),
  ]);
  const companyIds = new Set(companies.map((company) => company.id));
  const userIds = new Set(users.map((user) => user.id));
  const companiesAreSynthetic =
    companies.length === 2 && companies.every((company) => /staging/i.test(company.name));
  const usersAreSynthetic =
    users.length === 2 &&
    users.every((user) => companyIds.has(user.companyId) && user.status === "active");
  const propertiesAreSynthetic = properties.every(
    (property) =>
      Boolean(property.importJobId) ||
      /(?:sintet|simulad|staging|qa|teste)/i.test(`${property.code ?? ""} ${property.title}`),
  );
  const jobsAreSynthetic = importJobs.every(
    (job) => companyIds.has(job.companyId) && userIds.has(job.createdBy),
  );
  const filesAreSynthetic = storedFiles.every(
    (file) =>
      companyIds.has(file.companyId) &&
      (file.isTestData ||
        Boolean(file.importJobId) ||
        /(?:synthetic|sintet|staging|qa|teste)/i.test(
          `${file.testBatchId ?? ""} ${file.importSource ?? ""} ${file.originalFilename}`,
        )),
  );
  const applied = migrations
    .filter((row) => row.finished_at && !row.rolled_back_at)
    .map((row) => row.migration_name);
  const exactMigrations =
    applied.length === REQUIRED_MIGRATIONS.length &&
    REQUIRED_MIGRATIONS.every((migration) => applied.includes(migration));
  if (
    !companiesAreSynthetic ||
    !usersAreSynthetic ||
    !propertiesAreSynthetic ||
    !jobsAreSynthetic ||
    !filesAreSynthetic ||
    counts.properties !== 1
  ) {
    throw new Error(
      `O banco nao passou na verificacao sintetica: companies=${companiesAreSynthetic}, users=${usersAreSynthetic}, properties=${propertiesAreSynthetic}, jobs=${jobsAreSynthetic}, files=${filesAreSynthetic}, property_count=${counts.properties === 1}.`,
    );
  }
  if (!exactMigrations)
    throw new Error("A cadeia esperada de oito migrations nao esta integra e aplicada.");
  if (counts.runningJobs !== 0)
    throw new Error("Existe ImportJob em PROCESSING; o benchmark nao pode iniciar.");
  return {
    companies,
    counts,
    database,
    connections,
    safe: {
      nodeEnv: process.env.NODE_ENV,
      service: "imobiflow-api-staging",
      privateMysqlConfirmed: true,
      stagingGuards: true,
      companies: counts.companies,
      users: counts.users,
      properties: counts.properties,
      importJobs: counts.importJobs,
      importRows: counts.importRows,
      storedFiles: counts.storedFiles,
      propertyMedia: counts.propertyMedia,
      runningJobs: counts.runningJobs,
      migrationsApplied: applied.length,
      migrationsHealthy: exactMigrations,
      exclusivelySynthetic: true,
      apiHealthy: true,
    },
  };
}

async function readCounts() {
  const [
    companies,
    users,
    properties,
    importJobs,
    importRows,
    storedFiles,
    propertyMedia,
    runningJobs,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.appUser.count(),
    prisma.property.count(),
    prisma.importJob.count(),
    prisma.importRow.count(),
    prisma.storedFile.count(),
    prisma.propertyMedia.count(),
    prisma.importJob.count({ where: { status: "PROCESSING" } }),
  ]);
  return {
    companies,
    users,
    properties,
    importJobs,
    importRows,
    storedFiles,
    propertyMedia,
    runningJobs,
  };
}

async function readDatabaseSnapshot() {
  const databaseName = databaseUrl.pathname.replace(/^\//, "");
  const rows = await prisma.$queryRaw`
    SELECT table_name, table_rows, data_length, index_length
    FROM information_schema.tables
    WHERE table_schema = ${databaseName}
      AND table_name IN ('properties', 'import_jobs', 'import_rows', 'property_media', 'stored_files')
    ORDER BY table_name
  `;
  const totalRows = await prisma.$queryRaw`
    SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes,
           COALESCE(SUM(data_length), 0) AS data_bytes,
           COALESCE(SUM(index_length), 0) AS index_bytes
    FROM information_schema.tables WHERE table_schema = ${databaseName}
  `;
  return {
    totalBytes: Number(totalRows?.[0]?.bytes ?? 0),
    dataBytes: Number(totalRows?.[0]?.data_bytes ?? 0),
    indexBytes: Number(totalRows?.[0]?.index_bytes ?? 0),
    tables: rows.map((row) => {
      const normalized = Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
      );
      return {
        name: String(normalized.table_name),
        estimatedRows: Number(normalized.table_rows ?? 0),
        dataBytes: Number(normalized.data_length ?? 0),
        indexBytes: Number(normalized.index_length ?? 0),
      };
    }),
  };
}

async function readConnections() {
  const rows = await prisma.$queryRaw`SHOW STATUS LIKE 'Threads_connected'`;
  const row = rows?.[0] ?? {};
  const value = row.Value ?? row.VALUE ?? row.value ?? Object.values(row)[1] ?? 0;
  return Number(value);
}

async function loginCompanyA(initialCompanies) {
  const email = config.IMOBIFLOW_BOOTSTRAP_EMAIL;
  const password = config.IMOBIFLOW_BOOTSTRAP_PASSWORD;
  if (!email || !password)
    throw new Error("Credenciais bootstrap de staging ausentes no arquivo local ignorado.");
  const response = await api("/auth/login", { method: "POST", body: { email, password } });
  const token = response.payload?.session?.access_token;
  const companyId = response.payload?.access?.company?.id;
  if (!token || !companyId) throw new Error("Login da Empresa A nao retornou sessao e empresa.");
  const company = initialCompanies.find((candidate) => candidate.id === companyId);
  if (!company || !/staging.*empresa a/i.test(company.name)) {
    throw new Error("As credenciais locais nao pertencem a Empresa A ficticia de staging.");
  }
  return { token, companyId, elapsedMs: response.elapsedMs };
}

async function tokenForCompanyB(companyAId) {
  const user = await prisma.appUser.findFirst({
    where: {
      companyId: { not: companyAId },
      status: "active",
      company: { name: { contains: "Staging Empresa B" } },
    },
    select: { id: true, companyId: true, email: true },
  });
  if (!user) throw new Error("Usuario sintetico da Empresa B nao encontrado.");
  const secret = config.JWT_SECRET || config.IMOBIFLOW_BOOTSTRAP_PASSWORD;
  if (!secret) throw new Error("JWT_SECRET de staging ausente.");
  const body = Buffer.from(
    JSON.stringify({
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      iat: Date.now(),
    }),
    "utf8",
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return { token: `imobiflow.mysql.${body}.${signature}`, companyId: user.companyId };
}

function buildFixture() {
  const runKey = `QA5000-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const fileName = `${IMPORT_MARKER}-${runKey}.csv`;
  const rows = ["Codigo;Titulo;Cidade;Bairro;Status;Valor Venda;Tipo;Finalidade"];
  const types = ["apartamento", "casa", "comercial", "terreno", "rural"];
  const operations = ["venda", "locacao", "ambos"];
  const statuses = [
    "rascunho",
    "disponivel",
    "reservado",
    "vendido",
    "alugado",
    "inativo",
    "arquivado",
  ];
  const cities = ["Cidade Sintetica Norte", "Cidade Sintetica Sul", "Cidade Sintetica Leste"];
  const neighborhoods = [
    "Bairro QA Azul",
    "Bairro QA Verde",
    "Bairro QA Amarelo",
    "Bairro QA Branco",
  ];
  const codes = [];
  const externalIds = [];
  for (let index = 1; index <= PROPERTY_COUNT; index += 1) {
    const code = `${runKey}-${String(index).padStart(5, "0")}`;
    codes.push(code);
    externalIds.push(code);
    rows.push(
      [
        code,
        `Imovel sintetico QA 5000 ${index}`,
        cities[(index - 1) % cities.length],
        neighborhoods[(index - 1) % neighborhoods.length],
        statuses[(index - 1) % statuses.length],
        String(200_000 + index * 10),
        types[(index - 1) % types.length],
        operations[(index - 1) % operations.length],
      ].join(";"),
    );
  }
  const buffer = Buffer.from(rows.join("\n"), "utf8");
  const uniqueCodes = new Set(codes).size;
  const uniqueExternalIds = new Set(externalIds).size;
  const hasMedia =
    /https?:\/\/|\b(?:foto|imagem|media|video|tour|zip)\b/i.test(rows[0]) ||
    rows.slice(1).some((row) => /https?:\/\//i.test(row));
  if (
    rows.length !== PROPERTY_COUNT + 1 ||
    uniqueCodes !== PROPERTY_COUNT ||
    uniqueExternalIds !== PROPERTY_COUNT
  ) {
    throw new Error("A fixture nao produziu exatamente 5.000 identificadores unicos.");
  }
  if (buffer.byteLength > 10 * 1024 * 1024) throw new Error("A fixture excedeu 10 MB.");
  if (hasMedia) throw new Error("A fixture contem cabecalho ou URL de midia.");
  return {
    runKey,
    fileName,
    codes,
    externalIds,
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    validation: {
      rows: PROPERTY_COUNT,
      bytes: buffer.byteLength,
      uniqueCodes,
      uniqueExternalIds,
      mediaUrls: 0,
      belowTenMegabytes: true,
      marker: IMPORT_MARKER,
    },
  };
}

async function startImport(companyA, fixture, measuredAt) {
  const body = {
    file_name: fixture.fileName,
    content_base64: fixture.buffer.toString("base64"),
    import_type: "properties",
    source_type: "csv",
    mode: "full",
    confirm_full_import: true,
    allow_partial: false,
    batch_size: BATCH_SIZE,
  };
  try {
    const response = await api("/imports/start", {
      token: companyA.token,
      method: "POST",
      expected: [201],
      body,
      timeoutMs: 300_000,
    });
    const jobId = response.payload?.import?.id;
    if (!jobId) throw new Error("O start nao retornou ImportJob.");
    return { jobId, elapsedMs: response.elapsedMs, recoveredAfterTimeout: false };
  } catch (error) {
    if (!(error instanceof Error) || !/falhou antes da resposta/.test(error.message)) throw error;
    const created = await findStartedJobs(companyA.companyId, fixture.fileName, measuredAt);
    if (created.length !== 1) {
      throw new Error(
        `Start sem resposta e ${created.length} jobs correspondentes; nenhuma repeticao automatica foi feita.`,
      );
    }
    const recovered = await waitForJobUnlock(created[0].id);
    if (recovered.totalRows !== PROPERTY_COUNT || recovered.batchSize !== BATCH_SIZE) {
      throw new Error("Job recuperado apos timeout nao corresponde a fixture protegida.");
    }
    return { jobId: recovered.id, elapsedMs: null, recoveredAfterTimeout: true };
  }
}

async function findStartedJobs(companyId, sourceName, measuredAt) {
  return prisma.importJob.findMany({
    where: { companyId, sourceName, createdAt: { gte: new Date(measuredAt.getTime() - 5_000) } },
    select: { id: true },
  });
}

async function waitForJobUnlock(jobId) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const job = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    if (job.status !== "PROCESSING") return job;
    await delay(1_000);
  }
  throw new Error("Job criado no start permaneceu PROCESSING alem do limite.");
}

async function processBatch(token, jobId, batchNumber) {
  const before = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  let response;
  try {
    response = await api(`/imports/${jobId}/process-next-batch`, { token, method: "POST" });
  } catch (error) {
    if (!(error instanceof Error) || !/falhou antes da resposta/.test(error.message)) throw error;
    const recovered = await waitForJobUnlock(jobId);
    const advanced = recovered.processedRows === before.processedRows + BATCH_SIZE;
    if (!advanced)
      throw new Error(`Lote ${batchNumber} perdeu a resposta sem avancar exatamente 100 linhas.`);
    return snapshotBatch(batchNumber, null, recovered, true);
  }
  const current = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  return snapshotBatch(batchNumber, response.elapsedMs, current, false);
}

async function processConcurrentBatch(token, jobId, batchNumber) {
  const before = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  const concurrent = await Promise.all([
    api(`/imports/${jobId}/process-next-batch`, { token, method: "POST", expected: [200, 409] }),
    api(`/imports/${jobId}/process-next-batch`, { token, method: "POST", expected: [200, 409] }),
  ]);
  const statuses = concurrent
    .map((response) => response.status)
    .sort((left, right) => left - right);
  if (statuses.join(",") !== "200,409")
    throw new Error(`Lock concorrente inesperado: ${statuses.join("/")}.`);
  const current = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
  if (current.processedRows !== before.processedRows + BATCH_SIZE) {
    throw new Error("A disputa concorrente nao avancou exatamente um lote.");
  }
  const success = concurrent.find((response) => response.status === 200);
  return {
    batch: snapshotBatch(batchNumber, success.elapsedMs, current, false),
    concurrency: {
      statuses,
      protected: true,
      processedDelta: current.processedRows - before.processedRows,
    },
  };
}

function snapshotBatch(number, elapsedMs, job, recoveredAfterTimeout) {
  return {
    number,
    elapsedMs,
    recoveredAfterTimeout,
    cursor: job.nextCursor,
    processedRows: job.processedRows,
    importedRows: job.importedRows,
    duplicateRows: job.duplicateRows,
    failedRows: job.failedRows,
    status: job.status,
  };
}

function reportBatch(batch) {
  console.log(
    JSON.stringify({
      event: "batch",
      number: batch.number,
      elapsedMs: batch.elapsedMs,
      cursor: batch.cursor,
      processedRows: batch.processedRows,
      status: batch.status,
    }),
  );
}

function restartRailwayService() {
  const command = `npx.cmd -y @railway/cli@latest service restart --service imobiflow-api-staging --environment ${railwayEnvironment} --yes --json`;
  execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    cwd: repositoryDir,
    stdio: "ignore",
    windowsHide: true,
  });
}

async function validateIsolation(companyA, companyB, jobId, fixture, detailId) {
  const maliciousCompany = encodeURIComponent(companyA.companyId);
  const report = await api(`/imports/${jobId}/report`, { token: companyB.token, expected: [404] });
  const process = await api(`/imports/${jobId}/process-next-batch`, {
    token: companyB.token,
    method: "POST",
    expected: [404],
  });
  const retry = await api(`/imports/${jobId}/retry-failed`, {
    token: companyB.token,
    method: "POST",
    expected: [404],
  });
  const rollback = await api(`/imports/${jobId}/rollback`, {
    token: companyB.token,
    method: "POST",
    body: { confirm_rollback: true },
    expected: [404],
  });
  const detail = await api(`/real-estate/properties/${encodeURIComponent(detailId)}`, {
    token: companyB.token,
    expected: [404],
  });
  const list = await api(
    `/real-estate/properties?page=1&page_size=100&status=all&company_id=${maliciousCompany}`,
    { token: companyB.token },
  );
  const code = await api(
    `/real-estate/properties/by-code/${encodeURIComponent(fixture.codes[99])}`,
    { token: companyB.token, expected: [404] },
  );
  const external = await api(
    `/real-estate/properties/by-external-id/${encodeURIComponent(fixture.externalIds[199])}?import_source=csv`,
    {
      token: companyB.token,
      expected: [404],
    },
  );
  const items = Array.isArray(list.payload?.items) ? list.payload.items : [];
  const leaked = items.some((property) => String(property.code || "").startsWith(fixture.runKey));
  if (leaked) throw new Error("Empresa B recebeu imovel pertencente a Empresa A.");
  return {
    report: report.status,
    process: process.status,
    retry: retry.status,
    rollback: rollback.status,
    detail: detail.status,
    list: list.status,
    listItems: items.length,
    code: code.status,
    externalId: external.status,
    maliciousCompanyIdIgnored: !leaked,
    leakedProperties: 0,
  };
}

async function measureReads(companyA, companyB, fixture, expectedTotal) {
  const pageNumbers = [1, 2, 10, 25, 40, 50, 51, 52];
  const pages = {};
  for (const page of pageNumbers) {
    pages[`page_${page}`] = await measureApi(
      `/real-estate/properties?page=${page}&page_size=100&status=all`,
      companyA.token,
      7,
    );
  }
  const codePath = `/real-estate/properties/by-code/${encodeURIComponent(fixture.codes[999])}`;
  const externalPath = `/real-estate/properties/by-external-id/${encodeURIComponent(fixture.externalIds[1999])}?import_source=csv`;
  const codeResponse = await api(codePath, { token: companyA.token });
  const detailId = codeResponse.payload?.property?.id;
  if (!detailId) throw new Error("Busca por codigo nao retornou imovel para medir detalhe.");
  const dedicated = {
    code: await measureApi(codePath, companyA.token, 7),
    externalId: await measureApi(externalPath, companyA.token, 7),
    detail: await measureApi(
      `/real-estate/properties/${encodeURIComponent(detailId)}`,
      companyA.token,
      7,
    ),
  };
  const filters = {
    operation: await measureApi(
      "/real-estate/properties?page=1&page_size=100&status=all&operation=sale",
      companyA.token,
      7,
    ),
    propertyType: await measureApi(
      "/real-estate/properties?page=1&page_size=100&status=all&property_type=house",
      companyA.token,
      7,
    ),
    status: await measureApi(
      "/real-estate/properties?page=1&page_size=100&status=available",
      companyA.token,
      7,
    ),
    search: await measureApi(
      `/real-estate/properties?page=1&page_size=100&status=all&search=${encodeURIComponent(fixture.codes[2999])}`,
      companyA.token,
      7,
    ),
  };
  const coverage = await validateFullPagination(companyA.token, expectedTotal);
  const variants = await validatePageSizeVariants(companyA.token, expectedTotal);
  const count = await measureCount(companyA.companyId, 7);
  const explains = await readExplains(companyA.companyId, fixture);
  const readConcurrency = await runReadConcurrency(companyA, companyB, fixture);
  const allMetrics = [
    ...Object.values(pages),
    ...Object.values(dedicated),
    ...Object.values(filters),
  ];
  const overallSamples = allMetrics.flatMap((metric) => metric.samplesMs);
  return {
    pages,
    dedicated,
    filters,
    overall: summarize(overallSamples),
    coverage,
    variants,
    count,
    explains,
    readConcurrency,
    detailId,
  };
}

async function measureApi(path, token, repetitions) {
  await api(path, { token });
  const samples = [];
  const payloadSizes = [];
  let quantity = 0;
  let pagination = null;
  for (let index = 0; index < repetitions; index += 1) {
    const response = await api(path, { token });
    samples.push(response.elapsedMs);
    payloadSizes.push(response.payloadBytes);
    quantity = Array.isArray(response.payload?.items)
      ? response.payload.items.length
      : response.payload?.property
        ? 1
        : 0;
    pagination = response.payload?.pagination ?? pagination;
  }
  return {
    ...summarize(samples),
    quantity,
    pagination,
    averagePayloadBytes: round(
      payloadSizes.reduce((sum, value) => sum + value, 0) / payloadSizes.length,
    ),
    maxPayloadBytes: Math.max(...payloadSizes),
    samplesMs: samples,
  };
}

async function validateFullPagination(token, expectedTotal) {
  const ids = [];
  const pageSizes = [];
  let totalPages = null;
  for (let page = 1; page <= Math.ceil(expectedTotal / 100); page += 1) {
    const response = await api(`/real-estate/properties?page=${page}&page_size=100&status=all`, {
      token,
    });
    const items = Array.isArray(response.payload?.items) ? response.payload.items : [];
    ids.push(...items.map((item) => item.id));
    pageSizes.push(items.length);
    totalPages = response.payload?.pagination?.total_pages ?? totalPages;
    if (items.length > 100) throw new Error(`Pagina ${page} excedeu 100 itens.`);
  }
  const uniqueIds = new Set(ids);
  const approved =
    ids.length === expectedTotal &&
    uniqueIds.size === expectedTotal &&
    totalPages === Math.ceil(expectedTotal / 100);
  if (!approved)
    throw new Error("Cobertura completa da paginacao apresentou sobreposicao ou ausencia.");
  return {
    pagesRead: pageSizes.length,
    itemsRead: ids.length,
    uniqueItems: uniqueIds.size,
    totalPages,
    firstPageItems: pageSizes[0],
    lastPageItems: pageSizes.at(-1),
    approved,
  };
}

async function validatePageSizeVariants(token, expectedTotal) {
  const results = {};
  for (const pageSize of [25, 50, 100]) {
    const totalPages = Math.ceil(expectedTotal / pageSize);
    const [first, last, beyond] = await Promise.all([
      api(`/real-estate/properties?page=1&page_size=${pageSize}&status=all`, { token }),
      api(`/real-estate/properties?page=${totalPages}&page_size=${pageSize}&status=all`, { token }),
      api(`/real-estate/properties?page=${totalPages + 1}&page_size=${pageSize}&status=all`, {
        token,
      }),
    ]);
    const firstItems = first.payload?.items ?? [];
    const lastItems = last.payload?.items ?? [];
    const beyondItems = beyond.payload?.items ?? [];
    const approved =
      firstItems.length <= pageSize &&
      lastItems.length <= pageSize &&
      beyondItems.length === 0 &&
      first.payload?.pagination?.total === expectedTotal &&
      beyond.payload?.pagination?.has_next === false;
    if (!approved) throw new Error(`Contrato de paginacao falhou para page_size=${pageSize}.`);
    results[pageSize] = {
      totalPages,
      firstItems: firstItems.length,
      lastItems: lastItems.length,
      beyondItems: beyondItems.length,
      approved,
    };
  }
  return results;
}

async function measureCount(companyId, repetitions) {
  await prisma.property.count({ where: { companyId } });
  const samples = [];
  let value = 0;
  for (let index = 0; index < repetitions; index += 1) {
    const startedAt = performance.now();
    value = await prisma.property.count({ where: { companyId } });
    samples.push(round(performance.now() - startedAt));
  }
  return {
    ...summarize(samples),
    value,
    samplesMs: samples,
    measurementPath: "local-public-mysql",
  };
}

async function readExplains(companyId, fixture) {
  return {
    firstPage: sanitizeExplain(
      await prisma.$queryRaw`
      EXPLAIN SELECT id, created_at FROM properties
      WHERE company_id = ${companyId} ORDER BY created_at DESC, id DESC LIMIT 100
    `,
    ),
    deepPage50: sanitizeExplain(
      await prisma.$queryRaw`
      EXPLAIN SELECT id, created_at FROM properties
      WHERE company_id = ${companyId} ORDER BY created_at DESC, id DESC LIMIT 100 OFFSET 4900
    `,
    ),
    count: sanitizeExplain(
      await prisma.$queryRaw`
      EXPLAIN SELECT COUNT(*) FROM properties WHERE company_id = ${companyId}
    `,
    ),
    code: sanitizeExplain(
      await prisma.$queryRaw`
      EXPLAIN SELECT id FROM properties WHERE company_id = ${companyId} AND code = ${fixture.codes[999]} LIMIT 1
    `,
    ),
    externalId: sanitizeExplain(
      await prisma.$queryRaw`
      EXPLAIN SELECT id FROM properties
      WHERE company_id = ${companyId} AND import_source = 'csv' AND import_external_id = ${fixture.externalIds[1999]} LIMIT 1
    `,
    ),
    propertyType: sanitizeExplain(
      await prisma.$queryRaw`
      EXPLAIN SELECT id FROM properties WHERE company_id = ${companyId} AND property_type = 'house' LIMIT 100
    `,
    ),
  };
}

function sanitizeExplain(rows) {
  return rows.map((row) => {
    const normalized = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.toLowerCase(), value]),
    );
    return {
      key: normalized.key ?? normalized.f6 ?? null,
      accessType: normalized.type ?? normalized.f4 ?? null,
      estimatedRows: Number(normalized.rows ?? normalized.f9 ?? 0),
      extra: normalized.extra ?? normalized.f11 ?? null,
    };
  });
}

async function runReadConcurrency(companyA, companyB, fixture) {
  const pathsA = [
    "/real-estate/properties?page=1&page_size=100&status=all",
    "/real-estate/properties?page=25&page_size=100&status=all",
    "/real-estate/properties?page=50&page_size=100&status=all",
    "/real-estate/properties?page=1&page_size=100&status=all&operation=sale",
    "/real-estate/properties?page=1&page_size=100&status=available",
  ];
  const pathB = `/real-estate/properties?page=1&page_size=100&status=all&company_id=${encodeURIComponent(companyA.companyId)}`;
  const clients = Array.from({ length: 5 }, (_, clientIndex) =>
    (async () => {
      const samples = [];
      let successes = 0;
      let errors = 0;
      let leaks = 0;
      for (let requestIndex = 0; requestIndex < 10; requestIndex += 1) {
        const useCompanyB = clientIndex === 4;
        try {
          const response = await api(
            useCompanyB ? pathB : pathsA[(clientIndex + requestIndex) % pathsA.length],
            {
              token: useCompanyB ? companyB.token : companyA.token,
            },
          );
          samples.push(response.elapsedMs);
          successes += 1;
          if (
            useCompanyB &&
            (response.payload?.items ?? []).some((item) =>
              String(item.code || "").startsWith(fixture.runKey),
            )
          )
            leaks += 1;
        } catch {
          errors += 1;
        }
      }
      return { samples, successes, errors, leaks };
    })(),
  );
  const results = await Promise.all(clients);
  const samples = results.flatMap((result) => result.samples);
  const successes = results.reduce((sum, result) => sum + result.successes, 0);
  const errors = results.reduce((sum, result) => sum + result.errors, 0);
  const leaks = results.reduce((sum, result) => sum + result.leaks, 0);
  if (errors !== 0 || leaks !== 0)
    throw new Error("Teste leve de leitura encontrou erro ou vazamento empresarial.");
  return { clients: 5, requests: 50, successes, errors, leaks, ...summarize(samples) };
}

function readRailwayMetrics(since) {
  const command = `npx.cmd -y @railway/cli@latest metrics --service imobiflow-api-staging --environment ${railwayEnvironment} --since ${since} --json --cpu --memory`;
  const output = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
    cwd: repositoryDir,
    encoding: "utf8",
    windowsHide: true,
  });
  const start = output.indexOf("{");
  if (start < 0) throw new Error("Railway CLI nao retornou metricas JSON.");
  return JSON.parse(output.slice(start));
}

function metricPayload(metadata) {
  return metadata &&
    typeof metadata === "object" &&
    metadata.import_metrics &&
    typeof metadata.import_metrics === "object"
    ? metadata.import_metrics
    : {};
}

function sameRollback(left, right) {
  const keys = [
    "deleted_properties",
    "deleted_owners",
    "deleted_media",
    "deleted_file_records",
    "deleted_provider_files",
  ];
  return keys.every((key) => Number(left?.[key] ?? -1) === Number(right?.[key] ?? -2));
}

function summarize(samples) {
  const numeric = samples.filter((sample) => Number.isFinite(sample));
  return {
    averageMs: round(numeric.reduce((sum, value) => sum + value, 0) / Math.max(numeric.length, 1)),
    p50Ms: percentile(numeric, 50),
    p95Ms: percentile(numeric, 95),
    minMs: numeric.length ? Math.min(...numeric) : 0,
    maxMs: numeric.length ? Math.max(...numeric) : 0,
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

function sanitizeText(value) {
  return String(value)
    .replace(/(?:mysql|https?):\/\/[^\s]+/gi, "[URL_OCULTA]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [OCULTO]")
    .replace(/imobiflow\.mysql\.[A-Za-z0-9._-]+/gi, "[TOKEN_OCULTO]")
    .slice(0, 600);
}

async function writeEvidence(fileName, payload) {
  await mkdir(resultDir, { recursive: true });
  await writeFile(resolve(resultDir, fileName), JSON.stringify(payload, null, 2), "utf8");
}

async function run() {
  const measuredAt = new Date();
  const initial = await preflight();
  const fixture = buildFixture();
  if (preflightOnly) {
    console.log(
      JSON.stringify(
        {
          measuredAt: measuredAt.toISOString(),
          preflight: initial.safe,
          fixture: fixture.validation,
          database: initial.database,
          connections: initial.connections,
        },
        null,
        2,
      ),
    );
    return;
  }

  const companyA = await loginCompanyA(initial.companies);
  const companyB = await tokenForCompanyB(companyA.companyId);
  const baselineCompanyAProperties = await prisma.property.count({
    where: { companyId: companyA.companyId },
  });
  const baselineCompanyBProperties = await prisma.property.count({
    where: { companyId: companyB.companyId },
  });
  if (baselineCompanyAProperties !== 1 || baselineCompanyBProperties !== 0) {
    throw new Error(
      "A distribuicao inicial dos imoveis sinteticos entre Empresa A e B nao corresponde ao cenario aprovado.",
    );
  }

  let jobId;
  let rollbackCompleted = false;
  const benchmarkStartedAt = performance.now();
  try {
    const started = await startImport(companyA, fixture, measuredAt);
    jobId = started.jobId;
    const firstJob = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    if (
      firstJob.companyId !== companyA.companyId ||
      firstJob.sourceName !== fixture.fileName ||
      firstJob.totalRows !== PROPERTY_COUNT ||
      firstJob.batchSize !== BATCH_SIZE
    ) {
      throw new Error("ImportJob criado nao corresponde a Empresa A ou a fixture protegida.");
    }
    const batches = [snapshotBatch(1, started.elapsedMs, firstJob, started.recoveredAfterTimeout)];
    reportBatch(batches[0]);
    let concurrency;
    for (let batchNumber = 2; batchNumber <= RESTART_AFTER_BATCH; batchNumber += 1) {
      if (batchNumber === 10) {
        const concurrent = await processConcurrentBatch(companyA.token, jobId, batchNumber);
        concurrency = concurrent.concurrency;
        batches.push(concurrent.batch);
      } else {
        batches.push(await processBatch(companyA.token, jobId, batchNumber));
      }
      reportBatch(batches.at(-1));
    }

    const beforeRestart = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const propertiesBeforeRestart = await prisma.property.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    const databaseAtRestart = await readDatabaseSnapshot();
    const connectionsAtRestart = await readConnections();
    if (
      beforeRestart.processedRows !== 2_500 ||
      beforeRestart.importedRows !== 2_500 ||
      propertiesBeforeRestart !== 2_500 ||
      beforeRestart.status !== "PARTIALLY_COMPLETED"
    ) {
      throw new Error(
        "O lote 25 nao terminou com exatamente 2.500 imoveis persistidos e status parcial.",
      );
    }
    console.log(
      JSON.stringify({
        event: "restart",
        afterBatch: RESTART_AFTER_BATCH,
        processedRows: 2_500,
        cursor: beforeRestart.nextCursor,
      }),
    );
    restartRailwayService();
    await delay(5_000);
    await waitForApi();
    const afterRestartReport = await api(`/imports/${jobId}/report`, { token: companyA.token });
    const afterRestart = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    const propertiesAfterRestart = await prisma.property.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    const restartPersisted =
      beforeRestart.nextCursor === afterRestart.nextCursor &&
      afterRestart.processedRows === 2_500 &&
      afterRestart.importedRows === 2_500 &&
      propertiesAfterRestart === 2_500 &&
      afterRestartReport.status === 200;
    if (!restartPersisted)
      throw new Error("Cursor ou contadores nao persistiram apos o restart Railway.");

    for (
      let batchNumber = RESTART_AFTER_BATCH + 1;
      batchNumber <= EXPECTED_BATCHES;
      batchNumber += 1
    ) {
      batches.push(await processBatch(companyA.token, jobId, batchNumber));
      reportBatch(batches.at(-1));
    }
    const completedAt = performance.now();
    const finalReport = await api(`/imports/${jobId}/report`, { token: companyA.token });
    const finalJob = await prisma.importJob.findUniqueOrThrow({ where: { id: jobId } });
    if (
      finalJob.status !== "COMPLETED" ||
      finalJob.processedRows !== PROPERTY_COUNT ||
      finalJob.importedRows !== PROPERTY_COUNT ||
      finalJob.duplicateRows !== 0 ||
      finalJob.failedRows !== 0 ||
      batches.length !== EXPECTED_BATCHES
    ) {
      throw new Error(
        "O job nao concluiu com 5.000 importacoes em 50 lotes sem duplicatas ou falhas.",
      );
    }

    const propertiesBeforeIdempotency = await prisma.property.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    const repeated = await api(`/imports/${jobId}/process-next-batch`, {
      token: companyA.token,
      method: "POST",
    });
    const propertiesAfterIdempotency = await prisma.property.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    const idempotent =
      repeated.status === 200 &&
      propertiesBeforeIdempotency === PROPERTY_COUNT &&
      propertiesAfterIdempotency === PROPERTY_COUNT;
    if (!idempotent) throw new Error("A chamada repetida alterou a quantidade de imoveis.");

    const codeResponse = await api(
      `/real-estate/properties/by-code/${encodeURIComponent(fixture.codes[999])}`,
      { token: companyA.token },
    );
    const detailId = codeResponse.payload?.property?.id;
    if (!detailId) throw new Error("Imovel sintetico nao foi encontrado para testar isolamento.");
    const isolation = await validateIsolation(companyA, companyB, jobId, fixture, detailId);
    const expectedTotal = baselineCompanyAProperties + PROPERTY_COUNT;
    const reads = await measureReads(companyA, companyB, fixture, expectedTotal);
    const databaseAfterImport = await readDatabaseSnapshot();
    const countsAfterImport = await readCounts();
    const connectionsAfterReads = await readConnections();
    const importRowsCreated = await prisma.importRow.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    const mediaCreated = await prisma.propertyMedia.count({
      where: { companyId: companyA.companyId, property: { importJobId: jobId } },
    });
    const storedFilesCreated = await prisma.storedFile.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    if (importRowsCreated !== PROPERTY_COUNT || mediaCreated !== 0 || storedFilesCreated !== 0) {
      throw new Error("A auditoria de ImportRows ou ausencia de midia nao corresponde ao cenario.");
    }
    const measurementsCompletedAt = performance.now();

    const rollbackFirst = await api(`/imports/${jobId}/rollback`, {
      token: companyA.token,
      method: "POST",
      body: { confirm_rollback: true },
    });
    const databaseAfterRollback = await readDatabaseSnapshot();
    const countsAfterRollback = await readCounts();
    const connectionsAfterRollback = await readConnections();
    const jobPropertiesAfterRollback = await prisma.property.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    const jobMediaAfterRollback = await prisma.propertyMedia.count({
      where: { companyId: companyA.companyId, property: { importJobId: jobId } },
    });
    const jobFilesAfterRollback = await prisma.storedFile.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    const auditRowsAfterRollback = await prisma.importRow.count({
      where: { companyId: companyA.companyId, importJobId: jobId },
    });
    const previousSyntheticPreserved =
      (await prisma.property.count({ where: { companyId: companyA.companyId } })) ===
      baselineCompanyAProperties;
    const rollbackSecond = await api(`/imports/${jobId}/rollback`, {
      token: companyA.token,
      method: "POST",
      body: { confirm_rollback: true },
    });
    const rollbackIdempotent = sameRollback(
      rollbackFirst.payload?.rollback,
      rollbackSecond.payload?.rollback,
    );
    rollbackCompleted = true;
    if (
      jobPropertiesAfterRollback !== 0 ||
      jobMediaAfterRollback !== 0 ||
      jobFilesAfterRollback !== 0 ||
      auditRowsAfterRollback !== PROPERTY_COUNT ||
      !previousSyntheticPreserved ||
      !rollbackIdempotent ||
      countsAfterRollback.runningJobs !== 0
    ) {
      throw new Error(
        "Rollback nao preservou exatamente a auditoria e os dados sinteticos anteriores.",
      );
    }

    await delay(5_000);
    const railwayMetrics = readRailwayMetrics(measuredAt.toISOString());
    const batchTimes = batches
      .map((batch) => batch.elapsedMs)
      .filter((value) => Number.isFinite(value));
    const totalBatchMs = round(batchTimes.reduce((sum, value) => sum + value, 0));
    const result = {
      measuredAt: measuredAt.toISOString(),
      synthetic: true,
      target: "railway-api-private-mysql",
      companiesTested: 2,
      importingCompanies: 1,
      propertiesRequested: PROPERTY_COUNT,
      fixture: fixture.validation,
      fixtureSha256: fixture.sha256,
      batchSize: BATCH_SIZE,
      batchCount: batches.length,
      startMs: batches[0].elapsedMs,
      batches,
      batchSummary: summarize(batchTimes),
      totalBatchMs,
      flowUntilCompletedMs: round(completedAt - benchmarkStartedAt),
      totalFlowBeforeRollbackMs: round(measurementsCompletedAt - benchmarkStartedAt),
      totalFlowIncludingRollbackMs: round(performance.now() - benchmarkStartedAt),
      averagePerPropertyMs: round(totalBatchMs / PROPERTY_COUNT),
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
        afterBatch: RESTART_AFTER_BATCH,
        cursorBefore: beforeRestart.nextCursor,
        cursorAfter: afterRestart.nextCursor,
        processedBefore: beforeRestart.processedRows,
        processedAfter: afterRestart.processedRows,
        importedBefore: beforeRestart.importedRows,
        importedAfter: afterRestart.importedRows,
        propertiesBefore: propertiesBeforeRestart,
        propertiesAfter: propertiesAfterRestart,
        persisted: restartPersisted,
      },
      concurrency,
      idempotency: {
        approved: idempotent,
        before: propertiesBeforeIdempotency,
        after: propertiesAfterIdempotency,
      },
      isolation,
      reads: { ...reads, detailId: undefined },
      database: {
        before: initial.database,
        atRestart: databaseAtRestart,
        afterImport: databaseAfterImport,
        afterRollback: databaseAfterRollback,
        countsBefore: initial.counts,
        countsAfterImport,
        countsAfterRollback,
        connections: {
          before: initial.connections,
          atRestart: connectionsAtRestart,
          afterReads: connectionsAfterReads,
          afterRollback: connectionsAfterRollback,
        },
      },
      rollback: {
        first: rollbackFirst.payload?.rollback,
        second: rollbackSecond.payload?.rollback,
        idempotent: rollbackIdempotent,
        jobPropertiesRemaining: jobPropertiesAfterRollback,
        jobMediaRemaining: jobMediaAfterRollback,
        jobFilesRemaining: jobFilesAfterRollback,
        auditRowsPreserved: auditRowsAfterRollback,
        previousSyntheticPreserved,
        runningJobs: countsAfterRollback.runningJobs,
      },
      railwayMetrics,
      requests: { httpCalls, healthCalls },
      preflight: initial.safe,
    };
    await writeEvidence("railway-result.json", result);
    console.log(
      JSON.stringify({
        event: "benchmark_completed",
        properties: PROPERTY_COUNT,
        batches: batches.length,
        totalBatchMs,
        p50Ms: result.batchSummary.p50Ms,
        p95Ms: result.batchSummary.p95Ms,
        rollbackApproved: rollbackIdempotent,
        auditRowsPreserved: auditRowsAfterRollback,
      }),
    );
  } catch (error) {
    let emergencyRollback = null;
    if (!jobId && companyA) {
      const candidates = await findStartedJobs(
        companyA.companyId,
        fixture.fileName,
        measuredAt,
      ).catch(() => []);
      if (candidates.length === 1) jobId = candidates[0].id;
    }
    if (jobId && !rollbackCompleted) {
      try {
        const response = await api(`/imports/${jobId}/rollback`, {
          token: companyA.token,
          method: "POST",
          body: { confirm_rollback: true },
        });
        emergencyRollback = {
          attempted: true,
          response: response.payload?.rollback,
          remainingProperties: await prisma.property.count({
            where: { companyId: companyA.companyId, importJobId: jobId },
          }),
        };
      } catch (rollbackError) {
        emergencyRollback = {
          attempted: true,
          error: sanitizeText(
            rollbackError instanceof Error ? rollbackError.message : rollbackError,
          ),
        };
      }
    }
    const evidence = {
      measuredAt: measuredAt.toISOString(),
      synthetic: true,
      error: sanitizeText(error instanceof Error ? error.message : error),
      emergencyRollback,
      counts: await readCounts().catch(() => null),
    };
    await writeEvidence("failed-result.json", evidence);
    throw new Error(evidence.error);
  }
}

try {
  await run();
} catch (error) {
  console.error(
    JSON.stringify({
      event: "benchmark_failed",
      error: sanitizeText(error instanceof Error ? error.message : error),
    }),
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
