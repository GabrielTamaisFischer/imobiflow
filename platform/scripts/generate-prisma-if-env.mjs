import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

for (const envFile of [
  resolve(process.cwd(), ".env.local"),
  resolve(process.cwd(), ".env.production.local"),
  resolve(process.cwd(), ".env"),
]) {
  if (existsSync(envFile)) config({ path: envFile });
}

const env = { ...process.env };
if (!env.DATABASE_URL && !env.PRISMA_MIGRATE_DATABASE_URL) {
  env.DATABASE_URL = "mysql://prisma:prisma@127.0.0.1:3306/prisma_generate_only";
  console.warn("[postinstall] DATABASE_URL ausente; usando URL dummy somente para prisma generate (sem acesso ao banco).");
}

const result = spawnSync("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env,
});

process.exit(result.status ?? 1);
