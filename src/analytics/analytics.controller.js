const analyticsService = require("./analytics.service");
const { ok } = require("./analytics.response");

function getRequestContext(req) {
  return {
    companyId: req.companyId,
    user: req.user,
    query: req.query || {},
  };
}

// =======================
// Finance
// =======================

async function getFinanceExpenseSummary(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseSummary(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getFinanceExpenseByType(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseByType(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getFinanceExpenseByVehicle(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseByVehicle(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getFinanceExpenseByPaymentSource(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseByPaymentSource(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getFinanceTopVendors(req, res, next) {
  try {
    const result = await analyticsService.getFinanceTopVendors(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getFinanceExpenseApprovalBreakdown(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseApprovalBreakdown(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

// =======================
// AR
// =======================

async function getArOutstandingSummary(req, res, next) {
  try {
    const result = await analyticsService.getArOutstandingSummary(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getArTopDebtors(req, res, next) {
  try {
    const result = await analyticsService.getArTopDebtors(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

// =======================
// Maintenance
// =======================

async function getMaintenanceOpenWorkOrders(req, res, next) {
  try {
    const result = await analyticsService.getMaintenanceOpenWorkOrders(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getMaintenanceCostByVehicle(req, res, next) {
  try {
    const result = await analyticsService.getMaintenanceCostByVehicle(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

// =======================
// Inventory
// =======================

async function getInventoryTopIssuedParts(req, res, next) {
  try {
    const result = await analyticsService.getInventoryTopIssuedParts(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getInventoryLowStockItems(req, res, next) {
  try {
    const result = await analyticsService.getInventoryLowStockItems(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

// =======================
// Trips
// =======================

async function getTripsSummary(req, res, next) {
  try {
    const result = await analyticsService.getTripsSummary(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getActiveTrips(req, res, next) {
  try {
    const result = await analyticsService.getActiveTrips(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTripsNeedingFinancialClosure(req, res, next) {
  try {
    const result = await analyticsService.getTripsNeedingFinancialClosure(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTopClientsByTrips(req, res, next) {
  try {
    const result = await analyticsService.getTopClientsByTrips(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTopSitesByTrips(req, res, next) {
  try {
    const result = await analyticsService.getTopSitesByTrips(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTopVehiclesByTrips(req, res, next) {
  try {
    const result = await analyticsService.getTopVehiclesByTrips(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

// =======================
// Profit
// =======================

async function getEntityProfitSummary(req, res, next) {
  try {
    const result = await analyticsService.getEntityProfitSummary(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTripProfitSummary(req, res, next) {
  try {
    const result = await analyticsService.getTripProfitSummary(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTripsProfitSummary(req, res, next) {
  try {
    const result = await analyticsService.getTripsProfitSummary(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTopProfitableTrips(req, res, next) {
  try {
    const result = await analyticsService.getTopProfitableTrips(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getWorstTrips(req, res, next) {
  try {
    const result = await analyticsService.getWorstTrips(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getLowMarginTrips(req, res, next) {
  try {
    const result = await analyticsService.getLowMarginTrips(getRequestContext(req));
    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getFinanceExpenseSummary,
  getFinanceExpenseByType,
  getFinanceExpenseByVehicle,
  getFinanceExpenseByPaymentSource,
  getFinanceTopVendors,
  getFinanceExpenseApprovalBreakdown,

  getArOutstandingSummary,
  getArTopDebtors,

  getMaintenanceOpenWorkOrders,
  getMaintenanceCostByVehicle,

  getInventoryTopIssuedParts,
  getInventoryLowStockItems,

  getTripsSummary,
  getActiveTrips,
  getTripsNeedingFinancialClosure,
  getTopClientsByTrips,
  getTopSitesByTrips,
  getTopVehiclesByTrips,

  getEntityProfitSummary,
  getTripProfitSummary,
  getTripsProfitSummary,
  getTopProfitableTrips,
  getWorstTrips,
  getLowMarginTrips,
};