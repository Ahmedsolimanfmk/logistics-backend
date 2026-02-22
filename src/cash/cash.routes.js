// src/cash/cash.routes.js
const express = require("express");
const router = express.Router();

const cashController = require("./cash.controller");

// ✅ عدّل المسار ده حسب مشروعك
const authMiddleware = require("../middleware/authMiddleware"); // <-- غيّرها لو اسم/مكان مختلف

// =======================
// Cash Advances
// =======================

// ✅ IMPORTANT: summary MUST come BEFORE :id
router.get("/cash-advances/summary", authMiddleware, cashController.getCashAdvancesSummary);

router.get("/cash-advances", authMiddleware, cashController.getCashAdvances);
router.get("/cash-advances/:id", authMiddleware, cashController.getCashAdvanceById);
router.post("/cash-advances", authMiddleware, cashController.createCashAdvance);

// Phase B: Advance settlement workflow
router.post("/cash-advances/:id/submit-review", authMiddleware, cashController.submitCashAdvanceForReview);
router.post("/cash-advances/:id/close", authMiddleware, cashController.closeCashAdvance);
router.post("/cash-advances/:id/reopen", authMiddleware, cashController.reopenCashAdvance);

router.get("/cash-advances/:id/expenses", authMiddleware, cashController.getAdvanceExpenses);

// =======================
// Cash Expenses
// =======================

// ✅ IMPORTANT: summary MUST come BEFORE :id
router.get("/cash-expenses/summary", authMiddleware, cashController.getCashExpensesSummary);

router.get("/cash-expenses", authMiddleware, cashController.listCashExpenses);
router.get("/cash-expenses/:id", authMiddleware, cashController.getCashExpenseById);

router.post("/cash-expenses", authMiddleware, cashController.createCashExpense);

router.post("/cash-expenses/:id/approve", authMiddleware, cashController.approveCashExpense);
router.post("/cash-expenses/:id/reject", authMiddleware, cashController.rejectCashExpense);
router.post("/cash-expenses/:id/appeal", authMiddleware, cashController.appealRejectedExpense);
router.post("/cash-expenses/:id/resolve-appeal", authMiddleware, cashController.resolveAppeal);
router.post("/cash-expenses/:id/reopen", authMiddleware, cashController.reopenRejectedExpense);

// =======================
// Reports
// =======================
router.get("/reports/supervisor-deficit", authMiddleware, cashController.getSupervisorDeficitReport);
router.get("/cash-expenses/:id/audit", authMiddleware, cashController.getExpenseAudit);

// =======================
// Trip Finance
// =======================
router.post("/trips/:id/finance/open-review", authMiddleware, cashController.openTripFinanceReview);
router.post("/trips/:id/finance/close", authMiddleware, cashController.closeTripFinance);
router.get("/trips/:id/finance/summary", authMiddleware, cashController.getTripFinanceSummary);

module.exports = router;