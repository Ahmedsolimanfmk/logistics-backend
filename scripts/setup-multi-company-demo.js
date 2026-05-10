require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

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
  const rand = Date.now() + "-" + Math.floor(Math.random() * 10000);

  return prisma.vehicles.create({
    data: {
      company_id: company.id,
      fleet_no: "F-" + rand,
      plate_no: "P-" + rand,
      chassis_no: "C-" + rand,
      engine_no: "E-" + rand,
      display_name: `Truck ${rand}`,
    },
  });
}

// =======================
// SITE
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
      client_id: client.id,
    },
  });
}

// =======================
// TRIP FLOW
// =======================
async function createTripFlow(company, client, driver, vehicle, site) {
  const revenue = 5000 + Math.floor(Math.random() * 5000);
  const user = await getAnyUser();

  const trip = await prisma.trips.create({
    data: {
      trip_code:
        "TRIP-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
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

  // =======================
  // ASSIGNMENT
  // =======================
  await prisma.trip_assignments.create({
    data: {
      company: { connect: { id: company.id } },
      trip: { connect: { id: trip.id } },
      driver: { connect: { id: driver.id } },
      vehicle: { connect: { id: vehicle.id } },
    },
  });

  // =======================
  // REVENUE
  // =======================
  await prisma.trip_revenues.create({
    data: {
      trip: { connect: { id: trip.id } },
      company: { connect: { id: company.id } },
      client: { connect: { id: client.id } },
      amount: revenue,
      status: "APPROVED",
    },
  });

  // =======================
  // DRIVER CUSTODY ✅ FIXED
  // =======================
  await prisma.driver_custody.create({
    data: {
      company: { connect: { id: company.id } },
      trip: { connect: { id: trip.id } },
      driver: { connect: { id: driver.id } },

      type: "TRANSFER",
      amount: revenue - 2000,
    },
  });

  return trip;
}

// =======================
// DEMO
// =======================
async function createDemoForCompany(company) {
  const client = await createClient(company);
  const driver = await createDriver(company);
  const vehicle = await createVehicle(company);
  const site = await createSite(company, client);

  console.log("SITE CREATED:", site.id);

  for (let i = 0; i < 3; i++) {
    await createTripFlow(company, client, driver, vehicle, site);
  }
}

// =======================
// MAIN
// =======================
async function main() {
  console.log("🔥 RUNNING FINAL VERSION");

  await prisma.$queryRaw`SELECT 1`;

  const companies = [
    "Transport Pro",
    "Contractor One",
    "Heavy Contractor",
  ];

  for (const name of companies) {
    const company = await createCompany(name);
    await createDemoForCompany(company);
    await sleep(300);
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