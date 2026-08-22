import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

if (process.env.NODE_ENV === "production") throw new Error("Validacao de staging e proibida em producao.");
if (process.env.ALLOW_IMPORT_STAGING_TEST !== "true") throw new Error("Defina ALLOW_IMPORT_STAGING_TEST=true.");
const count = Number(process.argv.find((arg) => arg.startsWith("--count="))?.split("=")[1] ?? 50);
if (![50, 500].includes(count)) throw new Error("Use --count=50 ou --count=500.");
if (count === 500 && process.env.CONFIRM_IMPORT_500_STAGING !== "true") throw new Error("500 registros exigem confirmacao adicional.");

const apiUrl = process.env.STAGING_API_URL?.replace(/\/$/, "");
const token = process.env.STAGING_TOKEN_COMPANY_A;
if (!apiUrl || !token) throw new Error("Informe STAGING_API_URL e STAGING_TOKEN_COMPANY_A somente no ambiente local.");
const file = await readFile(resolve(process.cwd(), ".tmp", "import-staging", String(count), "company-a.csv"));

async function request(path, init = {}) {
  const started = performance.now();
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
  if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`), { elapsedMs });
  return { body, elapsedMs };
}

const started = await request("/imports/start", { method: "POST", body: JSON.stringify({
  file_name: "company-a.csv", content_base64: file.toString("base64"), import_type: "properties", mode: "test",
}) });
const jobId = started.body?.job?.id ?? started.body?.id;
if (!jobId) throw new Error("Resposta de inicio nao retornou o id do job.");
const batches = [];
let report = await request(`/imports/${jobId}/report`);
while (report.body?.has_pending_batches === true || report.body?.hasPendingBatches === true) {
  batches.push(await request(`/imports/${jobId}/process-next-batch`, { method: "POST" }));
  report = await request(`/imports/${jobId}/report`);
}
console.log(JSON.stringify({ measuredAt: new Date().toISOString(), synthetic: true, count, startMs: started.elapsedMs,
  batchMs: batches.map((item) => item.elapsedMs), reportMs: report.elapsedMs, report: report.body }, null, 2));
