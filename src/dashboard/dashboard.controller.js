// =======================
// src/dashboard/dashboard.controller.js
// =======================

const dashboardService = require("./dashboard.service");
const prisma = require("../prisma");

// -----------------------
// helpers
// -----------------------
function parseIntSafe(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

// =======================
// Summary (existing)
// =======================
exports.getDashboardSummary = async (req, res, next) => {
  try {
    const user = req.user;
    const filters = {
      tab: req.query.tab || "operations", // ✅ فعّال دلوقتي
      from: req.query.from,
      to: req.query.to,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
    };
    const data = await dashboardService.getSummary(user, filters);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getDashboardTrends = async (req, res, next) => {
  try {
    const user = req.user;
    const params = {
      metric: req.query.metric || "trips_created",
      bucket: req.query.bucket || "daily",
      from: req.query.from,
      to: req.query.to,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
      vehicleId: req.query.vehicleId,
      cashAdvanceId: req.query.cashAdvanceId,
    };
    const data = await dashboardService.getTrends(user, params);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getDashboardTrendsBundle = async (req, res, next) => {
  try {
    const user = req.user;
    const params = {
      bucket: req.query.bucket || "daily",
      from: req.query.from,
      to: req.query.to,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
      vehicleId: req.query.vehicleId,
      cashAdvanceId: req.query.cashAdvanceId,
    };

    const data = await dashboardService.getTrendsBundle(user, params);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// =======================
// ✅ NEW: Compliance alerts
// GET /dashboard/compliance-alerts?days=30&limit=100
// =======================
exports.getComplianceAlerts = async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseIntSafe(req.query.days, 30)));
    const limit = Math.min(200, Math.max(10, parseIntSafe(req.query.limit, 100)));

    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + days);

    // Vehicles: expiring soon + expired count
    const [vehiclesExpiring, vehiclesExpiringCount, vehiclesExpiredCount] = await Promise.all([
      prisma.vehicles.findMany({
        where: {
          is_active: true,
          license_expiry_date: { gte: now, lte: until },
        },
        orderBy: { license_expiry_date: "asc" },
        take: limit,
        select: {
          id: true,
          fleet_no: true,
          plate_no: true,
          display_name: true,
          status: true,
          is_active: true,
          supervisor_id: true,

          license_no: true,
          license_issue_date: true,
          license_expiry_date: true,
          disable_reason: true,

          updated_at: true,
        },
      }),
      prisma.vehicles.count({
        where: {
          is_active: true,
          license_expiry_date: { gte: now, lte: until },
        },
      }),
      prisma.vehicles.count({
        where: {
          is_active: true,
          license_expiry_date: { lt: now },
        },
      }),
    ]);

    // Drivers: expiring soon + expired count
    const [driversExpiring, driversExpiringCount, driversExpiredCount] = await Promise.all([
      prisma.drivers.findMany({
        where: {
          is_active: true,
          license_expiry_date: { gte: now, lte: until },
          // لو تحب تقييدها بـ status ACTIVE فقط:
          // status: "ACTIVE",
        },
        orderBy: { license_expiry_date: "asc" },
        take: limit,
        select: {
          id: true,
          full_name: true,
          phone: true,
          phone2: true,

          national_id: true,
          hire_date: true,

          license_no: true,
          license_issue_date: true,
          license_expiry_date: true,

          status: true,
          disable_reason: true,
          is_active: true,
          updated_at: true,
        },
      }),
      prisma.drivers.count({
        where: {
          is_active: true,
          license_expiry_date: { gte: now, lte: until },
        },
      }),
      prisma.drivers.count({
        where: {
          is_active: true,
          license_expiry_date: { lt: now },
        },
      }),
    ]);

    return res.json({
      range: { days, limit, now, until },
      counts: {
        vehicles: { expiring: vehiclesExpiringCount, expired: vehiclesExpiredCount },
        drivers: { expiring: driversExpiringCount, expired: driversExpiredCount },
      },
      items: {
        vehicles_expiring: vehiclesExpiring,
        drivers_expiring: driversExpiring,
      },
    });
  } catch (err) {
    next(err);
  }
};