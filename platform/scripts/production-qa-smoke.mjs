#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const apiUrl = normalizeApiUrl(args["api-url"] || process.env.IMOBIFLOW_API_URL || process.env.VITE_IMOBIFLOW_API_URL);
const email = args.email || process.env.IMOBIFLOW_BOOTSTRAP_EMAIL;
const password = process.env.IMOBIFLOW_BOOTSTRAP_PASSWORD;
const keepData = args["keep-data"] === "true" || args["keep-data"] === true || process.env.IMOBIFLOW_QA_KEEP_DATA === "true";
const logDir = args["log-dir"] || process.env.IMOBIFLOW_QA_LOG_DIR || path.join(process.cwd(), "logs");

if (!apiUrl) fail("Informe --api-url com a URL da Vercel ou IMOBIFLOW_API_URL.");
if (!email) fail("Informe --email ou IMOBIFLOW_BOOTSTRAP_EMAIL.");
if (!password) fail("IMOBIFLOW_BOOTSTRAP_PASSWORD precisa estar no ambiente. Nao passe senha como argumento.");

const startedAt = new Date();
const report = {
  started_at: startedAt.toISOString(),
  api_url: apiUrl,
  steps: [],
  keep_data: keepData,
};

try {
  await step("health", async () => {
    const health = await request("/health");
    assert(health.ok === true, "GET /health nao retornou ok=true.");
    return health;
  });

  const login = await step("login bootstrap", async () => {
    const firstLogin = await loginAndReadAccess();
    assert(firstLogin.token.startsWith("imobiflow.mysql."), "Login nao retornou token MySQL.");
    return {
      company_id: firstLogin.access.company.id,
      company_name: firstLogin.access.company.name,
      user_id: firstLogin.access.appUser.id,
    };
  });

  const token = loginAndReadAccess.lastToken;
  await step("clear qa before run", async () => request("/test-lab/clear", { method: "DELETE", token }));

  const generated = await step("generate qa", async () => {
    const result = await request("/test-lab/generate", { method: "POST", token });
    assert(result.created?.properties >= 14, "Geracao QA criou menos de 14 imoveis.");
    assert(result.site?.slug, "Geracao QA nao retornou slug do site.");
    return {
      test_batch_id: result.test_batch_id,
      created: result.created,
      site: result.site,
    };
  });

  const propertySnapshot = await step("list qa properties", async () => {
    const result = await request("/real-estate/properties?status=all", { token });
    const qaProperties = (result.properties || []).filter((property) => String(property.code || "").startsWith("QA-"));
    assert(qaProperties.length >= 14, "Lista interna retornou menos de 14 imoveis QA.");
    return {
      count: qaProperties.length,
      ids: qaProperties.map((property) => property.id).sort(),
      first: summarizeProperty(qaProperties[0]),
    };
  });

  await step("consistency second session", async () => {
    const second = await loginAndReadAccess();
    const result = await request("/real-estate/properties?status=all", { token: second.token });
    const ids = (result.properties || [])
      .filter((property) => String(property.code || "").startsWith("QA-"))
      .map((property) => property.id)
      .sort();
    assert(JSON.stringify(ids) === JSON.stringify(propertySnapshot.ids), "Segunda sessao retornou IDs QA diferentes.");
    return {
      company_id: second.access.company.id,
      company_name: second.access.company.name,
      count: ids.length,
    };
  });

  await step("public site list", async () => {
    const slug = generated.site.slug;
    const result = await request(`/public/sites/${encodeURIComponent(slug)}/properties`);
    assert((result.properties || []).length > 0, "Vitrine publica nao retornou imoveis publicados.");
    return {
      slug,
      count: result.properties.length,
      first: summarizeProperty(result.properties[0]),
    };
  });

  await step("public property detail", async () => {
    const slug = generated.site.slug;
    const propertiesResult = await request(`/public/sites/${encodeURIComponent(slug)}/properties`);
    const first = propertiesResult.properties[0];
    assert(first?.id, "Nao ha imovel publicado para abrir detalhe.");
    const detail = await request(`/public/sites/${encodeURIComponent(slug)}/properties/${encodeURIComponent(first.id)}`);
    const property = detail.property;
    assert(property?.title, "Detalhe do imovel nao retornou titulo.");
    assert(property?.description, "Detalhe do imovel nao retornou descricao.");
    assert(Array.isArray(property?.property_media) && property.property_media.length > 0, "Detalhe do imovel nao retornou fotos/midia.");
    assert(property?.bedrooms !== undefined || property?.private_area !== undefined, "Detalhe do imovel nao retornou detalhes cadastrais.");
    return summarizeProperty(property);
  });

  if (!keepData) {
    await step("clear qa after run", async () => {
      const clear = await request("/test-lab/clear", { method: "DELETE", token });
      const after = await request("/real-estate/properties?status=all", { token });
      const remaining = (after.properties || []).filter((property) => String(property.code || "").startsWith("QA-"));
      assert(remaining.length === 0, "Ainda existem imoveis QA depois da limpeza.");
      return { clear, remaining_qa_properties: remaining.length };
    });
  }

  report.finished_at = new Date().toISOString();
  report.ok = true;
  writeReport();
  console.log(`OK production QA smoke: ${report.log_file}`);
} catch (error) {
  report.finished_at = new Date().toISOString();
  report.ok = false;
  report.error = error instanceof Error ? error.message : String(error);
  writeReport();
  console.error(`ERRO production QA smoke: ${report.error}`);
  console.error(`Log: ${report.log_file}`);
  process.exit(1);
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    const entry = { name, ok: true, duration_ms: Date.now() - started, result };
    report.steps.push(entry);
    console.log(`OK ${name}`);
    return result;
  } catch (error) {
    const entry = {
      name,
      ok: false,
      duration_ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
    report.steps.push(entry);
    throw error;
  }
}

async function loginAndReadAccess() {
  const result = await request("/auth/login", {
    method: "POST",
    body: { email, password },
  });

  const token = result.session?.access_token;
  assert(token, "Login nao retornou access_token.");
  loginAndReadAccess.lastToken = token;
  return { token, access: result.access };
}

async function request(pathname, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${apiUrl}${pathname}`, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const message = payload?.message || payload?.error || text || response.statusText;
    throw new Error(`${options.method || "GET"} ${pathname} -> ${response.status}: ${message}`);
  }

  return payload;
}

function summarizeProperty(property) {
  if (!property) return null;
  return {
    id: property.id,
    code: property.code,
    title: property.title,
    status: property.status,
    media_count: Array.isArray(property.property_media) ? property.property_media.length : 0,
    sale_price_cents: property.sale_price_cents ?? null,
    rent_price_cents: property.rent_price_cents ?? null,
  };
}

function writeReport() {
  if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
  const fileName = `production-qa-${startedAt.toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(logDir, fileName);
  report.log_file = filePath;
  writeFileSync(filePath, JSON.stringify(redactReport(report), null, 2));
}

function redactReport(value) {
  return JSON.parse(
    JSON.stringify(value, (key, item) => {
      if (/password|secret|token|key/i.test(key) && typeof item === "string") return mask(item);
      return item;
    }),
  );
}

function mask(value) {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function normalizeApiUrl(value) {
  if (!value) return "";
  const normalized = String(value).replace(/\/$/, "");

  try {
    const url = new URL(normalized);
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/api";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return normalized;
  }

  return normalized;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
