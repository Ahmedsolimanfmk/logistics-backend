const analyticsService = require("../analytics/analytics.service");
const { buildInsightsByContext } = require("./ai-analytics.insights");

async function buildFinanceInlineInsights({ companyId, user, parsed, result }) {
  const expenseSummary =
    parsed?.intent === "expense_summary"
      ? result
      : await analyticsService.getFinanceExpenseSummary({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const expenseByType =
    parsed?.intent === "expense_by_type"
      ? result
      : await analyticsService.getFinanceExpenseByType({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const expenseByVehicle =
    parsed?.intent === "expense_by_vehicle"
      ? result
      : await analyticsService.getFinanceExpenseByVehicle({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const expenseByPaymentSource =
    parsed?.intent === "expense_by_payment_source"
      ? result
      : await analyticsService.getFinanceExpenseByPaymentSource({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const topVendors =
    parsed?.intent === "top_vendors"
      ? result
      : await analyticsService.getFinanceTopVendors({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const expenseApprovalBreakdown =
    parsed?.intent === "expense_approval_breakdown"
      ? result
      : await analyticsService.getFinanceExpenseApprovalBreakdown({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const expenseSummaryLastMonth = await analyticsService.getFinanceExpenseSummary({
    companyId,
    user,
    query: { range: "last_month" },
  });

  return buildInsightsByContext({
    context: "finance",
    data: {
      expenseSummary,
      expenseByType,
      expenseByVehicle,
      expenseByPaymentSource,
      topVendors,
      expenseApprovalBreakdown,
      expenseSummaryLastMonth,
    },
  }).slice(0, 5);
}

async function buildArInlineInsights({ companyId, user, parsed, result }) {
  const outstandingSummary =
    parsed?.intent === "outstanding_summary"
      ? result
      : await analyticsService.getArOutstandingSummary({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const topDebtors =
    parsed?.intent === "top_debtors"
      ? result
      : await analyticsService.getArTopDebtors({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  return buildInsightsByContext({
    context: "ar",
    data: {
      outstandingSummary,
      topDebtors,
    },
  }).slice(0, 3);
}

async function buildMaintenanceInlineInsights({ companyId, user, parsed, result }) {
  const openWorkOrders =
    parsed?.intent === "open_work_orders"
      ? result
      : await analyticsService.getMaintenanceOpenWorkOrders({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const costByVehicle =
    parsed?.intent === "maintenance_cost_by_vehicle"
      ? result
      : await analyticsService.getMaintenanceCostByVehicle({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  return buildInsightsByContext({
    context: "maintenance",
    data: {
      openWorkOrders,
      costByVehicle,
    },
  }).slice(0, 3);
}

async function buildInventoryInlineInsights({ companyId, user, parsed, result }) {
  const topIssuedParts =
    parsed?.intent === "top_issued_parts"
      ? result
      : await analyticsService.getInventoryTopIssuedParts({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const lowStockItems =
    parsed?.intent === "low_stock_items"
      ? result
      : await analyticsService.getInventoryLowStockItems({
          companyId,
          user,
          query: { limit: 10 },
        });

  return buildInsightsByContext({
    context: "inventory",
    data: {
      topIssuedParts,
      lowStockItems,
    },
  }).slice(0, 3);
}

async function buildTripsInlineInsights({ companyId, user, parsed, result }) {
  const tripsSummary =
    parsed?.intent === "trips_summary"
      ? result
      : await analyticsService.getTripsSummary({
          companyId,
          user,
          query: { range: "this_month" },
        });

  const activeTrips =
    parsed?.intent === "active_trips"
      ? result
      : await analyticsService.getActiveTrips({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const tripsNeedFinancialClosure =
    parsed?.intent === "trips_need_financial_closure"
      ? result
      : await analyticsService.getTripsNeedingFinancialClosure({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const topClientsByTrips =
    parsed?.intent === "top_clients_by_trips"
      ? result
      : await analyticsService.getTopClientsByTrips({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const topSitesByTrips =
    parsed?.intent === "top_sites_by_trips"
      ? result
      : await analyticsService.getTopSitesByTrips({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  const topVehiclesByTrips =
    parsed?.intent === "top_vehicles_by_trips"
      ? result
      : await analyticsService.getTopVehiclesByTrips({
          companyId,
          user,
          query: { range: "this_month", limit: 5 },
        });

  return buildInsightsByContext({
    context: "trips",
    data: {
      tripsSummary,
      activeTrips,
      tripsNeedFinancialClosure,
      topClientsByTrips,
      topSitesByTrips,
      topVehiclesByTrips,
    },
  }).slice(0, 5);
}

async function buildInlineInsights({ companyId, user, parsed, result }) {
  const moduleName = parsed?.module || parsed?.domain;

  if (moduleName === "finance") {
    return buildFinanceInlineInsights({ companyId, user, parsed, result });
  }

  if (moduleName === "ar") {
    return buildArInlineInsights({ companyId, user, parsed, result });
  }

  if (moduleName === "maintenance") {
    return buildMaintenanceInlineInsights({ companyId, user, parsed, result });
  }

  if (moduleName === "inventory") {
    return buildInventoryInlineInsights({ companyId, user, parsed, result });
  }

  if (moduleName === "trips") {
    return buildTripsInlineInsights({ companyId, user, parsed, result });
  }

  return [];
}

module.exports = {
  buildInlineInsights,
};