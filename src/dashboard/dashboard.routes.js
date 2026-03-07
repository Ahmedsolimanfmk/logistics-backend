// =======================
// src/dashboard/dashboard.routes.js
// =======================

const express = require("express");
const router = express.Router();

const { requireAdminOrHR } = require("../auth/role.middleware");

const {
  getDashboardSummary,
  getDashboardTrends,
  getDashboardTrendsBundle,
  getComplianceAlerts,
} = require("./dashboard.controller");

const {
  getDashboardAlerts,
  getDashboardAlertsSummary,
} = require("./alerts.controller");

// KPIs summary
router.get("/summary", getDashboardSummary);

// Single metric trends
router.get("/trends", getDashboardTrends);

// Bundle trends
router.get("/trends/bundle", getDashboardTrendsBundle);

// Central alerts
router.get("/alerts", getDashboardAlerts);
router.get("/alerts/summary", getDashboardAlertsSummary);

// Compliance alerts
router.get("/compliance-alerts", requireAdminOrHR, getComplianceAlerts);

module.exports = router;