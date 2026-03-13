const express = require("express");
const router = express.Router();

const controller = require("./analytics.controller");
const { authRequired } = require("../auth/jwt.middleware");

// =======================
// Finance
// =======================

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
  "/finance/expense-by-vehicle",
  authRequired,
  controller.getFinanceExpenseByVehicle
);

router.get(
  "/finance/expense-by-payment-source",
  authRequired,
  controller.getFinanceExpenseByPaymentSource
);

router.get(
  "/finance/top-vendors",
  authRequired,
  controller.getFinanceTopVendors
);

router.get(
  "/finance/expense-approval-breakdown",
  authRequired,
  controller.getFinanceExpenseApprovalBreakdown
);

// =======================
// AR
// =======================

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

// =======================
// Maintenance
// =======================

router.get(
  "/maintenance/open-work-orders",
  authRequired,
  controller.getMaintenanceOpenWorkOrders
);

router.get(
  "/maintenance/cost-by-vehicle",
  authRequired,
  controller.getMaintenanceCostByVehicle
);

// =======================
// Inventory
// =======================

router.get(
  "/inventory/top-issued-parts",
  authRequired,
  controller.getInventoryTopIssuedParts
);

router.get(
  "/inventory/low-stock-items",
  authRequired,
  controller.getInventoryLowStockItems
);

// =======================
// Trips
// =======================

router.get(
  "/trips/summary",
  authRequired,
  controller.getTripsSummary
);

router.get(
  "/trips/active",
  authRequired,
  controller.getActiveTrips
);

router.get(
  "/trips/need-financial-closure",
  authRequired,
  controller.getTripsNeedingFinancialClosure
);

router.get(
  "/trips/top-clients",
  authRequired,
  controller.getTopClientsByTrips
);

router.get(
  "/trips/top-sites",
  authRequired,
  controller.getTopSitesByTrips
);

router.get(
  "/trips/top-vehicles",
  authRequired,
  controller.getTopVehiclesByTrips
);

module.exports = router;