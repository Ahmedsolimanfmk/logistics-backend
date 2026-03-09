const prisma = require("../prisma");

async function getExpenseSummary({ range }) {
  const rows = await prisma.expenses.findMany({
    where: {
      expense_date: {
        gte: range.from,
        lte: range.to,
      },
    },
    select: {
      amount: true,
      status: true,
    },
  });

  let total_expense = 0;
  let approved_expense = 0;
  let pending_expense = 0;
  let rejected_expense = 0;

  for (const row of rows) {
    const amount = Number(row.amount || 0);
    total_expense += amount;

    const status = String(row.status || "").toLowerCase();

    if (status === "approved") approved_expense += amount;
    else if (status === "pending") pending_expense += amount;
    else if (status === "rejected") rejected_expense += amount;
  }

  return {
    metric: "expense_summary",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    data: {
      total_expense,
      approved_expense,
      pending_expense,
      rejected_expense,
      count: rows.length,
    },
    summary: {
      currency: "EGP",
    },
  };
}

module.exports = {
  getExpenseSummary,
};