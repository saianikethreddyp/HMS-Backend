import { PrismaClient } from "@prisma/client";
import { ensureDefaultOffer, ensureDefaultAdmin } from "../src/bootstrap.js";

const prisma = new PrismaClient();

async function main() {
  const offer = await ensureDefaultOffer(prisma);
  console.log(`Offer ready: ${offer.name} (${offer.id})`);

  const admin = await ensureDefaultAdmin(prisma);
  console.log(`Admin staff ready: ${admin.login}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
