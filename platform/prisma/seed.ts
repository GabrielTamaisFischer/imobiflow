import { PrismaClient } from "@prisma/client";
import { ensureSystemWebsiteTemplates } from "../backend/src/services/website-builder-system-templates.js";

const prisma = new PrismaClient();

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
