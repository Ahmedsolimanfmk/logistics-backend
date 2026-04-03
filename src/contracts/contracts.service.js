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
  if (v === undefined || v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

function buildError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  return err;
}

function requireCompanyId(company_id) {
  if (!company_id || !isUuid(company_id)) {
    throw buildError("Invalid or missing company_id", 400);
  }
  return company_id;
}

function normalizeStatus(status) {
  if (status === undefined) return undefined;

  const value = s(status);
  if (!value) return null;

  const normalized = value.toUpperCase();
  const allowed = ["ACTIVE", "EXPIRED", "TERMINATED"];

  if (!allowed.includes(normalized)) {
    throw buildError(
      `Invalid status. Allowed values: ${allowed.join(", ")}`,
      400
    );
  }

  return normalized;
}

function normalizeBillingCycle(billing_cycle) {
  if (billing_cycle === undefined) return undefined;

  const value = s(billing_cycle);
  if (!value) return null;

  const normalized = value.toUpperCase();
  const allowed = ["MONTHLY", "QUARTERLY", "YEARLY", "ONE_OFF"];

  if (!allowed.includes(normalized)) {
    throw buildError(
      `Invalid billing_cycle. Allowed values: ${allowed.join(", ")}`,
      400
    );
  }

  return normalized;
}

async function ensureClientExists(client_id, company_id) {
  if (!client_id) {
    throw buildError("client_id is required", 400);
  }

  if (!isUuid(client_id)) {
    throw buildError("Invalid client_id", 400);
  }

  const client = await prisma.clients.findFirst({
    where: {
      id: client_id,
      company_id,
    },
    select: {
      id: true,
      company_id: true,
      name: true,
      is_active: true,
    },
  });

  if (!client) {
    throw buildError("Client not found", 404);
  }

  return client;
}

function contractInclude() {
  return {
    client: {
      select: {
        id: true,
        name: true,
      },
    },
  };
}

async function getContractOrThrow(id, company_id) {
  if (!isUuid(id)) {
    throw buildError("Invalid contract id", 400);
  }

  const contract = await prisma.client_contracts.findFirst({
    where: {
      id,
      client: {
        company_id,
      },
    },
    include: contractInclude(),
  });

  if (!contract) {
    throw buildError("Contract not found", 404);
  }

  return contract;
}

// =======================
// CREATE
// =======================
async function createContract(data) {
  const company_id = requireCompanyId(data.company_id);

  const {
    client_id,
    contract_no,
    start_date,
    end_date,
    signed_at,
    terminated_at,
    termination_reason,
    document_url,
    billing_cycle,
    contract_value,
    currency,
    notes,
    status,
  } = data;

  if (!client_id) {
    throw buildError("client_id is required", 400);
  }

  if (!start_date) {
    throw buildError("start_date is required", 400);
  }

  const startDate = parseDate(start_date);
  const endDate = parseDate(end_date);
  const signedAt = parseDate(signed_at);
  const terminatedAt = parseDate(terminated_at);

  if (!startDate) {
    throw buildError("Invalid start_date", 400);
  }

  if (end_date && !endDate) {
    throw buildError("Invalid end_date", 400);
  }

  if (signed_at && !signedAt) {
    throw buildError("Invalid signed_at", 400);
  }

  if (terminated_at && !terminatedAt) {
    throw buildError("Invalid terminated_at", 400);
  }

  if (startDate && endDate && startDate > endDate) {
    throw buildError("start_date cannot be after end_date", 400);
  }

  const client = await ensureClientExists(client_id, company_id);

  const created = await prisma.client_contracts.create({
    data: {
      client_id: client.id,
      contract_no: s(contract_no),
      start_date: startDate,
      end_date: endDate,
      signed_at: signedAt,
      terminated_at: terminatedAt,
      termination_reason: s(termination_reason),
      document_url: s(document_url),
      billing_cycle: normalizeBillingCycle(billing_cycle) || "MONTHLY",
      contract_value: contract_value ?? null,
      currency: s(currency) || "EGP",
      status: normalizeStatus(status) || "ACTIVE",
      notes: s(notes),
    },
    include: contractInclude(),
  });

  return created;
}

