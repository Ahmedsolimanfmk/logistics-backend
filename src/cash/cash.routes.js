// src/cash/cash.routes.js
const express = require("express");
const router = express.Router();

const cashController = require("./cash.controller");
const { authRequired } = require("../auth/jwt.middleware");

// UUID v4-ish validator (no path regex)
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

// Guard middleware: if :id is not UUID -> 404 (prevents summary collisions too)
function requireUuidParam(paramName = "id") {
  return (req, res, next) => {
    const v = req.params?.[paramName];
    if (!isUuid(v)) return res.status(404).json({ message: "Not found" });
    return next();
  };
}

// =======================
// Cash Advances
// =======================

// ✅ summary MUST come BEFORE :id
router.get("/cash-advances/summary", authRequired, cashController.getCashAdvancesSummary);

// list
router.get("/cash-advances", authRequired, cashController.getCashAdvances);

// ✅ id route (validate UUID in middleware)
router.get("/cash-advances/:id", authRequired, requireUuidParam("id"), cashController.getCashAdvanceById);

router.post("/cash-advances", authRequired, cashController.createCashAdvance);

// Phase B
router.post(
  "/cash-advances/:id/submit-review",
  authRequired,
  requireUuidParam("id"),
  cashController.submitCashAdvanceForReview
);
router.post("/cash-advances/:id/close", authRequired, requireUuidParam("id"), cashController.closeCashAdvance);
router.post("/cash-advances/:id/reopen", authRequired, requireUuidParam("id"), cashController.reopenCashAdvance);

router.get("/cash-advances/:id/expenses", authRequired, requireUuidParam("id"), cashController.getAdvanceExpenses);

// =======================
// Cash Expenses
// =======================

// ✅ summary MUST come BEFORE :id
router.get("/cash-expenses/summary", authRequired, cashController.getCashExpensesSummary);

// list
router.get("/cash-expenses", authRequired, cashController.listCashExpenses);

// ✅ id route (validate UUID in middleware)
router.get("/cash-expenses/:id", authRequired, requireUuidParam("id"), cashController.getCashExpenseById);

router.post("/cash-expenses", authRequired, cashController.createCashExpense);

router.post("/cash-expenses/:id/approve", authRequired, requireUuidParam("id"), cashController.approveCashExpense);
router.post("/cash-expenses/:id/reject", authRequired, requireUuidParam("id"), cashController.rejectCashExpense);
router.post("/cash-expenses/:id/appeal", authRequired, requireUuidParam("id"), cashController.appealRejectedExpense);
router.post(
  "/cash-expenses/:id/resolve-appeal",
  authRequired,
  requireUuidParam("id"),
  cashController.resolveAppeal
);
router.post("/cash-expenses/:id/reopen", authRequired, requireUuidParam("id"), cashController.reopenRejectedExpense);

// =======================
// Reports
// =======================
router.get("/reports/supervisor-deficit", authRequired, cashController.getSupervisorDeficitReport);
router.get("/cash-expenses/:id/audit", authRequired, requireUuidParam("id"), cashController.getExpenseAudit);

// =======================
// Trip Finance
// =======================
router.post("/trips/:id/finance/open-review", authRequired, requireUuidParam("id"), cashController.openTripFinanceReview);
router.post("/trips/:id/finance/close", authRequired, requireUuidParam("id"), cashController.closeTripFinance);
router.get("/trips/:id/finance/summary", authRequired, requireUuidParam("id"), cashController.getTripFinanceSummary);

module.exports = router;