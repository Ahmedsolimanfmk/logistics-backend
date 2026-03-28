require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== BACKFILL STRUCTURE COMPANY START ===");

  const fleetVehicles = await prisma.fleet_vehicles.findMany({
    select: {
      id: true,
      company_id: true,
      fleet_id: true,
      vehicle_id: true,
    },
  });

  let fleetVehiclesUpdated = 0;

  for (const row of fleetVehicles) {
    if (row.company_id) continue;

    const fleet = await prisma.fleets.findUnique({
      where: { id: row.fleet_id },
      select: { company_id: true },
    });

    const vehicle = await prisma.vehicles.findUnique({
      where: { id: row.vehicle_id },
      select: { company_id: true },
    });

    if (!fleet?.company_id) {
      throw new Error(`Fleet ${row.fleet_id} has no company_id`);
    }

    if (!vehicle?.company_id) {
      throw new Error(`Vehicle ${row.vehicle_id} has no company_id`);
    }

    if (fleet.company_id !== vehicle.company_id) {
      throw new Error(`Company mismatch in fleet_vehicles ${row.id}`);
    }

    await prisma.fleet_vehicles.update({
      where: { id: row.id },
      data: { company_id: fleet.company_id },
    });

    fleetVehiclesUpdated += 1;
  }

  const fleetSites = await prisma.fleet_site_assignments.findMany({
    select: {
      id: true,
      company_id: true,
      fleet_id: true,
      site_id: true,
    },
  });

  let fleetSitesUpdated = 0;

  for (const row of fleetSites) {
    if (row.company_id) continue;

    const fleet = await prisma.fleets.findUnique({
      where: { id: row.fleet_id },
      select: { company_id: true },
    });

    const site = await prisma.sites.findUnique({
      where: { id: row.site_id },
      select: { company_id: true },
    });

    if (!fleet?.company_id) {
      throw new Error(`Fleet ${row.fleet_id} has no company_id`);
    }

    if (!site?.company_id) {
      throw new Error(`Site ${row.site_id} has no company_id`);
    }

    if (fleet.company_id !== site.company_id) {
      throw new Error(`Company mismatch in fleet_site_assignments ${row.id}`);
    }

    await prisma.fleet_site_assignments.update({
      where: { id: row.id },
      data: { company_id: fleet.company_id },
    });

    fleetSitesUpdated += 1;
  }

  const supervisors = await prisma.supervisor_assignments.findMany({
    select: {
      id: true,
      company_id: true,
      department_id: true,
      fleet_id: true,
      site_id: true,
    },
  });

  let supervisorsUpdated = 0;

  for (const row of supervisors) {
    if (row.company_id) continue;

    let derivedCompanyId = null;

    if (row.department_id) {
      const department = await prisma.departments.findUnique({
        where: { id: row.department_id },
        select: { company_id: true },
      });
      derivedCompanyId = department?.company_id ?? null;
    }

    if (!derivedCompanyId && row.fleet_id) {
      const fleet = await prisma.fleets.findUnique({
        where: { id: row.fleet_id },
        select: { company_id: true },
      });
      derivedCompanyId = fleet?.company_id ?? null;
    }

    if (!derivedCompanyId && row.site_id) {
      const site = await prisma.sites.findUnique({
        where: { id: row.site_id },
        select: { company_id: true },
      });
      derivedCompanyId = site?.company_id ?? null;
    }

    if (!derivedCompanyId) {
      throw new Error(`Could not derive company_id for supervisor_assignment ${row.id}`);
    }

    await prisma.supervisor_assignments.update({
      where: { id: row.id },
      data: { company_id: derivedCompanyId },
    });

    supervisorsUpdated += 1;
  }

  console.log("Fleet vehicles updated:", fleetVehiclesUpdated);
  console.log("Fleet site assignments updated:", fleetSitesUpdated);
  console.log("Supervisor assignments updated:", supervisorsUpdated);
  console.log("=== BACKFILL STRUCTURE COMPANY END ===");
}

main()
  .catch((error) => {
    console.error("BACKFILL STRUCTURE COMPANY FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });