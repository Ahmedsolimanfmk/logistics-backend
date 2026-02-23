// src/cash/cash.routes.js
const express = require("express");
const router = express.Router();

const cashController = require("./cash.controller");

// ✅ Your JWT middleware exports { authRequired }
const { authRequired } = require("../auth/jwt.middleware");

// UUID v4-ish (NO outer parentheses here)
const UUID_RE =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89ab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}";

// =======================
// Cash Advances
// =======================

// ✅ summary MUST come BEFORE :id
router.get("/cash-advances/summary", authRequired, cashController.getCashAdvancesSummary);

// list
router.get("/cash-advances", authRequired, cashController.getCashAdvances);

// ✅ id route restricted to UUID only
router.get(`/cash-advances/:id(${UUID_RE})`, authRequired, cashController.getCashAdvanceById);

router.post("/cash-advances", authRequired, cashController.createCashAdvance);

// Phase B
router.post(`/cash-advances/:id(${UUID_RE})/submit-review`, authRequired, cashController.submitCashAdvanceForReview);
router.post(`/cash-advances/:id(${UUID_RE})/close`, authRequired, cashController.closeCashAdvance);
router.post(`/cash-advances/:id(${UUID_RE})/reopen`, authRequired, cashController.reopenCashAdvance);

router.get(`/cash-advances/:id(${UUID_RE})/expenses`, authRequired, cashController.getAdvanceExpenses);

// =======================
// Cash Expenses
// =======================

// ✅ summary MUST come BEFORE :id
router.get("/cash-expenses/summary", authRequired, cashController.getCashExpensesSummary);

// list
router.get("/cash-expenses", authRequired, cashController.listCashExpenses);

// ✅ id route restricted to UUID only
router.get(`/cash-expenses/:id(${UUID_RE})`, authRequired, cashController.getCashExpenseById);

router.post("/cash-expenses", authRequired, cashController.createCashExpense);

router.post(`/cash-expenses/:id(${UUID_RE})/approve`, authRequired, cashController.approveCashExpense);
router.post(`/cash-expenses/:id(${UUID_RE})/reject`, authRequired, cashController.rejectCashExpense);
router.post(`/cash-expenses/:id(${UUID_RE})/appeal`, authRequired, cashController.appealRejectedExpense);
router.post(`/cash-expenses/:id(${UUID_RE})/resolve-appeal`, authRequired, cashController.resolveAppeal);
router.post(`/cash-expenses/:id(${UUID_RE})/reopen`, authRequired, cashController.reopenRejectedExpense);

// =======================
// Reports
// =======================
router.get("/reports/supervisor-deficit", authRequired, cashController.getSupervisorDeficitReport);
router.get(`/cash-expenses/:id(${UUID_RE})/audit`, authRequired, cashController.getExpenseAudit);

// =======================
// Trip Finance
// =======================
router.post(`/trips/:id(${UUID_RE})/finance/open-review`, authRequired, cashController.openTripFinanceReview);
router.post(`/trips/:id(${UUID_RE})/finance/close`, authRequired, cashController.closeTripFinance);
router.get(`/trips/:id(${UUID_RE})/finance/summary`, authRequired, cashController.getTripFinanceSummary);

module.exports = router;