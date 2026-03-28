require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== BACKFILL CORE MASTER DATA COMPANY START ===");

  const company = await prisma.companies.findUnique({
    where: { code: "COMP-DEFAULT" },
    select: { id: true, code: true },
  });

  if (!company) {
    throw new Error("Default company not found.");
  }

  const vehiclesResult = await prisma.vehicles.updateMany({
    where: { company_id: null },
    data: { company_id: company.id },
  });

  const driversResult = await prisma.drivers.updateMany({
    where: { company_id: null },
    data: { company_id: company.id },
  });

  const warehousesResult = await prisma.warehouses.updateMany({
    where: { company_id: null },
    data: { company_id: company.id },
  });

  const partsResult = await prisma.parts.updateMany({
    where: { company_id: null },
    data: { company_id: company.id },
  });

  const vendorsResult = await prisma.vendors.updateMany({
    where: { company_id: null },
    data: { company_id: company.id },
  });

  console.log("Vehicles updated:", vehiclesResult.count);
  console.log("Drivers updated:", driversResult.count);
  console.log("Warehouses updated:", warehousesResult.count);
  console.log("Parts updated:", partsResult.count);
  console.log("Vendors updated:", vendorsResult.count);
  console.log("=== BACKFILL CORE MASTER DATA COMPANY END ===");
}

main()
  .catch((error) => {
    console.error("BACKFILL CORE MASTER DATA COMPANY FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });