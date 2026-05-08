const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function safeUpper(v) {
  return String(v || "").trim().toUpperCase();
}

function toAmount(v) {
  return Number(v || 0);
}

function toMoney(v) {
  return Number(Number(v || 0).toFixed(2));
}

function safeDivide(numerator, denominator) {
  const n = Number(numerator || 0);
  const d = Number(denominator || 0);

  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) {
    return null;
  }

  return toMoney(n / d);
}

function calculateTripFinanceMetrics({
  revenue,
  expenses,
  pendingExpenses,
  profit,
  cargoWeight,
}) {
  const totalRevenue = toAmount(revenue);
  const approvedExpenses = toAmount(expenses);
  const pending = toAmount(pendingExpenses);
  const currentProfit = toAmount(profit);
  const weight = toAmount(cargoWeight);

  const expectedExpenses = approvedExpenses + pending;
  const expectedProfit = totalRevenue - expectedExpenses;

  const profitMarginPct =
    totalRevenue > 0 ? toMoney((currentProfit / totalRevenue) * 100) : null;

  const expectedProfitMarginPct =
    totalRevenue > 0 ? toMoney((expectedProfit / totalRevenue) * 100) : null;

  const costRatioPct =
    totalRevenue > 0 ? toMoney((approvedExpenses / totalRevenue) * 100) : null;

  const expectedCostRatioPct =
    totalRevenue > 0 ? toMoney((expectedExpenses / totalRevenue) * 100) : null;

  const profitPerTon = safeDivide(currentProfit, weight);
  const revenuePerTon = safeDivide(totalRevenue, weight);
  const expensePerTon = safeDivide(approvedExpenses, weight);

  return {
    profit_margin_pct: profitMarginPct,
    cost_ratio_pct: costRatioPct,

    expected_expenses: toMoney(expectedExpenses),
    expected_profit: toMoney(expectedProfit),
    expected_profit_margin_pct: expectedProfitMarginPct,
    expected_cost_ratio_pct: expectedCostRatioPct,

    cargo_weight: weight > 0 ? weight : null,
    profit_per_ton: profitPerTon,
    revenue_per_ton: revenuePerTon,
    expense_per_ton: expensePerTon,
  };
}

function buildTripFinanceFlags(metrics, { profit }) {
  const currentProfit = toAmount(profit);
  const margin = metrics.profit_margin_pct;
  const expectedMargin = metrics.expected_profit_margin_pct;
  const costRatio = metrics.cost_ratio_pct;
  const expectedProfit = metrics.expected_profit;

  return {
    is_loss_making: currentProfit < 0,
    is_expected_loss: Number(expectedProfit || 0) < 0,

    is_low_margin:
      margin !== null && Number(margin) >= 0 && Number(margin) < 10,

    is_expected_low_margin:
      expectedMargin !== null &&
      Number(expectedMargin) >= 0 &&
      Number(expectedMargin) < 10,

    is_high_cost:
      costRatio !== null && Number(costRatio) > 80,

    has_pending_expenses_risk: Number(metrics.expected_expenses || 0) > 0,
  };
}

// =======================
// Service
// =======================
async function getTripFinanceSummary(tripId, companyId) {
  const trip = await prisma.trips.findFirst({
    where: {
      id: tripId,
      company_id: companyId,
    },
    select: {
      id: true,
      company_id: true,
      agreed_revenue: true,
      revenue_currency: true,
      financial_status: true,
      client_id: true,
      cargo_weight: true,
      trip_type: true,
      cargo_type: true,
      origin: true,
      destination: true,
    },
  });

  if (!trip) {
    const err = new Error("Trip not found");
    err.statusCode = 404;
    throw err;
  }

  const [
    latestRevenueRow,
    latestApprovedRevenueRow,
    approvedExpenses,
    pendingExpenses,
  ] = await Promise.all([
    prisma.trip_revenues.findFirst({
      where: { company_id: companyId, trip_id: tripId },
      orderBy: [{ entered_at: "desc" }],
    }),
    prisma.trip_revenues.findFirst({
      where: {
        company_id: companyId,
        trip_id: tripId,
        status: "APPROVED",
      },
      orderBy: [{ entered_at: "desc" }],
    }),
    prisma.cash_expenses.findMany({
      where: {
        company_id: companyId,
        trip_id: tripId,
        approval_status: "APPROVED",
      },
    }),
    prisma.cash_expenses.findMany({
      where: {
        company_id: companyId,
        trip_id: tripId,
        approval_status: { in: ["PENDING", "APPEALED"] },
      },
    }),
  ]);

  let expenses = 0;
  let companyExpenses = 0;
  let advanceExpenses = 0;
  const breakdownByType = {};

  for (const row of approvedExpenses) {
    const amount = toAmount(row.amount);
    expenses += amount;

    if (safeUpper(row.payment_source) === "COMPANY") {
      companyExpenses += amount;
    } else {
      advanceExpenses += amount;
    }

    const key = row.expense_type || "OTHER";
    breakdownByType[key] = toAmount(breakdownByType[key]) + amount;
  }

  const pendingExpensesTotal = pendingExpenses.reduce(
    (sum, row) => sum + toAmount(row.amount),
    0
  );

  const revenueSourceRow = latestApprovedRevenueRow || latestRevenueRow || null;

  const revenue = revenueSourceRow
    ? toAmount(revenueSourceRow.amount)
    : toAmount(trip.agreed_revenue);

  const profit = revenue - expenses;

  let profitStatus = "BREAK_EVEN";
  if (profit > 0) profitStatus = "PROFIT";
  if (profit < 0) profitStatus = "LOSS";

  // =======================
  // Driver Custody Summary ✅ (المكان الصح)
  // =======================
  const custody = await prisma.driver_custody.findMany({
    where: {
      company_id: companyId,
      trip_id: tripId,
    },
  });

  let custodyReceived = 0;
  let custodyTransferred = 0;

  for (const row of custody) {
    const amt = toAmount(row.amount);

    if (row.type === "CASH_RECEIVED") {
      custodyReceived += amt;
    }

    if (row.type === "TRANSFER") {
      custodyTransferred += amt;
    }
  }

  const custodyPending = custodyReceived - custodyTransferred;

  // 🔥 Real Profit
  const realProfit = profit - custodyPending;

  let realProfitStatus = "BREAK_EVEN";
  if (realProfit > 0) realProfitStatus = "PROFIT";
  if (realProfit < 0) realProfitStatus = "LOSS";

  const metrics = calculateTripFinanceMetrics({
    revenue,
    expenses,
    pendingExpenses: pendingExpensesTotal,
    profit,
    cargoWeight: trip.cargo_weight,
  });

  const flags = buildTripFinanceFlags(metrics, { profit });

  return {
    trip_id: trip.id,
    company_id: trip.company_id,
    financial_status: trip.financial_status || "OPEN",

    revenue: toMoney(revenue),
    expenses: toMoney(expenses),
    pending_expenses: toMoney(pendingExpensesTotal),

    profit: toMoney(profit),
    profit_status: profitStatus,

    // 🔥 الجديد
    real_profit: toMoney(realProfit),
    real_profit_status: realProfitStatus,

    custody: {
      received: toMoney(custodyReceived),
      transferred: toMoney(custodyTransferred),
      pending: toMoney(custodyPending),
    },

    metrics,
    flags,
  };
}

module.exports = {
  getTripFinanceSummary,
  calculateTripFinanceMetrics,
};