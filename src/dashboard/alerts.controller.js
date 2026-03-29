// =======================
// src/dashboard/alerts.controller.js
// =======================

const alertsService = require("./alerts.service");

function parseIntSafe(v, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseReadStatus(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "read" || s === "unread") return s;
  return "all";
}

exports.getDashboardAlerts = async (req, res, next) => {
  try {
    const user = req.user;

    const filters = {
      companyId: req.companyId,
      limit: Math.min(200, Math.max(1, parseIntSafe(req.query.limit, 50))),
      area: req.query.area,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
      readStatus: parseReadStatus(req.query.read_status),
    };

    const data = await alertsService.getAlerts(user, filters);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
};

exports.getDashboardAlertsSummary = async (req, res, next) => {
  try {
    const user = req.user;

    const filters = {
      companyId: req.companyId,
      area: req.query.area,
      clientId: req.query.clientId,
      siteId: req.query.siteId,
    };

    const data = await alertsService.getAlertsSummary(user, filters);
    return res.json(data);
  } catch (err) {
    return next(err);
  }
};

exports.markAlertRead = async (req, res, next) => {
  try {
    const user = req.user;
    const alertKey = String(req.body?.alert_key || "").trim();

    if (!alertKey) {
      return res.status(400).json({
        message: "alert_key is required",
      });
    }

    const data = await alertsService.markAlertRead(user, alertKey);
    return res.json({
      ok: true,
      item: data,
    });
  } catch (err) {
    return next(err);
  }
};

exports.markAllDashboardAlertsRead = async (req, res, next) => {
  try {
    const user = req.user;

    const filters = {
      companyId: req.companyId,
      area: req.body?.area ?? req.query.area,
      clientId: req.body?.clientId ?? req.query.clientId,
      siteId: req.body?.siteId ?? req.query.siteId,
      readStatus: "unread",
    };

    const data = await alertsService.markAllAlertsRead(user, filters);

    return res.json({
      ok: true,
      updated: Number(data.updated || 0),
    });
  } catch (err) {
    return next(err);
  }
};