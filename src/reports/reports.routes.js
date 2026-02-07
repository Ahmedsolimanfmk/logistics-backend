// =======================
// src/reports/reports.routes.js
// =======================

const { Router } = require("express");
const { getTripFinanceReport, getSupervisorLedgerReport } = require("./reports.controller");

const router = Router();

// GET /reports/trips/:tripId/finance
router.get("/trips/:tripId/finance", getTripFinanceReport);

// GET /reports/supervisors/:supervisorId/ledger
router.get("/supervisors/:supervisorId/ledger", getSupervisorLedgerReport);

module.exports = router;
