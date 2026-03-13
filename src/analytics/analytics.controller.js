const analyticsService = require("./analytics.service");
const { ok } = require("./analytics.response");

async function getFinanceExpenseSummary(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseSummary({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getFinanceExpenseByType(req, res, next) {
  try {
    const result = await analyticsService.getFinanceExpenseByType({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getArOutstandingSummary(req, res, next) {
  try {
    const result = await analyticsService.getArOutstandingSummary({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getArTopDebtors(req, res, next) {
  try {
    const result = await analyticsService.getArTopDebtors({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getMaintenanceOpenWorkOrders(req, res, next) {
  try {
    const result = await analyticsService.getMaintenanceOpenWorkOrders({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getInventoryTopIssuedParts(req, res, next) {
  try {
    const result = await analyticsService.getInventoryTopIssuedParts({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getInventoryLowStockItems(req, res, next) {
  try {
    const result = await analyticsService.getInventoryLowStockItems({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getMaintenanceCostByVehicle(req, res, next) {
  try {
    const result = await analyticsService.getMaintenanceCostByVehicle({
      user: req.user,
      query: req.query,
    });

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
    const result = await analyticsService.getTripsSummary({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getActiveTrips(req, res, next) {
  try {
    const result = await analyticsService.getActiveTrips({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTripsNeedingFinancialClosure(req, res, next) {
  try {
    const result = await analyticsService.getTripsNeedingFinancialClosure({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTopClientsByTrips(req, res, next) {
  try {
    const result = await analyticsService.getTopClientsByTrips({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTopSitesByTrips(req, res, next) {
  try {
    const result = await analyticsService.getTopSitesByTrips({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

async function getTopVehiclesByTrips(req, res, next) {
  try {
    const result = await analyticsService.getTopVehiclesByTrips({
      user: req.user,
      query: req.query,
    });

    return res.json(ok(result));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getFinanceExpenseSummary,
  getFinanceExpenseByType,
  getArOutstandingSummary,
  getArTopDebtors,
  getMaintenanceOpenWorkOrders,
  getInventoryTopIssuedParts,
  getInventoryLowStockItems,
  getMaintenanceCostByVehicle,

  // trips
  getTripsSummary,
  getActiveTrips,
  getTripsNeedingFinancialClosure,
  getTopClientsByTrips,
  getTopSitesByTrips,
  getTopVehiclesByTrips,
};