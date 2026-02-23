// src/cash/cash.routes.js
const express = require("express");
const router = express.Router();

const cashController = require("./cash.controller");

// ✅ Use the real middleware path in your project
const authMiddleware = require("../auth/jwt.middleware");

// UUID v4-ish (NO outer parentheses here)
const UUID_RE =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";

// =======================
// Cash Advances
// =======================

// ✅ summary MUST come BEFORE :id
router.get("/cash-advances/summary", authMiddleware, cashController.getCashAdvancesSummary);

// list
router.get("/cash-advances", authMiddleware, cashController.getCashAdvances);

// ✅ id route restricted to UUID only
router.get(`/cash-advances/:id(${UUID_RE})`, authMiddleware, cashController.getCashAdvanceById);

router.post("/cash-advances", authMiddleware, cashController.createCashAdvance);

// Phase B
router.post(
  `/cash-advances/:id(${UUID_RE})/submit-review`,
  authMiddleware,
  cashController.submitCashAdvanceForReview
);
router.post(`/cash-advances/:id(${UUID_RE})/close`, authMiddleware, cashController.closeCashAdvance);
router.post(`/cash-advances/:id(${UUID_RE})/reopen`, authMiddleware, cashController.reopenCashAdvance);

router.get(`/cash-advances/:id(${UUID_RE})/expenses`, authMiddleware, cashController.getAdvanceExpenses);

// =======================
// Cash Expenses
// =======================

// ✅ summary MUST come BEFORE :id
router.get("/cash-expenses/summary", authMiddleware, cashController.getCashExpensesSummary);

// list
router.get("/cash-expenses", authMiddleware, cashController.listCashExpenses);

// ✅ id route restricted to UUID only
router.get(`/cash-expenses/:id(${UUID_RE})`, authMiddleware, cashController.getCashExpenseById);

router.post("/cash-expenses", authMiddleware, cashController.createCashExpense);

// These handlers MUST exist in controller (we provide safe fallbacks in controller below)
router.post(`/cash-expenses/:id(${UUID_RE})/approve`, authMiddleware, cashController.approveCashExpense);
router.post(`/cash-expenses/:id(${UUID_RE})/reject`, authMiddleware, cashController.rejectCashExpense);
router.post(`/cash-expenses/:id(${UUID_RE})/appeal`, authMiddleware, cashController.appealRejectedExpense);
router.post(`/cash-expenses/:id(${UUID_RE})/resolve-appeal`, authMiddleware, cashController.resolveAppeal);
router.post(`/cash-expenses/:id(${UUID_RE})/reopen`, authMiddleware, cashController.reopenRejectedExpense);

// =======================
// Reports
// =======================
router.get("/reports/supervisor-deficit", authMiddleware, cashController.getSupervisorDeficitReport);
router.get(`/cash-expenses/:id(${UUID_RE})/audit`, authMiddleware, cashController.getExpenseAudit);

// =======================
// Trip Finance
// =======================
router.post(`/trips/:id(${UUID_RE})/finance/open-review`, authMiddleware, cashController.openTripFinanceReview);
router.post(`/trips/:id(${UUID_RE})/finance/close`, authMiddleware, cashController.closeTripFinance);
router.get(`/trips/:id(${UUID_RE})/finance/summary`, authMiddleware, cashController.getTripFinanceSummary);

module.exports = router;