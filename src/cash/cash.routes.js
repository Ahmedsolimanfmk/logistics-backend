// =======================
// src/cash/cash.routes.js
// =======================

const express = require("express");
const router = express.Router();

const cashController = require("./cash.controller");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");

// enforce tenant
router.use(authRequired);
router.use(requireCompany);

// UUID validator
function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f-]{36}$/i.test(v)
  );
}

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

router.get("/cash-advances/summary", cashController.getCashAdvancesSummary);
router.get("/cash-advances", cashController.getCashAdvances);
router.get("/cash-advances/:id", requireUuidParam("id"), cashController.getCashAdvanceById);

router.post("/cash-advances", cashController.createCashAdvance);

router.post("/cash-advances/:id/submit-review", requireUuidParam("id"), cashController.submitCashAdvanceForReview);
router.post("/cash-advances/:id/close", requireUuidParam("id"), cashController.closeCashAdvance);
router.post("/cash-advances/:id/reopen", requireUuidParam("id"), cashController.reopenCashAdvance);

router.get("/cash-advances/:id/expenses", requireUuidParam("id"), cashController.getAdvanceExpenses);

// =======================
// Cash Expenses
// =======================

router.get("/cash-expenses/summary", cashController.getCashExpensesSummary);
router.get("/cash-expenses", cashController.listCashExpenses);
router.get("/cash-expenses/:id", requireUuidParam("id"), cashController.getCashExpenseById);

router.post("/cash-expenses", cashController.createCashExpense);

router.post("/cash-expenses/:id/approve", requireUuidParam("id"), cashController.approveCashExpense);
router.post("/cash-expenses/:id/reject", requireUuidParam("id"), cashController.rejectCashExpense);
router.post("/cash-expenses/:id/appeal", requireUuidParam("id"), cashController.appealRejectedExpense);
router.post("/cash-expenses/:id/resolve-appeal", requireUuidParam("id"), cashController.resolveAppeal);
router.post("/cash-expenses/:id/reopen", requireUuidParam("id"), cashController.reopenRejectedExpense);

router.get("/cash-expenses/:id/audit", requireUuidParam("id"), cashController.getExpenseAudit);

// =======================
// Reports
// =======================

router.get("/reports/supervisor-deficit", cashController.getSupervisorDeficitReport);

module.exports = router;