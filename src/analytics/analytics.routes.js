const express = require("express");
const router = express.Router();

const controller = require("./analytics.controller");
const { authRequired } = require("../auth/jwt.middleware");

router.get(
  "/finance/expense-summary",
  authRequired,
  controller.getFinanceExpenseSummary
);
router.get(
  "/finance/expense-by-type",
  authRequired,
  controller.getFinanceExpenseByType
);
router.get(
  "/ar/outstanding-summary",
  authRequired,
  controller.getArOutstandingSummary
);
router.get(
  "/ar/top-debtors",
  authRequired,
  controller.getArTopDebtors
);
router.get(
  "/maintenance/open-work-orders",
  authRequired,
  controller.getMaintenanceOpenWorkOrders
);

module.exports = router;