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
      where: {
        company_id: companyId,
        trip_id: tripId,
      },
      orderBy: [{ entered_at: "desc" }],
      select: {
        id: true,
        amount: true,
        currency: true,
        source: true,
        status: true,
        entered_at: true,
        approved_at: true,
        notes: true,
        contract_id: true,
        invoice_id: true,
        entered_by: true,
        approved_by: true,
      },
    }),

    prisma.trip_revenues.findFirst({
      where: {
        company_id: companyId,
        trip_id: tripId,
        status: "APPROVED",
      },
      orderBy: [{ entered_at: "desc" }],
      select: {
        id: true,
        amount: true,
        currency: true,
        source: true,
        status: true,
        entered_at: true,
        approved_at: true,
        notes: true,
        contract_id: true,
        invoice_id: true,
        entered_by: true,
        approved_by: true,
      },
    }),

    prisma.cash_expenses.findMany({
      where: {
        company_id: companyId,
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
        company_id: companyId,
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

  const revenueSourceRow = latestApprovedRevenueRow || latestRevenueRow || null;

  const revenue = revenueSourceRow
    ? toAmount(revenueSourceRow.amount)
    : toAmount(trip.agreed_revenue);

  const profit = revenue - expenses;

  let profitStatus = "BREAK_EVEN";
  if (profit > 0) profitStatus = "PROFIT";
  if (profit < 0) profitStatus = "LOSS";

  return {
    trip_id: trip.id,
    company_id: trip.company_id,
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
    latest_revenue_record: latestRevenueRow || null,
    latest_approved_revenue_record: latestApprovedRevenueRow || null,

    breakdown_by_type: breakdownByType,

    expenses_items: approvedExpenses,
    pending_expenses_items: pendingExpenses,
  };
}

module.exports = {
  getTripFinanceSummary,
};