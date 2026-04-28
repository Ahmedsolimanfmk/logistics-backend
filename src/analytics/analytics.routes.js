const express = require("express");
const router = express.Router();

const controller = require("./analytics.controller");
const { authRequired } = require("../auth/jwt.middleware");
const { requireCompany } = require("../auth/company.middleware");
const {
  requireCompanyActive,
  requireCompanyFeature,
} = require("../companies/company-access.middleware");

router.use(authRequired);
router.use(requireCompany);
router.use(requireCompanyActive);
router.use(requireCompanyFeature("analytics.access"));

// =======================
// Finance
// =======================

router.get("/finance/expense-summary", controller.getFinanceExpenseSummary);
router.get("/finance/expense-by-type", controller.getFinanceExpenseByType);
router.get("/finance/expense-by-vehicle", controller.getFinanceExpenseByVehicle);
router.get(
  "/finance/expense-by-payment-source",
  controller.getFinanceExpenseByPaymentSource
);
router.get("/finance/top-vendors", controller.getFinanceTopVendors);
router.get(
  "/finance/expense-approval-breakdown",
  controller.getFinanceExpenseApprovalBreakdown
);

// =======================
// AR
// =======================

router.get("/ar/outstanding-summary", controller.getArOutstandingSummary);
router.get("/ar/top-debtors", controller.getArTopDebtors);

// =======================
// Maintenance
// =======================

router.get(
  "/maintenance/open-work-orders",
  controller.getMaintenanceOpenWorkOrders
);
router.get(
  "/maintenance/cost-by-vehicle",
  controller.getMaintenanceCostByVehicle
);

// =======================
// Inventory
// =======================

router.get("/inventory/top-issued-parts", controller.getInventoryTopIssuedParts);
router.get("/inventory/low-stock-items", controller.getInventoryLowStockItems);

// =======================
// Trips
// =======================

router.get("/trips/summary", controller.getTripsSummary);
router.get("/trips/active", controller.getActiveTrips);
router.get(
  "/trips/need-financial-closure",
  controller.getTripsNeedingFinancialClosure
);
router.get("/trips/top-clients", controller.getTopClientsByTrips);
router.get("/trips/top-sites", controller.getTopSitesByTrips);
router.get("/trips/top-vehicles", controller.getTopVehiclesByTrips);

// =======================
// Profit
// =======================

router.get("/profit/client-summary", controller.getEntityProfitSummary);

router.get("/profit/trips/summary", controller.getTripsProfitSummary);
router.get("/profit/trips/top", controller.getTopProfitableTrips);
router.get("/profit/trips/worst", controller.getWorstTrips);
router.get("/profit/trips/low-margin", controller.getLowMarginTrips);

module.exports = router;