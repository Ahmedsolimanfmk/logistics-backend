// =======================
// src/drivers/drivers.controller.js
// FINAL: driver compliance fields + enum validation + license expiry guard
// + driver financial summary
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
    return { status: 400, message: "Duplicate value (unique field conflict)", details: e?.meta };
  }
  return null;
}

function parseDateOrNull(v) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
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

function applyDriverStateRules(res, data, incoming) {
  const nextStatus = incoming.status !== undefined ? incoming.status : data.status;
  const nextExpiry = incoming.license_expiry_date !== undefined ? incoming.license_expiry_date : data.license_expiry_date;

  if (nextExpiry && isExpired(nextExpiry)) {
    data.status = "DISABLED";
    data.disable_reason = "LICENSE_EXPIRED";
    data.is_active = false;
    return true;
  }

  if (nextStatus === "ACTIVE" && nextExpiry && isExpired(nextExpiry)) {
    res.status(400).json({ message: "Cannot set driver ACTIVE: license is expired" });
    return false;
  }

  if (nextStatus === "ACTIVE") data.is_active = true;
  if (nextStatus === "INACTIVE") data.is_active = false;
  if (nextStatus === "DISABLED") data.is_active = false;

  if (nextStatus && nextStatus !== "DISABLED" && incoming.disable_reason === undefined) {
    data.disable_reason = null;
  }

  return true;
}

// ✅ GET /drivers/active
async function getActiveDrivers(req, res) {
  try {
    const q = String(req.query.q || "").trim();

    const where = {
      is_active: true,
      status: "ACTIVE",
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

// ✅ NEW: GET /drivers/:id/financial-summary
async function getDriverFinancialSummary(req, res) {
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({
      where: { id },
      select: {
        id: true,
        full_name: true,
        phone: true,
        phone2: true,
        national_id: true,
        hire_date: true,
        license_no: true,
        license_issue_date: true,
        license_expiry_date: true,
        status: true,
        disable_reason: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    const assignments = await prisma.trip_assignments.findMany({
      where: { driver_id: id },
      orderBy: { assigned_at: "desc" },
      select: {
        id: true,
        trip_id: true,
        assigned_at: true,
        is_active: true,
        unassigned_at: true,
        trips: {
          select: {
            id: true,
            status: true,
            scheduled_at: true,
            created_at: true,
            financial_status: true,
            clients: { select: { id: true, name: true } },
            sites: { select: { id: true, name: true } },
          },
        },
        vehicles: {
          select: {
            id: true,
            fleet_no: true,
            plate_no: true,
            display_name: true,
          },
        },
      },
      take: 100,
    });

    const tripIds = Array.from(
      new Set(assignments.map((a) => a.trip_id).filter(Boolean))
    );

    let expenses = [];
    if (tripIds.length > 0) {
      expenses = await prisma.cash_expenses.findMany({
        where: {
          trip_id: { in: tripIds },
        },
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          trip_id: true,
          vehicle_id: true,
          expense_type: true,
          amount: true,
          notes: true,
          approval_status: true,
          payment_source: true,
          created_at: true,
          trips: {
            select: {
              id: true,
              status: true,
              clients: { select: { name: true } },
              sites: { select: { name: true } },
            },
          },
          vehicles: {
            select: {
              id: true,
              fleet_no: true,
              plate_no: true,
              display_name: true,
            },
          },
        },
        take: 200,
      });
    }

    const totalTrips = tripIds.length;
    const completedTrips = assignments.filter((a) => a?.trips?.status === "COMPLETED").length;
    const activeTrips = assignments.filter((a) => a?.is_active === true).length;

    const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const approvedExpenses = expenses
      .filter((e) => e.approval_status === "APPROVED")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const pendingExpenses = expenses
      .filter((e) => e.approval_status === "PENDING")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const recentTrips = assignments.slice(0, 20).map((a) => ({
      assignment_id: a.id,
      trip_id: a.trip_id,
      assigned_at: a.assigned_at,
      is_active: a.is_active,
      unassigned_at: a.unassigned_at,
      trip_status: a.trips?.status || null,
      scheduled_at: a.trips?.scheduled_at || null,
      created_at: a.trips?.created_at || null,
      financial_status: a.trips?.financial_status || null,
      client: a.trips?.clients?.name || null,
      site: a.trips?.sites?.name || null,
      vehicle: a.vehicles
        ? {
            id: a.vehicles.id,
            fleet_no: a.vehicles.fleet_no,
            plate_no: a.vehicles.plate_no,
            display_name: a.vehicles.display_name,
          }
        : null,
    }));

    const recentExpenses = expenses.slice(0, 20).map((e) => ({
      id: e.id,
      trip_id: e.trip_id,
      expense_type: e.expense_type,
      amount: Number(e.amount || 0),
      notes: e.notes,
      approval_status: e.approval_status,
      payment_source: e.payment_source,
      created_at: e.created_at,
      trip_status: e.trips?.status || null,
      client: e.trips?.clients?.name || null,
      site: e.trips?.sites?.name || null,
      vehicle: e.vehicles
        ? {
            id: e.vehicles.id,
            fleet_no: e.vehicles.fleet_no,
            plate_no: e.vehicles.plate_no,
            display_name: e.vehicles.display_name,
          }
        : null,
    }));

    return res.json({
      driver,
      summary: {
        total_trips: totalTrips,
        completed_trips: completedTrips,
        active_trips: activeTrips,
        expenses_count: expenses.length,
        total_expenses: totalExpenses,
        approved_expenses: approvedExpenses,
        pending_expenses: pendingExpenses,
      },
      recent_trips: recentTrips,
      recent_expenses: recentExpenses,
    });
  } catch (e) {
    return res.status(500).json({
      message: "Failed to fetch driver financial summary",
      error: e.message,
    });
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

    if (
      !applyDriverStateRules(res, data, {
        status: data.status,
        disable_reason: data.disable_reason,
        is_active: data.is_active,
        license_expiry_date: data.license_expiry_date,
      })
    ) {
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

    const incoming = {
      status: data.status !== undefined ? data.status : exists.status,
      disable_reason: data.disable_reason !== undefined ? data.disable_reason : exists.disable_reason,
      is_active: data.is_active !== undefined ? data.is_active : exists.is_active,
      license_expiry_date: exists.license_expiry_date,
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
  getDriverFinancialSummary,
  createDriver,
  updateDriver,
  setDriverStatus,
};