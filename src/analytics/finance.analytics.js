const prisma = require("../maintenance/prisma");

function toMoney(v) {
  return Math.round(Number(v || 0) * 100) / 100;
}

function normalizeHint(v) {
  return String(v || "").trim();
}

function buildBaseWhere(companyId, range) {
  return {
    company_id: companyId,
    created_at: {
      gte: range.from,
      lte: range.to,
    },
  };
}

function buildNonRejectedWhere(companyId, range) {
  return {
    ...buildBaseWhere(companyId, range),
    approval_status: {
      not: "REJECTED",
    },
  };
}

function buildExpenseTypeFilter(expenseType) {
  const hint = normalizeHint(expenseType);
  if (!hint) return {};
  return {
    expense_type: hint,
  };
}

function buildPaymentSourceFilter(paidMethod) {
  const hint = normalizeHint(paidMethod);
  if (!hint) return {};

  const normalized = hint.toLowerCase();
  const map = {
    cash: "CASH",
    كاش: "CASH",
    نقدي: "CASH",
    bank: "BANK_TRANSFER",
    بنك: "BANK_TRANSFER",
    تحويل: "BANK_TRANSFER",
    "bank transfer": "BANK_TRANSFER",
    عهدة: "ADVANCE",
    عهده: "ADVANCE",
    advance: "ADVANCE",
    شركة: "COMPANY",
    شركه: "COMPANY",
    company: "COMPANY",
  };

  return {
    payment_source: map[normalized] || hint.toUpperCase(),
  };
}

