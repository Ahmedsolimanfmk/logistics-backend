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

  const [
    currentRevenueRow,
    currentApprovedRevenueRow,
    approvedExpenses,
    pendingExpenses,
  ] = await Promise.all([
    prisma.trip_revenues.findFirst({
      where: {
        trip_id: tripId,
        is_current: true,
      },
      orderBy: { version_no: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        source: true,
        entered_at: true,
        approved_at: true,
        notes: true,
        is_current: true,
        version_no: true,
        is_approved: true,
        approval_notes: true,
        pricing_rule_id: true,
        pricing_rule_snapshot: true,
      },
    }),

    prisma.trip_revenues.findFirst({
      where: {
        trip_id: tripId,
        is_current: true,
        is_approved: true,
      },
      orderBy: { version_no: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        source: true,
        entered_at: true,
        approved_at: true,
        notes: true,
        is_current: true,
        version_no: true,
        is_approved: true,
        approval_notes: true,
        pricing_rule_id: true,
        pricing_rule_snapshot: true,
      },
    }),

    prisma.cash_expenses.findMany({
      where: {
        trip_id: tripId,
        approval_status: "APPROVED",
      },
      select: {
        id: true,
        amount: true,
        payment_source: true,
        expense_type: true,
        approval_status: true,
        created_at: true,
      },
    }),

    prisma.cash_expenses.findMany({
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
        created_at: true,
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

  const revenueSourceRow = currentApprovedRevenueRow || currentRevenueRow || null;

  const revenue = revenueSourceRow
    ? toAmount(revenueSourceRow.amount)
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

    currency: revenueSourceRow?.currency || trip.revenue_currency || "EGP",

    revenue_record: revenueSourceRow,
    current_revenue_record: currentRevenueRow || null,
    current_approved_revenue_record: currentApprovedRevenueRow || null,

    breakdown_by_type: breakdownByType,

    expenses_items: approvedExpenses,
    pending_expenses_items: pendingExpenses,
  };
}

module.exports = {
  getTripFinanceSummary,
};