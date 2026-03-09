const prisma = require("../prisma");

async function getExpenseSummary({ range, scope }) {
  const where = {
    created_at: {
      gte: range.from,
      lte: range.to,
    },
  };

  // لو لاحقًا احتجنا نضيف scope فعلي حسب الدور
  // نقدر نضيفه هنا تدريجيًا

  const rows = await prisma.cash_expenses.findMany({
    where,
    select: {
      amount: true,
      approval_status: true,
      payment_source: true,
      expense_type: true,
      trip_id: true,
      vehicle_id: true,
      created_at: true,
    },
  });

  let total_expense = 0;
  let approved_expense = 0;
  let pending_expense = 0;
  let rejected_expense = 0;

  let advance_expense = 0;
  let company_expense = 0;

  for (const row of rows) {
    const amount = Number(row.amount || 0);
    total_expense += amount;

    const approvalStatus = String(row.approval_status || "").toUpperCase();
    const paymentSource = String(row.payment_source || "").toUpperCase();

    if (approvalStatus === "APPROVED") approved_expense += amount;
    else if (approvalStatus === "PENDING") pending_expense += amount;
    else if (approvalStatus === "REJECTED") rejected_expense += amount;

    if (paymentSource === "ADVANCE") advance_expense += amount;
    else if (paymentSource === "COMPANY") company_expense += amount;
  }

  return {
    metric: "expense_summary",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
    },
    data: {
      total_expense,
      approved_expense,
      pending_expense,
      rejected_expense,
      advance_expense,
      company_expense,
      count: rows.length,
    },
    summary: {
      currency: "EGP",
    },
  };
}
async function getExpenseByType({ range, scope }) {
  const where = {
    created_at: {
      gte: range.from,
      lte: range.to,
    },
  };

  const rows = await prisma.cash_expenses.groupBy({
    by: ["expense_type"],
    where,
    _sum: {
      amount: true,
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _sum: {
        amount: "desc",
      },
    },
  });

  const items = rows.map((row) => ({
    expense_type: row.expense_type || "UNKNOWN",
    total_amount: Number(row._sum.amount || 0),
    count: row._count._all || 0,
  }));

  const grandTotal = items.reduce((sum, item) => sum + item.total_amount, 0);

  return {
    metric: "expense_by_type",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
    },
    data: {
      items,
    },
    summary: {
      currency: "EGP",
      types_count: items.length,
      total_expense: grandTotal,
    },
  };
}
module.exports = {
  getExpenseSummary,
  getExpenseByType,
};