// =======================
// src/contracts/contracts.service.js
// =======================

const prisma = require("../prisma");

function s(v) {
  const x = v == null ? "" : String(v);
  const t = x.trim();
  return t ? t : null;
}

function parseDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// =======================
// CREATE
// =======================
async function createContract(data) {
  const {
    client_id,
    contract_no,
    start_date,
    end_date,
    billing_cycle,
    contract_value,
    currency,
    notes,
  } = data;

  if (!client_id) {
    throw { status: 400, message: "client_id is required" };
  }

  if (!start_date) {
    throw { status: 400, message: "start_date is required" };
  }

  const created = await prisma.client_contracts.create({
    data: {
      client_id,
      contract_no: s(contract_no),
      start_date: parseDate(start_date),
      end_date: parseDate(end_date),
      billing_cycle: billing_cycle || "MONTHLY",
      contract_value: contract_value ?? null,
      currency: currency || "EGP",
      notes: s(notes),
    },
  });

  return created;
}

// =======================
// LIST
// =======================
async function listContracts({ client_id, page = 1, limit = 20 }) {
  const skip = (page - 1) * limit;

  const where = client_id ? { client_id } : {};

  const [items, total] = await Promise.all([
    prisma.client_contracts.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: limit,
      include: {
        clients: {
          select: { id: true, name: true },
        },
      },
    }),
    prisma.client_contracts.count({ where }),
  ]);

  return {
    items,
    total,
    meta: {
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

// =======================
// GET BY ID
// =======================
async function getContractById(id) {
  const contract = await prisma.client_contracts.findUnique({
    where: { id },
    include: {
      clients: true,
      contract_pricing_rules: true,
    },
  });

  if (!contract) {
    throw { status: 404, message: "Contract not found" };
  }

  return contract;
}

// =======================
// UPDATE
// =======================
async function updateContract(id, data) {
  const exists = await prisma.client_contracts.findUnique({
    where: { id },
  });

  if (!exists) {
    throw { status: 404, message: "Contract not found" };
  }

  const updated = await prisma.client_contracts.update({
    where: { id },
    data: {
      contract_no: data.contract_no !== undefined ? s(data.contract_no) : undefined,
      start_date: data.start_date ? parseDate(data.start_date) : undefined,
      end_date: data.end_date ? parseDate(data.end_date) : undefined,
      billing_cycle: data.billing_cycle,
      contract_value: data.contract_value,
      currency: data.currency,
      status: data.status,
      notes: data.notes !== undefined ? s(data.notes) : undefined,
    },
  });

  return updated;
}

// =======================
// TOGGLE STATUS
// =======================
async function setContractStatus(id, status) {
  const exists = await prisma.client_contracts.findUnique({
    where: { id },
  });

  if (!exists) {
    throw { status: 404, message: "Contract not found" };
  }

  const updated = await prisma.client_contracts.update({
    where: { id },
    data: { status },
  });

  return updated;
}

module.exports = {
  createContract,
  listContracts,
  getContractById,
  updateContract,
  setContractStatus,
};