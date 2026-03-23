const prisma = require("../prisma");

// =======================
// Helpers
// =======================
function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function toNullableDecimal(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeEnum(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim().toUpperCase();
}

function buildWhere(query) {
  const q = toNullableString(query && query.q);
  const vendor_type = normalizeEnum(query && query.vendor_type);
  const classification = normalizeEnum(query && query.classification);
  const status = normalizeEnum(query && query.status);

  const where = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { phone2: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { contact_person: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }

  if (vendor_type) where.vendor_type = vendor_type;
  if (classification) where.classification = classification;
  if (status) where.status = status;

  return where;
}

function mapVendorPayload(payload) {
  payload = payload || {};

  return {
    name: String(payload.name || "").trim(),
    code: toNullableString(payload.code),
    vendor_type: normalizeEnum(payload.vendor_type) || "MAINTENANCE_CENTER",
    classification: normalizeEnum(payload.classification) || "EXTERNAL",
    status: normalizeEnum(payload.status) || "ACTIVE",

    specialization: toNullableString(payload.specialization),
    contact_person: toNullableString(payload.contact_person),
    phone: toNullableString(payload.phone),
    phone2: toNullableString(payload.phone2),
    email: toNullableString(payload.email),
    address: toNullableString(payload.address),
    city: toNullableString(payload.city),
    tax_no: toNullableString(payload.tax_no),
    commercial_register: toNullableString(payload.commercial_register),
    payment_terms: toNullableString(payload.payment_terms),
    opening_balance: toNullableDecimal(payload.opening_balance),
    credit_limit: toNullableDecimal(payload.credit_limit),
    notes: toNullableString(payload.notes),
  };
}

async function ensureName(name) {
  if (!String(name || "").trim()) {
    const err = new Error("Vendor name is required");
    err.statusCode = 400;
    throw err;
  }
}

async function ensureCodeUnique(code, excludeId) {
  if (!code) return;

  const where = excludeId
    ? {
        code: code,
        id: { not: excludeId },
      }
    : {
        code: code,
      };

  const existing = await prisma.vendors.findFirst({
    where,
    select: { id: true, code: true },
  });

  if (existing) {
    const err = new Error("Vendor code already exists");
    err.statusCode = 409;
    throw err;
  }
}

async function getVendorOrThrow(id) {
  const vendor = await prisma.vendors.findUnique({
    where: { id: id },
  });

  if (!vendor) {
    const err = new Error("Vendor not found");
    err.statusCode = 404;
    throw err;
  }

  return vendor;
}

// =======================
// Service
// =======================
async function list(query) {
  query = query || {};

  const page = Math.max(parseInt(query.page || "1", 10), 1);
  const pageSize = Math.min(Math.max(parseInt(query.pageSize || "25", 10), 1), 100);
  const skip = (page - 1) * pageSize;

  const where = buildWhere(query);

  const result = await Promise.all([
    prisma.vendors.findMany({
      where: where,
      orderBy: [{ created_at: "desc" }, { name: "asc" }],
      skip: skip,
      take: pageSize,
    }),
    prisma.vendors.count({ where: where }),
  ]);

  const items = result[0];
  const total = result[1];
  const pages = Math.max(Math.ceil(total / pageSize), 1);

  return {
    items: items,
    total: total,
    page: page,
    pageSize: pageSize,
    pages: pages,
  };
}

async function options() {
  const items = await prisma.vendors.findMany({
    where: {
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      code: true,
      vendor_type: true,
      classification: true,
      city: true,
      phone: true,
    },
    orderBy: [{ name: "asc" }],
  });

  return items;
}

async function getById(id) {
  const vendor = await getVendorOrThrow(id);

  const result = await Promise.all([
    prisma.maintenance_work_orders.count({
      where: { vendor_id: id },
    }),
    prisma.cash_expenses.count({
      where: { vendor_id: id },
    }),
    prisma.vendor_transactions.count({
      where: { vendor_id: id },
    }),
  ]);

  const workOrdersCount = result[0];
  const expensesCount = result[1];
  const transactionsCount = result[2];

  return {
    ...vendor,
    stats: {
      work_orders_count: workOrdersCount,
      cash_expenses_count: expensesCount,
      vendor_transactions_count: transactionsCount,
    },
  };
}

async function create(payload) {
  const data = mapVendorPayload(payload);

  await ensureName(data.name);
  await ensureCodeUnique(data.code, null);

  const created = await prisma.vendors.create({
    data: data,
  });

  return created;
}

async function update(id, payload) {
  await getVendorOrThrow(id);

  const data = mapVendorPayload(payload);

  await ensureName(data.name);
  await ensureCodeUnique(data.code, id);

  const updated = await prisma.vendors.update({
    where: { id: id },
    data: data,
  });

  return updated;
}

async function toggle(id) {
  const existing = await getVendorOrThrow(id);

  const nextStatus = existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  const updated = await prisma.vendors.update({
    where: { id: id },
    data: {
      status: nextStatus,
    },
  });

  return updated;
}

module.exports = {
  list,
  options,
  getById,
  create,
  update,
  toggle,
};