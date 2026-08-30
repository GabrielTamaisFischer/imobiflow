import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { ensureSystemWebsiteTemplates } from "../backend/src/services/website-builder-system-templates.js";

// Ambiente local (sandbox): Prisma Client gerado com engineType="client"
// (WASM) por bloqueio de rede aos binarios nativos do Prisma. Precisa de um
// driver adapter explicito. Ativado apenas via PRISMA_LOCAL_DRIVER_ADAPTER
// (mesma flag usada em backend/src/lib/website-builder-prisma.ts). Sem essa
// flag o comportamento padrao (producao) permanece inalterado.
const prisma =
  process.env.PRISMA_LOCAL_DRIVER_ADAPTER === "true" && process.env.DATABASE_URL
    ? new PrismaClient({ adapter: new PrismaMariaDb(process.env.DATABASE_URL) })
    : new PrismaClient();

async function main() {
  await ensureSystemWebsiteTemplates(prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
