import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as typeof globalThis & {
  imobiflowPrisma?: PrismaClient;
};

function getPrismaSingleton() {
  if (!globalForPrisma.imobiflowPrisma) {
    globalForPrisma.imobiflowPrisma = new PrismaClient();
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
