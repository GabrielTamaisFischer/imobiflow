import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(message);
  process.exit(1);
}

const raw = process.env.DATABASE_URL;
const expectedHost = process.env.EXPECTED_STAGING_DB_HOST;
const expectedPort = process.env.EXPECTED_STAGING_DB_PORT;
const expectedName = process.env.EXPECTED_STAGING_DB_NAME;

if (process.env.ALLOW_C3_STAGING_MIGRATION !== "true") {
  fail("ALLOW_C3_STAGING_MIGRATION=true e obrigatorio.");
}
if (!raw || !expectedHost || !expectedPort || !expectedName) {
  fail("DATABASE_URL e EXPECTED_STAGING_DB_HOST/PORT/NAME sao obrigatorios.");
}

const url = new URL(raw);
const dbName = url.pathname.replace(/^\//, "");

if (url.hostname !== expectedHost || url.port !== expectedPort || dbName !== expectedName) {
  fail(
    [
      "Destino do banco nao corresponde ao staging esperado.",
      `host atual: ${url.hostname}`,
      `port atual: ${url.port}`,
      `database atual: ${dbName}`,
    ].join("\n"),
  );
}

console.log("C3 staging migration guard: OK");
console.log(`host=${url.hostname}`);
console.log(`port=${url.port}`);
console.log(`database=${dbName}`);
console.log("Executando prisma migrate deploy...");

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"],
  { stdio: "inherit", env: process.env },
);

const exitCode = result.status ?? 1;
console.log(`C3_MIGRATION_EXIT_CODE=${exitCode}`);
process.exit(exitCode);
