require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== V2 BACKFILL START ===\n");

  await backfillPartsTrackingMode();
  await backfillTripRevenueStatus();
  await backfillCashExpenseModuleSource();
  await backfillInventoryReservationStatus();

  console.log("\n=== V2 BACKFILL END ===");
}

async function backfillPartsTrackingMode() {
  console.log("---- Backfill parts.tracking_mode ----");

  const parts = await prisma.parts.findMany({
    select: {
      id: true,
      tracking_mode: true,
      _count: {
        select: {
          part_items: true,
          inventory_receipt_bulk_lines: true,
        },
      },
    },
  });

  let updated = 0;

  for (const part of parts) {
    const hasSerialized = part._count.part_items > 0;
    const hasBulk = part._count.inventory_receipt_bulk_lines > 0;

    let nextMode = part.tracking_mode;

    if (hasSerialized && hasBulk) nextMode = "BOTH";
    else if (hasSerialized) nextMode = "SERIALIZED";
    else if (hasBulk) nextMode = "BULK";

    if (nextMode !== part.tracking_mode) {
      await prisma.parts.update({
        where: { id: part.id },
        data: { tracking_mode: nextMode },
      });
      updated++;
    }
  }

  console.log("Updated parts.tracking_mode:", updated);
  console.log("");
}

async function backfillTripRevenueStatus() {
  console.log("---- Backfill trip_revenues.status ----");

  const revenues = await prisma.trip_revenues.findMany({
    select: {
      id: true,
      invoice_id: true,
      approved_by: true,
      status: true,
    },
  });

  let updated = 0;

  for (const row of revenues) {
    let nextStatus = row.status;

    if (row.invoice_id) nextStatus = "INVOICED";
    else if (row.approved_by) nextStatus = "APPROVED";
    else nextStatus = "DRAFT";

    if (nextStatus !== row.status) {
      await prisma.trip_revenues.update({
        where: { id: row.id },
        data: { status: nextStatus },
      });
      updated++;
    }
  }

  console.log("Updated trip_revenues.status:", updated);
  console.log("");
}

async function backfillCashExpenseModuleSource() {
  console.log("---- Backfill cash_expenses.module_source ----");

  const expenses = await prisma.cash_expenses.findMany({
    select: {
      id: true,
      trip_id: true,
      maintenance_work_order_id: true,
      inventory_receipt_id: true,
      module_source: true,
    },
  });

  let updated = 0;

  for (const row of expenses) {
    let nextModuleSource = "GENERAL";

    if (row.trip_id) nextModuleSource = "TRIP";
    if (row.maintenance_work_order_id) nextModuleSource = "MAINTENANCE";
    if (row.inventory_receipt_id) nextModuleSource = "INVENTORY";

    if (nextModuleSource !== row.module_source) {
      await prisma.cash_expenses.update({
        where: { id: row.id },
        data: { module_source: nextModuleSource },
      });
      updated++;
    }
  }

  console.log("Updated cash_expenses.module_source:", updated);
  console.log("");
}

async function backfillInventoryReservationStatus() {
  console.log("---- Backfill inventory_request_reservations.status ----");

  const reservations = await prisma.inventory_request_reservations.findMany({
    select: {
      id: true,
      status: true,
      released_at: true,
      part_item: {
        select: {
          status: true,
        },
      },
    },
  });

  let updated = 0;

  for (const row of reservations) {
    let nextStatus = row.status;

    if (row.released_at) {
      nextStatus = "RELEASED";
    } else if (row.part_item?.status === "ISSUED" || row.part_item?.status === "INSTALLED") {
      nextStatus = "CONSUMED";
    } else {
      nextStatus = "ACTIVE";
    }

    if (nextStatus !== row.status) {
      await prisma.inventory_request_reservations.update({
        where: { id: row.id },
        data: { status: nextStatus },
      });
      updated++;
    }
  }

  console.log("Updated inventory_request_reservations.status:", updated);
  console.log("");
}

main()
  .catch((e) => {
    console.error("BACKFILL FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });