const express = require("express");
const router = express.Router();

const controller = require("./analytics.controller");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
const {
  requireCompanyActive,
  requireCompanyFeature,
} = require("../companies/company-access.middleware");

function mustBeFn(name, fn) {
  if (typeof fn !== "function") {
    throw new TypeError(
      `[analytics.routes] Handler "${name}" is not a function. Check analytics.controller exports.`
    );
  }
  return fn;
}

router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);
router.use(requireCompanyFeature("analytics.access"));

// =======================
// Finance
// =======================

router.get(
  "/finance/expense-summary",
  mustBeFn("getFinanceExpenseSummary", controller.getFinanceExpenseSummary)
);

router.get(
  "/finance/expense-by-type",
  mustBeFn("getFinanceExpenseByType", controller.getFinanceExpenseByType)
);

router.get(
  "/finance/expense-by-vehicle",
  mustBeFn("getFinanceExpenseByVehicle", controller.getFinanceExpenseByVehicle)
);

router.get(
  "/finance/expense-by-payment-source",
  mustBeFn(
    "getFinanceExpenseByPaymentSource",
    controller.getFinanceExpenseByPaymentSource
  )
);

router.get(
  "/finance/top-vendors",
  mustBeFn("getFinanceTopVendors", controller.getFinanceTopVendors)
);

router.get(
  "/finance/expense-approval-breakdown",
  mustBeFn(
    "getFinanceExpenseApprovalBreakdown",
    controller.getFinanceExpenseApprovalBreakdown
  )
);

// =======================
// AR
// =======================

router.get(
  "/ar/outstanding-summary",
  mustBeFn("getArOutstandingSummary", controller.getArOutstandingSummary)
);

router.get(
  "/ar/top-debtors",
  mustBeFn("getArTopDebtors", controller.getArTopDebtors)
);

// =======================
// Maintenance
// =======================

router.get(
  "/maintenance/open-work-orders",
  mustBeFn("getMaintenanceOpenWorkOrders", controller.getMaintenanceOpenWorkOrders)
);

router.get(
  "/maintenance/cost-by-vehicle",
  mustBeFn("getMaintenanceCostByVehicle", controller.getMaintenanceCostByVehicle)
);

// =======================
// Inventory
// =======================

router.get(
  "/inventory/top-issued-parts",
  mustBeFn("getInventoryTopIssuedParts", controller.getInventoryTopIssuedParts)
);

router.get(
  "/inventory/low-stock-items",
  mustBeFn("getInventoryLowStockItems", controller.getInventoryLowStockItems)
);

// =======================
// Trips
// =======================

router.get(
  "/trips/summary",
  mustBeFn("getTripsSummary", controller.getTripsSummary)
);

router.get(
  "/trips/active",
  mustBeFn("getActiveTrips", controller.getActiveTrips)
);

router.get(
  "/trips/need-financial-closure",
  mustBeFn(
    "getTripsNeedingFinancialClosure",
    controller.getTripsNeedingFinancialClosure
  )
);

router.get(
  "/trips/top-clients",
  mustBeFn("getTopClientsByTrips", controller.getTopClientsByTrips)
);

router.get(
  "/trips/top-sites",
  mustBeFn("getTopSitesByTrips", controller.getTopSitesByTrips)
);

router.get(
  "/trips/top-vehicles",
  mustBeFn("getTopVehiclesByTrips", controller.getTopVehiclesByTrips)
);

// =======================
// Profit
// =======================

router.get(
  "/profit/client-summary",
  mustBeFn("getEntityProfitSummary", controller.getEntityProfitSummary)
);

router.get(
  "/profit/trips/summary",
  mustBeFn("getTripsProfitSummary", controller.getTripsProfitSummary)
);

router.get(
  "/profit/trips/top",
  mustBeFn("getTopProfitableTrips", controller.getTopProfitableTrips)
);

router.get(
  "/profit/trips/worst",
  mustBeFn("getWorstTrips", controller.getWorstTrips)
);

router.get(
  "/profit/trips/low-margin",
  mustBeFn("getLowMarginTrips", controller.getLowMarginTrips)
);

module.exports = router;