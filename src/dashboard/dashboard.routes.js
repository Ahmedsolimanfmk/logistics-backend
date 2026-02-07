const express = require("express");
const router = express.Router();

const {
  getDashboardSummary,
  getDashboardTrends,
  getDashboardTrendsBundle,
} = require("./dashboard.controller");

// KPIs summary
router.get("/summary", getDashboardSummary);

// Single metric trends
router.get("/trends", getDashboardTrends);

// Bundle trends
router.get("/trends/bundle", getDashboardTrendsBundle);

module.exports = router;
