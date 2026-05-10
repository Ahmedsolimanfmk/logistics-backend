require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function main() {
  console.log("=== FIX USER MEMBERSHIPS ===");

  const company = await prisma.companies.findFirst({
    where: { code: "COMP-DEFAULT" },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  const users = await prisma.users.findMany();

  let created = 0;

  for (const user of users) {
    const exists = await prisma.company_users.findFirst({
      where: {
        user_id: user.id,
        company_id: company.id,
      },
    });

    if (!exists) {
      await prisma.company_users.create({
        data: {
          user_id: user.id,
          company_id: company.id,
          company_role: "ADMIN",
          status: "ACTIVE",
          is_active: true,
        },
      });

      created++;
    }
  }

  console.log("✅ memberships created:", created);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());