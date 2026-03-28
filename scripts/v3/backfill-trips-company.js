require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== BACKFILL TRIPS COMPANY START ===");

  const trips = await prisma.trips.findMany({
    select: {
      id: true,
      company_id: true,
      client_id: true,
      site_id: true,
    },
  });

  let tripsUpdated = 0;

  for (const row of trips) {
    if (row.company_id) continue;

    const client = await prisma.clients.findUnique({
      where: { id: row.client_id },
      select: { company_id: true },
    });

    const site = await prisma.sites.findUnique({
      where: { id: row.site_id },
      select: { company_id: true },
    });

    if (!client?.company_id) {
      throw new Error(`Client ${row.client_id} has no company_id`);
    }

    if (!site?.company_id) {
      throw new Error(`Site ${row.site_id} has no company_id`);
    }

    if (client.company_id !== site.company_id) {
      throw new Error(`Company mismatch in trip ${row.id}`);
    }

    await prisma.trips.update({
      where: { id: row.id },
      data: { company_id: client.company_id },
    });

    tripsUpdated += 1;
  }

  const assignments = await prisma.trip_assignments.findMany({
    select: {
      id: true,
      company_id: true,
      trip_id: true,
      vehicle_id: true,
      driver_id: true,
    },
  });

  let assignmentsUpdated = 0;

  for (const row of assignments) {
    if (row.company_id) continue;

    const trip = await prisma.trips.findUnique({
      where: { id: row.trip_id },
      select: { company_id: true },
    });

    const vehicle = await prisma.vehicles.findUnique({
      where: { id: row.vehicle_id },
      select: { company_id: true },
    });

    const driver = await prisma.drivers.findUnique({
      where: { id: row.driver_id },
      select: { company_id: true },
    });

    if (!trip?.company_id || !vehicle?.company_id || !driver?.company_id) {
      throw new Error(`Missing company_id in trip assignment ${row.id}`);
    }

    if (trip.company_id !== vehicle.company_id || trip.company_id !== driver.company_id) {
      throw new Error(`Company mismatch in trip assignment ${row.id}`);
    }

    await prisma.trip_assignments.update({
      where: { id: row.id },
      data: { company_id: trip.company_id },
    });

    assignmentsUpdated += 1;
  }

  const events = await prisma.trip_events.findMany({
    select: {
      id: true,
      company_id: true,
      trip_id: true,
    },
  });

  let eventsUpdated = 0;

  for (const row of events) {
    if (row.company_id) continue;

    const trip = await prisma.trips.findUnique({
      where: { id: row.trip_id },
      select: { company_id: true },
    });

    if (!trip?.company_id) {
      throw new Error(`Trip ${row.trip_id} has no company_id for trip_event ${row.id}`);
    }

    await prisma.trip_events.update({
      where: { id: row.id },
      data: { company_id: trip.company_id },
    });

    eventsUpdated += 1;
  }

  const revenues = await prisma.trip_revenues.findMany({
    select: {
      id: true,
      company_id: true,
      trip_id: true,
      client_id: true,
    },
  });

  let revenuesUpdated = 0;

  for (const row of revenues) {
    if (row.company_id) continue;

    const trip = await prisma.trips.findUnique({
      where: { id: row.trip_id },
      select: { company_id: true },
    });

    const client = await prisma.clients.findUnique({
      where: { id: row.client_id },
      select: { company_id: true },
    });

    if (!trip?.company_id || !client?.company_id) {
      throw new Error(`Missing company_id in trip_revenue ${row.id}`);
    }

    if (trip.company_id !== client.company_id) {
      throw new Error(`Company mismatch in trip_revenue ${row.id}`);
    }

    await prisma.trip_revenues.update({
      where: { id: row.id },
      data: { company_id: trip.company_id },
    });

    revenuesUpdated += 1;
  }

  console.log("Trips updated:", tripsUpdated);
  console.log("Trip assignments updated:", assignmentsUpdated);
  console.log("Trip events updated:", eventsUpdated);
  console.log("Trip revenues updated:", revenuesUpdated);
  console.log("=== BACKFILL TRIPS COMPANY END ===");
}

main()
  .catch((error) => {
    console.error("BACKFILL TRIPS COMPANY FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });