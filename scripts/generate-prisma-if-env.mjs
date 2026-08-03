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

if (!process.env.DATABASE_URL) {
  console.warn("[postinstall] DATABASE_URL ausente; Prisma Client sera gerado quando o banco estiver configurado.");
  process.exit(0);
}

const result = spawnSync("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
