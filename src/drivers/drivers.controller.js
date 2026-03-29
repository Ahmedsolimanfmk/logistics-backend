const prisma = require("../prisma");

const DRIVER_STATUS = ["ACTIVE", "INACTIVE", "DISABLED", "TERMINATED"];
const DRIVER_DISABLE_REASON = ["LICENSE_EXPIRED", "ADMIN", "OTHER"];

// =======================
// Helpers
// =======================
function parseIntSafe(value, fallback) {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function pickPagination(req) {
  const page = Math.max(1, parseIntSafe(req.query.page || "1", 1));
  const pageSizeRaw = parseIntSafe(req.query.pageSize || req.query.limit || "10", 10);
  const pageSize = Math.min(100, Math.max(5, pageSizeRaw));
  const skip = (page - 1) * pageSize;
  return { page, pageSize, skip };
}

function prismaErrorToHttp(error) {
  if (error?.code === "P2002") {
    return {
      status: 409,
      message: "Duplicate value (unique field conflict within this company)",
      details: error?.meta,
    };
  }
  return null;
}

function parseDateOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function trimOrNull(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s ? s : null;
}

function validateEnumOrThrow(fieldName, valueUpper, allowedList) {
  if (valueUpper == null) return;
  if (!allowedList.includes(valueUpper)) {
    const err = new Error(`Invalid ${fieldName}`);
    err.statusCode = 400;
    err.details = {
      field: fieldName,
      allowed: allowedList,
      received: valueUpper,
    };
    throw err;
  }
}

function isExpired(expiryDate) {
  if (!expiryDate) return false;
  const exp = new Date(expiryDate);
  if (Number.isNaN(exp.getTime())) return false;
  return exp.getTime() < Date.now();
}

function applyDriverStateRules(data, incoming) {
  const nextStatus = incoming.status !== undefined ? incoming.status : data.status;
  const nextExpiry =
    incoming.license_expiry_date !== undefined
      ? incoming.license_expiry_date
      : data.license_expiry_date;

  if (nextExpiry && isExpired(nextExpiry)) {
    data.status = "DISABLED";
    data.disable_reason = "LICENSE_EXPIRED";
    return;
  }

  if (nextStatus === "ACTIVE" && nextExpiry && isExpired(nextExpiry)) {
    const err = new Error("Cannot set driver ACTIVE: license is expired");
    err.statusCode = 400;
    throw err;
  }

  if (nextStatus && nextStatus !== "DISABLED" && incoming.disable_reason === undefined) {
    data.disable_reason = null;
  }
}

function buildTripLocationLabel(trip) {
  if (!trip) return null;
  return trip?.site?.name || null;
}

function handleError(res, error, fallbackMessage) {
  const mapped = prismaErrorToHttp(error);
  if (mapped) {
    return res.status(mapped.status).json({
      message: mapped.message,
      details: mapped.details,
    });
  }

  const status = error?.statusCode || 500;
  return res.status(status).json({
    message: error?.message || fallbackMessage,
    ...(error?.details ? { details: error.details } : {}),
    ...(status >= 500 ? { error: error?.message } : {}),
  });
}

async function getDriverOrThrow(companyId, id, select) {
  const driver = await prisma.drivers.findFirst({
    where: {
      id,
      company_id: companyId,
    },
    ...(select ? { select } : {}),
  });

  if (!driver) {
    const err = new Error("Driver not found");
    err.statusCode = 404;
    throw err;
  }

  return driver;
}

// =======================
// GET /drivers/active
// =======================
async function getActiveDrivers(req, res) {
  try {
    const companyId = req.companyId;
    const q = String(req.query.q || "").trim();

    const where = {
      company_id: companyId,
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { phone2: { contains: q, mode: "insensitive" } },
              { license_no: { contains: q, mode: "insensitive" } },
              { national_id: { contains: q, mode: "insensitive" } },
              { employee_code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const drivers = await prisma.drivers.findMany({
      where,
      orderBy: [{ full_name: "asc" }],
      select: {
        id: true,
        company_id: true,
        employee_code: true,
        full_name: true,
        phone: true,
        phone2: true,
        license_no: true,
        license_expiry_date: true,
        status: true,
        disable_reason: true,
      },
    });

    const items = drivers.filter((driver) => !isExpired(driver.license_expiry_date));

    return res.json(items);
  } catch (error) {
    return handleError(res, error, "Failed to fetch active drivers");
  }
}

// =======================
// GET /drivers
// =======================
async function getDrivers(req, res) {
  try {
    const companyId = req.companyId;
    const q = String(req.query.q || "").trim();
    const status = req.query.status ? upper(req.query.status) : null;

    if (status) {
      validateEnumOrThrow("status", status, DRIVER_STATUS);
    }

    const { page, pageSize, skip } = pickPagination(req);

    const where = {
      company_id: companyId,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { phone2: { contains: q, mode: "insensitive" } },
              { license_no: { contains: q, mode: "insensitive" } },
              { national_id: { contains: q, mode: "insensitive" } },
              { employee_code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.drivers.findMany({
        where,
        orderBy: [{ full_name: "asc" }, { created_at: "desc" }],
        skip,
        take: pageSize,
      }),
      prisma.drivers.count({ where }),
    ]);

    return res.json({ page, pageSize, total, items });
  } catch (error) {
    return handleError(res, error, "Failed to fetch drivers");
  }
}

// =======================
// GET /drivers/:id
// =======================
async function getDriverById(req, res) {
  try {
    const { id } = req.params;
    const driver = await getDriverOrThrow(req.companyId, id);
    return res.json(driver);
  } catch (error) {
    return handleError(res, error, "Failed to fetch driver");
  }
}

// =======================
// GET /drivers/:id/financial-summary
// =======================
async function getDriverFinancialSummary(req, res) {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    const driver = await getDriverOrThrow(companyId, id, {
      id: true,
      company_id: true,
      employee_code: true,
      full_name: true,
      phone: true,
      phone2: true,
      national_id: true,
      address: true,
      emergency_contact_name: true,
      emergency_contact_phone: true,
      hire_date: true,
      license_no: true,
      license_issue_date: true,
      license_expiry_date: true,
      status: true,
      disable_reason: true,
      created_at: true,
      updated_at: true,
    });

    const assignments = await prisma.trip_assignments.findMany({
      where: {
        company_id: companyId,
        driver_id: id,
      },
      orderBy: { assigned_at: "desc" },
      select: {
        id: true,
        trip_id: true,
        assigned_at: true,
        is_active: true,
        unassigned_at: true,
        trip: {
          select: {
            id: true,
            company_id: true,
            trip_code: true,
            status: true,
            scheduled_at: true,
            created_at: true,
            financial_status: true,
            client: { select: { id: true, name: true } },
            site: { select: { id: true, name: true } },
          },
        },
        vehicle: {
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

    const validAssignments = assignments.filter(
      (a) => !a.trip || a.trip.company_id === companyId
    );

    const tripIds = Array.from(
      new Set(validAssignments.map((a) => a.trip_id).filter(Boolean))
    );

    let expenses = [];
    if (tripIds.length > 0) {
      expenses = await prisma.cash_expenses.findMany({
        where: {
          company_id: companyId,
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
          trip: {
            select: {
              id: true,
              trip_code: true,
              status: true,
              client: { select: { name: true } },
              site: { select: { name: true } },
            },
          },
          vehicle: {
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
    const completedTrips = validAssignments.filter(
      (a) => a?.trip?.status === "COMPLETED"
    ).length;
    const activeTrips = validAssignments.filter((a) => a?.is_active === true).length;

    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0
    );

    const approvedExpenses = expenses
      .filter((expense) => expense.approval_status === "APPROVED")
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const pendingExpenses = expenses
      .filter((expense) =>
        ["PENDING", "APPEALED"].includes(
          String(expense.approval_status || "").toUpperCase()
        )
      )
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const recentTrips = validAssignments.slice(0, 20).map((assignment) => ({
      assignment_id: assignment.id,
      trip_id: assignment.trip_id,
      trip_code: assignment.trip?.trip_code || null,
      assigned_at: assignment.assigned_at,
      is_active: assignment.is_active,
      unassigned_at: assignment.unassigned_at,
      trip_status: assignment.trip?.status || null,
      scheduled_at: assignment.trip?.scheduled_at || null,
      created_at: assignment.trip?.created_at || null,
      financial_status: assignment.trip?.financial_status || null,
      client: assignment.trip?.client?.name || null,
      site: buildTripLocationLabel(assignment.trip),
      vehicle: assignment.vehicle
        ? {
            id: assignment.vehicle.id,
            fleet_no: assignment.vehicle.fleet_no,
            plate_no: assignment.vehicle.plate_no,
            display_name: assignment.vehicle.display_name,
          }
        : null,
    }));

    const recentExpenses = expenses.slice(0, 20).map((expense) => ({
      id: expense.id,
      trip_id: expense.trip_id,
      trip_code: expense.trip?.trip_code || null,
      expense_type: expense.expense_type,
      amount: Number(expense.amount || 0),
      notes: expense.notes,
      approval_status: expense.approval_status,
      payment_source: expense.payment_source,
      created_at: expense.created_at,
      trip_status: expense.trip?.status || null,
      client: expense.trip?.client?.name || null,
      site: buildTripLocationLabel(expense.trip),
      vehicle: expense.vehicle
        ? {
            id: expense.vehicle.id,
            fleet_no: expense.vehicle.fleet_no,
            plate_no: expense.vehicle.plate_no,
            display_name: expense.vehicle.display_name,
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
  } catch (error) {
    return handleError(res, error, "Failed to fetch driver financial summary");
  }
}

// =======================
// POST /drivers
// =======================
async function createDriver(req, res) {
  try {
    const companyId = req.companyId;

    const {
      employee_code,
      full_name,
      phone,
      phone2,
      national_id,
      address,
      emergency_contact_name,
      emergency_contact_phone,
      hire_date,
      license_no,
      license_issue_date,
      license_expiry_date,
      status,
      disable_reason,
    } = req.body || {};

    const name = String(full_name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "full_name is required" });
    }

    const hireDate = parseDateOrNull(hire_date);
    const licIssue = parseDateOrNull(license_issue_date);
    const licExpiry = parseDateOrNull(license_expiry_date);

    if (hire_date !== undefined && hireDate === undefined) {
      return res.status(400).json({ message: "Invalid hire_date" });
    }
    if (license_issue_date !== undefined && licIssue === undefined) {
      return res.status(400).json({ message: "Invalid license_issue_date" });
    }
    if (license_expiry_date !== undefined && licExpiry === undefined) {
      return res.status(400).json({ message: "Invalid license_expiry_date" });
    }

    const statusUpper = status ? upper(status) : "ACTIVE";
    const reasonUpper = disable_reason ? upper(disable_reason) : null;

    validateEnumOrThrow("status", statusUpper, DRIVER_STATUS);
    if (reasonUpper) {
      validateEnumOrThrow("disable_reason", reasonUpper, DRIVER_DISABLE_REASON);
    }

    const data = {
      company_id: companyId,
      employee_code: trimOrNull(employee_code),
      full_name: name,
      phone: trimOrNull(phone),
      phone2: trimOrNull(phone2),
      national_id: trimOrNull(national_id),
      address: trimOrNull(address),
      emergency_contact_name: trimOrNull(emergency_contact_name),
      emergency_contact_phone: trimOrNull(emergency_contact_phone),
      hire_date: hireDate === undefined ? null : hireDate,
      license_no: trimOrNull(license_no),
      license_issue_date: licIssue === undefined ? null : licIssue,
      license_expiry_date: licExpiry === undefined ? null : licExpiry,
      status: statusUpper,
      disable_reason: reasonUpper,
    };

    applyDriverStateRules(data, {
      status: data.status,
      disable_reason: data.disable_reason,
      license_expiry_date: data.license_expiry_date,
    });

    const driver = await prisma.drivers.create({ data });
    return res.status(201).json(driver);
  } catch (error) {
    return handleError(res, error, "Failed to create driver");
  }
}

// =======================
// PATCH /drivers/:id
// =======================
async function updateDriver(req, res) {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    const exists = await getDriverOrThrow(companyId, id);

    const {
      employee_code,
      full_name,
      phone,
      phone2,
      national_id,
      address,
      emergency_contact_name,
      emergency_contact_phone,
      hire_date,
      license_no,
      license_issue_date,
      license_expiry_date,
      status,
      disable_reason,
    } = req.body || {};

    const data = {};

    if (employee_code !== undefined) data.employee_code = trimOrNull(employee_code);

    if (full_name !== undefined) {
      const name = String(full_name || "").trim();
      if (!name) {
        return res.status(400).json({ message: "full_name cannot be empty" });
      }
      data.full_name = name;
    }

    if (phone !== undefined) data.phone = trimOrNull(phone);
    if (phone2 !== undefined) data.phone2 = trimOrNull(phone2);
    if (national_id !== undefined) data.national_id = trimOrNull(national_id);
    if (address !== undefined) data.address = trimOrNull(address);
    if (emergency_contact_name !== undefined) {
      data.emergency_contact_name = trimOrNull(emergency_contact_name);
    }
    if (emergency_contact_phone !== undefined) {
      data.emergency_contact_phone = trimOrNull(emergency_contact_phone);
    }

    if (hire_date !== undefined) {
      const d = parseDateOrNull(hire_date);
      if (d === undefined) {
        return res.status(400).json({ message: "Invalid hire_date" });
      }
      data.hire_date = d;
    }

    if (license_no !== undefined) data.license_no = trimOrNull(license_no);

    if (license_issue_date !== undefined) {
      const d = parseDateOrNull(license_issue_date);
      if (d === undefined) {
        return res.status(400).json({ message: "Invalid license_issue_date" });
      }
      data.license_issue_date = d;
    }

    if (license_expiry_date !== undefined) {
      const d = parseDateOrNull(license_expiry_date);
      if (d === undefined) {
        return res.status(400).json({ message: "Invalid license_expiry_date" });
      }
      data.license_expiry_date = d;
    }

    if (status !== undefined) {
      const statusUpper = upper(status);
      if (!statusUpper) {
        return res.status(400).json({ message: "status cannot be empty" });
      }
      validateEnumOrThrow("status", statusUpper, DRIVER_STATUS);
      data.status = statusUpper;
    }

    if (disable_reason !== undefined) {
      const reasonUpper = disable_reason ? upper(disable_reason) : null;
      if (reasonUpper) {
        validateEnumOrThrow("disable_reason", reasonUpper, DRIVER_DISABLE_REASON);
      }
      data.disable_reason = reasonUpper;
    }

    applyDriverStateRules(data, {
      status: data.status !== undefined ? data.status : exists.status,
      disable_reason:
        data.disable_reason !== undefined ? data.disable_reason : exists.disable_reason,
      license_expiry_date:
        data.license_expiry_date !== undefined
          ? data.license_expiry_date
          : exists.license_expiry_date,
    });

    const updated = await prisma.drivers.update({
      where: { id: exists.id },
      data,
    });

    return res.json(updated);
  } catch (error) {
    return handleError(res, error, "Failed to update driver");
  }
}

// =======================
// PATCH /drivers/:id/status
// body: { status, disable_reason? }
// =======================
async function setDriverStatus(req, res) {
  try {
    const companyId = req.companyId;
    const { id } = req.params;

    const exists = await getDriverOrThrow(companyId, id);

    const statusUpper =
      req.body?.status !== undefined ? upper(req.body.status) : undefined;
    const reasonUpper =
      req.body?.disable_reason !== undefined
        ? req.body.disable_reason
          ? upper(req.body.disable_reason)
          : null
        : undefined;

    if (statusUpper === undefined) {
      return res.status(400).json({ message: "status is required" });
    }

    validateEnumOrThrow("status", statusUpper, DRIVER_STATUS);

    if (reasonUpper !== undefined && reasonUpper !== null) {
      validateEnumOrThrow("disable_reason", reasonUpper, DRIVER_DISABLE_REASON);
    }

    const data = {
      status: statusUpper,
    };

    if (reasonUpper !== undefined) {
      data.disable_reason = reasonUpper;
    }

    applyDriverStateRules(data, {
      status: data.status,
      disable_reason:
        data.disable_reason !== undefined ? data.disable_reason : exists.disable_reason,
      license_expiry_date: exists.license_expiry_date,
    });

    const updated = await prisma.drivers.update({
      where: { id: exists.id },
      data,
    });

    return res.json(updated);
  } catch (error) {
    return handleError(res, error, "Failed to update driver status");
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