const prisma = require("../prisma");

function toMoney(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

function buildBaseWhere(range) {
  return {
    created_at: {
      gte: range.from,
      lte: range.to,
    },
  };
}

function buildNonRejectedWhere(range) {
  return {
    ...buildBaseWhere(range),
    approval_status: {
      not: "REJECTED",
    },
  };
}

async function getExpenseSummary({ range, scope }) {
  const where = buildBaseWhere(range);

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
    const amount = toMoney(row.amount || 0);
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
      total_expense: toMoney(total_expense),
      approved_expense: toMoney(approved_expense),
      pending_expense: toMoney(pending_expense),
      rejected_expense: toMoney(rejected_expense),
      advance_expense: toMoney(advance_expense),
      company_expense: toMoney(company_expense),
      count: rows.length,
    },
    summary: {
      currency: "EGP",
    },
  };
}

async function getExpenseByType({ range, scope, limit = 50 }) {
  const where = buildNonRejectedWhere(range);

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
    take: limit,
  });

  const items = rows.map((row) => ({
    expense_type: row.expense_type || "UNKNOWN",
    total_amount: toMoney(row._sum.amount || 0),
    count: row._count._all || 0,
  }));

  const grandTotal = toMoney(items.reduce((sum, item) => sum + item.total_amount, 0));

  return {
    metric: "expense_by_type",
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
      types_count: items.length,
      total_expense: grandTotal,
    },
  };
}

async function getExpenseByVehicle({ range, scope, limit = 10 }) {
  const where = {
    ...buildNonRejectedWhere(range),
    vehicle_id: {
      not: null,
    },
  };

  const rows = await prisma.cash_expenses.groupBy({
    by: ["vehicle_id"],
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
    take: limit,
  });

  const vehicleIds = rows.map((r) => r.vehicle_id).filter(Boolean);

  const vehicles = vehicleIds.length
    ? await prisma.vehicles.findMany({
        where: {
          id: { in: vehicleIds },
        },
        select: {
          id: true,
          fleet_no: true,
          plate_no: true,
          display_name: true,
        },
      })
    : [];

  const vehicleMap = new Map(vehicles.map((v) => [v.id, v]));

  const items = rows.map((row) => {
    const vehicle = vehicleMap.get(row.vehicle_id);

    return {
      vehicle_id: row.vehicle_id,
      fleet_no: vehicle?.fleet_no || null,
      plate_no: vehicle?.plate_no || null,
      display_name: vehicle?.display_name || null,
      total_amount: toMoney(row._sum.amount || 0),
      count: row._count._all || 0,
    };
  });

  return {
    metric: "expense_by_vehicle",
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
      vehicles_count: items.length,
      total_expense: toMoney(items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)),
    },
  };
}

async function getExpenseByPaymentSource({ range, scope }) {
  const where = buildNonRejectedWhere(range);

  const rows = await prisma.cash_expenses.groupBy({
    by: ["payment_source"],
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
    payment_source: row.payment_source || "UNKNOWN",
    total_amount: toMoney(row._sum.amount || 0),
    count: row._count._all || 0,
  }));

  const grandTotal = toMoney(items.reduce((sum, item) => sum + item.total_amount, 0));

  return {
    metric: "expense_by_payment_source",
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
      sources_count: items.length,
      total_expense: grandTotal,
    },
  };
}

async function getTopVendors({ range, scope, limit = 10 }) {
  const where = {
    ...buildNonRejectedWhere(range),
    vendor_name: {
      not: null,
    },
  };

  const rows = await prisma.cash_expenses.groupBy({
    by: ["vendor_name"],
    where,
    _sum: {
      amount: true,
      vat_amount: true,
      invoice_total: true,
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _sum: {
        amount: "desc",
      },
    },
    take: limit,
  });

  const items = rows.map((row) => ({
    vendor_name: row.vendor_name || "مورد غير معروف",
    total_amount: toMoney(row._sum.amount || 0),
    total_vat: toMoney(row._sum.vat_amount || 0),
    total_invoice_amount: toMoney(row._sum.invoice_total || 0),
    count: row._count._all || 0,
  }));

  return {
    metric: "expense_top_vendors",
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
      vendors_count: items.length,
      total_expense: toMoney(items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)),
    },
  };
}

async function getExpenseApprovalBreakdown({ range, scope }) {
  const where = buildBaseWhere(range);

  const rows = await prisma.cash_expenses.groupBy({
    by: ["approval_status"],
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
    approval_status: row.approval_status || "UNKNOWN",
    total_amount: toMoney(row._sum.amount || 0),
    count: row._count._all || 0,
  }));

  const grandTotal = toMoney(items.reduce((sum, item) => sum + item.total_amount, 0));

  return {
    metric: "expense_approval_breakdown",
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
      statuses_count: items.length,
      total_expense: grandTotal,
    },
  };
}

module.exports = {
  getExpenseSummary,
  getExpenseByType,
  getExpenseByVehicle,
  getExpenseByPaymentSource,
  getTopVendors,
  getExpenseApprovalBreakdown,
};