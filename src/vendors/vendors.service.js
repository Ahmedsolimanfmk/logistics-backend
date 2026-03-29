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

function toNullableBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;

  return null;
}

function toNullableDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeEnum(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim().toUpperCase();
}

function buildWhere(companyId, query) {
  const q = toNullableString(query && query.q);
  const vendor_type = normalizeEnum(query && query.vendor_type);
  const classification = normalizeEnum(query && query.classification);
  const status = normalizeEnum(query && query.status);
  const is_blacklisted = toNullableBoolean(query && query.is_blacklisted);

  const where = {
    company_id: companyId,
  };

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { phone2: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { contact_person: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { specialization: { contains: q, mode: "insensitive" } },
      { tax_no: { contains: q, mode: "insensitive" } },
      { commercial_register: { contains: q, mode: "insensitive" } },
    ];
  }

  if (vendor_type) where.vendor_type = vendor_type;
  if (classification) where.classification = classification;
  if (status) where.status = status;
  if (is_blacklisted !== null) where.is_blacklisted = is_blacklisted;

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
    currency: toNullableString(payload.currency) || "EGP",
    opening_balance: toNullableDecimal(payload.opening_balance),
    opening_balance_date: toNullableDate(payload.opening_balance_date),
    credit_limit: toNullableDecimal(payload.credit_limit),
    is_blacklisted: toNullableBoolean(payload.is_blacklisted) ?? false,
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

async function ensureCodeUnique(companyId, code, excludeId) {
  if (!code) return;

  const where = {
    company_id: companyId,
    code,
  };

  if (excludeId) {
    where.id = { not: excludeId };
  }

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

async function getVendorOrThrow(companyId, id) {
  const vendor = await prisma.vendors.findFirst({
    where: {
      id,
      company_id: companyId,
    },
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
async function list(companyId, query) {
  query = query || {};

  const page = Math.max(parseInt(query.page || "1", 10), 1);
  const pageSize = Math.min(
    Math.max(parseInt(query.pageSize || "25", 10), 1),
    100
  );
  const skip = (page - 1) * pageSize;

  const where = buildWhere(companyId, query);

  const [items, total] = await Promise.all([
    prisma.vendors.findMany({
      where,
      orderBy: [{ created_at: "desc" }, { name: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.vendors.count({ where }),
  ]);

  const pages = Math.max(Math.ceil(total / pageSize), 1);

  return {
    items,
    total,
    page,
    pageSize,
    pages,
  };
}

async function options(companyId) {
  const items = await prisma.vendors.findMany({
    where: {
      company_id: companyId,
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
      is_blacklisted: true,
    },
    orderBy: [{ name: "asc" }],
  });

  return items;
}

async function getById(companyId, id) {
  const vendor = await getVendorOrThrow(companyId, id);

  const [workOrdersCount, expensesCount, transactionsCount] = await Promise.all([
    prisma.maintenance_work_orders.count({
      where: {
        company_id: companyId,
        vendor_id: id,
      },
    }),
    prisma.cash_expenses.count({
      where: {
        company_id: companyId,
        vendor_id: id,
      },
    }),
    prisma.vendor_transactions.count({
      where: {
        company_id: companyId,
        vendor_id: id,
      },
    }),
  ]);

  return {
    ...vendor,
    stats: {
      work_orders_count: workOrdersCount,
      cash_expenses_count: expensesCount,
      vendor_transactions_count: transactionsCount,
    },
  };
}

async function create(companyId, payload) {
  const data = mapVendorPayload(payload);

  await ensureName(data.name);
  await ensureCodeUnique(companyId, data.code, null);

  const created = await prisma.vendors.create({
    data: {
      ...data,
      company_id: companyId,
    },
  });

  return created;
}

async function update(companyId, id, payload) {
  await getVendorOrThrow(companyId, id);

  const data = mapVendorPayload(payload);

  await ensureName(data.name);
  await ensureCodeUnique(companyId, data.code, id);

  const updated = await prisma.vendors.update({
    where: { id },
    data,
  });

  return updated;
}

async function toggle(companyId, id) {
  const existing = await getVendorOrThrow(companyId, id);

  const nextStatus = existing.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  const updated = await prisma.vendors.update({
    where: { id },
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