// =======================
// src/dashboard/alerts.controller.js
// =======================

const alertsService = require("./alerts.service");

function parseIntSafe(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

exports.getDashboardAlerts = async (req, res, next) => {
  try {
    const user = req.user;

    const filters = {
      limit: Math.min(200, Math.max(1, parseIntSafe(req.query.limit, 50))),
      area: req.query.area,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
    };

    const data = await alertsService.getAlerts(user, filters);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getDashboardAlertsSummary = async (req, res, next) => {
  try {
    const user = req.user;

    const filters = {
      area: req.query.area,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
    };

    const data = await alertsService.getAlertsSummary(user, filters);
    res.json(data);
  } catch (err) {
    next(err);
  }
};