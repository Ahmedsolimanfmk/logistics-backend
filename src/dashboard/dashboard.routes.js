const express = require("express");
const router = express.Router();

const { authRequired } = require("../auth/jwt.middleware");
const { requireAdminOrHR } = require("../auth/role.middleware");
const { requireCompany } = require("../auth/company.middleware");
const {
  requireCompanyActive,
  requireCompanyFeature,
} = require("../companies/company-access.middleware");

const {
  getDashboardSummary,
  getDashboardTrends,
  getDashboardTrendsBundle,
  getComplianceAlerts,
} = require("./dashboard.controller");

const {
  getDashboardAlerts,
  getDashboardAlertsSummary,
  markAlertRead,
  markAllDashboardAlertsRead,
} = require("./alerts.controller");

// Protect all dashboard routes
router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);

// KPIs summary
router.get(
  "/summary",
  requireCompanyFeature("analytics.access"),
  getDashboardSummary
);

// Single metric trends
router.get(
  "/trends",
  requireCompanyFeature("analytics.access"),
  getDashboardTrends
);

// Bundle trends
router.get(
  "/trends/bundle",
  requireCompanyFeature("analytics.access"),
  getDashboardTrendsBundle
);

// Central alerts
router.get(
  "/alerts",
  requireCompanyFeature("dashboard.access"),
  getDashboardAlerts
);
router.get(
  "/alerts/summary",
  requireCompanyFeature("dashboard.access"),
  getDashboardAlertsSummary
);
router.patch(
  "/alerts/read",
  requireCompanyFeature("dashboard.access"),
  markAlertRead
);
router.patch(
  "/alerts/read-all",
  requireCompanyFeature("dashboard.access"),
  markAllDashboardAlertsRead
);

// Compliance alerts
router.get(
  "/compliance-alerts",
  requireAdminOrHR,
  requireCompanyFeature("dashboard.access"),
  getComplianceAlerts
);

module.exports = router;