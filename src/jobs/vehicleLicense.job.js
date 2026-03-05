// =======================
// src/jobs/vehicleLicense.job.js
// =======================

const cron = require("node-cron");
const prisma = require("../prisma");

function isExpired(date) {
  if (!date) return false;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

// =======================
// Disable expired vehicles
// =======================

async function runVehicleLicenseSweepOnce() {
  console.log("Checking vehicle license expiry...");

  try {
    const now = new Date();

    const expiredVehicles = await prisma.vehicles.findMany({
      where: {
        is_active: true,
        license_expiry_date: {
          lt: now,
        },
      },
      select: {
        id: true,
      },
    });

    if (!expiredVehicles.length) {
      console.log("No expired vehicle licenses");
      return;
    }

    const ids = expiredVehicles.map((v) => v.id);

    await prisma.vehicles.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        is_active: false,
        status: "DISABLED",
        disable_reason: "LICENSE_EXPIRED",
        updated_at: new Date(),
      },
    });

    console.log(`Disabled vehicles: ${ids.length}`);
  } catch (err) {
    console.error("Vehicle license sweep error:", err);
  }
}

// =======================
// Cron job
// =======================

function startVehicleLicenseMonitor() {
  console.log("Vehicle license monitor started");

  // كل ساعة
  cron.schedule("0 * * * *", async () => {
    await runVehicleLicenseSweepOnce();
  });
}

module.exports = {
  startVehicleLicenseMonitor,
  runVehicleLicenseSweepOnce,
};