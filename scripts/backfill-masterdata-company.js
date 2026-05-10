require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

// =======================
// HELPERS
// =======================
async function getAnyUser() {
  const user = await prisma.users.findFirst();
  if (!user) throw new Error("❌ No users found in DB");
  return user;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// =======================
// COMPANY
// =======================
async function createCompany(name) {
  const code = name.toUpperCase().replace(/\s/g, "_");

  return prisma.companies.upsert({
    where: { code },
    update: {},
    create: {
      name,
      code,
      base_currency: "EGP",
    },
  });
}

// =======================
// CLIENT
// =======================
async function createClient(company) {
  return prisma.clients.create({
    data: {
      name: `Client ${company.name}`,
      company_id: company.id,
    },
  });
}

// =======================
// DRIVER
// =======================
async function createDriver(company) {
  const phone =
    "010" + Math.floor(100000000 + Math.random() * 900000000);

  return prisma.drivers.create({
    data: {
      full_name: `Driver ${company.name}`,
      phone,
      company_id: company.id,
    },
  });
}

// =======================
// VEHICLE
// =======================
async function createVehicle(company) {
  return prisma.vehicles.create({
    data: {
      plate_no: Math.random().toString(36).slice(2, 8),
      fleet_no: "F-" + Math.floor(Math.random() * 1000),
      company_id: company.id,
    },
  });
}

// =======================
// SITE (FIXED SAFE)
// =======================
async function createSite(company, client) {
  return prisma.sites.upsert({
    where: {
      company_id_client_id_name: {
        company_id: company.id,
        client_id: client.id,
        name: `Main Site ${company.name}`,
      },
    },
    update: {},
    create: {
      name: `Main Site ${company.name}`,
      company_id: company.id,
      client_id: client.id, // 🔥 أهم سطر
    },
  });
}

// =======================
// TRIP FLOW (SAFE)
// =======================
async function createTripFlow(company, client, driver, vehicle, site) {
  const revenue = 5000 + Math.floor(Math.random() * 5000);
  const user = await getAnyUser();

 const trip = await prisma.trips.create({
  data: {
    trip_code:
      "TRIP-" + Date.now() + "-" + Math.floor(Math.random() * 1000),

    // 🔥 أهم 4 سطور
    company_id: company.id,
    client_id: client.id,
    site_id: site.id,
    created_by: user.id,

    origin: "القاهرة",
    destination: "الإسكندرية",
    status: "COMPLETED",
    agreed_revenue: revenue,
  },
});

  return trip;
}

// =======================
// DEMO PER COMPANY
// =======================
async function createDemoForCompany(company) {
  const client = await createClient(company);
  const driver = await createDriver(company);
  const vehicle = await createVehicle(company);
  const site = await createSite(company);

  console.log("SITE CREATED:", site?.id);

  for (let i = 0; i < 3; i++) {
    await createTripFlow(company, client, driver, vehicle, site);
  }
}

// =======================
// MAIN
// =======================
async function main() {
  console.log("=== MULTI COMPANY DEMO START ===");

  await prisma.$queryRaw`SELECT 1`;
  console.log("🔥 DB warmed up");

  const companies = [
    "Transport Pro",
    "Contractor One",
    "Heavy Contractor",
  ];

  for (const name of companies) {
    const company = await createCompany(name);
    await createDemoForCompany(company);

    await sleep(1000);
  }

  console.log("✅ DEMO READY");
}

main()
  .catch((e) => {
    console.error("❌ ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });