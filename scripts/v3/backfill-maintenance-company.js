require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== BACKFILL MAINTENANCE COMPANY START ===");

  const requests = await prisma.maintenance_requests.findMany({
    select: {
      id: true,
      company_id: true,
      vehicle_id: true,
    },
  });

  let requestsUpdated = 0;

  for (const row of requests) {
    if (row.company_id) continue;

    const vehicle = await prisma.vehicles.findUnique({
      where: { id: row.vehicle_id },
      select: { company_id: true },
    });

    if (!vehicle?.company_id) {
      throw new Error(`Vehicle ${row.vehicle_id} has no company_id for maintenance_request ${row.id}`);
    }

    await prisma.maintenance_requests.update({
      where: { id: row.id },
      data: { company_id: vehicle.company_id },
    });

    requestsUpdated += 1;
  }

  const attachments = await prisma.maintenance_request_attachments.findMany({
    select: {
      id: true,
      company_id: true,
      request_id: true,
    },
  });

  let attachmentsUpdated = 0;

  for (const row of attachments) {
    if (row.company_id) continue;

    const request = await prisma.maintenance_requests.findUnique({
      where: { id: row.request_id },
      select: { company_id: true },
    });

    if (!request?.company_id) {
      throw new Error(`Request ${row.request_id} has no company_id for attachment ${row.id}`);
    }

    await prisma.maintenance_request_attachments.update({
      where: { id: row.id },
      data: { company_id: request.company_id },
    });

    attachmentsUpdated += 1;
  }

  const workOrders = await prisma.maintenance_work_orders.findMany({
    select: {
      id: true,
      company_id: true,
      vehicle_id: true,
      request_id: true,
      vendor_id: true,
    },
  });

  let workOrdersUpdated = 0;

  for (const row of workOrders) {
    if (row.company_id) continue;

    const vehicle = await prisma.vehicles.findUnique({
      where: { id: row.vehicle_id },
      select: { company_id: true },
    });

    if (!vehicle?.company_id) {
      throw new Error(`Vehicle ${row.vehicle_id} has no company_id for work_order ${row.id}`);
    }

    if (row.request_id) {
      const request = await prisma.maintenance_requests.findUnique({
        where: { id: row.request_id },
        select: { company_id: true },
      });

      if (!request?.company_id || request.company_id !== vehicle.company_id) {
        throw new Error(`Request/company mismatch in work_order ${row.id}`);
      }
    }

    if (row.vendor_id) {
      const vendor = await prisma.vendors.findUnique({
        where: { id: row.vendor_id },
        select: { company_id: true },
      });

      if (!vendor?.company_id || vendor.company_id !== vehicle.company_id) {
        throw new Error(`Vendor/company mismatch in work_order ${row.id}`);
      }
    }

    await prisma.maintenance_work_orders.update({
      where: { id: row.id },
      data: { company_id: vehicle.company_id },
    });

    workOrdersUpdated += 1;
  }

  const events = await prisma.maintenance_work_order_events.findMany({
    select: {
      id: true,
      company_id: true,
      work_order_id: true,
    },
  });

  let eventsUpdated = 0;

  for (const row of events) {
    if (row.company_id) continue;

    const workOrder = await prisma.maintenance_work_orders.findUnique({
      where: { id: row.work_order_id },
      select: { company_id: true },
    });

    if (!workOrder?.company_id) {
      throw new Error(`Work order ${row.work_order_id} has no company_id for event ${row.id}`);
    }

    await prisma.maintenance_work_order_events.update({
      where: { id: row.id },
      data: { company_id: workOrder.company_id },
    });

    eventsUpdated += 1;
  }

  const reports = await prisma.post_maintenance_reports.findMany({
    select: {
      id: true,
      company_id: true,
      work_order_id: true,
    },
  });

  let reportsUpdated = 0;

  for (const row of reports) {
    if (row.company_id) continue;

    const workOrder = await prisma.maintenance_work_orders.findUnique({
      where: { id: row.work_order_id },
      select: { company_id: true },
    });

    if (!workOrder?.company_id) {
      throw new Error(`Work order ${row.work_order_id} has no company_id for post report ${row.id}`);
    }

    await prisma.post_maintenance_reports.update({
      where: { id: row.id },
      data: { company_id: workOrder.company_id },
    });

    reportsUpdated += 1;
  }

  console.log("Maintenance requests updated:", requestsUpdated);
  console.log("Maintenance request attachments updated:", attachmentsUpdated);
  console.log("Maintenance work orders updated:", workOrdersUpdated);
  console.log("Maintenance work order events updated:", eventsUpdated);
  console.log("Post maintenance reports updated:", reportsUpdated);
  console.log("=== BACKFILL MAINTENANCE COMPANY END ===");
}

main()
  .catch((error) => {
    console.error("BACKFILL MAINTENANCE COMPANY FAILED:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });