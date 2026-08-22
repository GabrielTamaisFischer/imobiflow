import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const envFiles = [".env", ".env.local", "backend/.env", "backend/.env.local"];
const cloudinaryKeys = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};

  return readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .reduce((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const separator = trimmed.indexOf("=");
      if (separator === -1) return acc;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      acc[key] = rawValue.replace(/^['"]|['"]$/g, "");
      return acc;
    }, {});
}

function loadProjectEnv() {
  const fileEnv = envFiles.reduce((acc, file) => {
    return { ...acc, ...parseEnvFile(path.join(root, file)) };
  }, {});

  return { ...fileEnv, ...process.env };
}

function isLocalUrl(value) {
  return value.includes("localhost") || value.includes("127.0.0.1");
}

function maskValue(value) {
  if (!value) return "";
  if (value.length <= 12) return "***";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function buildWebsiteBuilderPreflight(env = loadProjectEnv(), projectRoot = root) {
  const databaseUrl = env.DATABASE_URL ?? "";
  const apiUrl = env.VITE_IMOBIFLOW_API_URL || "/api";
  const storageProvider = env.STORAGE_PROVIDER || "cloudinary";
  const missingStorage = storageProvider === "cloudinary" ? cloudinaryKeys.filter((key) => !env[key]) : [];

  const checks = [
    {
      ok: Boolean(apiUrl) && !isLocalUrl(apiUrl),
      label: "Backend API",
      detail: apiUrl
        ? isLocalUrl(apiUrl)
          ? `${apiUrl} aponta para localhost; em producao use /api ou uma URL publica.`
          : apiUrl
        : "nao configurada",
    },
    {
      ok: Boolean(databaseUrl) && databaseUrl.startsWith("mysql://"),
      label: "DATABASE_URL",
      detail: databaseUrl
        ? databaseUrl.startsWith("mysql://")
          ? "MySQL configurado"
          : "precisa comecar com mysql://"
        : "nao configurada",
    },
    {
      ok: missingStorage.length === 0,
      label: storageProvider === "cloudinary" ? "Cloudinary" : `Storage ${storageProvider}`,
      detail: missingStorage.length === 0 ? "variaveis configuradas" : `faltando ${missingStorage.join(", ")}`,
    },
    {
      ok: existsSync(path.join(projectRoot, "prisma/schema.prisma")),
      label: "Prisma schema",
      detail: "prisma/schema.prisma",
    },
    {
      ok: existsSync(path.join(projectRoot, "prisma/migrations")),
      label: "Prisma migrations",
      detail: "prisma/migrations",
    },
    {
      ok: existsSync(path.join(projectRoot, "api/[...path].ts")),
      label: "Vercel Function",
      detail: "api/[...path].ts",
    },
  ];

  return {
    checks,
    databaseUrl,
    missingStorage,
    ready: checks.every((check) => check.ok),
  };
}

export function formatWebsiteBuilderPreflight(preflight, { strict = false } = {}) {
  const lines = ["Website Builder Fase 1 - Preflight", "===================================="];

  for (const check of preflight.checks) {
    const mark = check.ok ? "OK" : strict ? "ERRO" : "PENDENTE";
    lines.push(`${mark.padEnd(8)} ${check.label} - ${check.detail}`);
  }

  if (preflight.databaseUrl) {
    lines.push("", `DATABASE_URL detectada: ${maskValue(preflight.databaseUrl)}`);
  }

  if (preflight.missingStorage.length > 0) {
    lines.push("", "Variaveis Cloudinary esperadas:");
    for (const key of cloudinaryKeys) lines.push(`- ${key}`);
  }

  lines.push(
    "",
    "Proximos comandos quando MySQL estiver pronto:",
    "npm run prisma:generate",
    "npm run prisma:migrate",
    "npm run prisma:seed",
  );

  return lines.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const strict = process.argv.includes("--strict");
  const preflight = buildWebsiteBuilderPreflight();
  console.log(formatWebsiteBuilderPreflight(preflight, { strict }));

  if (strict && !preflight.ready) {
    process.exitCode = 1;
  }
}
