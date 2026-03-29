const prisma = require("../maintenance/prisma");

function toMoney(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

function isOverdue(dueDate, now = new Date()) {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  return d < now;
}

async function getOutstandingInvoicesBase({ companyId, range }) {
  return prisma.ar_invoices.findMany({
    where: {
      company_id: companyId,
      issue_date: {
        gte: range.from,
        lte: range.to,
      },
      status: {
        in: ["APPROVED", "PARTIALLY_PAID", "PAID"],
      },
    },
    select: {
      id: true,
      client_id: true,
      total_amount: true,
      due_date: true,
      status: true,
      issue_date: true,
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      payments: {
        select: {
          amount_allocated: true,
          payment: {
            select: {
              status: true,
            },
          },
        },
      },
    },
    orderBy: {
      issue_date: "desc",
    },
  });
}

function buildInvoiceOutstandingRow(row, now = new Date()) {
  const totalAmount = toMoney(row?.total_amount || 0);

  const paidAmount = toMoney(
    (row?.payments || [])
      .filter((p) => String(p?.payment?.status || "").toUpperCase() === "POSTED")
      .reduce((sum, p) => sum + Number(p?.amount_allocated || 0), 0)
  );

  const remainingAmount = Math.max(0, toMoney(totalAmount - paidAmount));
  const overdue = remainingAmount > 0 && isOverdue(row?.due_date, now);

  return {
    invoice_id: row.id,
    client_id: row.client_id,
    client_name: row?.client?.name || "عميل غير معروف",
    issue_date: row.issue_date || null,
    due_date: row.due_date || null,
    status: row.status || null,
    total_amount: totalAmount,
    paid_amount: paidAmount,
    remaining_amount: remainingAmount,
    is_overdue: overdue,
  };
}

async function getOutstandingSummary({ companyId, range, scope }) {
  const now = new Date();
  const rows = await getOutstandingInvoicesBase({ companyId, range });

  let total_outstanding = 0;
  let overdue_amount = 0;
  let current_amount = 0;

  let approved_count = 0;
  let partially_paid_count = 0;
  let paid_count = 0;
  let open_invoice_count = 0;

  for (const row of rows) {
    const item = buildInvoiceOutstandingRow(row, now);
    const status = String(item.status || "").toUpperCase();

    if (status === "APPROVED") approved_count += 1;
    else if (status === "PARTIALLY_PAID") partially_paid_count += 1;
    else if (status === "PAID") paid_count += 1;

    if (item.remaining_amount > 0) {
      open_invoice_count += 1;
      total_outstanding += item.remaining_amount;

      if (item.is_overdue) overdue_amount += item.remaining_amount;
      else current_amount += item.remaining_amount;
    }
  }

  total_outstanding = toMoney(total_outstanding);
  overdue_amount = toMoney(overdue_amount);
  current_amount = toMoney(current_amount);

  return {
    metric: "ar_outstanding_summary",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
      role: scope?.role || null,
    },
    data: {
      total_outstanding,
      overdue_amount,
      current_amount,
      invoice_count: open_invoice_count,
      approved_count,
      partially_paid_count,
      paid_count,
    },
    summary: {
      currency: "EGP",
    },
  };
}

async function getTopDebtors({ companyId, range, scope, limit = 10 }) {
  const now = new Date();
  const rows = await getOutstandingInvoicesBase({ companyId, range });

  const map = new Map();

  for (const row of rows) {
    const item = buildInvoiceOutstandingRow(row, now);
    if (item.remaining_amount <= 0) continue;

    const prev = map.get(item.client_id) || {
      client_id: item.client_id,
      client_name: item.client_name,
      total_outstanding: 0,
      overdue_amount: 0,
      current_amount: 0,
      invoice_count: 0,
    };

    prev.total_outstanding += item.remaining_amount;
    prev.invoice_count += 1;

    if (item.is_overdue) prev.overdue_amount += item.remaining_amount;
    else prev.current_amount += item.remaining_amount;

    map.set(item.client_id, prev);
  }

  const items = Array.from(map.values())
    .map((item) => ({
      client_id: item.client_id,
      client_name: item.client_name,
      total_outstanding: toMoney(item.total_outstanding),
      overdue_amount: toMoney(item.overdue_amount),
      current_amount: toMoney(item.current_amount),
      invoice_count: item.invoice_count,
    }))
    .filter((item) => item.total_outstanding > 0)
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
    .slice(0, limit);

  const grandTotal = toMoney(
    items.reduce((sum, item) => sum + Number(item.total_outstanding || 0), 0)
  );

  return {
    metric: "ar_top_debtors",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
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