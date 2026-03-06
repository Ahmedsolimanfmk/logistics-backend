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

function daysDiff(from, to) {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// =======================
// Summary (existing)
// =======================
exports.getDashboardSummary = async (req, res, next) => {
  try {
    const user = req.user;
    const filters = {
      tab: req.query.tab || "operations",
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
// Compliance alerts
// GET /dashboard/compliance-alerts?days=30&limit=100
// =======================
exports.getComplianceAlerts = async (req, res, next) => {
  try {
    const days = Math.min(365, Math.max(1, parseIntSafe(req.query.days, 30)));
    const limit = Math.min(200, Math.max(10, parseIntSafe(req.query.limit, 100)));

    const now = new Date();
    const until = new Date(now);
    until.setDate(until.getDate() + days);

    const [
      vehiclesExpiring,
      vehiclesExpired,
      vehiclesExpiringCount,
      vehiclesExpiredCount,
      driversExpiring,
      driversExpired,
      driversExpiringCount,
      driversExpiredCount,
    ] = await Promise.all([
      prisma.vehicles.findMany({
        where: {
          license_expiry_date: {
            not: null,
            gte: now,
            lte: until,
          },
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

      prisma.vehicles.findMany({
        where: {
          license_expiry_date: {
            not: null,
            lt: now,
          },
        },
        orderBy: { license_expiry_date: "desc" },
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
          license_expiry_date: {
            not: null,
            gte: now,
            lte: until,
          },
        },
      }),

      prisma.vehicles.count({
        where: {
          license_expiry_date: {
            not: null,
            lt: now,
          },
        },
      }),

      prisma.drivers.findMany({
        where: {
          license_expiry_date: {
            not: null,
            gte: now,
            lte: until,
          },
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

      prisma.drivers.findMany({
        where: {
          license_expiry_date: {
            not: null,
            lt: now,
          },
        },
        orderBy: { license_expiry_date: "desc" },
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
          license_expiry_date: {
            not: null,
            gte: now,
            lte: until,
          },
        },
      }),

      prisma.drivers.count({
        where: {
          license_expiry_date: {
            not: null,
            lt: now,
          },
        },
      }),
    ]);

    const mapVehicleExpiring = vehiclesExpiring.map((v) => ({
      ...v,
      days_left: v.license_expiry_date ? daysDiff(now, new Date(v.license_expiry_date)) : null,
    }));

    const mapVehicleExpired = vehiclesExpired.map((v) => ({
      ...v,
      days_overdue: v.license_expiry_date
        ? daysDiff(new Date(v.license_expiry_date), now)
        : null,
    }));

    const mapDriverExpiring = driversExpiring.map((d) => ({
      ...d,
      days_left: d.license_expiry_date ? daysDiff(now, new Date(d.license_expiry_date)) : null,
    }));

    const mapDriverExpired = driversExpired.map((d) => ({
      ...d,
      days_overdue: d.license_expiry_date
        ? daysDiff(new Date(d.license_expiry_date), now)
        : null,
    }));

    return res.json({
      range: { days, limit, now, until },
      counts: {
        vehicles: {
          expiring: vehiclesExpiringCount,
          expired: vehiclesExpiredCount,
        },
        drivers: {
          expiring: driversExpiringCount,
          expired: driversExpiredCount,
        },
      },
      items: {
        vehicles_expiring: mapVehicleExpiring,
        vehicles_expired: mapVehicleExpired,
        drivers_expiring: mapDriverExpiring,
        drivers_expired: mapDriverExpired,
      },
    });
  } catch (err) {
    next(err);
  }
};