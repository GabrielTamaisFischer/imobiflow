import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as typeof globalThis & {
  imobiflowPrisma?: PrismaClient;
};

/**
 * Ambiente local (sandbox): binarios nativos do Prisma (schema-engine/
 * libquery_engine) nao podem ser baixados por politica de rede. Nesse caso o
 * Prisma Client foi gerado com engineType="client" (WASM) e PRECISA de um
 * driver adapter injetado manualmente. Isso e ativado apenas via a flag
 * PRISMA_LOCAL_DRIVER_ADAPTER=true, definida somente no .env local. Sem essa
 * flag o comportamento em producao permanece 100% inalterado
 * (new PrismaClient() com engine nativo, como sempre foi).
 */
function createPrismaClient(): PrismaClient {
  if (env.PRISMA_LOCAL_DRIVER_ADAPTER === "true" && env.DATABASE_URL) {
    const adapter = new PrismaMariaDb(env.DATABASE_URL);
    return new PrismaClient({ adapter });
  }

  return new PrismaClient();
}

function getPrismaSingleton() {
  if (!globalForPrisma.imobiflowPrisma) {
    globalForPrisma.imobiflowPrisma = createPrismaClient();
  }

  return globalForPrisma.imobiflowPrisma;
}

export function getWebsiteBuilderPrisma() {
  if (!env.DATABASE_URL) {
    throw Object.assign(
      new Error(
        "Website Builder ainda nao possui DATABASE_URL configurada. Configure o MySQL local ou online antes de usar este modulo.",
      ),
      { statusCode: 503 },
    );
  }

  return getPrismaSingleton();
}

export const getPrisma = getWebsiteBuilderPrisma;
