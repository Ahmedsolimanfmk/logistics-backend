const express = require("express");
const router = express.Router();

const cashController = require("./cash.controller");

// Cash Advances
router.get("/cash-advances", cashController.getCashAdvances);
router.get("/cash-advances/:id", cashController.getCashAdvanceById);
router.post("/cash-advances", cashController.createCashAdvance);

// Phase B: Advance settlement workflow
router.post("/cash-advances/:id/submit-review", cashController.submitCashAdvanceForReview);
router.post("/cash-advances/:id/close", cashController.closeCashAdvance);
router.post("/cash-advances/:id/reopen", cashController.reopenCashAdvance);

router.get("/cash-advances/:id/expenses", cashController.getAdvanceExpenses);

// Cash Expenses
router.get("/cash-expenses", cashController.listCashExpenses);
router.get("/cash-expenses/:id", cashController.getCashExpenseById);

router.post("/cash-expenses", cashController.createCashExpense);
router.post("/cash-expenses/:id/approve", cashController.approveCashExpense);
router.post("/cash-expenses/:id/reject", cashController.rejectCashExpense);
router.post("/cash-expenses/:id/appeal", cashController.appealRejectedExpense);
router.post("/cash-expenses/:id/resolve-appeal", cashController.resolveAppeal);
router.post("/cash-expenses/:id/reopen", cashController.reopenRejectedExpense);

// Reports
router.get("/reports/supervisor-deficit", cashController.getSupervisorDeficitReport);
router.get("/cash-expenses/:id/audit", cashController.getExpenseAudit);

// Trip Finance
router.post("/trips/:id/finance/open-review", cashController.openTripFinanceReview);
router.post("/trips/:id/finance/close", cashController.closeTripFinance);
router.get("/trips/:id/finance/summary", cashController.getTripFinanceSummary);

module.exports = router;
