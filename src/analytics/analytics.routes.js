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

module.exports = router;