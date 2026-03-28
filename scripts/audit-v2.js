require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("=== V2 AUDIT START ===\n");

  await auditVehicles();
  await auditSupervisorAssignments();
  await auditCashExpenses();
  await auditInventory();
  await auditTripAssignments();

  console.log("\n=== V2 AUDIT END ===");
}

async function auditVehicles() {
  console.log("---- Vehicles Audit ----");

  const duplicateChassis = await prisma.vehicles.groupBy({
    by: ["chassis_no"],
    _count: { chassis_no: true },
    where: {
      chassis_no: { not: null },
    },
    having: {
      chassis_no: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  const duplicateEngines = await prisma.vehicles.groupBy({
    by: ["engine_no"],
    _count: { engine_no: true },
    where: {
      engine_no: { not: null },
    },
    having: {
      engine_no: {
        _count: {
          gt: 1,
        },
      },
    },
  });

  const disabledWithoutReason = await prisma.vehicles.findMany({
    where: {
      status: "DISABLED",
      disable_reason: null,
    },
    select: {
      id: true,
      fleet_no: true,
      plate_no: true,
      status: true,
      disable_reason: true,
    },
  });

  console.log("Duplicate chassis_no groups:", duplicateChassis.length);
  console.log("Duplicate engine_no groups:", duplicateEngines.length);
  console.log("Disabled vehicles without disable_reason:", disabledWithoutReason.length);
  console.log("");
}

async function auditSupervisorAssignments() {
  console.log("---- Supervisor Assignments Audit ----");

  const assignments = await prisma.supervisor_assignments.findMany({
    where: { is_active: true },
    select: {
      id: true,
      supervisor_id: true,
      role_scope: true,
      department_id: true,
      fleet_id: true,
      site_id: true,
    },
  });

  const invalid = assignments.filter((a) => {
    if (a.role_scope === "DEPARTMENT") {
      return !a.department_id || a.fleet_id || a.site_id;
    }
    if (a.role_scope === "FLEET") {
      return !a.fleet_id || a.site_id;
    }
    if (a.role_scope === "SITE") {
      return !a.site_id || a.fleet_id;
    }
    if (a.role_scope === "FLEET_SITE") {
      return !a.fleet_id || !a.site_id;
    }
    return false;
  });

  const grouped = new Map();
  for (const a of assignments) {
    const key = [
      a.supervisor_id,
      a.role_scope,
      a.department_id || "null",
      a.fleet_id || "null",
      a.site_id || "null",
    ].join("|");

    grouped.set(key, (grouped.get(key) || 0) + 1);
  }

  const duplicates = [...grouped.entries()].filter(([, count]) => count > 1);

  console.log("Invalid active scope assignments:", invalid.length);
  console.log("Duplicate active scope assignments:", duplicates.length);
  console.log("");
}

async function auditCashExpenses() {
  console.log("---- Cash Expenses Audit ----");

  const all = await prisma.cash_expenses.findMany({
    select: {
      id: true,
      cash_advance_id: true,
      trip_id: true,
      vehicle_id: true,
      maintenance_work_order_id: true,
      inventory_receipt_id: true,
      vendor_id: true,
      payment_source: true,
      module_source: true,
      invoice_no: true,
    },
  });

  const ambiguous = all.filter((e) => {
    const refs = [
      e.trip_id,
      e.maintenance_work_order_id,
      e.inventory_receipt_id,
    ].filter(Boolean).length;

    return refs > 1;
  });

  const advanceWithoutAdvanceId = all.filter(
    (e) => e.payment_source === "ADVANCE" && !e.cash_advance_id
  );

  const maintenanceWithoutWorkOrder = all.filter(
    (e) => e.module_source === "MAINTENANCE" && !e.maintenance_work_order_id
  );

  const inventoryWithoutReceipt = all.filter(
    (e) => e.module_source === "INVENTORY" && !e.inventory_receipt_id
  );

  const tripWithoutTrip = all.filter(
    (e) => e.module_source === "TRIP" && !e.trip_id
  );

  console.log("Ambiguous module-linked expenses:", ambiguous.length);
  console.log("ADVANCE expenses without cash_advance_id:", advanceWithoutAdvanceId.length);
  console.log("MAINTENANCE module_source without work order:", maintenanceWithoutWorkOrder.length);
  console.log("INVENTORY module_source without receipt:", inventoryWithoutReceipt.length);
  console.log("TRIP module_source without trip_id:", tripWithoutTrip.length);
  console.log("");
}

async function auditInventory() {
  console.log("---- Inventory Audit ----");

  const parts = await prisma.parts.findMany({
    select: {
      id: true,
      part_number: true,
      tracking_mode: true,
      _count: {
        select: {
          part_items: true,
          inventory_receipt_bulk_lines: true,
        },
      },
    },
  });

  const suspiciousParts = parts.filter((p) => {
    if (p.tracking_mode === "SERIALIZED" && p._count.inventory_receipt_bulk_lines > 0) {
      return true;
    }
    if (p.tracking_mode === "BULK" && p._count.part_items > 0) {
      return true;
    }
    return false;
  });

  const reservations = await prisma.inventory_request_reservations.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      part_item_id: true,
    },
  });

  const reservationCount = new Map();
  for (const r of reservations) {
    reservationCount.set(r.part_item_id, (reservationCount.get(r.part_item_id) || 0) + 1);
  }

  const duplicateActiveReservations = [...reservationCount.entries()].filter(
    ([, count]) => count > 1
  );

  console.log("Suspicious parts vs tracking_mode:", suspiciousParts.length);
  console.log("Duplicate ACTIVE reservations on same part_item:", duplicateActiveReservations.length);
  console.log("");
}

async function auditTripAssignments() {
  console.log("---- Trip Assignments Audit ----");

  const activeAssignments = await prisma.trip_assignments.findMany({
    where: { is_active: true },
    select: {
      id: true,
      trip_id: true,
      vehicle_id: true,
      driver_id: true,
    },
  });

  const vehicleMap = new Map();
  const driverMap = new Map();

  for (const a of activeAssignments) {
    vehicleMap.set(a.vehicle_id, (vehicleMap.get(a.vehicle_id) || 0) + 1);
    driverMap.set(a.driver_id, (driverMap.get(a.driver_id) || 0) + 1);
  }

  const duplicateVehicleAssignments = [...vehicleMap.entries()].filter(([, c]) => c > 1);
  const duplicateDriverAssignments = [...driverMap.entries()].filter(([, c]) => c > 1);

  console.log("Vehicles in multiple active trip assignments:", duplicateVehicleAssignments.length);
  console.log("Drivers in multiple active trip assignments:", duplicateDriverAssignments.length);
  console.log("");
}

main()
  .catch((e) => {
    console.error("AUDIT FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });