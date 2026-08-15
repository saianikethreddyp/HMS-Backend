import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const offer = await prisma.membershipOffer.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Family Membership",
      pricePaise: 100000,
      validityMonths: 12,
      memberLimit: 4,
      quotaTotal: 20,
      isActive: true,
    },
  });
  console.log(`Seeded offer: ${offer.name} (${offer.id})`);

  const adminLogin = process.env.SEED_ADMIN_LOGIN;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!adminLogin) {
    console.log("SEED_ADMIN_LOGIN not set; skipping admin user seed.");
    return;
  }

  const existing = await prisma.staffUser.findUnique({ where: { login: adminLogin } });
  if (existing) {
    console.log(`Staff user '${adminLogin}' already exists; skipping.`);
    return;
  }

  const admin = await prisma.staffUser.create({
    data: { login: adminLogin, name: adminName, role: "ADMIN", isActive: true },
  });
  console.log(`Seeded admin staff user: ${admin.login}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
