// =======================
// src/jobs/driverLicense.job.js
// =======================

const cron = require("node-cron");
const prisma = require("../prisma");

async function runDriverLicenseSweepOnce() {
  console.log("Checking driver license expiry...");

  try {
    const now = new Date();

    const expiredDrivers = await prisma.drivers.findMany({
      where: {
        is_active: true,
        license_expiry_date: {
          not: null,
          lt: now,
        },
      },
      select: {
        id: true,
      },
    });

    if (!expiredDrivers.length) {
      console.log("No expired driver licenses");
      return;
    }

    const ids = expiredDrivers.map((d) => d.id);

    await prisma.drivers.updateMany({
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

    console.log(`Disabled drivers: ${ids.length}`);
  } catch (err) {
    console.error("Driver license sweep error:", err);
  }
}

// =======================
// Cron job
// =======================

function startDriverLicenseMonitor() {
  console.log("Driver license monitor started");

  // run once on startup
  runDriverLicenseSweepOnce().catch((err) => {
    console.error("Initial driver license sweep error:", err);
  });

  // every hour
  cron.schedule("0 * * * *", async () => {
    await runDriverLicenseSweepOnce();
  });
}

module.exports = {
  startDriverLicenseMonitor,
  runDriverLicenseSweepOnce,
};