// src/dashboard/dashboard.controller.js
const dashboardService = require("./dashboard.service");

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