// =======================
// LIST
// =======================
async function listContracts({ company_id, client_id, page = 1, limit = 20 }) {
  requireCompanyId(company_id);

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const skip = (safePage - 1) * safeLimit;

  const where = {
    client: {
      company_id,
    },
  };

  if (client_id !== undefined && client_id !== null && client_id !== "") {
    if (!isUuid(client_id)) {
      throw buildError("Invalid client_id", 400);
    }

    const client = await ensureClientExists(client_id, company_id);
    where.client_id = client.id;
  }

  const [items, total] = await Promise.all([
    prisma.client_contracts.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip,
      take: safeLimit,
      include: contractInclude(),
    }),
    prisma.client_contracts.count({ where }),
  ]);

  return {
    items,
    total,
    meta: {
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    },
  };
}

// =======================
// GET BY ID
// =======================
async function getContractById(id, company_id) {
  requireCompanyId(company_id);
  return getContractOrThrow(id, company_id);
}

// =======================
// UPDATE
// =======================
async function updateContract(id, data, company_id) {
  requireCompanyId(company_id);

  const exists = await getContractOrThrow(id, company_id);

  let nextClientId = exists.client_id;
  if (data.client_id !== undefined) {
    if (!data.client_id) {
      throw buildError("client_id cannot be empty", 400);
    }

    const client = await ensureClientExists(data.client_id, company_id);
    nextClientId = client.id;
  }

  let nextStartDate;
  if (data.start_date !== undefined) {
    nextStartDate = parseDate(data.start_date);
    if (data.start_date && !nextStartDate) {
      throw buildError("Invalid start_date", 400);
    }
  }

  let nextEndDate;
  if (data.end_date !== undefined) {
    if (data.end_date === null || data.end_date === "") {
      nextEndDate = null;
    } else {
      nextEndDate = parseDate(data.end_date);
      if (!nextEndDate) {
        throw buildError("Invalid end_date", 400);
      }
    }
  }

  let nextSignedAt;
  if (data.signed_at !== undefined) {
    if (data.signed_at === null || data.signed_at === "") {
      nextSignedAt = null;
    } else {
      nextSignedAt = parseDate(data.signed_at);
      if (!nextSignedAt) {
        throw buildError("Invalid signed_at", 400);
      }
    }
  }

  let nextTerminatedAt;
  if (data.terminated_at !== undefined) {
    if (data.terminated_at === null || data.terminated_at === "") {
      nextTerminatedAt = null;
    } else {
      nextTerminatedAt = parseDate(data.terminated_at);
      if (!nextTerminatedAt) {
        throw buildError("Invalid terminated_at", 400);
      }
    }
  }

  const effectiveStartDate =
    data.start_date !== undefined ? nextStartDate : exists.start_date;
  const effectiveEndDate =
    data.end_date !== undefined ? nextEndDate : exists.end_date;

  if (
    effectiveStartDate &&
    effectiveEndDate &&
    effectiveStartDate > effectiveEndDate
  ) {
    throw buildError("start_date cannot be after end_date", 400);
  }

  const updated = await prisma.client_contracts.update({
    where: { id: exists.id },
    data: {
      client_id: nextClientId,
      contract_no:
        data.contract_no !== undefined ? s(data.contract_no) : undefined,
      start_date: data.start_date !== undefined ? nextStartDate : undefined,
      end_date: data.end_date !== undefined ? nextEndDate : undefined,
      signed_at: data.signed_at !== undefined ? nextSignedAt : undefined,
      terminated_at:
        data.terminated_at !== undefined ? nextTerminatedAt : undefined,
      termination_reason:
        data.termination_reason !== undefined
          ? s(data.termination_reason)
          : undefined,
      document_url:
        data.document_url !== undefined ? s(data.document_url) : undefined,
      billing_cycle:
        data.billing_cycle !== undefined
          ? normalizeBillingCycle(data.billing_cycle)
          : undefined,
      contract_value:
        data.contract_value !== undefined ? data.contract_value : undefined,
      currency: data.currency !== undefined ? s(data.currency) : undefined,
      status:
        data.status !== undefined ? normalizeStatus(data.status) : undefined,
      notes: data.notes !== undefined ? s(data.notes) : undefined,
    },
    include: contractInclude(),
  });

  return updated;
}

// =======================
// SET STATUS
// =======================
async function setContractStatus(id, status, company_id) {
  requireCompanyId(company_id);

  const exists = await getContractOrThrow(id, company_id);
  const normalizedStatus = normalizeStatus(status);

  if (!normalizedStatus) {
    throw buildError("status is required", 400);
  }

  const updated = await prisma.client_contracts.update({
    where: { id: exists.id },
    data: { status: normalizedStatus },
    include: contractInclude(),
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