// =======================
// src/drivers/drivers.controller.js
// FINAL: driver compliance fields + enum validation + license expiry guard
// =======================

const prisma = require("../prisma");

const DRIVER_STATUS = ["ACTIVE", "INACTIVE", "DISABLED"];
const DRIVER_DISABLE_REASON = ["LICENSE_EXPIRED", "ADMIN", "OTHER"];

function parseBool(v) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(s)) return true;
  if (["0", "false", "no", "n"].includes(s)) return false;
  return undefined;
}

function pickPagination(req) {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const pageSizeRaw = parseInt(req.query.pageSize || "10", 10);
  const pageSize = Math.min(100, Math.max(5, Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

function prismaErrorToHttp(e) {
  const code = e?.code;
  if (code === "P2002") {
    // meta.target usually contains violated unique fields
    return { status: 400, message: "Duplicate value (unique field conflict)", details: e?.meta };
  }
  return null;
}

function parseDateOrNull(v) {
  if (v === undefined) return undefined; // not provided
  if (v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined; // invalid
  return d;
}

function upper(v) {
  return String(v || "").trim().toUpperCase();
}

function validateEnumOr400(res, fieldName, valueUpper, allowedList) {
  if (valueUpper == null) return true;
  if (!allowedList.includes(valueUpper)) {
    res.status(400).json({
      message: `Invalid ${fieldName}`,
      allowed: allowedList,
      received: valueUpper,
    });
    return false;
  }
  return true;
}

function isExpired(expiryDate) {
  if (!expiryDate) return false;
  const exp = new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() < Date.now();
}

/**
 * Apply consistency rules:
 * - ACTIVE => is_active true
 * - INACTIVE => is_active false
 * - DISABLED => is_active false
 * - If license expired => force DISABLED + LICENSE_EXPIRED + is_active false
 * - Prevent setting ACTIVE while license expired
 */
function applyDriverStateRules(res, data, incoming) {
  // incoming may have: status, disable_reason, is_active, license_expiry_date
  const nextStatus = incoming.status !== undefined ? incoming.status : data.status;
  const nextExpiry = incoming.license_expiry_date !== undefined ? incoming.license_expiry_date : data.license_expiry_date;

  // If expiry is in the past -> force disable
  if (nextExpiry && isExpired(nextExpiry)) {
    data.status = "DISABLED";
    data.disable_reason = "LICENSE_EXPIRED";
    data.is_active = false;
    return true;
  }

  // If user tries to set ACTIVE while expired (extra safety)
  if (nextStatus === "ACTIVE" && nextExpiry && isExpired(nextExpiry)) {
    res.status(400).json({ message: "Cannot set driver ACTIVE: license is expired" });
    return false;
  }

  // Sync status <-> is_active
  if (nextStatus === "ACTIVE") data.is_active = true;
  if (nextStatus === "INACTIVE") data.is_active = false;
  if (nextStatus === "DISABLED") data.is_active = false;

  // If status is not DISABLED => clear reason (unless explicitly provided)
  if (nextStatus && nextStatus !== "DISABLED" && incoming.disable_reason === undefined) {
    data.disable_reason = null;
  }

  return true;
}

// ✅ NEW: GET /drivers/active
// query: q (optional) => used for dropdown search
async function getActiveDrivers(req, res) {
  try {
    const q = String(req.query.q || "").trim();

    const where = {
      is_active: true,
      status: "ACTIVE", // ✅ only ACTIVE drivers in dropdown
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { phone2: { contains: q, mode: "insensitive" } },
              { license_no: { contains: q, mode: "insensitive" } },
              { national_id: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const drivers = await prisma.drivers.findMany({
      where,
      orderBy: [{ full_name: "asc" }],
      select: {
        id: true,
        full_name: true,
        phone: true,
        phone2: true,
        license_no: true,
        status: true,
      },
    });

    return res.json(drivers);
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch active drivers", error: e.message });
  }
}

// GET /drivers
// query: q, is_active, status, page, pageSize
async function getDrivers(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const isActive = parseBool(req.query.is_active);
    const status = req.query.status ? upper(req.query.status) : null;

    if (status && !validateEnumOr400(res, "status", status, DRIVER_STATUS)) return;

    const { page, pageSize, skip } = pickPagination(req);

    const where = {
      ...(typeof isActive === "boolean" ? { is_active: isActive } : {}),
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { phone2: { contains: q, mode: "insensitive" } },
              { license_no: { contains: q, mode: "insensitive" } },
              { national_id: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.drivers.findMany({
        where,
        orderBy: [{ is_active: "desc" }, { full_name: "asc" }, { created_at: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.drivers.count({ where }),
    ]);

    return res.json({ page, pageSize, total, items });
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch drivers", error: e.message });
  }
}

// GET /drivers/:id
async function getDriverById(req, res) {
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({ where: { id } });
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    return res.json(driver);
  } catch (e) {
    return res.status(500).json({ message: "Failed to fetch driver", error: e.message });
  }
}

// POST /drivers
async function createDriver(req, res) {
  try {
    const {
      full_name,
      phone,
      phone2,
      national_id,
      hire_date,
      license_no,
      license_issue_date,
      license_expiry_date,
      status,
      disable_reason,
      is_active,
    } = req.body || {};

    const name = String(full_name || "").trim();
    if (!name) return res.status(400).json({ message: "full_name is required" });

    const hireDate = parseDateOrNull(hire_date);
    const licIssue = parseDateOrNull(license_issue_date);
    const licExpiry = parseDateOrNull(license_expiry_date);

    if (hire_date !== undefined && hireDate === undefined) return res.status(400).json({ message: "Invalid hire_date" });
    if (license_issue_date !== undefined && licIssue === undefined)
      return res.status(400).json({ message: "Invalid license_issue_date" });
    if (license_expiry_date !== undefined && licExpiry === undefined)
      return res.status(400).json({ message: "Invalid license_expiry_date" });

    const statusUpper = status ? upper(status) : "ACTIVE";
    const reasonUpper = disable_reason ? upper(disable_reason) : null;

    if (!validateEnumOr400(res, "status", statusUpper, DRIVER_STATUS)) return;
    if (reasonUpper && !validateEnumOr400(res, "disable_reason", reasonUpper, DRIVER_DISABLE_REASON)) return;

    const data = {
      full_name: name,
      phone: phone ? String(phone).trim() : null,
      phone2: phone2 ? String(phone2).trim() : null,
      national_id: national_id ? String(national_id).trim() : null,
      hire_date: hireDate === undefined ? null : hireDate,
      license_no: license_no ? String(license_no).trim() : null,
      license_issue_date: licIssue === undefined ? null : licIssue,
      license_expiry_date: licExpiry === undefined ? null : licExpiry,
      status: statusUpper,
      disable_reason: reasonUpper,
      is_active: typeof is_active === "boolean" ? is_active : true,
    };

    // enforce rules (auto-disable if expired, sync is_active)
    if (!applyDriverStateRules(res, data, { status: data.status, disable_reason: data.disable_reason, is_active: data.is_active, license_expiry_date: data.license_expiry_date })) {
      return;
    }

    const driver = await prisma.drivers.create({ data });
    return res.status(201).json(driver);
  } catch (e) {
    const mapped = prismaErrorToHttp(e);
    if (mapped) return res.status(mapped.status).json({ message: mapped.message, details: mapped.details });
    return res.status(500).json({ message: "Failed to create driver", error: e.message });
  }
}

// PATCH /drivers/:id
async function updateDriver(req, res) {
  try {
    const { id } = req.params;

    const exists = await prisma.drivers.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Driver not found" });

    const {
      full_name,
      phone,
      phone2,
      national_id,
      hire_date,
      license_no,
      license_issue_date,
      license_expiry_date,
      status,
      disable_reason,
      is_active,
    } = req.body || {};

    const data = {};

    if (full_name !== undefined) {
      const name = String(full_name || "").trim();
      if (!name) return res.status(400).json({ message: "full_name cannot be empty" });
      data.full_name = name;
    }

    if (phone !== undefined) data.phone = phone ? String(phone).trim() : null;
    if (phone2 !== undefined) data.phone2 = phone2 ? String(phone2).trim() : null;
    if (national_id !== undefined) data.national_id = national_id ? String(national_id).trim() : null;

    if (hire_date !== undefined) {
      const d = parseDateOrNull(hire_date);
      if (d === undefined) return res.status(400).json({ message: "Invalid hire_date" });
      data.hire_date = d;
    }

    if (license_no !== undefined) data.license_no = license_no ? String(license_no).trim() : null;

    if (license_issue_date !== undefined) {
      const d = parseDateOrNull(license_issue_date);
      if (d === undefined) return res.status(400).json({ message: "Invalid license_issue_date" });
      data.license_issue_date = d;
    }

    if (license_expiry_date !== undefined) {
      const d = parseDateOrNull(license_expiry_date);
      if (d === undefined) return res.status(400).json({ message: "Invalid license_expiry_date" });
      data.license_expiry_date = d;
    }

    let statusUpper;
    if (status !== undefined) {
      statusUpper = upper(status);
      if (!statusUpper) return res.status(400).json({ message: "status cannot be empty" });
      if (!validateEnumOr400(res, "status", statusUpper, DRIVER_STATUS)) return;
      data.status = statusUpper;
    }

    let reasonUpper;
    if (disable_reason !== undefined) {
      reasonUpper = disable_reason ? upper(disable_reason) : null;
      if (reasonUpper && !validateEnumOr400(res, "disable_reason", reasonUpper, DRIVER_DISABLE_REASON)) return;
      data.disable_reason = reasonUpper;
    }

    if (typeof is_active === "boolean") data.is_active = is_active;

    // Apply rules using "future" values (merge exists + data)
    const incoming = {
      status: data.status !== undefined ? data.status : exists.status,
      disable_reason: data.disable_reason !== undefined ? data.disable_reason : exists.disable_reason,
      is_active: data.is_active !== undefined ? data.is_active : exists.is_active,
      license_expiry_date:
        data.license_expiry_date !== undefined ? data.license_expiry_date : exists.license_expiry_date,
    };

    if (!applyDriverStateRules(res, data, incoming)) return;

    const updated = await prisma.drivers.update({ where: { id }, data });
    return res.json(updated);
  } catch (e) {
    const mapped = prismaErrorToHttp(e);
    if (mapped) return res.status(mapped.status).json({ message: mapped.message, details: mapped.details });
    return res.status(500).json({ message: "Failed to update driver", error: e.message });
  }
}

// PATCH /drivers/:id/status
// body: { is_active: boolean } OR { status, disable_reason? }
async function setDriverStatus(req, res) {
  try {
    const { id } = req.params;

    const exists = await prisma.drivers.findUnique({ where: { id } });
    if (!exists) return res.status(404).json({ message: "Driver not found" });

    const isActive = parseBool(req.body?.is_active);
    const statusUpper = req.body?.status !== undefined ? upper(req.body?.status) : undefined;
    const reasonUpper = req.body?.disable_reason !== undefined ? upper(req.body?.disable_reason) : undefined;

    if (statusUpper !== undefined && !validateEnumOr400(res, "status", statusUpper, DRIVER_STATUS)) return;
    if (reasonUpper !== undefined && reasonUpper && !validateEnumOr400(res, "disable_reason", reasonUpper, DRIVER_DISABLE_REASON)) return;

    const data = {};

    if (typeof isActive === "boolean") data.is_active = isActive;

    if (statusUpper !== undefined) {
      if (!statusUpper) return res.status(400).json({ message: "status cannot be empty" });
      data.status = statusUpper;
    }

    if (reasonUpper !== undefined) {
      data.disable_reason = reasonUpper || null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "Provide is_active and/or status" });
    }

    // Apply rules (consider existing expiry too)
    const incoming = {
      status: data.status !== undefined ? data.status : exists.status,
      disable_reason: data.disable_reason !== undefined ? data.disable_reason : exists.disable_reason,
      is_active: data.is_active !== undefined ? data.is_active : exists.is_active,
      license_expiry_date: exists.license_expiry_date, // status endpoint doesn't change expiry
    };

    if (!applyDriverStateRules(res, data, incoming)) return;

    const updated = await prisma.drivers.update({ where: { id }, data });
    return res.json(updated);
  } catch (e) {
    return res.status(500).json({ message: "Failed to update driver status", error: e.message });
  }
}

module.exports = {
  getActiveDrivers,
  getDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  setDriverStatus,
};