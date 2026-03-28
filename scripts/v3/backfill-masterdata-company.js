require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== BACKFILL MASTER DATA COMPANY START ===");

  const company = await prisma.companies.findUnique({
    where: { code: "COMP-DEFAULT" },
    select: { id: true, code: true, name: true },
  });

  if (!company) {
    throw new Error("Default company not found.");
  }

  const departmentsResult = await prisma.departments.updateMany({
    where: { company_id: null },
    data: { company_id: company.id },
  });

  const clientsResult = await prisma.clients.updateMany({
    where: { company_id: null },
    data: { company_id: company.id },
  });

  const sitesResult = await prisma.sites.updateMany({
    where: { company_id: null },
    data: { company_id: company.id },
  });

  const fleets = await prisma.fleets.findMany({
    select: { id: true, company_id: true, department_id: true },
  });

  let fleetsUpdated = 0;

  for (const fleet of fleets) {
    if (fleet.company_id) continue;

    const department = await prisma.departments.findUnique({
      where: { id: fleet.department_id },
      select: { company_id: true },
    });

    if (!department?.company_id) {
      throw new Error(`Department ${fleet.department_id} has no company_id`);
    }

    await prisma.fleets.update({
      where: { id: fleet.id },
      data: { company_id: department.company_id },
    });

    fleetsUpdated += 1;
  }

  console.log("Departments updated:", departmentsResult.count);
  console.log("Clients updated:", clientsResult.count);
  console.log("Sites updated:", sitesResult.count);
  console.log("Fleets updated:", fleetsUpdated);
  console.log("=== BACKFILL MASTER DATA COMPANY END ===");
}

main()
  .catch((error) => {
    console.error("BACKFILL MASTER DATA COMPANY FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });