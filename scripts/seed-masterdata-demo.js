require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== SEED MASTER DATA DEMO START ===");

  // =========================
  // 1. Company
  // =========================
  const company = await prisma.companies.findUnique({
    where: { code: "COMP-DEFAULT" },
    select: { id: true },
  });

  if (!company) {
    throw new Error("Company not found. Run seed-default-company first.");
  }

  const companyId = company.id;

  // =========================
  // 2. Vehicle Classes
  // =========================
  const vehicleClassesData = [
    { code: "TRAILER", name: "تريلا" },
    { code: "TRUCK", name: "نقل ثقيل" },
    { code: "HALF_TRUCK", name: "نصف نقل" },
  ];

  for (const row of vehicleClassesData) {
    await prisma.vehicle_classes.upsert({
      where: {
        company_id_code: {
          company_id: companyId,
          code: row.code,
        },
      },
      update: {
        name: row.name,
        is_active: true,
      },
      create: {
        company_id: companyId,
        code: row.code,
        name: row.name,
        is_active: true,
      },
    });
  }

  console.log("Vehicle classes seeded");

  // =========================
  // 3. Cargo Types
  // =========================
  const cargoTypesData = [
    { code: "GENERAL", name: "بضائع عامة" },
    { code: "BULK", name: "مواد سائبة" },
    { code: "CONTAINER", name: "حاويات" },
  ];

  for (const row of cargoTypesData) {
    await prisma.cargo_types.upsert({
      where: {
        company_id_code: {
          company_id: companyId,
          code: row.code,
        },
      },
      update: {
        name: row.name,
        is_active: true,
      },
      create: {
        company_id: companyId,
        code: row.code,
        name: row.name,
        is_active: true,
      },
    });
  }

  console.log("Cargo types seeded");

  // =========================
  // 4. Zones
  // =========================
  const zonesData = [
    { code: "CAIRO", name: "القاهرة" },
    { code: "ALEX", name: "الإسكندرية" },
    { code: "SUEZ", name: "السويس" },
    { code: "DELTA", name: "الدلتا" },
  ];

  const zones = [];

  for (const row of zonesData) {
    const zone = await prisma.zones.upsert({
      where: {
        company_id_code: {
          company_id: companyId,
          code: row.code,
        },
      },
      update: {
        name: row.name,
        is_active: true,
      },
      create: {
        company_id: companyId,
        code: row.code,
        name: row.name,
        is_active: true,
      },
    });

    zones.push(zone);
  }

  console.log("Zones seeded");

  // =========================
  // 5. Clients + Sites (لو مش موجودين)
  // =========================
  const client = await prisma.clients.findFirst({
    where: { company_id: companyId },
  });

  if (!client) {
    console.log("⚠️ No client found — create one first");
    return;
  }

  const sites = await prisma.sites.findMany({
    where: { client_id: client.id },
  });

  if (sites.length < 2) {
    console.log("⚠️ Need at least 2 sites to create routes");
    return;
  }

  // =========================
  // 6. Routes
  // =========================
  const routesData = [
    {
      code: "R1",
      name: "القاهرة → الإسكندرية",
      distance_km: 220,
      pickup_site_id: sites[0].id,
      dropoff_site_id: sites[1].id,
    },
    {
      code: "R2",
      name: "القاهرة → السويس",
      distance_km: 140,
      pickup_site_id: sites[0].id,
      dropoff_site_id: sites[1].id,
    },
  ];

  for (const row of routesData) {
    await prisma.routes.create({
      data: {
        company_id: companyId,
        client_id: client.id,
        code: row.code,
        name: row.name,
        pickup_site_id: row.pickup_site_id,
        dropoff_site_id: row.dropoff_site_id,
        distance_km: row.distance_km,
        is_active: true,
      },
    });
  }

  console.log("Routes seeded");

  console.log("=== SEED MASTER DATA DEMO END ===");
}

main()
  .catch((err) => {
    console.error("SEED FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });