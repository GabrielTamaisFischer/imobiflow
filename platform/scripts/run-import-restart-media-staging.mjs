import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";

if (process.env.NODE_ENV === "production") throw new Error("Diagnostico de importacao proibido em producao.");
if (process.env.ALLOW_IMPORT_STAGING_TEST !== "true") throw new Error("Defina ALLOW_IMPORT_STAGING_TEST=true.");
if (process.env.CONFIRM_IMPORT_MEDIA_STAGING !== "true") throw new Error("Defina CONFIRM_IMPORT_MEDIA_STAGING=true.");

const platformDir = process.cwd();
const backendDir = resolve(platformDir, "backend");
const config = dotenv.parse(await readFile(resolve(platformDir, ".env")));
if (config.NODE_ENV !== "staging") throw new Error("O arquivo local precisa declarar NODE_ENV=staging.");
process.env.DATABASE_URL = config.DATABASE_URL;
const prisma = new PrismaClient();
const apiUrl = "http://127.0.0.1:3333";
const sourceFolder = `${config.CLOUDINARY_UPLOAD_FOLDER || "imobiflow/staging/imports"}/benchmark-sources`;
cloudinary.config({ cloud_name: config.CLOUDINARY_CLOUD_NAME, api_key: config.CLOUDINARY_API_KEY, api_secret: config.CLOUDINARY_API_SECRET, secure: true });

let apiProcess;
let httpCalls = 0;
let peakMemoryBytes = 0;
const sourcePublicIds = [];

function startApi(overrides = {}) {
  apiProcess = spawn(process.execPath, [resolve(platformDir, "node_modules/tsx/dist/cli.mjs"), "src/server.ts"], {
    cwd: backendDir,
    env: { ...process.env, ...config, ...overrides, NODE_ENV: "staging", PORT: "3333", IMPORT_METRICS_ENABLED: "true" },
    stdio: "ignore",
    windowsHide: true,
  });
}

async function stopApi() {
  if (!apiProcess || apiProcess.killed) return;
  apiProcess.kill();
  await new Promise((resolveWait) => setTimeout(resolveWait, 800));
}

async function waitForApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (apiProcess.exitCode !== null) throw new Error("API encerrou durante o diagnostico.");
    try { if ((await fetch(`${apiUrl}/health`)).ok) return; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error("Timeout aguardando API local.");
}

function sampleMemory() {
  try {
    const value = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-Process -Id ${apiProcess.pid}).WorkingSet64`], { encoding: "utf8", windowsHide: true });
    peakMemoryBytes = Math.max(peakMemoryBytes, Number(value.trim()) || 0);
  } catch {}
}

async function http(path, { token, method = "GET", body } = {}) {
  httpCalls += 1;
  const started = performance.now();
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  sampleMemory();
  return { status: response.status, payload, elapsedMs: round(performance.now() - started) };
}

async function login(email, password) {
  const response = await http("/auth/login", { method: "POST", body: { email, password } });
  if (response.status !== 200 || !response.payload.session?.access_token) throw new Error(`Login falhou: HTTP ${response.status}`);
  return { token: response.payload.session.access_token, access: response.payload.access };
}

function fixture(prefix, imageUrls = []) {
  const rows = ["Codigo;Titulo;Cidade;Status;Valor Venda;Fotos;Video URL;Tour URL"];
  for (let index = 1; index <= 50; index += 1) {
    const code = `${prefix}-${String(index).padStart(3, "0")}`;
    const images = index === 1 ? imageUrls.join("|") : "";
    rows.push(`${code};Imovel sintetico ${index};Curitiba;disponivel;${100000 + index};${images};https://video.example/${code};https://tour.example/${code}`);
  }
  return Buffer.from(rows.join("\n"));
}

async function startJob(token, file, concurrency) {
  const response = await http("/imports/start", { token, method: "POST", body: {
    file_name: "staging.csv", content_base64: file.toString("base64"), import_type: "properties",
    mode: "test", batch_size: 25, allow_partial: true,
  } });
  if (response.status !== 201 || !response.payload.import?.id) throw new Error(`Inicio do job falhou: HTTP ${response.status}`);
  const job = await prisma.importJob.findUniqueOrThrow({ where: { id: response.payload.import.id } });
  if (Number(config.IMPORT_MEDIA_CONCURRENCY || concurrency) !== concurrency && concurrency !== 1 && concurrency !== 3) throw new Error("Concorrencia inesperada.");
  return { response, jobId: job.id, job };
}

async function rollback(token, jobId) {
  const response = await http(`/imports/${jobId}/rollback`, { token, method: "POST", body: { confirm_rollback: true } });
  if (response.status !== 200) throw new Error(`Rollback falhou: HTTP ${response.status}`);
  return response;
}

async function runNoImageScenario(token) {
  const file = fixture("DBONLY");
  const started = await startJob(token, file, 1);
  const second = await http(`/imports/${started.jobId}/process-next-batch`, { token, method: "POST" });
  const report = await http(`/imports/${started.jobId}/report`, { token });
  const countBefore = await prisma.property.count({ where: { importJobId: started.jobId } });
  const idempotent = await http(`/imports/${started.jobId}/process-next-batch`, { token, method: "POST" });
  const countAfter = await prisma.property.count({ where: { importJobId: started.jobId } });
  const finalJob = await prisma.importJob.findUniqueOrThrow({ where: { id: started.jobId } });
  await rollback(token, started.jobId);
  return {
    fileBytes: file.byteLength, startMs: started.response.elapsedMs, secondBatchMs: second.elapsedMs,
    totalMeasuredMs: round(started.response.elapsedMs + second.elapsedMs + report.elapsedMs),
    firstCursor: started.job.nextCursor, finalCursor: finalJob.nextCursor, imported: finalJob.importedRows,
    duplicates: finalJob.duplicateRows, idempotent: idempotent.status === 200 && countBefore === countAfter,
    metrics: metricPayload(finalJob.metadataJson),
  };
}

async function runRestartScenario(token, baseEnv) {
  const file = fixture("RESTART");
  const started = await startJob(token, file, 1);
  const propertiesBefore = await prisma.property.count({ where: { importJobId: started.jobId } });
  await stopApi();
  startApi(baseEnv);
  await waitForApi();
  const afterRestart = await http(`/imports/${started.jobId}/report`, { token });
  const persisted = await prisma.importJob.findUniqueOrThrow({ where: { id: started.jobId } });
  const second = await http(`/imports/${started.jobId}/process-next-batch`, { token, method: "POST" });
  const finalJob = await prisma.importJob.findUniqueOrThrow({ where: { id: started.jobId } });
  const propertiesAfter = await prisma.property.count({ where: { importJobId: started.jobId } });
  await rollback(token, started.jobId);
  const remaining = await prisma.property.count({ where: { importJobId: started.jobId } });
  return {
    cursorBeforeRestart: started.job.nextCursor, cursorAfterRestart: persisted.nextCursor,
    processedBeforeRestart: started.job.processedRows, processedAfterRestart: persisted.processedRows,
    propertiesBeforeRestart: propertiesBefore, propertiesAfterCompletion: propertiesAfter,
    reportAfterRestartStatus: afterRestart.status, secondBatchStatus: second.status,
    finalCursor: finalJob.nextCursor, finalStatus: finalJob.status, duplicates: finalJob.duplicateRows,
    remainingAfterRollback: remaining,
  };
}

async function runMediaScenario(token, urls, concurrency, prefix) {
  await stopApi();
  startApi({ IMPORT_MEDIA_CONCURRENCY: String(concurrency) });
  await waitForApi();
  const file = fixture(prefix, [...urls, "https://example.invalid/missing.jpg", "http://127.0.0.1/private.jpg"]);
  const cloudBefore = await cloudCount();
  const started = await startJob(token, file, concurrency);
  const second = await http(`/imports/${started.jobId}/process-next-batch`, { token, method: "POST" });
  const finalJob = await prisma.importJob.findUniqueOrThrow({ where: { id: started.jobId } });
  const physicalAssets = await prisma.storedFile.count({ where: { importJobId: started.jobId } });
  const deduplications = finalJob.importedPhotos - physicalAssets;
  const localhostFiles = await prisma.storedFile.count({ where: { importJobId: started.jobId, sourceUrl: { startsWith: "http://127.0.0.1" } } });
  const metrics = metricPayload(finalJob.metadataJson);
  await rollback(token, started.jobId);
  const cloudAfter = await cloudCount();
  return {
    concurrency, fileBytes: file.byteLength, startMs: started.response.elapsedMs, secondBatchMs: second.elapsedMs,
    totalBatchMs: round(started.response.elapsedMs + second.elapsedMs), imported: finalJob.importedRows,
    duplicates: finalJob.duplicateRows, downloads: metricCount(metrics, "media_download"),
    uploads: metricCount(metrics, "storage_upload"), physicalAssets, deduplications,
    rejectedImages: finalJob.failedPhotos, localhostFiles,
    averageDownloadMs: metricAverage(metrics, "media_download"), averageUploadMs: metricAverage(metrics, "storage_upload"),
    totalMediaMs: mediaTotal(metrics), cloudBefore, cloudAfter, metrics,
  };
}

async function prepareDistinctImageUrls() {
  const uploads = [];
  for (const [index, file] of ["public/site-templates/imoveis-logo.png", "public/site-templates/magnifico-hero.jpg"].entries()) {
    const result = await cloudinary.uploader.upload(resolve(platformDir, file), {
      folder: sourceFolder, public_id: `source-${Date.now()}-${index}`, overwrite: false, tags: ["imobiflow", "staging-benchmark-source"],
    });
    sourcePublicIds.push(result.public_id);
    uploads.push(result.public_id);
  }
  return Array.from({ length: 20 }, (_, index) => cloudinary.url(uploads[index % uploads.length], {
    secure: true, format: "jpg",
    transformation: [{ width: 64, height: 64, crop: "fill" }, { effect: `hue:${(index * 17) % 100}` }, { quality: 60 }],
  }));
}

async function cloudCount() {
  let total = 0;
  let cursor;
  do {
    const page = await cloudinary.api.resources({ type: "upload", prefix: config.CLOUDINARY_UPLOAD_FOLDER, max_results: 500, ...(cursor ? { next_cursor: cursor } : {}) });
    total += page.resources?.length || 0;
    cursor = page.next_cursor;
  } while (cursor);
  return total;
}

function metricPayload(metadata) {
  return metadata && typeof metadata === "object" && metadata.import_metrics && typeof metadata.import_metrics === "object" ? metadata.import_metrics : {};
}
function metricCount(metrics, name) { return Number(metrics[name]?.count || 0); }
function metricAverage(metrics, name) { const count = metricCount(metrics, name); return count ? round(Number(metrics[name].total_ms) / count) : 0; }
function mediaTotal(metrics) { return round(["media_download", "media_validate", "media_dedup_lookup", "storage_upload", "stored_file_create", "property_media_create"].reduce((sum, name) => sum + Number(metrics[name]?.total_ms || 0), 0)); }
function round(value) { return Math.round(value * 100) / 100; }

const diagnosticStarted = performance.now();
const mediaOnly = process.argv.includes("--media-only");
try {
  startApi({ IMPORT_MEDIA_CONCURRENCY: "1" });
  await waitForApi();
  const companyA = await login(config.IMOBIFLOW_BOOTSTRAP_EMAIL, config.IMOBIFLOW_BOOTSTRAP_PASSWORD);
  await stopApi();
  const passwordB = randomBytes(36).toString("base64url");
  const companyBEnv = { IMOBIFLOW_BOOTSTRAP_EMAIL: "staging-b@example.com", IMOBIFLOW_BOOTSTRAP_PASSWORD: passwordB, IMOBIFLOW_BOOTSTRAP_COMPANY_NAME: "ImobiFlow Staging Empresa B", IMPORT_MEDIA_CONCURRENCY: "1" };
  startApi(companyBEnv);
  await waitForApi();
  const companyB = await login("staging-b@example.com", passwordB);

  const restart = mediaOnly ? null : await runRestartScenario(companyA.token, companyBEnv);
  const isolationStatus = mediaOnly ? null : (await http(`/imports/${await latestImportJobId(companyA.access.company.id)}/report`, { token: companyB.token })).status;
  const noImages = mediaOnly ? null : await runNoImageScenario(companyA.token);
  const distinctUrls = await prepareDistinctImageUrls();
  const mediaSequential = await runMediaScenario(companyA.token, distinctUrls, 1, "MEDIA-SEQ");
  const mediaConcurrent = await runMediaScenario(companyA.token, distinctUrls, 3, "MEDIA-CON");
  const gainPercent = mediaSequential.startMs > 0 ? round((1 - mediaConcurrent.startMs / mediaSequential.startMs) * 100) : 0;
  const result = {
    measuredAt: new Date().toISOString(), companiesTested: 2, rowsPerScenario: 50,
    httpCalls, peakMemoryBytes, restart, isolationStatus, noImages, mediaSequential, mediaConcurrent,
    measuredStartGainPercent: gainPercent, totalDiagnosticMs: round(performance.now() - diagnosticStarted),
  };
  await writeFile(resolve(platformDir, ".tmp/import-restart-media-result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await stopApi();
  for (const publicId of sourcePublicIds) await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true }).catch(() => undefined);
  await prisma.$disconnect();
}

async function latestImportJobId(companyId) {
  return (await prisma.importJob.findFirstOrThrow({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { id: true } })).id;
}
