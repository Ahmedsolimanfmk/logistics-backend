const { resolveTimeRange } = require("./analytics.time");
const { buildScopeFilters } = require("./analytics.filters");

const financeAnalytics = require("./finance.analytics");
const arAnalytics = require("./ar.analytics");
const maintenanceAnalytics = require("./maintenance.analytics");
const inventoryAnalytics = require("./inventory.analytics");
const tripsAnalytics = require("./trips.analytics");

// =======================
// Finance
// =======================

async function getFinanceExpenseSummary({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return financeAnalytics.getExpenseSummary({
    range,
    scope,
  });
}

async function getFinanceExpenseByType({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return financeAnalytics.getExpenseByType({
    range,
    scope,
    limit,
  });
}

async function getFinanceExpenseByVehicle({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return financeAnalytics.getExpenseByVehicle({
    range,
    scope,
    limit,
  });
}

async function getFinanceExpenseByPaymentSource({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return financeAnalytics.getExpenseByPaymentSource({
    range,
    scope,
  });
}

async function getFinanceTopVendors({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return financeAnalytics.getTopVendors({
    range,
    scope,
    limit,
  });
}

async function getFinanceExpenseApprovalBreakdown({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return financeAnalytics.getExpenseApprovalBreakdown({
    range,
    scope,
  });
}

// =======================
// AR
// =======================

async function getArOutstandingSummary({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return arAnalytics.getOutstandingSummary({
    range,
    scope,
  });
}

async function getArTopDebtors({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return arAnalytics.getTopDebtors({
    range,
    scope,
    limit,
  });
}

// =======================
// Maintenance
// =======================

async function getMaintenanceOpenWorkOrders({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return maintenanceAnalytics.getOpenWorkOrders({
    range,
    scope,
  });
}

async function getMaintenanceCostByVehicle({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return maintenanceAnalytics.getCostByVehicle({
    range,
    scope,
    limit,
  });
}

// =======================
// Inventory
// =======================

async function getInventoryTopIssuedParts({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return inventoryAnalytics.getTopIssuedParts({
    range,
    scope,
    limit,
  });
}

async function getInventoryLowStockItems({ user, query }) {
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return inventoryAnalytics.getLowStockItems({
    scope,
    limit,
  });
}

// =======================
// Trips
// =======================

async function getTripsSummary({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);

  return tripsAnalytics.getTripsSummary({
    range,
    scope,
    query,
  });
}

async function getActiveTrips({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return tripsAnalytics.getActiveTrips({
    range,
    scope,
    limit,
    query,
  });
}

async function getTripsNeedingFinancialClosure({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return tripsAnalytics.getTripsNeedingFinancialClosure({
    range,
    scope,
    limit,
    query,
  });
}

async function getTopClientsByTrips({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return tripsAnalytics.getTopClientsByTrips({
    range,
    scope,
    limit,
    query,
  });
}

async function getTopSitesByTrips({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return tripsAnalytics.getTopSitesByTrips({
    range,
    scope,
    limit,
    query,
  });
}

async function getTopVehiclesByTrips({ user, query }) {
  const range = resolveTimeRange(query);
  const scope = buildScopeFilters(user, query);
  const limit = Math.max(1, Math.min(50, Number(query.limit || 10)));

  return tripsAnalytics.getTopVehiclesByTrips({
    range,
    scope,
    limit,
    query,
  });
}

// =======================
// EXPORTS
// =======================

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
};