async function resolveVehicleIdsByHint(companyId, vehicleHint) {
  const hint = normalizeHint(vehicleHint);
  if (!hint) return null;

  const vehicles = await prisma.vehicles.findMany({
    where: {
      company_id: companyId,
      OR: [
        { id: hint },
        { fleet_no: { contains: hint, mode: "insensitive" } },
        { plate_no: { contains: hint, mode: "insensitive" } },
        { display_name: { contains: hint, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
    },
    take: 20,
  });

  const ids = vehicles.map((v) => v.id).filter(Boolean);
  return ids.length ? ids : ["__NO_MATCH__"];
}

async function resolveVendorIdsByHint(companyId, vendorHint) {
  const hint = normalizeHint(vendorHint);
  if (!hint) return null;

  const vendors = await prisma.vendors.findMany({
    where: {
      company_id: companyId,
      OR: [
        { id: hint },
        { name: { contains: hint, mode: "insensitive" } },
        { code: { contains: hint, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
    },
    take: 20,
  });

  const ids = vendors.map((v) => v.id).filter(Boolean);
  return ids.length ? ids : ["__NO_MATCH__"];
}

async function buildExpenseWhere(companyId, range, query = {}, { nonRejected = false } = {}) {
  const where = nonRejected
    ? buildNonRejectedWhere(companyId, range)
    : buildBaseWhere(companyId, range);

  if (query?.expense_type) {
    Object.assign(where, buildExpenseTypeFilter(query.expense_type));
  }

  if (query?.paid_method) {
    Object.assign(where, buildPaymentSourceFilter(query.paid_method));
  }

  if (query?.vehicle_hint) {
    const vehicleIds = await resolveVehicleIdsByHint(companyId, query.vehicle_hint);
    where.vehicle_id = { in: vehicleIds };
  }

  if (query?.vendor_hint || query?.vendor_name) {
    const vendorIds = await resolveVendorIdsByHint(
      companyId,
      query.vendor_hint || query.vendor_name
    );
    where.vendor_id = { in: vendorIds };
  }

  return where;
}

async function getExpenseSummary({ companyId, range, scope, query = {} }) {
  const where = await buildExpenseWhere(companyId, range, query);

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
      vendor_id: true,
      vendor: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
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
      company_id: companyId,
      role: scope?.role || null,
      vehicle_hint: query?.vehicle_hint || null,
      vendor_hint: query?.vendor_hint || query?.vendor_name || null,
      expense_type: query?.expense_type || null,
      paid_method: query?.paid_method || null,
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

async function getExpenseByType({ companyId, range, scope, limit = 50, query = {} }) {
  const where = await buildExpenseWhere(companyId, range, query, { nonRejected: true });

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
      company_id: companyId,
      role: scope?.role || null,
      limit,
      vehicle_hint: query?.vehicle_hint || null,
      vendor_hint: query?.vendor_hint || query?.vendor_name || null,
      paid_method: query?.paid_method || null,
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

async function getExpenseByVehicle({ companyId, range, scope, limit = 10, query = {} }) {
  const where = await buildExpenseWhere(companyId, range, query, { nonRejected: true });

  if (!query?.vehicle_hint) {
    where.vehicle_id = { not: null };
  }

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
          company_id: companyId,
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
      company_id: companyId,
      role: scope?.role || null,
      limit,
      vehicle_hint: query?.vehicle_hint || null,
      vendor_hint: query?.vendor_hint || query?.vendor_name || null,
      expense_type: query?.expense_type || null,
      paid_method: query?.paid_method || null,
    },
    data: {
      items,
    },
    summary: {
      currency: "EGP",
      vehicles_count: items.length,
      total_expense: toMoney(
        items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
      ),
    },
  };
}

async function getExpenseByPaymentSource({ companyId, range, scope, query = {} }) {
  const where = await buildExpenseWhere(companyId, range, query, { nonRejected: true });

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
      company_id: companyId,
      role: scope?.role || null,
      vehicle_hint: query?.vehicle_hint || null,
      vendor_hint: query?.vendor_hint || query?.vendor_name || null,
      expense_type: query?.expense_type || null,
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

async function getTopVendors({ companyId, range, scope, limit = 10, query = {} }) {
  const where = await buildExpenseWhere(companyId, range, query, { nonRejected: true });

  where.vendor_id = query?.vendor_hint || query?.vendor_name
    ? where.vendor_id
    : { not: null };

  const rows = await prisma.cash_expenses.groupBy({
    by: ["vendor_id"],
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

  const vendorIds = rows.map((r) => r.vendor_id).filter(Boolean);

  const vendors = vendorIds.length
    ? await prisma.vendors.findMany({
        where: {
          company_id: companyId,
          id: { in: vendorIds },
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
      })
    : [];

  const vendorMap = new Map(vendors.map((v) => [v.id, v]));

  const items = rows.map((row) => {
    const vendor = vendorMap.get(row.vendor_id);

    return {
      vendor_id: row.vendor_id,
      vendor_name: vendor?.name || "مورد غير معروف",
      vendor_code: vendor?.code || null,
      total_amount: toMoney(row._sum.amount || 0),
      total_vat: toMoney(row._sum.vat_amount || 0),
      total_invoice_amount: toMoney(row._sum.invoice_total || 0),
      count: row._count._all || 0,
    };
  });

  return {
    metric: "expense_top_vendors",
    range: {
      from: range.from,
      to: range.to,
      key: range.key,
    },
    filters: {
      company_id: companyId,
      role: scope?.role || null,
      limit,
      vehicle_hint: query?.vehicle_hint || null,
      expense_type: query?.expense_type || null,
      paid_method: query?.paid_method || null,
      vendor_hint: query?.vendor_hint || query?.vendor_name || null,
    },
    data: {
      items,
    },
    summary: {
      currency: "EGP",
      vendors_count: items.length,
      total_expense: toMoney(
        items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0)
      ),
    },
  };
}

async function getExpenseApprovalBreakdown({ companyId, range, scope, query = {} }) {
  const where = await buildExpenseWhere(companyId, range, query);

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
      company_id: companyId,
      role: scope?.role || null,
      vehicle_hint: query?.vehicle_hint || null,
      vendor_hint: query?.vendor_hint || query?.vendor_name || null,
      expense_type: query?.expense_type || null,
      paid_method: query?.paid_method || null,
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