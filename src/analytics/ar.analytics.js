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

async function getTopDebtors({ range, scope, limit = 10 }) {
  const rows = await prisma.ar_invoices.groupBy({
    by: ["client_id"],
    where: {
      issue_date: {
        gte: range.from,
        lte: range.to,
      },
      status: {
        notIn: ["CANCELLED", "REJECTED", "DRAFT", "PAID"],
      },
    },
    _sum: {
      total_amount: true,
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _sum: {
        total_amount: "desc",
      },
    },
    take: limit,
  });

  const clientIds = rows.map((r) => r.client_id);

  const clients = clientIds.length
    ? await prisma.clients.findMany({
        where: {
          id: { in: clientIds },
        },
        select: {
          id: true,
          name: true,
        },
      })
    : [];

  const clientMap = new Map(clients.map((c) => [c.id, c.name]));

  const items = rows.map((row) => ({
    client_id: row.client_id,
    client_name: clientMap.get(row.client_id) || "عميل غير معروف",
    total_outstanding: Number(row._sum.total_amount || 0),
    invoice_count: row._count._all || 0,
  }));

  const grandTotal = items.reduce((sum, item) => sum + item.total_outstanding, 0);

  return {
    metric: "ar_top_debtors",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      role: scope?.role || null,
      limit,
    },
    data: {
      items,
    },
    summary: {
      currency: "EGP",
      clients_count: items.length,
      total_outstanding: grandTotal,
    },
  };
}

module.exports = {
  getOutstandingSummary,
  getTopDebtors,
};