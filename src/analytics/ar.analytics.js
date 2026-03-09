const prisma = require("../prisma");

async function getOutstandingSummary({ range, scope }) {
  const now = new Date();

  const rows = await prisma.ar_invoices.findMany({
    where: {
      issue_date: {
        gte: range.from,
        lte: range.to,
      },
      status: {
        notIn: ["CANCELLED", "REJECTED", "DRAFT"],
      },
    },
    select: {
      id: true,
      total_amount: true,
      due_date: true,
      status: true,
    },
    orderBy: {
      issue_date: "desc",
    },
  });

  let total_outstanding = 0;
  let overdue_amount = 0;
  let current_amount = 0;

  let approved_count = 0;
  let partially_paid_count = 0;
  let paid_count = 0;
  let submitted_count = 0;

  for (const row of rows) {
    const amount = Number(row.total_amount || 0);
    const status = String(row.status || "").toUpperCase();

    total_outstanding += amount;

    if (status === "APPROVED") approved_count += 1;
    else if (status === "PARTIALLY_PAID") partially_paid_count += 1;
    else if (status === "PAID") paid_count += 1;
    else if (status === "SUBMITTED") submitted_count += 1;

    const dueDate = row.due_date ? new Date(row.due_date) : null;

    if (dueDate && dueDate < now && status !== "PAID") {
      overdue_amount += amount;
    } else if (status !== "PAID") {
      current_amount += amount;
    }
  }

  return {
    metric: "ar_outstanding_summary",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
    },
    data: {
      total_outstanding,
      overdue_amount,
      current_amount,
      invoice_count: rows.length,
      approved_count,
      partially_paid_count,
      paid_count,
      submitted_count,
    },
    summary: {
      currency: "EGP",
    },
  };
}

module.exports = {
  getOutstandingSummary,
};