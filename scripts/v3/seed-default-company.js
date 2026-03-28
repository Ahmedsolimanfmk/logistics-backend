require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const company = await prisma.companies.upsert({
    where: { code: "COMP-DEFAULT" },
    update: {
      name: "Default Company",
      timezone: "Africa/Cairo",
      base_currency: "EGP",
      is_active: true,
    },
    create: {
      code: "COMP-DEFAULT",
      name: "Default Company",
      timezone: "Africa/Cairo",
      base_currency: "EGP",
      is_active: true,
    },
  });

  const existingSubscription = await prisma.company_subscriptions.findFirst({
    where: {
      company_id: company.id,
      plan_code: "DEFAULT",
    },
    select: { id: true },
  });

  if (!existingSubscription) {
    await prisma.company_subscriptions.create({
      data: {
        company_id: company.id,
        plan_code: "DEFAULT",
        status: "ACTIVE",
        starts_at: new Date(),
        ai_enabled: true,
        analytics_enabled: true,
      },
    });
  }

  console.log("Default company ready:", company.id);
}

main()
  .catch((error) => {
    console.error("SEED DEFAULT COMPANY FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });