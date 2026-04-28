const { resolveTimeRange } = require("./analytics.time");
const { buildScopeFilters } = require("./analytics.filters");

const financeAnalytics = require("./finance.analytics");
const arAnalytics = require("./ar.analytics");
const maintenanceAnalytics = require("./maintenance.analytics");
const inventoryAnalytics = require("./inventory.analytics");
const tripsAnalytics = require("./trips.analytics");
const profitAnalytics = require("./profit.analytics");

function resolveLimit(query = {}, fallback = 10, max = 50) {
  const raw = Number(query.limit ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(raw)));
}

function buildContext(companyId, user, query = {}) {
  return {
    companyId,
    query,
    range: resolveTimeRange(query),
    scope: buildScopeFilters(companyId, user, query),
  };
}

// =======================
// Finance
// =======================

async function getFinanceExpenseSummary({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return financeAnalytics.getExpenseSummary({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    query: ctx.query,
  });
}

async function getFinanceExpenseByType({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return financeAnalytics.getExpenseByType({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getFinanceExpenseByVehicle({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return financeAnalytics.getExpenseByVehicle({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getFinanceExpenseByPaymentSource({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return financeAnalytics.getExpenseByPaymentSource({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    query: ctx.query,
  });
}

async function getFinanceTopVendors({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return financeAnalytics.getTopVendors({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getFinanceExpenseApprovalBreakdown({
  companyId,
  user,
  query = {},
}) {
  const ctx = buildContext(companyId, user, query);

  return financeAnalytics.getExpenseApprovalBreakdown({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    query: ctx.query,
  });
}

// =======================
// AR
// =======================

async function getArOutstandingSummary({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return arAnalytics.getOutstandingSummary({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    query: ctx.query,
  });
}

async function getArTopDebtors({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return arAnalytics.getTopDebtors({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

// =======================
// Maintenance
// =======================

async function getMaintenanceOpenWorkOrders({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return maintenanceAnalytics.getOpenWorkOrders({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    query: ctx.query,
  });
}

async function getMaintenanceCostByVehicle({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return maintenanceAnalytics.getCostByVehicle({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

// =======================
// Inventory
// =======================

async function getInventoryTopIssuedParts({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return inventoryAnalytics.getTopIssuedParts({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getInventoryLowStockItems({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return inventoryAnalytics.getLowStockItems({
    companyId: ctx.companyId,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

// =======================
// Trips
// =======================

async function getTripsSummary({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return tripsAnalytics.getTripsSummary({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    query: ctx.query,
  });
}

async function getActiveTrips({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return tripsAnalytics.getActiveTrips({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getTripsNeedingFinancialClosure({
  companyId,
  user,
  query = {},
}) {
  const ctx = buildContext(companyId, user, query);

  return tripsAnalytics.getTripsNeedingFinancialClosure({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getTopClientsByTrips({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return tripsAnalytics.getTopClientsByTrips({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getTopSitesByTrips({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return tripsAnalytics.getTopSitesByTrips({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getTopVehiclesByTrips({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return tripsAnalytics.getTopVehiclesByTrips({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

// =======================
// Profit
// =======================

async function getEntityProfitSummary({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return profitAnalytics.getClientProfitSummary({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    query: ctx.query,
  });
}
async function getTripsProfitSummary({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return profitAnalytics.getTripsProfitSummary({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    query: ctx.query,
  });
}

async function getTopProfitableTrips({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return profitAnalytics.getTopProfitableTrips({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getWorstTrips({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return profitAnalytics.getWorstTrips({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    query: ctx.query,
  });
}

async function getLowMarginTrips({ companyId, user, query = {} }) {
  const ctx = buildContext(companyId, user, query);

  return profitAnalytics.getLowMarginTrips({
    companyId: ctx.companyId,
    range: ctx.range,
    scope: ctx.scope,
    limit: resolveLimit(query, 10, 50),
    threshold: Number(query.threshold || 10),
    query: ctx.query,
  });
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

  getTripsProfitSummary,
  getTopProfitableTrips,
  getWorstTrips,
  getLowMarginTrips,
};