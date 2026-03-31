const dashboardService = require("./dashboard.service");
const alertsService = require("./alerts.service");

function parseIntSafe(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

async function getDashboardSummary(req, res, next) {
  try {
    const user = req.user;
    const filters = {
      companyId: req.companyId,
      tab: req.query.tab || "operations",
      from: req.query.from,
      to: req.query.to,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
    };

    const data = await dashboardService.getSummary(user, filters);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function getDashboardTrends(req, res, next) {
  try {
    const user = req.user;
    const params = {
      companyId: req.companyId,
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
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

async function getDashboardTrendsBundle(req, res, next) {
  try {
    const user = req.user;
    const params = {
      companyId: req.companyId,
      bucket: req.query.bucket || "daily",
      from: req.query.from,
      to: req.query.to,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
      vehicleId: req.query.vehicleId,
      cashAdvanceId: req.query.cashAdvanceId,
    };

    const data = await dashboardService.getTrendsBundle(user, params);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

// GET /dashboard/compliance-alerts?days=30&limit=100
async function getComplianceAlerts(req, res, next) {
  try {
    const days = Math.min(365, Math.max(1, parseIntSafe(req.query.days, 30)));
    const limit = Math.min(200, Math.max(10, parseIntSafe(req.query.limit, 100)));

    const data = await alertsService.getComplianceSnapshot(req.companyId, {
      daysWindow: days,
      limit,
    });

    return res.json(data);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getDashboardSummary,
  getDashboardTrends,
  getDashboardTrendsBundle,
  getComplianceAlerts,
};