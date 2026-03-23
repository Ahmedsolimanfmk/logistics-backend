const prisma = require("../prisma");
const tripFinanceService = require("../trips/trip-finance.service");

// =======================
// Helpers
// =======================
function safeUpper(v) {
  return String(v || "").toUpperCase();
}

function toAmount(v) {
  return Number(v || 0);
}

// =======================
// Service
// =======================
async function getTripFinanceSummary(tripId) {
  const trip = await prisma.trips.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      agreed_revenue: true,
      revenue_currency: true,
      financial_status: true,
      client_id: true,
    },
  });

  if (!trip) {
    const err = new Error("Trip not found");
    err.statusCode = 404;
    throw err;
  }

  const revenueRow = await prisma.trip_revenues.findFirst({
    where: { trip_id: tripId },
    orderBy: { entered_at: "desc" },
    select: {
      id: true,
      amount: true,
      currency: true,
      source: true,
      entered_at: true,
      approved_at: true,
      notes: true,
    },
  });

  const approvedExpenses = await prisma.cash_expenses.findMany({
    where: {
      trip_id: tripId,
      approval_status: { in: ["APPROVED", "REAPPROVED"] },
    },
    select: {
      id: true,
      amount: true,
      payment_source: true,
      expense_type: true,
      approval_status: true,
    },
  });

  const pendingExpenses = await prisma.cash_expenses.findMany({
    where: {
      trip_id: tripId,
      approval_status: { in: ["PENDING", "APPEALED"] },
    },
    select: {
      id: true,
      amount: true,
      payment_source: true,
      expense_type: true,
      approval_status: true,
    },
  });

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

  const revenue = revenueRow
    ? toAmount(revenueRow.amount)
    : toAmount(trip.agreed_revenue);

  const profit = revenue - expenses;

  let profitStatus = "BREAK_EVEN";
  if (profit > 0) profitStatus = "PROFIT";
  if (profit < 0) profitStatus = "LOSS";

  return {
    trip_id: trip.id,
    financial_status: trip.financial_status || "OPEN",

    revenue,
    expenses,
    pending_expenses: pendingExpensesTotal,

    company_expenses: companyExpenses,
    advance_expenses: advanceExpenses,

    profit,
    profit_status: profitStatus,

    currency: revenueRow?.currency || trip.revenue_currency || "EGP",
    revenue_record: revenueRow || null,
    breakdown_by_type: breakdownByType,
  };
}

module.exports = {
  getTripFinanceSummary,
};