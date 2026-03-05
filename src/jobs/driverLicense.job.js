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
        status: "SUSPENDED",
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

  // كل ساعة
  cron.schedule("0 * * * *", async () => {
    await runDriverLicenseSweepOnce();
  });
}

module.exports = {
  startDriverLicenseMonitor,
  runDriverLicenseSweepOnce,
};